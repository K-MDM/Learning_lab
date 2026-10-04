CREATE TABLE "langlab"."activation_challenges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"licence_id" uuid NOT NULL,
	"device_public_key" text NOT NULL,
	"platform" text NOT NULL,
	"purpose" text NOT NULL,
	"nonce" text NOT NULL,
	"generation" bigint NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	CONSTRAINT "challenge_platform" CHECK ("langlab"."activation_challenges"."platform" IN ('android','windows')),
	CONSTRAINT "challenge_purpose" CHECK ("langlab"."activation_challenges"."purpose" IN ('activate','status'))
);
--> statement-breakpoint
ALTER TABLE "langlab"."activation_challenges" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "langlab"."activation_rate_limits" (
	"scope" text PRIMARY KEY NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"requests" integer NOT NULL,
	CONSTRAINT "activation_rate_positive" CHECK ("langlab"."activation_rate_limits"."requests">0)
);
--> statement-breakpoint
ALTER TABLE "langlab"."activation_rate_limits" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "langlab"."activation_challenges" ADD CONSTRAINT "activation_challenges_licence_id_licences_id_fk" FOREIGN KEY ("licence_id") REFERENCES "langlab"."licences"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "challenge_expiry" ON "langlab"."activation_challenges" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "activation_rate_window" ON "langlab"."activation_rate_limits" USING btree ("window_start");