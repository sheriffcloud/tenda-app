CREATE TABLE "chain_contracts" (
	"chain_id" text NOT NULL,
	"address" text NOT NULL,
	"deploy_block" integer,
	"recorded_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "chain_contracts_chain_id_address_pk" PRIMARY KEY("chain_id","address")
);
--> statement-breakpoint
ALTER TABLE "escrows" ADD COLUMN "escrow_contract" text;--> statement-breakpoint
ALTER TABLE "chain_contracts" ADD CONSTRAINT "chain_contracts_chain_id_chains_id_fk" FOREIGN KEY ("chain_id") REFERENCES "public"."chains"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "escrows_chain_contract_idx" ON "escrows" USING btree ("chain_id","escrow_contract") WHERE "escrows"."escrow_contract" IS NOT NULL;