DELETE FROM "escrow_proofs" a
USING "escrow_proofs" b
WHERE a."escrow_id" = b."escrow_id"
  AND a."url" = b."url"
  AND a."type" = b."type"
  AND a."id" > b."id";
--> statement-breakpoint
CREATE UNIQUE INDEX "escrow_proofs_identity_uq" ON "escrow_proofs" USING btree ("escrow_id","url","type");
