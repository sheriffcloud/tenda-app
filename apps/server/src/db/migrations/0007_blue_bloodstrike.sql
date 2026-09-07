CREATE TYPE "public"."otp_channel" AS ENUM('phone', 'email');--> statement-breakpoint
CREATE TABLE "auth_otps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"channel" "otp_channel" NOT NULL,
	"identifier" text NOT NULL,
	"user_id" uuid,
	"code_hash" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"consumed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "auth_otps" ADD CONSTRAINT "auth_otps_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "auth_otps_channel_identifier_idx" ON "auth_otps" USING btree ("channel","identifier","created_at");