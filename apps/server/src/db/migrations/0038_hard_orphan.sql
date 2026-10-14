CREATE TABLE "gas_seed_settings" (
	"chain_id" text PRIMARY KEY NOT NULL,
	"claims_enabled" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "gas_grants" ADD COLUMN "wallet_address" text;--> statement-breakpoint
ALTER TABLE "gas_grants" ADD COLUMN "funder_address" text;--> statement-breakpoint
ALTER TABLE "gas_seed_settings" ADD CONSTRAINT "gas_seed_settings_chain_id_chains_id_fk" FOREIGN KEY ("chain_id") REFERENCES "public"."chains"("id") ON DELETE cascade ON UPDATE no action;