CREATE TABLE "langlab"."curriculum_review_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"release_id" uuid NOT NULL,
	"manifest_digest" text NOT NULL,
	"kind" text NOT NULL,
	"actor_user_id" uuid NOT NULL,
	"reviewer" text NOT NULL,
	"reference" text NOT NULL,
	"document_url" text NOT NULL,
	"document_digest" text NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"parent_event_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "curriculum_event_kind" CHECK ("langlab"."curriculum_review_events"."kind" IN ('rights_attested','expert_review','submitted','correction_requested','correction_resolved','authority_approval','authority_rejection')),
	CONSTRAINT "curriculum_digest_bound" CHECK ("langlab"."curriculum_review_events"."manifest_digest" ~ '^[a-f0-9]{64}$' AND "langlab"."curriculum_review_events"."document_digest" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "curriculum_text_bounds" CHECK (length("langlab"."curriculum_review_events"."reviewer") BETWEEN 1 AND 200 AND length("langlab"."curriculum_review_events"."reference") BETWEEN 1 AND 500 AND length("langlab"."curriculum_review_events"."document_url") BETWEEN 1 AND 2000 AND length("langlab"."curriculum_review_events"."notes")<=4000)
);
--> statement-breakpoint
ALTER TABLE "langlab"."curriculum_review_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "langlab"."curriculum_review_events" ADD CONSTRAINT "curriculum_review_events_release_id_package_releases_id_fk" FOREIGN KEY ("release_id") REFERENCES "langlab"."package_releases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "langlab"."curriculum_review_events" ADD CONSTRAINT "curriculum_review_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "auth"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "curriculum_release_evidence" ON "langlab"."curriculum_review_events" USING btree ("release_id","manifest_digest","created_at");
--> statement-breakpoint
CREATE FUNCTION langlab.guard_curriculum_event() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE digest text; unit uuid; allowed boolean;
BEGIN
 SELECT manifest_digest,unit_id INTO digest,unit FROM langlab.package_releases WHERE id=NEW.release_id FOR UPDATE;
 IF digest IS DISTINCT FROM NEW.manifest_digest THEN RAISE EXCEPTION 'Curriculum evidence needs the current manifest digest'; END IF;
 SELECT EXISTS(SELECT 1 FROM langlab.admin_memberships m JOIN langlab.admin_roles r ON r.user_id=m.user_id WHERE m.user_id=NEW.actor_user_id AND m.status='active' AND (r.role IN ('owner','publisher') OR (r.role='content_editor' AND NEW.kind NOT IN ('authority_approval','authority_rejection')))) INTO allowed;
 IF NOT allowed THEN RAISE EXCEPTION 'Curriculum evidence actor is not authorized'; END IF;
 IF (SELECT count(*) FROM langlab.curriculum_review_events WHERE release_id=NEW.release_id)>=200 THEN RAISE EXCEPTION 'Curriculum evidence quota exceeded'; END IF;
 IF NEW.document_url !~ '^https://' THEN RAISE EXCEPTION 'Evidence document needs HTTPS'; END IF;
 IF NEW.parent_event_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM langlab.curriculum_review_events e JOIN langlab.package_releases p ON p.id=e.release_id WHERE e.id=NEW.parent_event_id AND p.unit_id=unit AND e.kind='correction_requested') THEN RAISE EXCEPTION 'Correction parent is invalid'; END IF;
 IF NEW.kind='correction_resolved' AND NEW.parent_event_id IS NULL THEN RAISE EXCEPTION 'Correction resolution needs its request'; END IF;
 RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER curriculum_event_guard BEFORE INSERT ON langlab.curriculum_review_events FOR EACH ROW EXECUTE FUNCTION langlab.guard_curriculum_event();
--> statement-breakpoint
CREATE TRIGGER curriculum_event_immutable BEFORE UPDATE OR DELETE ON langlab.curriculum_review_events FOR EACH ROW EXECUTE FUNCTION langlab.deny_audit_mutation();
--> statement-breakpoint
REVOKE ALL ON langlab.curriculum_review_events FROM PUBLIC,authenticated;
GRANT SELECT,INSERT ON langlab.curriculum_review_events TO service_role;
REVOKE EXECUTE ON FUNCTION langlab.guard_curriculum_event() FROM PUBLIC;
