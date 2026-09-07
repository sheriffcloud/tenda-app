/**
 * The server's Solana chain layer against REAL program bytes, in-process:
 * LiteSVM loads `contracts/solana/target/deploy/tenda_escrow.so` and the two
 * ports the adapter speaks — the read seam (`SolanaRpc`) and the relayer's
 * write path (`SolanaRelayer`) — are implemented over it. What a suite
 * proves here is that a transaction the server BUILT executes on the
 * program the chain runs, which no fake RPC can say.
 *
 * Gated: `litesvmSkip` is true when the artifact is absent (`anchor build`
 * in contracts/solana produces it; CI builds it for the IDL drift guard).
 */
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { BN } from '@coral-xyz/anchor'
import {
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  VersionedTransaction,
  type TransactionInstruction,
} from '@solana/web3.js'
import {
  MINT_SIZE,
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountInstruction,
  createInitializeMint2Instruction,
  createMintToInstruction,
  getAssociatedTokenAddressSync,
} from '@solana/spl-token'
import bs58 from 'bs58'
import { FailedTransactionMetadata, LiteSVM } from 'litesvm'
import { PROGRAM_ID, platformPda } from '@server/chains/solana/pdas'
import type { SolanaRelayer } from '@server/chains/solana/relay/relayer'
import type { SolanaRpc } from '@server/chains/solana/rpc'
import { TEST_PROGRAM } from './solana'

const PROGRAM_SO = join(__dirname, '../../../../contracts/solana/target/deploy/tenda_escrow.so')
export const litesvmSkip = !existsSync(PROGRAM_SO)

const FUND_LAMPORTS = 10n * 1_000_000_000n

export interface LiteSvmFixture {
  svm: LiteSVM
  payer: Keypair
  treasury: Keypair
  /** Send instructions signed by `payer` (+ extra signers); throws with the logs on failure. */
  send(ixs: TransactionInstruction[], signers?: Keypair[]): void
  /** A fresh SPL mint (6 decimals, payer is the authority) with an ATA per holder, funded when asked. */
  mint(holders: Array<{ owner: PublicKey; amount: bigint }>): PublicKey
}

/**
 * `initialize_platform` is gated on the program's UPGRADE AUTHORITY (#39), which
 * lives in a ProgramData account at a PDA of [program id] under the upgradeable
 * loader. LiteSVM loads the program under BPFLoader2 and creates no such
 * account, so the harness has to supply the one a real deployment would have —
 * otherwise every boot fails with `AccountNotInitialized` on `program_data`.
 *
 * `UpgradeableLoaderState::ProgramData` (bincode): u32 tag (3) | u64 slot |
 * Option<Pubkey> authority, then the ELF. The trailing bytes are written
 * because a header-only account exists on no cluster.
 *
 * Deliberately a second copy of contracts/solana/tests/helpers.ts
 * `setUpgradeAuthority`: these are different packages with different tsconfigs,
 * and the contracts harness already duplicates `idlBytesConstant` across its own
 * two harnesses for the same reason. Keep them in step.
 */
const BPF_LOADER_UPGRADEABLE = new PublicKey('BPFLoaderUpgradeab1e11111111111111111111111')
const PROGRAM_DATA_HEADER = 45
const PROGRAM_DATA_ELF_STUB = 1_024

function setUpgradeAuthority(svm: LiteSVM, authority: PublicKey): void {
  const data = Buffer.alloc(PROGRAM_DATA_HEADER + PROGRAM_DATA_ELF_STUB)
  data.writeUInt32LE(3, 0)
  data.writeBigUInt64LE(0n, 4)
  data.writeUInt8(1, 12) // Option::Some
  authority.toBuffer().copy(data, 13)
  const [address] = PublicKey.findProgramAddressSync(
    [PROGRAM_ID.toBuffer()],
    BPF_LOADER_UPGRADEABLE,
  )
  svm.setAccount(address, {
    lamports: Number(svm.minimumBalanceForRentExemption(BigInt(data.length))),
    data,
    owner: BPF_LOADER_UPGRADEABLE,
    executable: false,
  })
}

/** Boot LiteSVM with the program loaded and the platform initialized. */
export async function startLiteSvm(): Promise<LiteSvmFixture> {
  const svm = new LiteSVM()
    .withSysvars()
    .withBuiltins()
    .withDefaultPrograms()
    .withSigverify(true)
    .withBlockhashCheck(true)
  svm.addProgramFromFile(PROGRAM_ID, PROGRAM_SO)
  const payer = Keypair.generate()
  const treasury = Keypair.generate()
  svm.airdrop(payer.publicKey, FUND_LAMPORTS)
  setUpgradeAuthority(svm, payer.publicKey)

  const send = (ixs: TransactionInstruction[], signers: Keypair[] = []): void => {
    const tx = new Transaction().add(...ixs)
    tx.feePayer = payer.publicKey
    tx.recentBlockhash = svm.latestBlockhash()
    tx.sign(payer, ...signers)
    const res = svm.sendTransaction(tx)
    if (res instanceof FailedTransactionMetadata) {
      throw new Error(`${res.err().toString()}\n${res.meta().logs().join('\n')}`)
    }
  }

  send([
    await TEST_PROGRAM.methods
      .initializePlatform({
        protocolAdmin: payer.publicKey,
        disputeAdmin: payer.publicKey,
        treasury: treasury.publicKey,
        feeBps: 250,
        seekerFeeBps: 100,
        approvalWindowSeconds: new BN(172_800),
        gracePeriodSeconds: new BN(3_600),
      })
      .accountsPartial({ platformState: platformPda(), payer: payer.publicKey, systemProgram: SystemProgram.programId })
      .instruction(),
  ])

  const mint = (holders: Array<{ owner: PublicKey; amount: bigint }>): PublicKey => {
    const mintKp = Keypair.generate()
    const rent = svm.minimumBalanceForRentExemption(BigInt(MINT_SIZE))
    const ixs: TransactionInstruction[] = [
      SystemProgram.createAccount({
        fromPubkey: payer.publicKey,
        newAccountPubkey: mintKp.publicKey,
        space: MINT_SIZE,
        lamports: Number(rent),
        programId: TOKEN_PROGRAM_ID,
      }),
      createInitializeMint2Instruction(mintKp.publicKey, 6, payer.publicKey, null),
    ]
    for (const { owner, amount } of holders) {
      const ata = getAssociatedTokenAddressSync(mintKp.publicKey, owner)
      ixs.push(createAssociatedTokenAccountInstruction(payer.publicKey, ata, owner, mintKp.publicKey))
      if (amount > 0n) ixs.push(createMintToInstruction(mintKp.publicKey, ata, payer.publicKey, amount))
    }
    send(ixs, [mintKp])
    return mintKp.publicKey
  }

  return { svm, payer, treasury, send, mint }
}

/** The adapter's read seam over LiteSVM. */
export function litesvmRpc(svm: LiteSVM): SolanaRpc {
  return {
    async getLatestBlockhash() {
      return { blockhash: svm.latestBlockhash(), last_valid_block_height: 0 }
    },
    async getTransaction(tx_ref) {
      const meta = svm.getTransaction(bs58.decode(tx_ref))
      if (meta === null) return null
      const failed = meta instanceof FailedTransactionMetadata
      return {
        failed,
        failure_reason: failed ? meta.err().toString() : null,
        log_messages: failed ? meta.meta().logs() : meta.logs(),
      }
    },
    async getAccount(address) {
      const account = svm.getAccount(new PublicKey(address))
      return account === null ? null : { data: Buffer.from(account.data), owner: account.owner.toBase58() }
    },
    async getSignaturesForAddress() {
      return []
    },
  }
}

/** The relayer's write path over LiteSVM, signing as `keypair`. */
export function litesvmRelayer(svm: LiteSVM, keypair: Keypair): SolanaRelayer {
  return {
    public_key: keypair.publicKey,
    async getBalance(address) {
      return svm.getBalance(address) ?? 0n
    },
    async minimumBalanceForRentExemption(bytes) {
      return svm.minimumBalanceForRentExemption(BigInt(bytes))
    },
    async isBlockhashValid(blockhash) {
      // LiteSVM keeps ONE live blockhash; anything else has expired.
      return blockhash === svm.latestBlockhash()
    },
    async simulate(tx) {
      const res = svm.simulateTransaction(tx)
      if (res instanceof FailedTransactionMetadata) return { err: res.err().toString(), logs: res.meta().logs() }
      return { err: null, logs: res.meta().logs() }
    },
    sign(tx: VersionedTransaction) {
      tx.sign([keypair])
    },
    async send(tx) {
      const res = svm.sendTransaction(tx)
      if (res instanceof FailedTransactionMetadata) {
        throw new Error(`${res.err().toString()}\n${res.meta().logs().join('\n')}`)
      }
      return bs58.encode(res.signature())
    },
  }
}
