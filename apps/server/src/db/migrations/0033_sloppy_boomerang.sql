ALTER TABLE "chain_contracts" ALTER COLUMN "recorded_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "chain_contracts" ALTER COLUMN "recorded_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "escrows" ALTER COLUMN "accept_deadline" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "escrows" ALTER COLUMN "completion_deadline" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "escrows" ALTER COLUMN "submitted_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "escrows" ALTER COLUMN "approval_deadline" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "escrows" ALTER COLUMN "assignment_released_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "escrows" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "escrows" ALTER COLUMN "created_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "escrows" ALTER COLUMN "updated_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "escrows" ALTER COLUMN "updated_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "escrow_transactions" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "escrow_transactions" ALTER COLUMN "created_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "tx_attempts" ALTER COLUMN "submitted_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "tx_attempts" ALTER COLUMN "submitted_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "tx_attempts" ALTER COLUMN "confirmed_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "tx_attempts" ALTER COLUMN "failed_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "escrow_proofs" ALTER COLUMN "uploaded_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "escrow_proofs" ALTER COLUMN "uploaded_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "gig_applications" ALTER COLUMN "expires_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "gig_applications" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "gig_applications" ALTER COLUMN "created_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "gig_applications" ALTER COLUMN "updated_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "gig_applications" ALTER COLUMN "updated_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "dispute_messages" ALTER COLUMN "created_at" SET DATA TYPE timestamp (3) with time zone;--> statement-breakpoint
ALTER TABLE "dispute_messages" ALTER COLUMN "created_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "dispute_reads" ALTER COLUMN "last_read_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "dispute_reads" ALTER COLUMN "last_read_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "dispute_resolutions" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "dispute_resolutions" ALTER COLUMN "created_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "dispute_resolutions" ALTER COLUMN "updated_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "dispute_resolutions" ALTER COLUMN "updated_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "disputes" ALTER COLUMN "assigned_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "disputes" ALTER COLUMN "resolved_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "disputes" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "disputes" ALTER COLUMN "created_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "featured_slots" ALTER COLUMN "starts_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "featured_slots" ALTER COLUMN "ends_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "featured_slots" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "featured_slots" ALTER COLUMN "created_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "reviews" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "reviews" ALTER COLUMN "created_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "admin_users" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "admin_users" ALTER COLUMN "created_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "auth_nonces" ALTER COLUMN "expires_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "auth_nonces" ALTER COLUMN "consumed_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "auth_otps" ALTER COLUMN "expires_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "auth_otps" ALTER COLUMN "consumed_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "auth_otps" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "auth_otps" ALTER COLUMN "created_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "email_otps" ALTER COLUMN "expires_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "email_otps" ALTER COLUMN "consumed_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "email_otps" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "email_otps" ALTER COLUMN "created_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "gas_grants" ALTER COLUMN "granted_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "gas_grants" ALTER COLUMN "granted_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "user_identities" ALTER COLUMN "verified_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "user_identities" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "user_identities" ALTER COLUMN "created_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "user_wallets" ALTER COLUMN "verified_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "user_wallets" ALTER COLUMN "verified_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "announcements_read_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "last_active_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "created_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "updated_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "updated_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "announcements" ALTER COLUMN "published_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "announcements" ALTER COLUMN "expires_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "announcements" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "announcements" ALTER COLUMN "created_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "announcements" ALTER COLUMN "updated_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "announcements" ALTER COLUMN "updated_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "conversations" ALTER COLUMN "closed_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "conversations" ALTER COLUMN "last_message_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "conversations" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "conversations" ALTER COLUMN "created_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "device_tokens" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "device_tokens" ALTER COLUMN "created_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "device_tokens" ALTER COLUMN "updated_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "device_tokens" ALTER COLUMN "updated_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "gig_subscriptions" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "gig_subscriptions" ALTER COLUMN "created_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "messages" ALTER COLUMN "read_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "messages" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "messages" ALTER COLUMN "created_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "notifications" ALTER COLUMN "read_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "notifications" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "notifications" ALTER COLUMN "created_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "admin_audit_log" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "admin_audit_log" ALTER COLUMN "created_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "chain_cursors" ALTER COLUMN "last_processed_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "chain_cursors" ALTER COLUMN "last_processed_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "reports" ALTER COLUMN "reviewed_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "reports" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "reports" ALTER COLUMN "created_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "standing_events" ALTER COLUMN "recorded_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "standing_events" ALTER COLUMN "recorded_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "standing_overrides" ALTER COLUMN "applied_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "standing_overrides" ALTER COLUMN "applied_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "user_standing" ALTER COLUMN "restriction_until" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "user_standing" ALTER COLUMN "updated_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "user_standing" ALTER COLUMN "updated_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "category_price_stats" ALTER COLUMN "updated_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "category_price_stats" ALTER COLUMN "updated_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "moderation_overrides" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "moderation_overrides" ALTER COLUMN "created_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "moderation_verdicts" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "moderation_verdicts" ALTER COLUMN "created_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "bank_accounts" ALTER COLUMN "verified_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "bank_accounts" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "bank_accounts" ALTER COLUMN "created_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "fiat_intents" ALTER COLUMN "expires_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "fiat_intents" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "fiat_intents" ALTER COLUMN "created_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "fiat_intents" ALTER COLUMN "updated_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "fiat_intents" ALTER COLUMN "updated_at" SET DEFAULT now();