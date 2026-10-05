import {createHash,randomUUID} from 'node:crypto';
import {eq} from 'drizzle-orm';
import type {PgDatabase,PgQueryResultHKT} from 'drizzle-orm/pg-core';
import * as s from '../db/schema';
import {contentStaff,ContentError,type AssetStore} from './content';
import {validateManifest,manifestDigest} from './package';
import {validWav} from './media-validation';
import {imageDimensions} from './image-dimensions';
type DB=PgDatabase<PgQueryResultHKT,typeof s>;
export function inspectMedia(bytes:Buffer){
  const dimensions=imageDimensions(bytes);
  const safeImage=dimensions!==null&&dimensions.every(value=>value>0&&value<=4096);
  if(bytes.length<12||bytes.length>20*1024*1024)throw new ContentError(400,'Media must be a supported file up to 20 MB.');
  if(validWav(bytes))return {mime:'audio/wav',extension:'wav',folder:'audio'};
  if(safeImage&&bytes.length>=45&&bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))&&bytes.toString('ascii',12,16)==='IHDR'&&bytes.readUInt32BE(8)===13&&bytes.readUInt32BE(16)>0&&bytes.readUInt32BE(20)>0&&bytes.readUInt32BE(16)<=4096&&bytes.readUInt32BE(20)<=4096&&bytes.toString('ascii',bytes.length-8,bytes.length-4)==='IEND')return {mime:'image/png',extension:'png',folder:'images'};
  if(safeImage&&bytes.length>=32&&bytes[0]===255&&bytes[1]===216&&bytes[2]===255&&bytes[bytes.length-2]===255&&bytes[bytes.length-1]===217)return {mime:'image/jpeg',extension:'jpg',folder:'images'};
  if(bytes.length>=32&&bytes.toString('ascii',4,8)==='ftyp'){
    const boxes=new Set<string>();let offset=0;
    while(offset+8<=bytes.length){let size=bytes.readUInt32BE(offset);const kind=bytes.toString('ascii',offset+4,offset+8);if(size===0)size=bytes.length-offset;if(size<8||offset+size>bytes.length)throw new ContentError(400,'Invalid MP4 container.');boxes.add(kind);offset+=size;}
    if(offset===bytes.length&&boxes.has('moov')&&boxes.has('mdat'))return {mime:'video/mp4',extension:'mp4',folder:'video'};
  }
  throw new ContentError(400,'Use a valid WAV, PNG, JPEG or MP4 file.');
}
export async function attachContentMedia(db:DB,actor:string,id:string,expectedDigest:string,bytes:Buffer,store:AssetStore){
  const format=inspectMedia(bytes),assetId=randomUUID(),objectKey=`assets/${assetId}.${format.extension}`;
  await db.transaction(tx=>contentStaff(tx,actor,['owner','content_editor']));
  await store.upload(objectKey,bytes,format.mime);
  try{return await db.transaction(async tx=>{
    await contentStaff(tx,actor,['owner','content_editor']);
    const [release]=await tx.select().from(s.packageReleases).where(eq(s.packageReleases.id,id)).for('update');
    if(!release||release.status!=='draft'||release.manifestDigest!==expectedDigest)throw new ContentError(409,'Draft changed or was published. Reload before uploading.');
    const manifest=structuredClone(validateManifest(release.manifest));
    const asset={id:assetId,relative_path:`${format.folder}/${assetId}.${format.extension}`,sha256:createHash('sha256').update(bytes).digest('hex'),byte_size:bytes.length,mime_type:format.mime};
    manifest.assets.push(asset);manifest.publication_status='draft';if(manifest.schema_version===2)manifest.age_reviewed=false;
    try{validateManifest(manifest);}catch{throw new ContentError(400,'Package media limit exceeded. Use at most 100 files totalling 100 MB.');}
    await tx.insert(s.assets).values({id:assetId,objectKey,sha256:asset.sha256,byteSize:BigInt(bytes.length),mimeType:format.mime});
    await tx.insert(s.packageAssets).values({releaseId:id,assetId,relativePath:asset.relative_path});
    await tx.update(s.packageReleases).set({manifest,manifestDigest:manifestDigest(manifest)}).where(eq(s.packageReleases.id,id));
    await tx.insert(s.adminAuditEvents).values({actorUserId:actor,entityType:'content_release',entityId:id,action:'media_attached'});
    return {id,assetId};
  });}catch(error){try{await store.remove(objectKey);}catch{/* Private orphan retained for operator cleanup. */}throw error;}
}
