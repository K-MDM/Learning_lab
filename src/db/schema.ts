// Code-first langlab models. Generated once from the reviewed foundation.
// Change this file and run npm run db:generate for subsequent schema changes.
import {sql} from 'drizzle-orm';
import {pgSchema,pgPolicy,pgRole,uuid,text,integer,bigint,timestamp,jsonb,primaryKey,unique,uniqueIndex,index,check} from 'drizzle-orm/pg-core';
const lab=pgSchema('langlab');
const authUsers=pgSchema('auth').table('users',{id:uuid('id').primaryKey()});
const authenticated=pgRole('authenticated').existing();

// Records successful issuance requests without retaining the plaintext keys.
export const licenceIssuanceRequests=lab.table('licence_issuance_requests',{
  id:uuid('id').primaryKey(),
  actorUserId:uuid('actor_user_id').notNull().references(()=>authUsers.id),
  createdAt:timestamp('created_at',{withTimezone:true}).notNull().defaultNow()
}).enableRLS();

export const adminMemberships=lab.table('admin_memberships',{
  userId:uuid('user_id').primaryKey().references(()=>authUsers.id),
  status:text('status').notNull().default("active"),
  createdAt:timestamp('created_at',{withTimezone:true}).notNull().defaultNow()
},t=>[
  check('admin_memberships_check_0',sql.raw("status IN ('active','disabled')")),
  pgPolicy('own_membership',{for:'select',to:authenticated,using:sql`${t.userId}=auth.uid()`})
]).enableRLS();

export const adminRoles=lab.table('admin_roles',{
  userId:uuid('user_id').notNull().references(()=>adminMemberships.userId),
  role:text('role').notNull()
},t=>[
  check('admin_roles_check_0',sql.raw("role IN ('owner','licence_manager','content_editor','publisher')")),
  primaryKey({columns:[t.userId,t.role]}),
  pgPolicy('own_roles',{for:'select',to:authenticated,using:sql`${t.userId}=auth.uid()`})
]).enableRLS();

export const licences=lab.table('licences',{
  id:uuid('id').primaryKey().defaultRandom(),
  keyDigest:text('key_digest').notNull().unique(),
  digestKeyVersion:integer('digest_key_version').notNull().default(1),
  displaySuffix:text('display_suffix').notNull(),
  status:text('status').notNull().default("pending"),
  durationMonths:integer('duration_months').notNull().default(12),
  firstActivatedAt:timestamp('first_activated_at',{withTimezone:true}),
  expiresAt:timestamp('expires_at',{withTimezone:true}),
  generation:bigint('generation',{mode:'bigint'}).notNull().default(sql`1`),
  createdAt:timestamp('created_at',{withTimezone:true}).notNull().defaultNow()
},t=>[
  check('licences_check_0',sql.raw("key_digest ~ '^[a-f0-9]{64}$'")),
  check('licences_check_1',sql.raw("digest_key_version>0")),
  check('licences_check_2',sql.raw("status IN ('pending','active','expired','revoked')")),
  check('licences_check_3',sql.raw("duration_months=12")),
  check('licences_check_4',sql.raw("generation>0")),
  check('licences_check_5',sql.raw("(first_activated_at IS NULL)=(expires_at IS NULL)")),
  check('licences_check_6',sql.raw("expires_at IS NULL OR expires_at>first_activated_at")),
  check('licences_check_7',sql.raw("status<>'active' OR first_activated_at IS NOT NULL")),
  index('licence_status_expiry').on(t.status,t.expiresAt)
]).enableRLS();

export const deviceActivations=lab.table('device_activations',{
  id:uuid('id').primaryKey().defaultRandom(),
  licenceId:uuid('licence_id').notNull().references(()=>licences.id),
  devicePublicKey:text('device_public_key').notNull(),
  platform:text('platform').notNull(),
  generation:bigint('generation',{mode:'bigint'}).notNull(),
  activatedAt:timestamp('activated_at',{withTimezone:true}).notNull().defaultNow(),
  endedAt:timestamp('ended_at',{withTimezone:true})
},t=>[
  check('device_activations_check_0',sql.raw("platform IN ('android','windows')")),
  check('device_activations_check_1',sql.raw("generation>0")),
  unique('device_activations_unique_2').on(t.licenceId,t.generation),
  check('device_activations_check_3',sql.raw("ended_at IS NULL OR ended_at>=activated_at")),
  uniqueIndex('one_current_device_per_licence').on(t.licenceId).where(sql.raw("ended_at IS NULL"))
]).enableRLS();

export const activationChallenges=lab.table('activation_challenges',{
  id:uuid('id').primaryKey().defaultRandom(),
  licenceId:uuid('licence_id').notNull().references(()=>licences.id),
  devicePublicKey:text('device_public_key').notNull(),
  platform:text('platform').notNull(),purpose:text('purpose').notNull(),
  nonce:text('nonce').notNull(),generation:bigint('generation',{mode:'bigint'}).notNull(),
  expiresAt:timestamp('expires_at',{withTimezone:true}).notNull(),
  consumedAt:timestamp('consumed_at',{withTimezone:true})
},t=>[check('challenge_platform',sql`${t.platform} IN ('android','windows')`),
  check('challenge_purpose',sql`${t.purpose} IN ('activate','status')`),index('challenge_expiry').on(t.expiresAt)]).enableRLS();

export const activationRateLimits=lab.table('activation_rate_limits',{
  scope:text('scope').primaryKey(),windowStart:timestamp('window_start',{withTimezone:true}).notNull(),
  requests:integer('requests').notNull()
},t=>[check('activation_rate_positive',sql`${t.requests}>0`),index('activation_rate_window').on(t.windowStart)]).enableRLS();

export const contentChallenges=lab.table('content_challenges',{
  id:uuid('id').primaryKey().defaultRandom(),licenceId:uuid('licence_id').notNull().references(()=>licences.id),
  activationId:uuid('activation_id').notNull().references(()=>deviceActivations.id),
  devicePublicKey:text('device_public_key').notNull(),generation:bigint('generation',{mode:'bigint'}).notNull(),
  path:text('path').notNull(),nonce:text('nonce').notNull(),expiresAt:timestamp('expires_at',{withTimezone:true}).notNull(),
  consumedAt:timestamp('consumed_at',{withTimezone:true})
},t=>[index('content_challenge_expiry').on(t.expiresAt)]).enableRLS();

export const licenceEvents=lab.table('licence_events',{
  id:uuid('id').primaryKey().defaultRandom(),
  licenceId:uuid('licence_id').notNull().references(()=>licences.id),
  activationId:uuid('activation_id').references(()=>deviceActivations.id),
  actorUserId:uuid('actor_user_id').references(()=>authUsers.id),
  action:text('action').notNull(),
  metadata:jsonb('metadata').notNull().default({}),
  createdAt:timestamp('created_at',{withTimezone:true}).notNull().defaultNow()
},t=>[
  check('licence_events_check_0',sql.raw("jsonb_typeof(metadata)='object'")),
  index('licence_event_history').on(t.licenceId,t.createdAt)
]).enableRLS();

export const contentCollections=lab.table('content_collections',{
  id:uuid('id').primaryKey().defaultRandom(),
  code:text('code').notNull().unique(),
  title:text('title').notNull(),
  status:text('status').notNull().default("draft")
},t=>[
  check('content_collections_check_0',sql.raw("status IN ('draft','active','withdrawn')"))
]).enableRLS();

export const licenceEntitlements=lab.table('licence_entitlements',{
  licenceId:uuid('licence_id').notNull().references(()=>licences.id),
  collectionId:uuid('collection_id').notNull().references(()=>contentCollections.id)
},t=>[
  primaryKey({columns:[t.licenceId,t.collectionId]})
]).enableRLS();

export const languages=lab.table('languages',{
  code:text('code').primaryKey(),
  name:text('name').notNull(),
  nativeName:text('native_name').notNull()
},t=>[
  
]).enableRLS();

export const learningLevels=lab.table('learning_levels',{
  id:uuid('id').primaryKey().defaultRandom(),
  code:text('code').notNull().unique(),
  stage:text('stage').notNull(),
  grade:integer('grade'),
  proficiency:text('proficiency')
},t=>[
  check('learning_levels_check_0',sql.raw("grade BETWEEN 1 AND 12"))
]).enableRLS();

export const skills=lab.table('skills',{
  code:text('code').primaryKey(),
  name:text('name').notNull()
},t=>[
  
]).enableRLS();

export const courses=lab.table('courses',{
  id:uuid('id').primaryKey().defaultRandom(),
  languageCode:text('language_code').notNull().references(()=>languages.code),
  levelId:uuid('level_id').notNull().references(()=>learningLevels.id),
  title:text('title').notNull()
},t=>[
  index('course_catalogue').on(t.languageCode,t.levelId)
]).enableRLS();

export const units=lab.table('units',{
  id:uuid('id').primaryKey().defaultRandom(),
  courseId:uuid('course_id').notNull().references(()=>courses.id),
  title:text('title').notNull(),
  position:integer('position').notNull()
},t=>[
  check('units_check_0',sql.raw("position>=0")),
  unique('units_unique_1').on(t.courseId,t.position)
]).enableRLS();

export const lessons=lab.table('lessons',{
  id:uuid('id').primaryKey().defaultRandom(),
  unitId:uuid('unit_id').notNull().references(()=>units.id),
  skillCode:text('skill_code').notNull().references(()=>skills.code),
  position:integer('position').notNull()
},t=>[
  check('lessons_check_0',sql.raw("position>=0")),
  unique('lessons_unique_1').on(t.unitId,t.position)
]).enableRLS();

export const lessonVersions=lab.table('lesson_versions',{
  id:uuid('id').primaryKey().defaultRandom(),
  lessonId:uuid('lesson_id').notNull().references(()=>lessons.id),
  version:integer('version').notNull(),
  payload:jsonb('payload').notNull(),
  reviewStatus:text('review_status').notNull().default("draft"),
  publishedAt:timestamp('published_at',{withTimezone:true})
},t=>[
  check('lesson_versions_check_0',sql.raw("version>0")),
  check('lesson_versions_check_1',sql.raw("jsonb_typeof(payload)='object'")),
  check('lesson_versions_check_2',sql.raw("review_status IN ('draft','reviewed')")),
  unique('lesson_versions_unique_3').on(t.lessonId,t.version),
  check('lesson_versions_check_4',sql.raw("published_at IS NULL OR review_status='reviewed'"))
]).enableRLS();

export const curriculumOutcomes=lab.table('curriculum_outcomes',{
  id:uuid('id').primaryKey().defaultRandom(),
  authority:text('authority').notNull(),
  reference:text('reference').notNull(),
  description:text('description').notNull()
},t=>[
  unique('curriculum_outcomes_unique_0').on(t.authority,t.reference)
]).enableRLS();

export const lessonOutcomeMappings=lab.table('lesson_outcome_mappings',{
  lessonVersionId:uuid('lesson_version_id').notNull().references(()=>lessonVersions.id),
  outcomeId:uuid('outcome_id').notNull().references(()=>curriculumOutcomes.id)
},t=>[
  primaryKey({columns:[t.lessonVersionId,t.outcomeId]})
]).enableRLS();

export const collectionUnits=lab.table('collection_units',{
  collectionId:uuid('collection_id').notNull().references(()=>contentCollections.id),
  unitId:uuid('unit_id').notNull().references(()=>units.id)
},t=>[
  primaryKey({columns:[t.collectionId,t.unitId]}),
  index('collection_unit_reverse').on(t.unitId,t.collectionId)
]).enableRLS();

export const packageReleases=lab.table('package_releases',{
  id:uuid('id').primaryKey().defaultRandom(),
  unitId:uuid('unit_id').notNull().references(()=>units.id),
  version:text('version').notNull(),
  status:text('status').notNull().default("draft"),
  manifest:jsonb('manifest').notNull(),
  manifestDigest:text('manifest_digest').notNull(),
  minimumAppVersion:text('minimum_app_version').notNull(),
  publishedAt:timestamp('published_at',{withTimezone:true})
},t=>[
  check('package_releases_check_0',sql.raw("version ~ '^[0-9]+\\.[0-9]+\\.[0-9]+$'")),
  check('package_releases_check_1',sql.raw("status IN ('draft','published','withdrawn')")),
  check('package_releases_check_2',sql.raw("jsonb_typeof(manifest)='object'")),
  check('package_releases_check_3',sql.raw("manifest_digest ~ '^[a-f0-9]{64}$'")),
  unique('package_releases_unique_4').on(t.unitId,t.version),
  check('package_releases_check_5',sql.raw("status='draft' OR published_at IS NOT NULL"))
]).enableRLS();

export const packageLessons=lab.table('package_lessons',{
  releaseId:uuid('release_id').notNull().references(()=>packageReleases.id),
  lessonVersionId:uuid('lesson_version_id').notNull().references(()=>lessonVersions.id),
  position:integer('position').notNull()
},t=>[
  check('package_lessons_check_0',sql.raw("position>=0")),
  primaryKey({columns:[t.releaseId,t.lessonVersionId]}),
  unique('package_lessons_unique_1').on(t.releaseId,t.position),
  index('package_lesson_reverse').on(t.lessonVersionId)
]).enableRLS();

export const assets=lab.table('assets',{
  id:uuid('id').primaryKey().defaultRandom(),
  objectKey:text('object_key').notNull().unique(),
  sha256:text('sha256').notNull(),
  byteSize:bigint('byte_size',{mode:'bigint'}).notNull(),
  mimeType:text('mime_type').notNull()
},t=>[
  check('assets_check_0',sql.raw("sha256 ~ '^[a-f0-9]{64}$'")),
  check('assets_check_1',sql.raw("byte_size>=0"))
]).enableRLS();

export const packageAssets=lab.table('package_assets',{
  releaseId:uuid('release_id').notNull().references(()=>packageReleases.id),
  assetId:uuid('asset_id').notNull().references(()=>assets.id),
  relativePath:text('relative_path').notNull()
},t=>[
  check('package_assets_check_0',sql.raw("relative_path !~ '(^/|\\\\|:|(^|/)\\.\\.(/|$))'")),
  primaryKey({columns:[t.releaseId,t.relativePath]}),
  index('package_asset_reverse').on(t.assetId)
]).enableRLS();

export const adminAuditEvents=lab.table('admin_audit_events',{
  id:uuid('id').primaryKey().defaultRandom(),
  actorUserId:uuid('actor_user_id').references(()=>authUsers.id),
  action:text('action').notNull(),
  entityType:text('entity_type').notNull(),
  entityId:uuid('entity_id').notNull(),
  createdAt:timestamp('created_at',{withTimezone:true}).notNull().defaultNow()
},t=>[
  
]).enableRLS();

export type Licence=typeof licences.$inferSelect;
export const curriculumReviewEvents=lab.table('curriculum_review_events',{
  id:uuid('id').primaryKey(),
  releaseId:uuid('release_id').notNull().references(()=>packageReleases.id),
  manifestDigest:text('manifest_digest').notNull(),
  kind:text('kind').notNull(),
  actorUserId:uuid('actor_user_id').notNull().references(()=>authUsers.id),
  reviewer:text('reviewer').notNull(),
  reference:text('reference').notNull(),
  documentUrl:text('document_url').notNull(),
  documentDigest:text('document_digest').notNull(),
  notes:text('notes').notNull().default(''),
  parentEventId:uuid('parent_event_id'),
  createdAt:timestamp('created_at',{withTimezone:true}).notNull().defaultNow()
},t=>[
  index('curriculum_release_evidence').on(t.releaseId,t.manifestDigest,t.createdAt),
  check('curriculum_event_kind',sql`${t.kind} IN ('rights_attested','expert_review','submitted','correction_requested','correction_resolved','authority_approval','authority_rejection')`),
  check('curriculum_digest_bound',sql`${t.manifestDigest} ~ '^[a-f0-9]{64}$' AND ${t.documentDigest} ~ '^[a-f0-9]{64}$'`),
  check('curriculum_text_bounds',sql`length(${t.reviewer}) BETWEEN 1 AND 200 AND length(${t.reference}) BETWEEN 1 AND 500 AND length(${t.documentUrl}) BETWEEN 1 AND 2000 AND length(${t.notes})<=4000`)
]).enableRLS();
export type NewLicence=typeof licences.$inferInsert;
export type DeviceActivation=typeof deviceActivations.$inferSelect;
export type PackageRelease=typeof packageReleases.$inferSelect;
export type LessonVersion=typeof lessonVersions.$inferSelect;
export type AdminMembership=typeof adminMemberships.$inferSelect;
