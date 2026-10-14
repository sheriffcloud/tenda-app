ALTER TYPE "public"."proof_type" ADD VALUE 'geotag';--> statement-breakpoint
ALTER TYPE "public"."proof_type" ADD VALUE 'text';--> statement-breakpoint
ALTER TYPE "public"."proof_type" ADD VALUE 'structured';--> statement-breakpoint
DROP INDEX "escrow_proofs_identity_uq";--> statement-breakpoint
ALTER TABLE "escrow_proofs" ALTER COLUMN "url" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "gig_details" ADD COLUMN "proof_params" jsonb;--> statement-breakpoint
ALTER TABLE "escrow_proofs" ADD COLUMN "payload" jsonb;--> statement-breakpoint
CREATE UNIQUE INDEX "escrow_proofs_identity_uq" ON "escrow_proofs" USING btree ("escrow_id","type",coalesce("url", ''),coalesce("payload", 'null'::jsonb));