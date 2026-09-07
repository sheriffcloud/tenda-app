ALTER TABLE "chain_contracts" DROP CONSTRAINT "chain_contracts_chain_id_chains_id_fk";
--> statement-breakpoint
ALTER TABLE "chain_contracts" ADD CONSTRAINT "chain_contracts_chain_id_chains_id_fk" FOREIGN KEY ("chain_id") REFERENCES "public"."chains"("id") ON DELETE cascade ON UPDATE no action;