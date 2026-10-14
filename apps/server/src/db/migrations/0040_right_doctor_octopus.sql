CREATE TYPE "public"."gas_grant_status" AS ENUM('claimed', 'submitted', 'delivered', 'unresolved');--> statement-breakpoint
ALTER TABLE "gas_grants" ALTER COLUMN "tx_ref" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "gas_grants" ADD COLUMN "status" "gas_grant_status" DEFAULT 'claimed' NOT NULL;--> statement-breakpoint
ALTER TABLE "gas_grants" ADD COLUMN "submitted_at" timestamp with time zone;