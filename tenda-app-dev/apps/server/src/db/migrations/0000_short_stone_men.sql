CREATE TYPE "public"."chain_namespace" AS ENUM('solana', 'eip155');--> statement-breakpoint
CREATE TYPE "public"."escrow_kind" AS ENUM('gig', 'exchange');--> statement-breakpoint
CREATE TYPE "public"."escrow_status" AS ENUM('draft', 'open', 'accepted', 'submitted', 'completed', 'cancelled', 'refunded', 'disputed', 'resolved');--> statement-breakpoint
CREATE TYPE "public"."escrow_tx_type" AS ENUM('create', 'accept', 'decline', 'submit', 'approve', 'claim_stalled', 'cancel', 'refund_expired', 'reclaim_abandoned', 'dispute', 'resolve');--> statement-breakpoint
CREATE TYPE "public"."proof_type" AS ENUM('image', 'video', 'document');--> statement-breakpoint
CREATE TYPE "public"."dispute_winner" AS ENUM('creator', 'counterparty', 'split');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('user', 'dispute_admin', 'super_admin');--> statement-breakpoint
CREATE TYPE "public"."user_status" AS ENUM('active', 'suspended');--> statement-breakpoint
CREATE TYPE "public"."conversation_status" AS ENUM('active', 'closed');--> statement-breakpoint
CREATE TYPE "public"."device_platform" AS ENUM('expo', 'fcm', 'apns');--> statement-breakpoint
CREATE TYPE "public"."report_content_type" AS ENUM('escrow', 'message', 'user', 'review');--> statement-breakpoint
CREATE TYPE "public"."report_reason" AS ENUM('spam', 'harassment', 'inappropriate', 'fraud', 'other');--> statement-breakpoint
CREATE TYPE "public"."report_status" AS ENUM('pending', 'reviewed', 'actioned', 'dismissed');--> statement-breakpoint
CREATE TYPE "public"."restriction_kind" AS ENUM('accept_cooldown', 'create_cooldown', 'dispute_cooldown', 'manual_review');--> statement-breakpoint
CREATE TYPE "public"."standing_event_kind" AS ENUM('completed', 'abandoned', 'ghosted_approval', 'disputed_won', 'disputed_lost', 'fraud_confirmed', 'declined', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."moderation_decision" AS ENUM('approve', 'warn', 'block');--> statement-breakpoint
CREATE TYPE "public"."fiat_direction" AS ENUM('onramp', 'offramp');--> statement-breakpoint
CREATE TYPE "public"."fiat_intent_status" AS ENUM('quoted', 'awaiting_user', 'awaiting_provider', 'settling', 'settled', 'failed', 'cancelled');--> statement-breakpoint
CREATE TABLE "assets" (
	"id" text PRIMARY KEY NOT NULL,
	"chain_id" text NOT NULL,
	"symbol" text NOT NULL,
	"decimals" integer NOT NULL,
	"token_address" text,
	"is_stable" boolean DEFAULT false NOT NULL,
	"is_enabled" boolean DEFAULT true NOT NULL,
	CONSTRAINT "assets_id_chain_uq" UNIQUE("id","chain_id")
);
--> statement-breakpoint
CREATE TABLE "chains" (
	"id" text PRIMARY KEY NOT NULL,
	"namespace" "chain_namespace" NOT NULL,
	"display_name" text NOT NULL,
	"min_confirmations" integer DEFAULT 1 NOT NULL,
	"treasury_address" text NOT NULL,
	"escrow_program" text NOT NULL,
	"gas_seed_amount_raw" numeric(78, 0),
	"gas_seed_wallet_address" text,
	"is_enabled" boolean DEFAULT true NOT NULL,
	CONSTRAINT "chains_gas_seed_paired_chk" CHECK (("chains"."gas_seed_amount_raw" IS NULL) = ("chains"."gas_seed_wallet_address" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "escrow_proofs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"escrow_id" uuid NOT NULL,
	"url" text NOT NULL,
	"type" "proof_type" NOT NULL,
	"uploaded_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "escrow_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"escrow_id" uuid NOT NULL,
	"type" "escrow_tx_type" NOT NULL,
	"tx_ref" text NOT NULL,
	"amount_raw" numeric(78, 0),
	"platform_fee_raw" numeric(78, 0),
	"actor_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "escrow_transactions_tx_ref_uq" UNIQUE("tx_ref")
);
--> statement-breakpoint
CREATE TABLE "escrows" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" "escrow_kind" NOT NULL,
	"chain_id" text NOT NULL,
	"asset" text NOT NULL,
	"amount_raw" numeric(78, 0) NOT NULL,
	"creator_id" uuid NOT NULL,
	"counterparty_id" uuid,
	"assigned_counterparty_id" uuid,
	"status" "escrow_status" NOT NULL,
	"escrow_ref" text,
	"accept_deadline" timestamp,
	"completion_duration_seconds" integer,
	"completion_deadline" timestamp,
	"submitted_at" timestamp,
	"approval_deadline" timestamp,
	"dispute_bond_raw" numeric(78, 0) DEFAULT '0' NOT NULL,
	"is_seeker" boolean DEFAULT false NOT NULL,
	"sponsored_tx_used" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "escrows_escrow_ref_uq" UNIQUE("escrow_ref"),
	CONSTRAINT "escrows_creator_not_counterparty_chk" CHECK ("escrows"."creator_id" <> "escrows"."counterparty_id"),
	CONSTRAINT "escrows_creator_not_assigned_chk" CHECK ("escrows"."creator_id" <> "escrows"."assigned_counterparty_id"),
	CONSTRAINT "escrows_amount_positive_chk" CHECK ("escrows"."amount_raw" > 0)
);
--> statement-breakpoint
CREATE TABLE "exchange_details" (
	"escrow_id" uuid PRIMARY KEY NOT NULL,
	"fiat_amount" numeric(20, 4) NOT NULL,
	"fiat_currency" varchar(3) NOT NULL,
	"rate" numeric(30, 10) NOT NULL,
	"payment_window_seconds" integer NOT NULL,
	"payment_proof_url" text
);
--> statement-breakpoint
CREATE TABLE "gig_details" (
	"escrow_id" uuid PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"category" text NOT NULL,
	"country" text,
	"city" text,
	"latitude" double precision,
	"longitude" double precision,
	"remote" boolean DEFAULT false NOT NULL,
	"cross_border" boolean DEFAULT false NOT NULL,
	"search_vector" "tsvector" GENERATED ALWAYS AS (setweight(to_tsvector('english', coalesce("gig_details"."title", '')), 'A') || setweight(to_tsvector('english', coalesce("gig_details"."description", '')), 'B')) STORED
);
--> statement-breakpoint
CREATE TABLE "tx_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"escrow_id" uuid,
	"action" "escrow_tx_type" NOT NULL,
	"tx_ref" text NOT NULL,
	"submitted_at" timestamp DEFAULT now() NOT NULL,
	"confirmed_at" timestamp,
	"failed_at" timestamp,
	"failure_code" text,
	"was_sponsored" boolean DEFAULT false NOT NULL,
	CONSTRAINT "tx_attempts_tx_ref_uq" UNIQUE("tx_ref")
);
--> statement-breakpoint
CREATE TABLE "disputes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"escrow_id" uuid NOT NULL,
	"raised_by" uuid NOT NULL,
	"reason" text NOT NULL,
	"winner" "dispute_winner",
	"resolved_by" uuid,
	"resolved_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "disputes_escrow_id_uq" UNIQUE("escrow_id")
);
--> statement-breakpoint
CREATE TABLE "platform_config" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"fee_bps" integer DEFAULT 250 NOT NULL,
	"seeker_fee_bps" integer DEFAULT 100 NOT NULL,
	"grace_period_seconds" integer DEFAULT 3600 NOT NULL,
	"approval_window_seconds" integer DEFAULT 172800 NOT NULL,
	"default_sponsored_tx_count" integer DEFAULT 3 NOT NULL,
	"moderation_rules_version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "platform_config_singleton_chk" CHECK ("platform_config"."id" = 1),
	CONSTRAINT "platform_config_fee_bps_range_chk" CHECK ("platform_config"."fee_bps" BETWEEN 0 AND 10000 AND "platform_config"."seeker_fee_bps" BETWEEN 0 AND 10000)
);
--> statement-breakpoint
CREATE TABLE "reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"escrow_id" uuid NOT NULL,
	"reviewer_id" uuid NOT NULL,
	"reviewee_id" uuid NOT NULL,
	"score" integer NOT NULL,
	"comment" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "reviews_escrow_reviewer_uq" UNIQUE("escrow_id","reviewer_id"),
	CONSTRAINT "reviews_score_range_chk" CHECK ("reviews"."score" BETWEEN 1 AND 5),
	CONSTRAINT "reviews_reviewer_not_reviewee_chk" CHECK ("reviews"."reviewer_id" <> "reviews"."reviewee_id")
);
--> statement-breakpoint
CREATE TABLE "auth_nonces" (
	"nonce" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp NOT NULL,
	"consumed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "gas_grants" (
	"user_id" uuid NOT NULL,
	"chain_id" text NOT NULL,
	"amount_raw" numeric(78, 0) NOT NULL,
	"tx_ref" text NOT NULL,
	"granted_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "gas_grants_user_id_chain_id_pk" PRIMARY KEY("user_id","chain_id"),
	CONSTRAINT "gas_grants_tx_ref_uq" UNIQUE("tx_ref")
);
--> statement-breakpoint
CREATE TABLE "phone_otps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"phone_e164" text NOT NULL,
	"user_id" uuid,
	"code_hash" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"consumed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_wallets" (
	"chain_ns" "chain_namespace" NOT NULL,
	"address" text NOT NULL,
	"user_id" uuid NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"verified_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_wallets_chain_ns_address_pk" PRIMARY KEY("chain_ns","address")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"first_name" text DEFAULT '' NOT NULL,
	"last_name" text DEFAULT '' NOT NULL,
	"bio" text,
	"avatar_url" text,
	"country" text,
	"city" text,
	"latitude" double precision,
	"longitude" double precision,
	"phone_e164" text,
	"phone_verified_at" timestamp,
	"role" "user_role" DEFAULT 'user' NOT NULL,
	"status" "user_status" DEFAULT 'active' NOT NULL,
	"is_seeker" boolean DEFAULT false NOT NULL,
	"review_score" numeric(3, 2),
	"sponsored_tx_remaining" integer DEFAULT 3 NOT NULL,
	"advanced_mode_enabled" boolean DEFAULT false NOT NULL,
	"display_currency" varchar(3),
	"last_active_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_phone_e164_uq" UNIQUE("phone_e164")
);
--> statement-breakpoint
CREATE TABLE "announcements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" varchar(200) NOT NULL,
	"body" varchar(2000) NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"published_at" timestamp,
	"expires_at" timestamp,
	"created_by" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_a_id" uuid NOT NULL,
	"user_b_id" uuid NOT NULL,
	"status" "conversation_status" DEFAULT 'active' NOT NULL,
	"closed_by" uuid,
	"closed_at" timestamp,
	"last_message_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "conversations_user_pair_unique" UNIQUE("user_a_id","user_b_id")
);
--> statement-breakpoint
CREATE TABLE "device_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token" text NOT NULL,
	"platform" "device_platform" DEFAULT 'expo' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "device_tokens_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "gig_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"city" text DEFAULT '*' NOT NULL,
	"category" text DEFAULT '*' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "gig_subscriptions_unique" UNIQUE("user_id","city","category")
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"sender_id" uuid NOT NULL,
	"escrow_id" uuid,
	"content" varchar(2000) NOT NULL,
	"attachment_url" text,
	"attachment_type" text,
	"attachment_size" integer,
	"read_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "admin_audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"admin_id" uuid,
	"admin_role" text NOT NULL,
	"action" text NOT NULL,
	"target_type" text,
	"target_id" text,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chain_cursors" (
	"chain_id" text PRIMARY KEY NOT NULL,
	"last_block" bigint DEFAULT 0 NOT NULL,
	"last_processed_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reporter_id" uuid NOT NULL,
	"reported_user_id" uuid NOT NULL,
	"content_type" "report_content_type" NOT NULL,
	"content_id" uuid NOT NULL,
	"reason" "report_reason" NOT NULL,
	"note" varchar(500),
	"content_snapshot" varchar(2000),
	"status" "report_status" DEFAULT 'pending' NOT NULL,
	"admin_note" varchar(1000),
	"reviewed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "reports_reporter_content_unique" UNIQUE("reporter_id","content_type","content_id")
);
--> statement-breakpoint
CREATE TABLE "standing_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"escrow_id" uuid,
	"kind" "standing_event_kind" NOT NULL,
	"role" text NOT NULL,
	"recorded_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "standing_overrides" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"action" text NOT NULL,
	"reason" text NOT NULL,
	"applied_by" uuid NOT NULL,
	"applied_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_standing" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"completed_count" integer DEFAULT 0 NOT NULL,
	"abandoned_count" integer DEFAULT 0 NOT NULL,
	"ghosted_count" integer DEFAULT 0 NOT NULL,
	"disputed_won_count" integer DEFAULT 0 NOT NULL,
	"disputed_lost_count" integer DEFAULT 0 NOT NULL,
	"fraud_confirmed_count" integer DEFAULT 0 NOT NULL,
	"restriction_until" timestamp,
	"restriction_kind" "restriction_kind",
	"restriction_reason" text,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_standing_restriction_paired_chk" CHECK (("user_standing"."restriction_kind" IS NULL) = ("user_standing"."restriction_reason" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "category_price_stats" (
	"category" text NOT NULL,
	"country" text NOT NULL,
	"asset" text NOT NULL,
	"p10_amount_raw" numeric(78, 0),
	"p50_amount_raw" numeric(78, 0),
	"p90_amount_raw" numeric(78, 0),
	"sample_size" integer NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "category_price_stats_category_country_asset_pk" PRIMARY KEY("category","country","asset")
);
--> statement-breakpoint
CREATE TABLE "moderation_overrides" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"category" text,
	"country" text,
	"rule" text NOT NULL,
	"value" text NOT NULL,
	"reason" text,
	"created_by" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "moderation_verdicts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subject_kind" text NOT NULL,
	"subject_id" uuid,
	"input_hash" text NOT NULL,
	"decision" "moderation_decision" NOT NULL,
	"reasons" jsonb NOT NULL,
	"provider" text NOT NULL,
	"model" text,
	"cost_usd" numeric(10, 6),
	"latency_ms" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bank_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"country" text NOT NULL,
	"bank_code" text NOT NULL,
	"account_number" text NOT NULL,
	"account_name" text NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"verified_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "bank_accounts_user_acct_uq" UNIQUE("user_id","bank_code","account_number")
);
--> statement-breakpoint
CREATE TABLE "fiat_intents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"direction" "fiat_direction" NOT NULL,
	"user_id" uuid NOT NULL,
	"wallet_address" text NOT NULL,
	"chain_id" text NOT NULL,
	"provider" text NOT NULL,
	"fiat_currency" varchar(3) NOT NULL,
	"fiat_amount" numeric(20, 4) NOT NULL,
	"asset" text NOT NULL,
	"asset_amount_raw" numeric(78, 0) NOT NULL,
	"rate" numeric(30, 10) NOT NULL,
	"fee_amount" numeric(20, 4) NOT NULL,
	"status" "fiat_intent_status" NOT NULL,
	"provider_ref" text,
	"kyc_required" boolean DEFAULT false NOT NULL,
	"kyc_url" text,
	"expires_at" timestamp NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fiat_providers" (
	"id" text PRIMARY KEY NOT NULL,
	"display_name" text NOT NULL,
	"capabilities" jsonb NOT NULL,
	"priority" integer DEFAULT 100 NOT NULL,
	"is_enabled" boolean DEFAULT true NOT NULL,
	"config" jsonb
);
--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_chain_id_chains_id_fk" FOREIGN KEY ("chain_id") REFERENCES "public"."chains"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "escrow_proofs" ADD CONSTRAINT "escrow_proofs_escrow_id_escrows_id_fk" FOREIGN KEY ("escrow_id") REFERENCES "public"."escrows"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "escrow_transactions" ADD CONSTRAINT "escrow_transactions_escrow_id_escrows_id_fk" FOREIGN KEY ("escrow_id") REFERENCES "public"."escrows"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "escrow_transactions" ADD CONSTRAINT "escrow_transactions_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "escrows" ADD CONSTRAINT "escrows_chain_id_chains_id_fk" FOREIGN KEY ("chain_id") REFERENCES "public"."chains"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "escrows" ADD CONSTRAINT "escrows_creator_id_users_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "escrows" ADD CONSTRAINT "escrows_counterparty_id_users_id_fk" FOREIGN KEY ("counterparty_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "escrows" ADD CONSTRAINT "escrows_assigned_counterparty_id_users_id_fk" FOREIGN KEY ("assigned_counterparty_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "escrows" ADD CONSTRAINT "escrows_asset_chain_fk" FOREIGN KEY ("asset","chain_id") REFERENCES "public"."assets"("id","chain_id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "exchange_details" ADD CONSTRAINT "exchange_details_escrow_id_escrows_id_fk" FOREIGN KEY ("escrow_id") REFERENCES "public"."escrows"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gig_details" ADD CONSTRAINT "gig_details_escrow_id_escrows_id_fk" FOREIGN KEY ("escrow_id") REFERENCES "public"."escrows"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tx_attempts" ADD CONSTRAINT "tx_attempts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tx_attempts" ADD CONSTRAINT "tx_attempts_escrow_id_escrows_id_fk" FOREIGN KEY ("escrow_id") REFERENCES "public"."escrows"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "disputes" ADD CONSTRAINT "disputes_escrow_id_escrows_id_fk" FOREIGN KEY ("escrow_id") REFERENCES "public"."escrows"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "disputes" ADD CONSTRAINT "disputes_raised_by_users_id_fk" FOREIGN KEY ("raised_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "disputes" ADD CONSTRAINT "disputes_resolved_by_users_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_escrow_id_escrows_id_fk" FOREIGN KEY ("escrow_id") REFERENCES "public"."escrows"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_reviewer_id_users_id_fk" FOREIGN KEY ("reviewer_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_reviewee_id_users_id_fk" FOREIGN KEY ("reviewee_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gas_grants" ADD CONSTRAINT "gas_grants_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gas_grants" ADD CONSTRAINT "gas_grants_chain_id_chains_id_fk" FOREIGN KEY ("chain_id") REFERENCES "public"."chains"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "phone_otps" ADD CONSTRAINT "phone_otps_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_wallets" ADD CONSTRAINT "user_wallets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_user_a_id_users_id_fk" FOREIGN KEY ("user_a_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_user_b_id_users_id_fk" FOREIGN KEY ("user_b_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_closed_by_users_id_fk" FOREIGN KEY ("closed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device_tokens" ADD CONSTRAINT "device_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gig_subscriptions" ADD CONSTRAINT "gig_subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_sender_id_users_id_fk" FOREIGN KEY ("sender_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_escrow_id_escrows_id_fk" FOREIGN KEY ("escrow_id") REFERENCES "public"."escrows"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_audit_log" ADD CONSTRAINT "admin_audit_log_admin_id_users_id_fk" FOREIGN KEY ("admin_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chain_cursors" ADD CONSTRAINT "chain_cursors_chain_id_chains_id_fk" FOREIGN KEY ("chain_id") REFERENCES "public"."chains"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_reporter_id_users_id_fk" FOREIGN KEY ("reporter_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_reported_user_id_users_id_fk" FOREIGN KEY ("reported_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "standing_events" ADD CONSTRAINT "standing_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "standing_events" ADD CONSTRAINT "standing_events_escrow_id_escrows_id_fk" FOREIGN KEY ("escrow_id") REFERENCES "public"."escrows"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "standing_overrides" ADD CONSTRAINT "standing_overrides_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "standing_overrides" ADD CONSTRAINT "standing_overrides_applied_by_users_id_fk" FOREIGN KEY ("applied_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_standing" ADD CONSTRAINT "user_standing_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "moderation_overrides" ADD CONSTRAINT "moderation_overrides_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_accounts" ADD CONSTRAINT "bank_accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fiat_intents" ADD CONSTRAINT "fiat_intents_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fiat_intents" ADD CONSTRAINT "fiat_intents_chain_id_chains_id_fk" FOREIGN KEY ("chain_id") REFERENCES "public"."chains"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fiat_intents" ADD CONSTRAINT "fiat_intents_provider_fiat_providers_id_fk" FOREIGN KEY ("provider") REFERENCES "public"."fiat_providers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fiat_intents" ADD CONSTRAINT "fiat_intents_asset_assets_id_fk" FOREIGN KEY ("asset") REFERENCES "public"."assets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "assets_chain_token_uq" ON "assets" USING btree ("chain_id","token_address") WHERE "assets"."token_address" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "assets_one_native_per_chain_uq" ON "assets" USING btree ("chain_id") WHERE "assets"."token_address" IS NULL;--> statement-breakpoint
CREATE INDEX "escrow_proofs_escrow_idx" ON "escrow_proofs" USING btree ("escrow_id");--> statement-breakpoint
CREATE INDEX "escrow_transactions_escrow_idx" ON "escrow_transactions" USING btree ("escrow_id");--> statement-breakpoint
CREATE INDEX "escrow_transactions_created_at_idx" ON "escrow_transactions" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "escrows_status_idx" ON "escrows" USING btree ("status");--> statement-breakpoint
CREATE INDEX "escrows_chain_idx" ON "escrows" USING btree ("chain_id");--> statement-breakpoint
CREATE INDEX "escrows_creator_idx" ON "escrows" USING btree ("creator_id");--> statement-breakpoint
CREATE INDEX "escrows_counterparty_idx" ON "escrows" USING btree ("counterparty_id");--> statement-breakpoint
CREATE INDEX "escrows_assigned_idx" ON "escrows" USING btree ("assigned_counterparty_id") WHERE "escrows"."assigned_counterparty_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "escrows_accept_deadline_idx" ON "escrows" USING btree ("accept_deadline");--> statement-breakpoint
CREATE INDEX "escrows_approval_deadline_idx" ON "escrows" USING btree ("approval_deadline");--> statement-breakpoint
CREATE INDEX "gig_details_category_idx" ON "gig_details" USING btree ("category");--> statement-breakpoint
CREATE INDEX "gig_details_country_idx" ON "gig_details" USING btree ("country");--> statement-breakpoint
CREATE INDEX "gig_details_search_idx" ON "gig_details" USING gin ("search_vector");--> statement-breakpoint
CREATE INDEX "tx_attempts_pending_idx" ON "tx_attempts" USING btree ("submitted_at") WHERE "tx_attempts"."confirmed_at" IS NULL AND "tx_attempts"."failed_at" IS NULL;--> statement-breakpoint
CREATE INDEX "tx_attempts_user_idx" ON "tx_attempts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "auth_nonces_expires_idx" ON "auth_nonces" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "gas_grants_chain_idx" ON "gas_grants" USING btree ("chain_id");--> statement-breakpoint
CREATE INDEX "phone_otps_phone_idx" ON "phone_otps" USING btree ("phone_e164","created_at");--> statement-breakpoint
CREATE INDEX "user_wallets_user_idx" ON "user_wallets" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "user_wallets_one_primary_per_user_idx" ON "user_wallets" USING btree ("user_id") WHERE "user_wallets"."is_primary" = true;--> statement-breakpoint
CREATE INDEX "user_wallets_address_prefix_idx" ON "user_wallets" USING btree ("address" text_pattern_ops);--> statement-breakpoint
CREATE INDEX "users_country_idx" ON "users" USING btree ("country");--> statement-breakpoint
CREATE INDEX "announcements_active_priority_idx" ON "announcements" USING btree ("is_active","priority");--> statement-breakpoint
CREATE INDEX "announcements_expires_at_idx" ON "announcements" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "conversations_user_a_idx" ON "conversations" USING btree ("user_a_id");--> statement-breakpoint
CREATE INDEX "conversations_user_b_idx" ON "conversations" USING btree ("user_b_id");--> statement-breakpoint
CREATE INDEX "conversations_user_a_last_msg_idx" ON "conversations" USING btree ("user_a_id","last_message_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "conversations_user_b_last_msg_idx" ON "conversations" USING btree ("user_b_id","last_message_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "device_tokens_user_id_idx" ON "device_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "gig_subscriptions_user_id_idx" ON "gig_subscriptions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "gig_subscriptions_city_category_idx" ON "gig_subscriptions" USING btree ("city","category");--> statement-breakpoint
CREATE INDEX "messages_conversation_created_at_idx" ON "messages" USING btree ("conversation_id","created_at");--> statement-breakpoint
CREATE INDEX "messages_sender_id_idx" ON "messages" USING btree ("sender_id");--> statement-breakpoint
CREATE INDEX "messages_unread_idx" ON "messages" USING btree ("conversation_id","sender_id") WHERE "messages"."read_at" IS NULL;--> statement-breakpoint
CREATE INDEX "audit_log_admin_created_idx" ON "admin_audit_log" USING btree ("admin_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_log_target_idx" ON "admin_audit_log" USING btree ("target_type","target_id");--> statement-breakpoint
CREATE INDEX "audit_log_created_at_idx" ON "admin_audit_log" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "reports_status_idx" ON "reports" USING btree ("status");--> statement-breakpoint
CREATE INDEX "reports_content_type_status_idx" ON "reports" USING btree ("content_type","status");--> statement-breakpoint
CREATE INDEX "reports_content_id_idx" ON "reports" USING btree ("content_id");--> statement-breakpoint
CREATE INDEX "reports_created_at_idx" ON "reports" USING btree ("created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "reports_reported_user_id_idx" ON "reports" USING btree ("reported_user_id");--> statement-breakpoint
CREATE INDEX "standing_events_user_idx" ON "standing_events" USING btree ("user_id","recorded_at");--> statement-breakpoint
CREATE INDEX "user_standing_restriction_idx" ON "user_standing" USING btree ("restriction_until") WHERE "user_standing"."restriction_until" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "moderation_verdicts_subject_idx" ON "moderation_verdicts" USING btree ("subject_kind","subject_id");--> statement-breakpoint
CREATE INDEX "moderation_verdicts_hash_idx" ON "moderation_verdicts" USING btree ("input_hash");--> statement-breakpoint
CREATE INDEX "fiat_intents_user_idx" ON "fiat_intents" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "fiat_intents_status_idx" ON "fiat_intents" USING btree ("status");--> statement-breakpoint
CREATE INDEX "fiat_intents_provider_ref_idx" ON "fiat_intents" USING btree ("provider","provider_ref");