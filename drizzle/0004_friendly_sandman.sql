CREATE TABLE "langlab"."content_challenges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"licence_id" uuid NOT NULL,
	"activation_id" uuid NOT NULL,
	"device_public_key" text NOT NULL,
	"generation" bigint NOT NULL,
	"path" text NOT NULL,
	"nonce" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "langlab"."content_challenges" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "langlab"."content_challenges" ADD CONSTRAINT "content_challenges_licence_id_licences_id_fk" FOREIGN KEY ("licence_id") REFERENCES "langlab"."licences"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "langlab"."content_challenges" ADD CONSTRAINT "content_challenges_activation_id_device_activations_id_fk" FOREIGN KEY ("activation_id") REFERENCES "langlab"."device_activations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "content_challenge_expiry" ON "langlab"."content_challenges" USING btree ("expires_at");