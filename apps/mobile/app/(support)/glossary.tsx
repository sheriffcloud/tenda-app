import { View, ScrollView, StyleSheet } from 'react-native'
import { useUnistyles } from 'react-native-unistyles'
import { ScreenContainer, Header, Text, AccordionItem } from '@/components/ui'

const TERMS = [
  {
    term: 'Blockchain',
    definition:
      'A permanent public record of all transactions that no one can change or delete. Think of it like a ledger kept by millions of computers at once, no single person controls it.',
  },
  {
    term: 'Escrow',
    definition:
      'A secure holding area for payment. When a poster publishes a gig, the money is locked in escrow on-chain. It can only be released to the worker (on approval) or returned to the poster (on refund/expiry).',
  },
  {
    term: 'Lamports',
    definition:
      "The smallest unit of SOL, like Kobo is to Naira. 1 SOL = 1,000,000,000 lamports. You'll rarely need to think about lamports, Tenda handles the conversion.",
  },
  {
    term: 'Seed Phrase',
    definition:
      'A set of 12 or 24 random words that is the master key to your wallet. Anyone with your seed phrase can access your funds. Write it down offline, never share it, and never type it into any website or app.',
  },
  {
    term: 'Signature',
    definition:
      "Your digital approval of a transaction. When your wallet asks you to 'sign', it's like signing a cheque, you're confirming you authorise that specific action.",
  },
  {
    term: 'Smart Contract',
    definition:
      "A self-executing agreement stored on the blockchain. Tenda's escrow is a smart contract, the rules are written into code and enforced automatically.",
  },
  {
    term: 'SOL',
    definition:
      'The digital currency of the Solana blockchain, the network Tenda runs on. All gig payments on Tenda are in SOL. The local currency equivalent is shown alongside.',
  },
  {
    term: 'Solana',
    definition:
      'The blockchain network Tenda is built on. Solana is known for fast transactions and very low fees, usually less than $0.01 per transaction.',
  },
  {
    term: 'Transaction',
    definition:
      'Any action recorded on the blockchain: publishing a gig, accepting, submitting proof, or approving payment. Each transaction is permanent and publicly verifiable.',
  },
  {
    term: 'Wallet',
    definition:
      'Your digital identity and payment account on Tenda. Think of it like a bank account, but only you control it. Tenda supports Phantom and Solflare on Android.',
  },
] as const

export default function GlossaryScreen() {
  const { theme } = useUnistyles()

  return (
    <ScreenContainer scroll={false} padding={false} edges={['left', 'right', 'bottom']}>
      <Header title="Glossary" showBack />

      <ScrollView contentContainerStyle={s.scroll}>
        <Text style={[s.intro, { color: theme.colors.content.secondary }]}>
          Plain-English definitions of the crypto and Tenda terms you&apos;ll see across the app.
        </Text>

        <View
          style={[
            s.card,
            { backgroundColor: theme.colors.surface.card, borderColor: theme.colors.border.default },
          ]}
        >
          {TERMS.map((item, index) => (
            <AccordionItem
              key={item.term}
              title={item.term}
              last={index === TERMS.length - 1}
            >
              <Text style={[s.body, { color: theme.colors.content.secondary }]}>
                {item.definition}
              </Text>
            </AccordionItem>
          ))}
        </View>
      </ScrollView>
    </ScreenContainer>
  )
}

const s = StyleSheet.create({
  scroll: {
    paddingTop: 12,
    paddingBottom: 16,
  },
  intro: {
    fontSize: 13.5,
    lineHeight: 20,
    paddingHorizontal: 20,
    paddingBottom: 14,
  },
  card: {
    marginHorizontal: 20,
    paddingHorizontal: 18,
    borderWidth: 1,
    borderRadius: 18,
  },
  body: {
    fontSize: 13.5,
    lineHeight: 20,
    paddingBottom: 16,
  },
})
