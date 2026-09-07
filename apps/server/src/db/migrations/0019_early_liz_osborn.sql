CREATE TYPE "public"."application_status" AS ENUM('open', 'withdrawn', 'expired', 'assigned', 'passed');--> statement-breakpoint
CREATE TABLE "gig_applications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"escrow_id" uuid NOT NULL,
	"applicant_id" uuid NOT NULL,
	"message" text,
	"status" "application_status" DEFAULT 'open' NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "gig_applications_escrow_applicant_uq" UNIQUE("escrow_id","applicant_id")
);
--> statement-breakpoint
ALTER TABLE "escrows" ADD COLUMN "requires_approval" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "escrows" ADD COLUMN "assigned_from_application" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "escrows" ADD COLUMN "assignment_released_at" timestamp;--> statement-breakpoint
ALTER TABLE "platform_config" ADD COLUMN "max_open_applications" integer DEFAULT 5 NOT NULL;--> statement-breakpoint
ALTER TABLE "platform_config" ADD COLUMN "application_ttl_seconds" integer DEFAULT 86400 NOT NULL;--> statement-breakpoint
ALTER TABLE "gig_applications" ADD CONSTRAINT "gig_applications_escrow_id_escrows_id_fk" FOREIGN KEY ("escrow_id") REFERENCES "public"."escrows"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gig_applications" ADD CONSTRAINT "gig_applications_applicant_id_users_id_fk" FOREIGN KEY ("applicant_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "gig_applications_escrow_status_idx" ON "gig_applications" USING btree ("escrow_id","status");--> statement-breakpoint
CREATE INDEX "gig_applications_applicant_status_idx" ON "gig_applications" USING btree ("applicant_id","status");--> statement-breakpoint
CREATE INDEX "gig_applications_expiry_idx" ON "gig_applications" USING btree ("expires_at") WHERE "gig_applications"."status" = 'open';--> statement-breakpoint
ALTER TABLE "platform_config" ADD CONSTRAINT "platform_config_max_open_applications_range_chk" CHECK ("platform_config"."max_open_applications" BETWEEN 1 AND 100);--> statement-breakpoint
ALTER TABLE "platform_config" ADD CONSTRAINT "platform_config_application_ttl_range_chk" CHECK ("platform_config"."application_ttl_seconds" BETWEEN 3600 AND 2592000);