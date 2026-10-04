import {randomUUID} from 'node:crypto';
import {and,eq,sql} from 'drizzle-orm';
import type {PgDatabase,PgQueryResultHKT} from 'drizzle-orm/pg-core';
import * as s from '../db/schema';
import {contentStaff,ContentError} from './content';
import {validateManifest,manifestDigest,type Manifest} from './package';
type DB=PgDatabase<PgQueryResultHKT,typeof s>;

export async function saveContentDraft(db:DB,actor:string,id:string,expectedDigest:string,input:unknown){
  let incoming:Manifest;try{incoming=validateManifest(input);}catch{throw new ContentError(400,'Check lesson IDs, activities, media references and quiz answers.');}
  return db.transaction(async tx=>{
    await contentStaff(tx,actor,['owner','content_editor']);
    const [release]=await tx.select().from(s.packageReleases).where(eq(s.packageReleases.id,id)).for('update');
    if(!release||release.status!=='draft')throw new ContentError(409,'Only a draft can be edited. Create a revision for published content.');
    if(release.manifestDigest!==expectedDigest)throw new ContentError(409,'Another staff member changed this draft. Reload before saving.');
    const original=validateManifest(release.manifest);
    // Existing media and release identity are immutable through the lesson editor.
    if(incoming.release_id!==id||incoming.unit_id!==original.unit_id||incoming.version!==original.version||incoming.language!==original.language||incoming.level!==original.level||JSON.stringify(incoming.assets)!==JSON.stringify(original.assets))throw new ContentError(400,'Release identity, language, level and media cannot be changed in this editor.');
    const manifest={...incoming,publication_status:'draft' as const};
    if(manifest.lessons.length>20||manifest.lessons.some(lesson=>lesson.activities.length>30))throw new ContentError(400,'Use at most 20 lessons and 30 activities per lesson.');
    const links=await tx.select({version:s.lessonVersions}).from(s.packageLessons).innerJoin(s.lessonVersions,eq(s.lessonVersions.id,s.packageLessons.lessonVersionId)).where(eq(s.packageLessons.releaseId,id));
    const originals=new Map(links.map(row=>[row.version.lessonId,row.version]));
    await tx.delete(s.packageLessons).where(eq(s.packageLessons.releaseId,id));
    for(const [position,lesson] of manifest.lessons.entries()){
      const previous=originals.get(lesson.id);
      if(previous){
        if(lesson.version!==previous.version)throw new ContentError(400,'Existing lesson version numbers must be preserved.');
        // Never edit a payload already included in another published package.
        const [published]=await tx.select({id:s.packageReleases.id}).from(s.packageLessons).innerJoin(s.packageReleases,eq(s.packageReleases.id,s.packageLessons.releaseId)).where(and(eq(s.packageLessons.lessonVersionId,previous.id),sql`${s.packageReleases.status} != 'draft'`)).limit(1);
        if(published)throw new ContentError(409,'This lesson is already published. Create a revision.');
        await tx.update(s.lessonVersions).set({payload:lesson,reviewStatus:'draft'}).where(eq(s.lessonVersions.id,previous.id));
        await tx.insert(s.packageLessons).values({releaseId:id,lessonVersionId:previous.id,position});
      }else{
        if(lesson.version!==1)throw new ContentError(400,'A new lesson starts at version 1.');
        const [exists]=await tx.select().from(s.lessons).where(eq(s.lessons.id,lesson.id));if(exists)throw new ContentError(400,'New lessons need new IDs.');
        const [last]=await tx.select({position:s.lessons.position}).from(s.lessons).where(eq(s.lessons.unitId,release.unitId)).orderBy(sql`${s.lessons.position} desc`).limit(1);
        await tx.insert(s.lessons).values({id:lesson.id,unitId:release.unitId,skillCode:lesson.skill,position:(last?.position??-1)+1});
        const [version]=await tx.insert(s.lessonVersions).values({lessonId:lesson.id,version:1,payload:lesson}).returning();
        await tx.insert(s.packageLessons).values({releaseId:id,lessonVersionId:version.id,position});
      }
    }
    await tx.update(s.packageReleases).set({manifest,manifestDigest:manifestDigest(manifest)}).where(eq(s.packageReleases.id,id));
    await tx.insert(s.adminAuditEvents).values({actorUserId:actor,entityType:'content_release',entityId:id,action:'draft_updated'});
    return {id};
  });
}

export async function createContentRevision(db:DB,actor:string,id:string){
  return db.transaction(async tx=>{
    await contentStaff(tx,actor,['owner','content_editor']);
    const [source]=await tx.select().from(s.packageReleases).where(eq(s.packageReleases.id,id));
    if(!source||source.status!=='published')throw new ContentError(409,'Choose a published release to revise.');
    await tx.select().from(s.units).where(eq(s.units.id,source.unitId)).for('update');
    const releases=await tx.select().from(s.packageReleases).where(eq(s.packageReleases.unitId,source.unitId));
    if(releases.some(row=>row.status==='draft'))throw new ContentError(409,'This unit already has a draft revision. Edit it instead.');
    const highest=releases.map(row=>row.version.split('.').map(Number)).sort((a,b)=>b[0]-a[0]||b[1]-a[1]||b[2]-a[2])[0];
    const version=`${highest[0]}.${highest[1]}.${highest[2]+1}`,newId=randomUUID();
    const manifest=structuredClone(validateManifest(source.manifest));manifest.release_id=newId;manifest.version=version;manifest.publication_status='draft';
    const links=await tx.select({version:s.lessonVersions}).from(s.packageLessons).innerJoin(s.lessonVersions,eq(s.lessonVersions.id,s.packageLessons.lessonVersionId)).where(eq(s.packageLessons.releaseId,id));
    await tx.insert(s.packageReleases).values({id:newId,unitId:source.unitId,version,manifest,manifestDigest:manifestDigest(manifest),minimumAppVersion:source.minimumAppVersion});
    for(const [position,lesson] of manifest.lessons.entries()){
      const original=links.find(row=>row.version.lessonId===lesson.id)?.version;if(!original)throw new ContentError(409,'Published lesson links are incomplete.');
      const [latest]=await tx.select({version:s.lessonVersions.version}).from(s.lessonVersions).where(eq(s.lessonVersions.lessonId,lesson.id)).orderBy(sql`${s.lessonVersions.version} desc`).limit(1);
      lesson.version=latest.version+1;
      const [created]=await tx.insert(s.lessonVersions).values({lessonId:lesson.id,version:lesson.version,payload:lesson}).returning();
      await tx.insert(s.packageLessons).values({releaseId:newId,lessonVersionId:created.id,position});
    }
    const assets=await tx.select().from(s.packageAssets).where(eq(s.packageAssets.releaseId,id));
    if(assets.length)await tx.insert(s.packageAssets).values(assets.map(row=>({...row,releaseId:newId})));
    await tx.update(s.packageReleases).set({manifest,manifestDigest:manifestDigest(manifest)}).where(eq(s.packageReleases.id,newId));
    await tx.insert(s.adminAuditEvents).values({actorUserId:actor,entityType:'content_release',entityId:newId,action:'revision_created'});
    return {id:newId};
  });
}

