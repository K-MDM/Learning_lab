import {createHash} from 'node:crypto';
import {and,eq,inArray,notInArray,sql} from 'drizzle-orm';
import * as s from '../db/schema';
import {createDraft,contentStaff,ContentError,type AssetStore} from './content';
import {validateManifest,manifestDigest,type Manifest} from './package';
import {assertKnownAnswerWriting} from './writing-policy';

type DB=Parameters<typeof createDraft>[0];
export type CurriculumUnit={key:string;code:string;grade:number;stage:string;skill:string;course_id:string;collection_id:string;title:string;manifest:Manifest};
export type EnglishCurriculum={version:string;units:CurriculumUnit[]};
const hash=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
export async function englishResetPreview(db:DB,keepUnits:string[]=[]) {
  const rows=await db.select({release:s.packageReleases,unit:s.units,course:s.courses}).from(s.packageReleases)
    .innerJoin(s.units,eq(s.units.id,s.packageReleases.unitId)).innerJoin(s.courses,eq(s.courses.id,s.units.courseId))
    .where(and(eq(s.courses.languageCode,'en'),keepUnits.length?notInArray(s.units.id,keepUnits):sql`true`)).orderBy(s.packageReleases.id);
  return {rows,digest:hash(rows.map(r=>[r.release.id,r.release.status,r.release.manifestDigest])),
    published:rows.filter(r=>r.release.status==='published').length,drafts:rows.filter(r=>r.release.status==='draft').length};
}
export function validateEnglishCurriculum(data:EnglishCurriculum) {
  if(data.version!=='english-framework-v1'||data.units.length!==72) throw new ContentError(400,'Expected the72-module English framework dataset.');
  const combinations=new Set<string>(),ids=new Set<string>();
  for(const unit of data.units) {
    const manifest=validateManifest(unit.manifest);
    assertKnownAnswerWriting(manifest);
    if(manifest.language!=='en'||manifest.level!==`grade-${unit.grade}`||unit.grade<1||unit.grade>12||
       manifest.lessons.length!==4||manifest.lessons.some(l=>l.skill!==unit.skill)||ids.has(manifest.release_id))
      throw new ContentError(400,'Curriculum identity, grade or lesson count is invalid.');
    for(const lesson of manifest.lessons) for(const activity of lesson.activities) {
      if(['writing','gap_fill','spelling','error_correction','picture'].includes(activity.type)) throw new ContentError(400,'Curriculum must not require typing.');
      if(activity.type==='quiz'&&(!activity.explanation?.trim()||new Set(activity.options).size!==activity.options?.length))
        throw new ContentError(400,'Every MCQ needs distinct choices and authored feedback.');
    }
    combinations.add(`${unit.grade}/${unit.skill}`);ids.add(manifest.release_id);
  }
  if(combinations.size!==72)throw new ContentError(400,'Duplicate or missing grade/skill combinations.');
}
export async function replaceEnglishCurriculum(db:DB,actor:string,data:EnglishCurriculum,expectedDigest:string,publish:boolean) {
  validateEnglishCurriculum(data);
  return db.transaction(async tx=>{
    await contentStaff(tx,actor,['owner']);
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('english-framework-reset-v1'))`);
    const newIds=data.units.map(u=>u.manifest.release_id);
    const existing=await tx.select({id:s.packageReleases.id}).from(s.packageReleases).where(inArray(s.packageReleases.id,newIds));
    if(existing.length===newIds.length)return {created:false,modules:72,archived:0,status:'already_seeded'};
    if(existing.length)throw new ContentError(409,'A partial curriculum exists; inspect before replacing content.');
    const preview=await englishResetPreview(tx,data.units.map(u=>u.manifest.unit_id));
    if(preview.digest!==expectedDigest)throw new ContentError(409,'English content changed after the backup. Run preview again.');
    const oldIds=preview.rows.filter(r=>r.release.status!=='withdrawn').map(r=>r.release.id);
    if(oldIds.length)await tx.update(s.packageReleases).set({status:'withdrawn'}).where(inArray(s.packageReleases.id,oldIds));
    await tx.insert(s.languages).values({code:'en',name:'English',nativeName:'English'}).onConflictDoNothing();
    const levels=await tx.insert(s.learningLevels).values(Array.from({length:12},(_,i)=>({code:`grade-${i+1}`,grade:i+1,
      stage:i<2?'foundational':i<5?'preparatory':i<8?'middle':'secondary'})))
      .onConflictDoUpdate({target:s.learningLevels.code,set:{code:sql`excluded.code`}}).returning();
    await tx.insert(s.courses).values(Array.from({length:12},(_,i)=>({id:data.units.find(u=>u.grade===i+1)!.course_id,
      languageCode:'en',levelId:levels.find(l=>l.code===`grade-${i+1}`)!.id,title:`English · Class ${i+1} · LSRW framework`}))).onConflictDoNothing();
    await tx.insert(s.units).values(data.units.map((u,i)=>({id:u.manifest.unit_id,courseId:u.course_id,title:u.title,position:i%6})));
    await tx.insert(s.contentCollections).values(data.units.map(u=>({id:u.collection_id,code:u.code,title:u.title,status:'draft'})));
    await tx.insert(s.collectionUnits).values(data.units.map(u=>({collectionId:u.collection_id,unitId:u.manifest.unit_id})));
    const manifests=data.units.map(u=>({...structuredClone(u.manifest),publication_status:publish?'reviewed':'draft',age_reviewed:publish} as Manifest));
    manifests.forEach(m=>validateManifest(m,publish));
    await tx.insert(s.lessons).values(manifests.flatMap(m=>m.lessons.map((l,i)=>({id:l.id,unitId:m.unit_id,skillCode:l.skill,position:i}))));
    const versions=await tx.insert(s.lessonVersions).values(manifests.flatMap(m=>m.lessons.map(l=>({lessonId:l.id,version:1,payload:l,
      reviewStatus:publish?'reviewed':'draft',publishedAt:publish?new Date():null})))).returning();
    const assets=Array.from(new Map(manifests.flatMap(m=>m.assets).map(a=>[a.id,a])).values());
    if(assets.length)await tx.insert(s.assets).values(assets.map(a=>({id:a.id,objectKey:`curriculum/${data.version}/${a.id}.png`,
      sha256:a.sha256,byteSize:BigInt(a.byte_size),mimeType:a.mime_type}))).onConflictDoNothing();
    await tx.insert(s.packageReleases).values(manifests.map(m=>({id:m.release_id,unitId:m.unit_id,version:m.version,status:'draft',
      manifest:m,manifestDigest:manifestDigest(m),minimumAppVersion:m.minimum_app_version})));
    await tx.insert(s.packageLessons).values(manifests.flatMap(m=>m.lessons.map((l,i)=>({releaseId:m.release_id,
      lessonVersionId:versions.find(v=>v.lessonId===l.id)!.id,position:i}))));
    if(assets.length)await tx.insert(s.packageAssets).values(manifests.flatMap(m=>m.assets.map(a=>({releaseId:m.release_id,assetId:a.id,relativePath:a.relative_path}))));
    const outcomes=await tx.insert(s.curriculumOutcomes).values(data.units.flatMap(u=>u.manifest.lessons.map((l,i)=>({
      authority:'User-supplied LSRW framework',reference:`${data.version}/grade-${u.grade}/${u.skill}/lesson-${i+1}`,
      description:l.learning_outcomes!.join(' ')})))).onConflictDoUpdate({target:[s.curriculumOutcomes.authority,s.curriculumOutcomes.reference],
      set:{description:sql`excluded.description`}}).returning();
    await tx.insert(s.lessonOutcomeMappings).values(data.units.flatMap(u=>u.manifest.lessons.map((l,i)=>({
      lessonVersionId:versions.find(v=>v.lessonId===l.id)!.id,
      outcomeId:outcomes.find(o=>o.reference===`${data.version}/grade-${u.grade}/${u.skill}/lesson-${i+1}`)!.id}))));
    if(publish) {
      await tx.update(s.packageReleases).set({status:'published',publishedAt:new Date()}).where(inArray(s.packageReleases.id,newIds));
      await tx.update(s.contentCollections).set({status:'active'}).where(inArray(s.contentCollections.id,data.units.map(u=>u.collection_id)));
    }
    await tx.insert(s.adminAuditEvents).values(data.units.map(u=>({actorUserId:actor,entityType:'content_release',entityId:u.manifest.release_id,
      action:publish?'english_framework_seeded_published':'english_framework_seeded_draft'})));
    for(const id of oldIds)await tx.insert(s.adminAuditEvents).values({actorUserId:actor,entityType:'content_release',entityId:id,action:'english_framework_replaced_withdrawn'});
    return {created:true,modules:72,lessons:versions.length,activities:manifests.reduce((n,m)=>n+m.lessons.reduce((s,l)=>s+l.activities.length,0),0),
      archived:oldIds.length,status:publish?'published':'draft'};
  });
}
export async function uploadCurriculumAssets(store:AssetStore,data:EnglishCurriculum,read:(id:string)=>Promise<Buffer>) {
  const assets=Array.from(new Map(data.units.flatMap(u=>u.manifest.assets).map(a=>[a.id,a])).values());
  for(const asset of assets) {
    const bytes=await read(asset.id);
    if(bytes.length!==asset.byte_size||createHash('sha256').update(bytes).digest('hex')!==asset.sha256)throw new ContentError(400,'Curriculum image bytes changed.');
    const key=`curriculum/${data.version}/${asset.id}.png`;
    try {await store.upload(key,bytes,asset.mime_type);}
    catch {
      // Retry an interrupted transaction only when the existing private object is identical.
      const url=await store.signedUrl(key),response=await fetch(url);
      if(!response.ok)throw new ContentError(503,'Curriculum image upload failed.');
      const received=Buffer.from(await response.arrayBuffer());
      if(received.length!==asset.byte_size||createHash('sha256').update(received).digest('hex')!==asset.sha256)
        throw new ContentError(409,'An existing curriculum image has different bytes.');
    }
  }
}
