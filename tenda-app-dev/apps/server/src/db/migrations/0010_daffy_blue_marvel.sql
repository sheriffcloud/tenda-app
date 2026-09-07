CREATE TYPE "public"."payout_rail_kind" AS ENUM('bank', 'mobile_money');--> statement-breakpoint
ALTER TABLE "bank_accounts" DROP CONSTRAINT "bank_accounts_user_acct_uq";--> statement-breakpoint
ALTER TABLE "bank_accounts" ADD COLUMN "kind" "payout_rail_kind" DEFAULT 'bank' NOT NULL;--> statement-breakpoint
ALTER TABLE "bank_accounts" ADD CONSTRAINT "bank_accounts_user_acct_uq" UNIQUE("user_id","kind","bank_code","account_number");