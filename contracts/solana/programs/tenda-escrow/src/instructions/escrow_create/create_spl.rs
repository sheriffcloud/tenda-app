use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};

use crate::constants::{ESCROW_SEED, ESCROW_TOKEN_SEED};
use crate::events::EscrowCreated;
use crate::state::Escrow;

use super::shared::CreateEscrowArgs;

#[derive(Accounts)]
#[instruction(args: CreateEscrowArgs)]
pub struct CreateEscrowSpl<'info> {
    #[account(
        init,
        payer = creator,
        space = Escrow::LEN,
        seeds = [ESCROW_SEED, args.escrow_id.as_ref()],
        bump,
    )]
    pub escrow: Account<'info, Escrow>,

    /// Per-escrow token vault. PDA-owned token account whose `authority` is
    /// the Escrow data PDA — settlement instructions sign as that PDA.
    #[account(
        init,
        payer = creator,
        seeds = [ESCROW_TOKEN_SEED, args.escrow_id.as_ref()],
        bump,
        token::mint = mint,
        token::authority = escrow,
    )]
    pub vault_token_account: Account<'info, TokenAccount>,

    pub mint: Account<'info, Mint>,

    #[account(
        mut,
        constraint = creator_token_account.mint == mint.key(),
        constraint = creator_token_account.owner == creator.key(),
    )]
    pub creator_token_account: Account<'info, TokenAccount>,

    #[account(mut)]
    pub creator: Signer<'info>,

    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

pub fn handler(ctx: Context<CreateEscrowSpl>, args: CreateEscrowArgs) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    args.validate(now)?;

    let escrow = &mut ctx.accounts.escrow;
    args.init_escrow(
        escrow,
        ctx.accounts.mint.key(),
        ctx.accounts.creator.key(),
        now,
        ctx.bumps.escrow,
        ctx.bumps.vault_token_account,
    );

    // Move escrow amount from creator's ATA into the vault.
    let cpi_ctx = CpiContext::new(
        ctx.accounts.token_program.to_account_info(),
        Transfer {
            from: ctx.accounts.creator_token_account.to_account_info(),
            to: ctx.accounts.vault_token_account.to_account_info(),
            authority: ctx.accounts.creator.to_account_info(),
        },
    );
    token::transfer(cpi_ctx, args.amount)?;

    emit!(EscrowCreated {
        escrow_id: escrow.escrow_id,
        kind: escrow.kind,
        asset: escrow.asset,
        amount: escrow.amount,
        creator: escrow.creator,
        assigned_counterparty: escrow.assigned_counterparty,
        accept_deadline: escrow.accept_deadline,
        completion_duration_seconds: args.completion_duration_seconds,
        dispute_bond: escrow.dispute_bond,
        is_seeker: escrow.is_seeker,
        timestamp: now,
    });
    Ok(())
}
