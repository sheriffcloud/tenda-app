ALTER TABLE "escrows" ADD COLUMN "creator_address" text;--> statement-breakpoint
ALTER TABLE "escrows" ADD COLUMN "counterparty_address" text;--> statement-breakpoint
ALTER TABLE "escrows" ADD COLUMN "assigned_counterparty_address" text;