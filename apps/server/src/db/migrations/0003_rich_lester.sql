ALTER TABLE "dispute_messages" ALTER COLUMN "created_at" SET DATA TYPE timestamp (3);--> statement-breakpoint
ALTER TABLE "dispute_messages" ALTER COLUMN "created_at" SET DEFAULT now();