import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {and,desc,eq,inArray,lt} from 'drizzle-orm';
import type {PgDatabase,PgQueryResultHKT} from 'drizzle-orm/pg-core';
import * as s from '../db/schema';
import {contentStaff,ContentError} from './content';
import {validateManifest,type Manifest} from './package';
type DB=PgDatabase<PgQueryResultHKT,typeof s>;
export const evidenceKinds=['rights_attested','expert_review','submitted','correction_requested','correction_resolved','authority_approval','authority_rejection'] as const;
export const curriculumTopics=JSON.parse(readFileSync(resolve(process.cwd(),'../contracts/curriculum-topics.json'),'utf8')) as {applicability:string;topics:{id:string;skill:string;label:string}[]};
const languages=['en','hi','sa','fr','de'],levels=['foundational','preparatory','middle','secondary',...Array.from({length:12},(_,i)=>`grade-${i+1}`),'beginner','intermediate','advanced','remedial'],skills=['listening','speaking','reading','writing','grammar','vocabulary'];
export type CoverageCell={language:string;level:string;skill:string;draft:number;published:number;mapped:number;ageReviewed:number;evidenceRecorded:number;topics:string[];missingTopics:string[]};
export function emptyCoverage():CoverageCell[]{return languages.flatMap(language=>levels.flatMap(level=>skills.map(skill=>({language,level,skill,draft:0,published:0,mapped:0,ageReviewed:0,evidenceRecorded:0,topics:[],missingTopics:curriculumTopics.topics.filter(t=>t.skill===skill).map(t=>t.id)}))));}
export function addCoverage(cells:CoverageCell[],manifest:Manifest,status:string,evidence:string[]){
 for(const skill of new Set(manifest.lessons.map(lesson=>lesson.skill))){
  const cell=cells.find(c=>c.language===manifest.language&&c.level===manifest.level&&c.skill===skill);if(!cell)continue;
  const lessons=manifest.lessons.filter(lesson=>lesson.skill===skill);
  if(status==='draft')cell.draft++;
  if(status!=='published')continue;
  cell.published++;
  if(manifest.age_reviewed)cell.ageReviewed++;
  if(lessons.every(lesson=>lesson.curriculum_references.length>0&&(lesson.learning_outcomes?.length??0)>0))cell.mapped++;
  if(evidence.includes('authority_approval')&&!evidence.includes('authority_rejection'))cell.evidenceRecorded++;
  for(const lesson of lessons)for(const activity of lesson.activities){if(activity.topic&&!cell.topics.includes(activity.topic))cell.topics.push(activity.topic);}
  cell.topics.sort();cell.missingTopics=curriculumTopics.topics.filter(t=>t.skill===skill&&!cell.topics.includes(t.id)).map(t=>t.id);
 }
}
export async function curriculumCoverage(db:DB,actor:string){return db.transaction(async tx=>{
 await contentStaff(tx,actor,['owner','publisher','content_editor','licence_manager']);
 const cells=emptyCoverage();let cursor:string|undefined,count=0;
 for(let page=0;page<=200;page++){
  const releases=await tx.select({id:s.packageReleases.id,manifest:s.packageReleases.manifest,status:s.packageReleases.status,digest:s.packageReleases.manifestDigest}).from(s.packageReleases).where(cursor?lt(s.packageReleases.id,cursor):undefined).orderBy(desc(s.packageReleases.id)).limit(50);
  if(!releases.length)break;if(page===200)throw new ContentError(413,'Coverage inventory exceeds 10,000 releases. Export by collection before continuing.');
  const evidence=await tx.select({releaseId:s.curriculumReviewEvents.releaseId,digest:s.curriculumReviewEvents.manifestDigest,kind:s.curriculumReviewEvents.kind}).from(s.curriculumReviewEvents).where(inArray(s.curriculumReviewEvents.releaseId,releases.map(r=>r.id)));
  for(const release of releases){addCoverage(cells,validateManifest(release.manifest),release.status,evidence.filter(e=>e.releaseId===release.id&&e.digest===release.digest).map(e=>e.kind));count++;}
  cursor=releases.at(-1)!.id;
 }
 return {releaseCount:count,applicability:curriculumTopics.applicability,approvalNotice:'Evidence recorded by company staff is not independently verified formal acceptance. Approval does not transfer to edited digests or successor releases.',cells};
});}
export type EvidenceInput={id:string;releaseId:string;manifestDigest:string;kind:typeof evidenceKinds[number];reviewer:string;reference:string;documentUrl:string;documentDigest:string;notes:string;parentEventId?:string|null};
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
function validEvidence(value:EvidenceInput){
 if(!value||Object.keys(value).some(k=>!['id','releaseId','manifestDigest','kind','reviewer','reference','documentUrl','documentDigest','notes','parentEventId'].includes(k))||!uuid.test(value.id)||!uuid.test(value.releaseId)||!evidenceKinds.includes(value.kind)||![value.manifestDigest,value.documentDigest].every(v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v)))throw new ContentError(400,'Invalid evidence identity, kind or digest.');
 for(const [field,max] of [['reviewer',200],['reference',500],['documentUrl',2000],['notes',4000]] as const)if(typeof value[field]!=='string'||value[field].length>max||(field!=='notes'&&!value[field].trim()))throw new ContentError(400,'Evidence text is missing or too long.');
 let url:URL;try{url=new URL(value.documentUrl);}catch{throw new ContentError(400,'Evidence needs a valid HTTPS document URL.');}
 if(url.protocol!=='https:'||url.username||url.password||url.hash)throw new ContentError(400,'Evidence needs HTTPS without credentials or fragments.');
 if(value.parentEventId&&!uuid.test(value.parentEventId))throw new ContentError(400,'Invalid correction reference.');
 if(value.kind==='correction_resolved'&&!value.parentEventId)throw new ContentError(400,'Choose the earlier correction request.');
}
export async function recordCurriculumEvidence(db:DB,actor:string,value:EvidenceInput){validEvidence(value);return db.transaction(async tx=>{
 await contentStaff(tx,actor,value.kind.startsWith('authority_')?['owner','publisher']:['owner','publisher','content_editor']);
 const [existing]=await tx.select().from(s.curriculumReviewEvents).where(eq(s.curriculumReviewEvents.id,value.id));
 if(existing){if(existing.actorUserId!==actor||Object.entries(value).some(([key,val])=>existing[key as keyof typeof existing]!==val&&(val??null)!==(existing[key as keyof typeof existing]??null)))throw new ContentError(409,'Evidence request ID was already used.');return {id:existing.id};}
 const [release]=await tx.select().from(s.packageReleases).where(eq(s.packageReleases.id,value.releaseId)).for('update');
 if(!release||release.manifestDigest!==value.manifestDigest)throw new ContentError(409,'Content changed. Reload before recording evidence.');
 const previous=await tx.select({id:s.curriculumReviewEvents.id}).from(s.curriculumReviewEvents).where(eq(s.curriculumReviewEvents.releaseId,value.releaseId)).limit(200);
 if(previous.length>=200)throw new ContentError(409,'Evidence history is full for this release. Create a reviewed successor.');
 await tx.insert(s.curriculumReviewEvents).values({...value,parentEventId:value.parentEventId??null,actorUserId:actor});
 await tx.insert(s.adminAuditEvents).values({actorUserId:actor,entityType:'curriculum_evidence',entityId:value.id,action:value.kind});
 return {id:value.id};
});}
export async function curriculumEvidence(db:DB,actor:string,releaseId:string){if(!uuid.test(releaseId))throw new ContentError(400,'Invalid release.');return db.transaction(async tx=>{await contentStaff(tx,actor,['owner','publisher','content_editor','licence_manager']);return tx.select().from(s.curriculumReviewEvents).where(eq(s.curriculumReviewEvents.releaseId,releaseId)).orderBy(desc(s.curriculumReviewEvents.createdAt),desc(s.curriculumReviewEvents.id)).limit(200);});}
