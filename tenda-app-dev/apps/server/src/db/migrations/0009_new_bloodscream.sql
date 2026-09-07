CREATE TYPE "public"."resolution_status" AS ENUM('pending', 'executing', 'confirmed', 'rejected');--> statement-breakpoint
CREATE TABLE "dispute_resolutions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dispute_id" uuid NOT NULL,
	"proposed_winner" "dispute_winner" NOT NULL,
	"proposed_by" uuid NOT NULL,
	"status" "resolution_status" DEFAULT 'pending' NOT NULL,
	"threshold" integer DEFAULT 1 NOT NULL,
	"reject_reason" text,
	"rejected_by" uuid,
	"resolved_tx_ref" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "dispute_resolutions_threshold_positive_chk" CHECK ("dispute_resolutions"."threshold" >= 1)
);
--> statement-breakpoint
ALTER TABLE "dispute_resolutions" ADD CONSTRAINT "dispute_resolutions_dispute_id_disputes_id_fk" FOREIGN KEY ("dispute_id") REFERENCES "public"."disputes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dispute_resolutions" ADD CONSTRAINT "dispute_resolutions_proposed_by_users_id_fk" FOREIGN KEY ("proposed_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dispute_resolutions" ADD CONSTRAINT "dispute_resolutions_rejected_by_users_id_fk" FOREIGN KEY ("rejected_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "dispute_resolutions_dispute_idx" ON "dispute_resolutions" USING btree ("dispute_id");--> statement-breakpoint
CREATE UNIQUE INDEX "dispute_resolutions_active_uq" ON "dispute_resolutions" USING btree ("dispute_id") WHERE "dispute_resolutions"."status" IN ('pending', 'executing');