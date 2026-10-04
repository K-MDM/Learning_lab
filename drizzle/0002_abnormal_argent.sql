CREATE TABLE "langlab"."licence_issuance_requests" (
	"id" uuid PRIMARY KEY NOT NULL,
	"actor_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "langlab"."licence_issuance_requests" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "langlab"."licence_issuance_requests" ADD CONSTRAINT "licence_issuance_requests_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "auth"."users"("id") ON DELETE no action ON UPDATE no action;