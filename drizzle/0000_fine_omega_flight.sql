CREATE SCHEMA IF NOT EXISTS langlab;
--> statement-breakpoint
CREATE TABLE "langlab"."admin_audit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_user_id" uuid,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "langlab"."admin_audit_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "langlab"."admin_memberships" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "admin_memberships_check_0" CHECK (status IN ('active','disabled'))
);
--> statement-breakpoint
ALTER TABLE "langlab"."admin_memberships" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "langlab"."admin_roles" (
	"user_id" uuid NOT NULL,
	"role" text NOT NULL,
	CONSTRAINT "admin_roles_user_id_role_pk" PRIMARY KEY("user_id","role"),
	CONSTRAINT "admin_roles_check_0" CHECK (role IN ('owner','licence_manager','content_editor','publisher'))
);
--> statement-breakpoint
ALTER TABLE "langlab"."admin_roles" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "langlab"."assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"object_key" text NOT NULL,
	"sha256" text NOT NULL,
	"byte_size" bigint NOT NULL,
	"mime_type" text NOT NULL,
	CONSTRAINT "assets_object_key_unique" UNIQUE("object_key"),
	CONSTRAINT "assets_check_0" CHECK (sha256 ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "assets_check_1" CHECK (byte_size>=0)
);
--> statement-breakpoint
ALTER TABLE "langlab"."assets" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "langlab"."collection_units" (
	"collection_id" uuid NOT NULL,
	"unit_id" uuid NOT NULL,
	CONSTRAINT "collection_units_collection_id_unit_id_pk" PRIMARY KEY("collection_id","unit_id")
);
--> statement-breakpoint
ALTER TABLE "langlab"."collection_units" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "langlab"."content_collections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"title" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	CONSTRAINT "content_collections_code_unique" UNIQUE("code"),
	CONSTRAINT "content_collections_check_0" CHECK (status IN ('draft','active','withdrawn'))
);
--> statement-breakpoint
ALTER TABLE "langlab"."content_collections" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "langlab"."courses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"language_code" text NOT NULL,
	"level_id" uuid NOT NULL,
	"title" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "langlab"."courses" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "langlab"."curriculum_outcomes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"authority" text NOT NULL,
	"reference" text NOT NULL,
	"description" text NOT NULL,
	CONSTRAINT "curriculum_outcomes_unique_0" UNIQUE("authority","reference")
);
--> statement-breakpoint
ALTER TABLE "langlab"."curriculum_outcomes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "langlab"."device_activations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"licence_id" uuid NOT NULL,
	"device_public_key" text NOT NULL,
	"platform" text NOT NULL,
	"generation" bigint NOT NULL,
	"activated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone,
	CONSTRAINT "device_activations_unique_2" UNIQUE("licence_id","generation"),
	CONSTRAINT "device_activations_check_0" CHECK (platform IN ('android','windows')),
	CONSTRAINT "device_activations_check_1" CHECK (generation>0),
	CONSTRAINT "device_activations_check_3" CHECK (ended_at IS NULL OR ended_at>=activated_at)
);
--> statement-breakpoint
ALTER TABLE "langlab"."device_activations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "langlab"."languages" (
	"code" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"native_name" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "langlab"."languages" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "langlab"."learning_levels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"stage" text NOT NULL,
	"grade" integer,
	"proficiency" text,
	CONSTRAINT "learning_levels_code_unique" UNIQUE("code"),
	CONSTRAINT "learning_levels_check_0" CHECK (grade BETWEEN 1 AND 12)
);
--> statement-breakpoint
ALTER TABLE "langlab"."learning_levels" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "langlab"."lesson_outcome_mappings" (
	"lesson_version_id" uuid NOT NULL,
	"outcome_id" uuid NOT NULL,
	CONSTRAINT "lesson_outcome_mappings_lesson_version_id_outcome_id_pk" PRIMARY KEY("lesson_version_id","outcome_id")
);
--> statement-breakpoint
ALTER TABLE "langlab"."lesson_outcome_mappings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "langlab"."lesson_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lesson_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"payload" jsonb NOT NULL,
	"review_status" text DEFAULT 'draft' NOT NULL,
	"published_at" timestamp with time zone,
	CONSTRAINT "lesson_versions_unique_3" UNIQUE("lesson_id","version"),
	CONSTRAINT "lesson_versions_check_0" CHECK (version>0),
	CONSTRAINT "lesson_versions_check_1" CHECK (jsonb_typeof(payload)='object'),
	CONSTRAINT "lesson_versions_check_2" CHECK (review_status IN ('draft','reviewed')),
	CONSTRAINT "lesson_versions_check_4" CHECK (published_at IS NULL OR review_status='reviewed')
);
--> statement-breakpoint
ALTER TABLE "langlab"."lesson_versions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "langlab"."lessons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"unit_id" uuid NOT NULL,
	"skill_code" text NOT NULL,
	"position" integer NOT NULL,
	CONSTRAINT "lessons_unique_1" UNIQUE("unit_id","position"),
	CONSTRAINT "lessons_check_0" CHECK (position>=0)
);
--> statement-breakpoint
ALTER TABLE "langlab"."lessons" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "langlab"."licence_entitlements" (
	"licence_id" uuid NOT NULL,
	"collection_id" uuid NOT NULL,
	CONSTRAINT "licence_entitlements_licence_id_collection_id_pk" PRIMARY KEY("licence_id","collection_id")
);
--> statement-breakpoint
ALTER TABLE "langlab"."licence_entitlements" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "langlab"."licence_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"licence_id" uuid NOT NULL,
	"activation_id" uuid,
	"actor_user_id" uuid,
	"action" text NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "licence_events_check_0" CHECK (jsonb_typeof(metadata)='object')
);
--> statement-breakpoint
ALTER TABLE "langlab"."licence_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "langlab"."licences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key_digest" text NOT NULL,
	"digest_key_version" integer DEFAULT 1 NOT NULL,
	"display_suffix" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"duration_months" integer DEFAULT 12 NOT NULL,
	"first_activated_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"generation" bigint DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "licences_key_digest_unique" UNIQUE("key_digest"),
	CONSTRAINT "licences_check_0" CHECK (key_digest ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "licences_check_1" CHECK (digest_key_version>0),
	CONSTRAINT "licences_check_2" CHECK (status IN ('pending','active','expired','revoked')),
	CONSTRAINT "licences_check_3" CHECK (duration_months=12),
	CONSTRAINT "licences_check_4" CHECK (generation>0),
	CONSTRAINT "licences_check_5" CHECK ((first_activated_at IS NULL)=(expires_at IS NULL)),
	CONSTRAINT "licences_check_6" CHECK (expires_at IS NULL OR expires_at>first_activated_at),
	CONSTRAINT "licences_check_7" CHECK (status<>'active' OR first_activated_at IS NOT NULL)
);
--> statement-breakpoint
ALTER TABLE "langlab"."licences" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "langlab"."package_assets" (
	"release_id" uuid NOT NULL,
	"asset_id" uuid NOT NULL,
	"relative_path" text NOT NULL,
	CONSTRAINT "package_assets_release_id_relative_path_pk" PRIMARY KEY("release_id","relative_path"),
	CONSTRAINT "package_assets_check_0" CHECK (relative_path !~ '(^/|\\|:|(^|/)\.\.(/|$))')
);
--> statement-breakpoint
ALTER TABLE "langlab"."package_assets" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "langlab"."package_lessons" (
	"release_id" uuid NOT NULL,
	"lesson_version_id" uuid NOT NULL,
	"position" integer NOT NULL,
	CONSTRAINT "package_lessons_release_id_lesson_version_id_pk" PRIMARY KEY("release_id","lesson_version_id"),
	CONSTRAINT "package_lessons_unique_1" UNIQUE("release_id","position"),
	CONSTRAINT "package_lessons_check_0" CHECK (position>=0)
);
--> statement-breakpoint
ALTER TABLE "langlab"."package_lessons" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "langlab"."package_releases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"unit_id" uuid NOT NULL,
	"version" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"manifest" jsonb NOT NULL,
	"manifest_digest" text NOT NULL,
	"minimum_app_version" text NOT NULL,
	"published_at" timestamp with time zone,
	CONSTRAINT "package_releases_unique_4" UNIQUE("unit_id","version"),
	CONSTRAINT "package_releases_check_0" CHECK (version ~ '^[0-9]+\.[0-9]+\.[0-9]+$'),
	CONSTRAINT "package_releases_check_1" CHECK (status IN ('draft','published','withdrawn')),
	CONSTRAINT "package_releases_check_2" CHECK (jsonb_typeof(manifest)='object'),
	CONSTRAINT "package_releases_check_3" CHECK (manifest_digest ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "package_releases_check_5" CHECK (status='draft' OR published_at IS NOT NULL)
);
--> statement-breakpoint
ALTER TABLE "langlab"."package_releases" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "langlab"."skills" (
	"code" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "langlab"."skills" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "langlab"."units" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"course_id" uuid NOT NULL,
	"title" text NOT NULL,
	"position" integer NOT NULL,
	CONSTRAINT "units_unique_1" UNIQUE("course_id","position"),
	CONSTRAINT "units_check_0" CHECK (position>=0)
);
--> statement-breakpoint
ALTER TABLE "langlab"."units" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "langlab"."admin_audit_events" ADD CONSTRAINT "admin_audit_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "auth"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "langlab"."admin_memberships" ADD CONSTRAINT "admin_memberships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "langlab"."admin_roles" ADD CONSTRAINT "admin_roles_user_id_admin_memberships_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "langlab"."admin_memberships"("user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "langlab"."collection_units" ADD CONSTRAINT "collection_units_collection_id_content_collections_id_fk" FOREIGN KEY ("collection_id") REFERENCES "langlab"."content_collections"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "langlab"."collection_units" ADD CONSTRAINT "collection_units_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "langlab"."units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "langlab"."courses" ADD CONSTRAINT "courses_language_code_languages_code_fk" FOREIGN KEY ("language_code") REFERENCES "langlab"."languages"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "langlab"."courses" ADD CONSTRAINT "courses_level_id_learning_levels_id_fk" FOREIGN KEY ("level_id") REFERENCES "langlab"."learning_levels"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "langlab"."device_activations" ADD CONSTRAINT "device_activations_licence_id_licences_id_fk" FOREIGN KEY ("licence_id") REFERENCES "langlab"."licences"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "langlab"."lesson_outcome_mappings" ADD CONSTRAINT "lesson_outcome_mappings_lesson_version_id_lesson_versions_id_fk" FOREIGN KEY ("lesson_version_id") REFERENCES "langlab"."lesson_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "langlab"."lesson_outcome_mappings" ADD CONSTRAINT "lesson_outcome_mappings_outcome_id_curriculum_outcomes_id_fk" FOREIGN KEY ("outcome_id") REFERENCES "langlab"."curriculum_outcomes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "langlab"."lesson_versions" ADD CONSTRAINT "lesson_versions_lesson_id_lessons_id_fk" FOREIGN KEY ("lesson_id") REFERENCES "langlab"."lessons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "langlab"."lessons" ADD CONSTRAINT "lessons_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "langlab"."units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "langlab"."lessons" ADD CONSTRAINT "lessons_skill_code_skills_code_fk" FOREIGN KEY ("skill_code") REFERENCES "langlab"."skills"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "langlab"."licence_entitlements" ADD CONSTRAINT "licence_entitlements_licence_id_licences_id_fk" FOREIGN KEY ("licence_id") REFERENCES "langlab"."licences"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "langlab"."licence_entitlements" ADD CONSTRAINT "licence_entitlements_collection_id_content_collections_id_fk" FOREIGN KEY ("collection_id") REFERENCES "langlab"."content_collections"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "langlab"."licence_events" ADD CONSTRAINT "licence_events_licence_id_licences_id_fk" FOREIGN KEY ("licence_id") REFERENCES "langlab"."licences"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "langlab"."licence_events" ADD CONSTRAINT "licence_events_activation_id_device_activations_id_fk" FOREIGN KEY ("activation_id") REFERENCES "langlab"."device_activations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "langlab"."licence_events" ADD CONSTRAINT "licence_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "auth"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "langlab"."package_assets" ADD CONSTRAINT "package_assets_release_id_package_releases_id_fk" FOREIGN KEY ("release_id") REFERENCES "langlab"."package_releases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "langlab"."package_assets" ADD CONSTRAINT "package_assets_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "langlab"."assets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "langlab"."package_lessons" ADD CONSTRAINT "package_lessons_release_id_package_releases_id_fk" FOREIGN KEY ("release_id") REFERENCES "langlab"."package_releases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "langlab"."package_lessons" ADD CONSTRAINT "package_lessons_lesson_version_id_lesson_versions_id_fk" FOREIGN KEY ("lesson_version_id") REFERENCES "langlab"."lesson_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "langlab"."package_releases" ADD CONSTRAINT "package_releases_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "langlab"."units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "langlab"."units" ADD CONSTRAINT "units_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "langlab"."courses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "collection_unit_reverse" ON "langlab"."collection_units" USING btree ("unit_id","collection_id");--> statement-breakpoint
CREATE INDEX "course_catalogue" ON "langlab"."courses" USING btree ("language_code","level_id");--> statement-breakpoint
CREATE UNIQUE INDEX "one_current_device_per_licence" ON "langlab"."device_activations" USING btree ("licence_id") WHERE ended_at IS NULL;--> statement-breakpoint
CREATE INDEX "licence_event_history" ON "langlab"."licence_events" USING btree ("licence_id","created_at");--> statement-breakpoint
CREATE INDEX "licence_status_expiry" ON "langlab"."licences" USING btree ("status","expires_at");--> statement-breakpoint
CREATE INDEX "package_asset_reverse" ON "langlab"."package_assets" USING btree ("asset_id");--> statement-breakpoint
CREATE INDEX "package_lesson_reverse" ON "langlab"."package_lessons" USING btree ("lesson_version_id");--> statement-breakpoint
CREATE POLICY "own_membership" ON "langlab"."admin_memberships" AS PERMISSIVE FOR SELECT TO "authenticated" USING ("langlab"."admin_memberships"."user_id"=auth.uid());--> statement-breakpoint
CREATE POLICY "own_roles" ON "langlab"."admin_roles" AS PERMISSIVE FOR SELECT TO "authenticated" USING ("langlab"."admin_roles"."user_id"=auth.uid());
