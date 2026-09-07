ALTER TYPE "public"."escrow_tx_type" ADD VALUE 'assign_accept' BEFORE 'submit';--> statement-breakpoint
ALTER TYPE "public"."escrow_tx_type" ADD VALUE 'unassign' BEFORE 'submit';