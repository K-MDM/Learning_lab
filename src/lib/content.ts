import {assertKnownAnswerWriting} from './writing-policy';
import registry from '../../../contracts/learning-registry.json';
import {validWav} from './media-validation';
import {randomUUID,createHash} from 'node:crypto';
import {and,desc,eq,sql,lt,ilike,or} from 'drizzle-orm';
import type {PgDatabase,PgQueryResultHKT} from 'drizzle-orm/pg-core';
import * as s from '../db/schema';
import {canonical,manifestDigest,validateManifest,type Manifest} from './package';
type DB=PgDatabase<PgQueryResultHKT,typeof s>;
type TX=Parameters<Parameters<DB['transaction']>[0]>[0];
export class ContentError extends Error{constructor(public status:number,message:string){super(message);}}
export interface AssetStore{upload(key:string,bytes:Buffer,mime:string):Promise<void>;remove(key:string):Promise<void>;signedUrl(key:string):Promise<string>;}
export async function contentStaff(tx:TX,actor:string,roles:string[]){
  const [member]=await tx.select().from(s.adminMemberships).where(eq(s.adminMemberships.userId,actor)).for('share');
  const assigned=await tx.select().from(s.adminRoles).where(eq(s.adminRoles.userId,actor)).for('share');
  if(member?.status!=='active'||!assigned.some(row=>roles.includes(row.role)))throw new ContentError(403,'Your staff role cannot perform this content action.');
}
async function audit(tx:TX,actor:string,id:string,action:string){await tx.insert(s.adminAuditEvents).values({actorUserId:actor,entityType:'content_release',entityId:id,action});}
export type DraftInput={courseTitle:string;unitTitle:string;lessonTitle:string;language:string;level:string;story:string;question:string;options:string[];correctIndex:number;demonstration:boolean};
function validateDraft(input:DraftInput){
  for(const field of [input.courseTitle,input.unitTitle,input.lessonTitle,input.level])if(typeof field!=='string'||!field.trim()||field.length>120)throw new ContentError(400,'Course, unit, lesson and level are required (maximum 120 characters).');
  if(!registry.languages.some(item=>item.code===input.language)||typeof input.story!=='string'||!input.story.trim()||input.story.length>10000||
    typeof input.question!=='string'||!input.question.trim()||input.question.length>500||!Array.isArray(input.options)||input.options.length<2||input.options.length>8||
    input.options.some(option=>typeof option!=='string'||!option.trim()||option.length>300)||!Number.isInteger(input.correctIndex)||input.correctIndex<0||input.correctIndex>=input.options.length||typeof input.demonstration!=='boolean')
    throw new ContentError(400,'Check the story, language and quiz answers.');
  if(!/^grade-(?:[1-9]|1[0-2])$/.test(input.level)&&!registry.stages.includes(input.level)&&!registry.proficiencies.includes(input.level))throw new ContentError(400,'Choose a registered stage, grade or proficiency.');
}
export async function createDraft(db:DB,actor:string,input:DraftInput,audio:Buffer|null,store?:AssetStore){
  validateDraft(input);
  if(audio&&!validWav(audio))throw new ContentError(400,'Upload a valid WAV narration up to 20 MB.');
  await db.transaction(tx=>contentStaff(tx,actor,['owner','content_editor']));
  const assetId=randomUUID(),key=`assets/${assetId}.wav`,releaseId=randomUUID(),unitId=randomUUID(),lessonId=randomUUID(),collectionId=randomUUID();
  const title=input.lessonTitle.trim()+(input.demonstration?' — demonstration':'');
  const manifest:Manifest={schema_version:1,release_id:releaseId,unit_id:unitId,version:'1.0.0',language:input.language,level:input.level,minimum_app_version:'1.0.0',publication_status:'draft',
    lessons:[{id:lessonId,version:1,title,skill:'reading',curriculum_references:[],activities:[
      {id:'reading',type:'reading',prompt:input.story.trim(),scoring_version:1},
      ...(audio?[{id:'narration',type:'listening' as const,prompt:'Listen to the story.',scoring_version:1,reference_asset:assetId}]:[]),
      {id:'comprehension',type:'quiz',prompt:input.question.trim(),options:input.options.map(x=>x.trim()),correct_index:input.correctIndex,scoring_version:1}]}],
    assets:audio?[{id:assetId,relative_path:`audio/${assetId}.wav`,sha256:createHash('sha256').update(audio).digest('hex'),byte_size:audio.length,mime_type:'audio/wav'}]:[]};
  validateManifest(manifest);if(audio){if(!store)throw new ContentError(503,'Audio storage is not configured.');await store.upload(key,audio,'audio/wav');}
  try{return await db.transaction(async tx=>{
    await contentStaff(tx,actor,['owner','content_editor']);
    const language=registry.languages.find(item=>item.code===input.language)!;
    await tx.insert(s.languages).values({code:language.code,name:language.name,nativeName:language.name}).onConflictDoNothing();
    const [level]=await tx.insert(s.learningLevels).values({code:input.level,stage:input.level.startsWith('grade-')?(Number(input.level.slice(6))<=2?'foundational':Number(input.level.slice(6))<=5?'preparatory':Number(input.level.slice(6))<=8?'middle':'secondary'):registry.stages.includes(input.level)?input.level:'proficiency',grade:input.level.startsWith('grade-')?Number(input.level.slice(6)):null,proficiency:registry.proficiencies.includes(input.level)?input.level:null}).onConflictDoUpdate({target:s.learningLevels.code,set:{code:input.level}}).returning();
    const [course]=await tx.insert(s.courses).values({languageCode:input.language,levelId:level.id,title:input.courseTitle.trim()}).returning();
    await tx.insert(s.units).values({id:unitId,courseId:course.id,title:input.unitTitle.trim(),position:0});
    await tx.insert(s.lessons).values({id:lessonId,unitId,skillCode:'reading',position:0});
    const [version]=await tx.insert(s.lessonVersions).values({lessonId,version:1,payload:manifest.lessons[0]}).returning();
    await tx.insert(s.contentCollections).values({id:collectionId,code:`unit-${unitId}`,title:input.unitTitle.trim(),status:'draft'});
    await tx.insert(s.collectionUnits).values({collectionId,unitId});
    if(audio)await tx.insert(s.assets).values({id:assetId,objectKey:key,sha256:manifest.assets[0].sha256,byteSize:BigInt(audio.length),mimeType:'audio/wav'});
    await tx.insert(s.packageReleases).values({id:releaseId,unitId,version:manifest.version,manifest,manifestDigest:manifestDigest(manifest),minimumAppVersion:'1.0.0'});
    await tx.insert(s.packageLessons).values({releaseId,lessonVersionId:version.id,position:0});
    if(audio)await tx.insert(s.packageAssets).values({releaseId,assetId,relativePath:manifest.assets[0].relative_path});
    await audit(tx,actor,releaseId,'draft_created');return {id:releaseId};
  });}catch(error){try{if(audio&&store)await store.remove(key);}catch{/* Orphan is private; retained for operator cleanup. */}throw error;}
}
export async function reviewOrPublish(db:DB,actor:string,id:string,action:'review'|'publish',ageAppropriate=false){
  return db.transaction(async tx=>{
    await contentStaff(tx,actor,['owner','publisher']);
    const [release]=await tx.select().from(s.packageReleases).where(eq(s.packageReleases.id,id)).for('update');
    if(!release)throw new ContentError(404,'Release not found.');if(release.status!=='draft')throw new ContentError(409,'Only drafts can be reviewed or published.');
    const manifest=validateManifest(release.manifest),links=await tx.select({version:s.lessonVersions}).from(s.packageLessons)
      .innerJoin(s.lessonVersions,eq(s.lessonVersions.id,s.packageLessons.lessonVersionId)).where(eq(s.packageLessons.releaseId,id));
    try {assertKnownAnswerWriting(manifest);} catch {throw new ContentError(400,'Writing is MCQ-only. Replace typed answers before review or publication.');}
    if(action==='review'){
      if(manifest.schema_version===2&&!ageAppropriate)throw new ContentError(400,'Confirm staff review of age suitability for the declared level. This is not formal curriculum approval.');
      if(manifest.publication_status==='reviewed')throw new ContentError(409,'Draft already reviewed.');manifest.publication_status='reviewed';
      if(manifest.schema_version===2)manifest.age_reviewed=true;
      for(const row of links)await tx.update(s.lessonVersions).set({reviewStatus:'reviewed'}).where(eq(s.lessonVersions.id,row.version.id));
      await tx.update(s.packageReleases).set({manifest,manifestDigest:manifestDigest(manifest)}).where(eq(s.packageReleases.id,id));
    }else{
      if(manifest.publication_status!=='reviewed')throw new ContentError(409,'Content review is required before publication.');
      validateManifest(manifest,true);
      if(links.length!==manifest.lessons.length||links.some(row=>row.version.reviewStatus!=='reviewed'||
        !manifest.lessons.some(lesson=>lesson.id===row.version.lessonId&&lesson.version===row.version.version&&canonical(lesson)===canonical(row.version.payload))))
        throw new ContentError(409,'All lesson references must match reviewed content.');
      const files=await tx.select({asset:s.assets,path:s.packageAssets.relativePath}).from(s.packageAssets)
        .innerJoin(s.assets,eq(s.assets.id,s.packageAssets.assetId)).where(eq(s.packageAssets.releaseId,id));
      if(files.length!==manifest.assets.length||manifest.assets.some(asset=>!files.some(row=>row.asset.id===asset.id&&row.asset.sha256===asset.sha256&&row.asset.byteSize===BigInt(asset.byte_size)&&row.asset.mimeType===asset.mime_type&&row.path===asset.relative_path)))
        throw new ContentError(409,'Asset references do not match the manifest.');
      for(const row of links)await tx.update(s.lessonVersions).set({publishedAt:sql`clock_timestamp()`}).where(eq(s.lessonVersions.id,row.version.id));
      await tx.update(s.packageReleases).set({status:'published',publishedAt:sql`clock_timestamp()`}).where(eq(s.packageReleases.id,id));
      const collections=await tx.select().from(s.collectionUnits).where(eq(s.collectionUnits.unitId,release.unitId));
      for(const collection of collections)await tx.update(s.contentCollections).set({status:'active'}).where(eq(s.contentCollections.id,collection.collectionId));
    }
    await audit(tx,actor,id,action==='review'?(manifest.schema_version===2?'content_and_age_reviewed':'content_reviewed'):'content_published');return {id};
  });
}
export async function listContent(db:DB,actor:string,filters:{cursor?:string;search?:string;status?:string}={}){return db.transaction(async tx=>{
  await contentStaff(tx,actor,['owner','content_editor','publisher','licence_manager']);
  const search=filters.search?.trim().slice(0,120).replace(/[\\%_]/g,'\\$&');
  return tx.selectDistinctOn([s.packageReleases.id],{id:s.packageReleases.id,status:s.packageReleases.status,manifest:s.packageReleases.manifest,manifestDigest:s.packageReleases.manifestDigest,publishedAt:s.packageReleases.publishedAt,
    unitTitle:s.units.title,courseTitle:s.courses.title,collectionId:s.contentCollections.id})
    .from(s.packageReleases).innerJoin(s.units,eq(s.units.id,s.packageReleases.unitId)).innerJoin(s.courses,eq(s.courses.id,s.units.courseId))
    .innerJoin(s.collectionUnits,eq(s.collectionUnits.unitId,s.units.id)).innerJoin(s.contentCollections,eq(s.contentCollections.id,s.collectionUnits.collectionId))
    .where(and(filters.cursor?lt(s.packageReleases.id,filters.cursor):undefined,filters.status&&['draft','published','withdrawn'].includes(filters.status)?eq(s.packageReleases.status,filters.status):undefined,search?or(ilike(s.units.title,`%${search}%`),ilike(s.courses.title,`%${search}%`),ilike(s.courses.languageCode,`%${search}%`)):undefined))
    .orderBy(desc(s.packageReleases.id)).limit(101);
});}
export async function previewContent(db:DB,actor:string,id:string,store:AssetStore){return db.transaction(async tx=>{
  await contentStaff(tx,actor,['owner','content_editor','publisher']);
  const files=await tx.select({key:s.assets.objectKey,mimeType:s.assets.mimeType,path:s.packageAssets.relativePath}).from(s.packageAssets).innerJoin(s.assets,eq(s.assets.id,s.packageAssets.assetId)).where(eq(s.packageAssets.releaseId,id));
  const assets=await Promise.all(files.map(async row=>({url:await store.signedUrl(row.key),mimeType:row.mimeType,path:row.path})));
  return {urls:assets.map(asset=>asset.url),assets};
});}

