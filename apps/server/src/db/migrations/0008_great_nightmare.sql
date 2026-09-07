ALTER TABLE "phone_otps" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "phone_otps" CASCADE;--> statement-breakpoint
ALTER TABLE "users" DROP CONSTRAINT "users_phone_e164_uq";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "phone_e164";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "phone_verified_at";