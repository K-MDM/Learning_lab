import {eq, sql} from 'drizzle-orm';
import demos from '../../resources/content/demos/english.json';
import curriculum from '../../resources/content/curriculum/english-grade-10.json';
import * as s from '../db/schema';
import {contentStaff, ContentError} from './content';
import {createContentRevision, saveContentDraft} from './content-edit';
import {validateManifest, type Activity} from './package';

type DB = Parameters<typeof saveContentDraft>[0];
export async function updateWritingSeeds(db: DB, actor: string) {
  return db.transaction(async tx => {
    await contentStaff(tx, actor, ['owner', 'content_editor']);
    const results = [];
    for (const [code, template] of [
      ['demo-english-v1-writing', demos.find(t => t.skill === 'writing')!],
      ['class10-english-v1-class10-writing', curriculum.find(t => t.skill === 'writing')!],
    ] as const) {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${code}))`);
      const rows = await tx.select({release: s.packageReleases}).from(s.contentCollections)
        .innerJoin(s.collectionUnits, eq(s.collectionUnits.collectionId, s.contentCollections.id))
        .innerJoin(s.packageReleases, eq(s.packageReleases.unitId, s.collectionUnits.unitId))
        .where(eq(s.contentCollections.code, code));
      const releases = rows.map(r => r.release);
      const candidates = releases.filter(r => r.status === 'draft' || r.status === 'published')
        .sort((a, b) => {
          const av = a.version.split('.').map(Number), bv = b.version.split('.').map(Number);
          return bv[0] - av[0] || bv[1] - av[1] || bv[2] - av[2];
        });
      let release = candidates.find(r => r.status === 'draft') ?? candidates[0];
      if (!release) {results.push({code, status: 'not_seeded'}); continue;}
      const source = validateManifest(release.manifest);
      const writing = source.lessons.filter(l => l.skill === 'writing');
      if (writing.length !== 1) throw new ContentError(409, 'Seeded Writing lesson identity is ambiguous.');
      if (!writing[0].activities.some(a => ['writing','gap_fill','spelling','error_correction','picture'].includes(a.type))) {
        results.push({code, id: release.id, status: 'already_updated'}); continue;
      }
      if (release.status === 'published') {
        const created = await createContentRevision(tx, actor, release.id);
        [release] = await tx.select().from(s.packageReleases).where(eq(s.packageReleases.id, created.id));
      }
      const manifest = structuredClone(validateManifest(release.manifest));
      manifest.schema_version = 2; manifest.minimum_app_version = '1.3.0';
      const lesson = manifest.lessons.find(l => l.skill === 'writing')!;
      lesson.title = template.title;
      lesson.learning_outcomes = [template.outcome];
      lesson.activities = template.activities.map((a, index) => ({
        ...a, id: `writing-mcq-v2-${index + 1}`, scoring_version: 1, normalization: 'NFC',
      } as Activity));
      await saveContentDraft(tx, actor, release.id, release.manifestDigest, manifest);
      results.push({code, id: release.id, version: release.version, activities: lesson.activities.length, status: 'draft_updated'});
    }
    return results;
  });
}
