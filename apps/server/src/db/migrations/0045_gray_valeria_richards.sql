ALTER TABLE "gig_details" ADD COLUMN "kind" "escrow_kind" DEFAULT 'gig' NOT NULL;--> statement-breakpoint
ALTER TABLE "exchange_details" ADD COLUMN "kind" "escrow_kind" DEFAULT 'exchange' NOT NULL;--> statement-breakpoint
ALTER TABLE "gig_details" ADD CONSTRAINT "gig_details_escrow_kind_fk" FOREIGN KEY ("escrow_id","kind") REFERENCES "public"."escrows"("id","kind") ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "exchange_details" ADD CONSTRAINT "exchange_details_escrow_kind_fk" FOREIGN KEY ("escrow_id","kind") REFERENCES "public"."escrows"("id","kind") ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "gig_details" ADD CONSTRAINT "gig_details_kind_chk" CHECK ("gig_details"."kind" = 'gig');--> statement-breakpoint
ALTER TABLE "exchange_details" ADD CONSTRAINT "exchange_details_kind_chk" CHECK ("exchange_details"."kind" = 'exchange');