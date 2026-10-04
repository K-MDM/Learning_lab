import {randomBytes} from 'node:crypto';
import {and,eq,isNull,desc,lt,sql} from 'drizzle-orm';
import type {PgDatabase,PgQueryResultHKT} from 'drizzle-orm/pg-core';
import * as s from '../db/schema';
import {ActivationError,verifyEntitlement,deviceDigest,verifyDeviceProof,limited,type ActivationConfig,type Envelope} from './activation';
import {validateManifest,signManifest,manifestDigest} from './package';
import type {AssetStore} from './content';
type DB=PgDatabase<PgQueryResultHKT,typeof s>;type TX=Parameters<Parameters<DB['transaction']>[0]>[0];
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
function allowed(path:string){const parts=path.split('/');return path==='/api/v1/catalogue'||(parts.length===6&&parts.slice(0,5).join('/')==='/api/v1/catalogue/after'&&uuid.test(parts[5]))||(parts.slice(0,4).join('/')==='/api/v1/releases'&&uuid.test(parts[4]??'')&&(parts.length===5||(parts.length===6&&parts[5]==='downloads')));}
function message(row:typeof s.contentChallenges.$inferSelect){return Buffer.from(['KEEEL-LANGLAB-CONTENT-V1',row.id,row.nonce,row.path,row.licenceId,row.activationId,row.generation.toString(),row.expiresAt.toISOString()].join('\n'));}
async function current(tx:TX,licenceId:string,activationId:string,generation:bigint,devicePublicKey:string){
  const [licence]=await tx.select().from(s.licences).where(eq(s.licences.id,licenceId)).for('share');
  if(!licence||licence.status!=='active'||!licence.expiresAt||licence.expiresAt<=new Date())throw new ActivationError(410,'This licence is expired or revoked.','licence_inactive');
  const [binding]=await tx.select().from(s.deviceActivations).where(and(eq(s.deviceActivations.id,activationId),eq(s.deviceActivations.licenceId,licenceId),isNull(s.deviceActivations.endedAt)));
  if(!binding||binding.devicePublicKey!==devicePublicKey||binding.generation!==generation||licence.generation!==generation)throw new ActivationError(409,'Device binding has been reset.','binding_reset');
}
export async function contentChallenge(db:DB,input:{entitlement:Envelope;devicePublicKey:string;path:string},config:ActivationConfig){
  if(!allowed(input.path))throw new ActivationError(400,'Invalid content request path.');
  const claims=verifyEntitlement(input.entitlement,config);
  if(claims.device_key_digest!==deviceDigest(input.devicePublicKey))throw new ActivationError(401,'Wrong device identity.','invalid_entitlement');
  await limited(db,`content:${claims.licence_id}`,new Date());
  return db.transaction(async tx=>{
    await current(tx,claims.licence_id,claims.activation_id,BigInt(claims.generation),input.devicePublicKey);
    await tx.execute(sql`DELETE FROM langlab.content_challenges WHERE id IN (SELECT id FROM langlab.content_challenges WHERE expires_at<clock_timestamp()-interval '1 day' LIMIT 100)`);
    const [challenge]=await tx.insert(s.contentChallenges).values({licenceId:claims.licence_id,activationId:claims.activation_id,generation:BigInt(claims.generation),devicePublicKey:input.devicePublicKey,
      path:input.path,nonce:randomBytes(32).toString('base64url'),expiresAt:new Date(Date.now()+120000)}).returning();
    return {id:challenge.id,message:message(challenge).toString('base64url')};
  });
}
export async function deviceContent(db:DB,path:string,proof:{challengeId:string;signature:string},config:ActivationConfig,store?:AssetStore){
  if(!allowed(path)||!uuid.test(proof.challengeId))throw new ActivationError(400,'Invalid content proof.');
  const [lookup]=await db.select().from(s.contentChallenges).where(eq(s.contentChallenges.id,proof.challengeId));
  if(!lookup)throw new ActivationError(401,'Content challenge not found.');
  await limited(db,`content:${lookup.licenceId}`,new Date());
  return db.transaction(async tx=>{
    await current(tx,lookup.licenceId,lookup.activationId,lookup.generation,lookup.devicePublicKey);
    const [challenge]=await tx.select().from(s.contentChallenges).where(eq(s.contentChallenges.id,proof.challengeId)).for('update');
    if(!challenge||challenge.consumedAt||challenge.expiresAt<=new Date()||challenge.path!==path)throw new ActivationError(401,'Invalid or expired content challenge.');
    if(!verifyDeviceProof(challenge.devicePublicKey,message(challenge),proof.signature))throw new ActivationError(401,'Invalid device proof.');
    await tx.update(s.contentChallenges).set({consumedAt:new Date()}).where(eq(s.contentChallenges.id,challenge.id));
    const isCatalogue=path==='/api/v1/catalogue'||path.startsWith('/api/v1/catalogue/after/');
    const cursor=path.startsWith('/api/v1/catalogue/after/')?path.split('/')[5]:undefined;
    const id=isCatalogue?undefined:path.split('/')[4];
    const available=sql`exists(select 1 from langlab.collection_units cu join langlab.content_collections cc on cc.id=cu.collection_id where cu.unit_id=${s.units.id} and cc.status='active')`;
    const rows=await tx.select({id:s.packageReleases.id,unitId:s.units.id,title:s.units.title,course:s.courses.title,language:s.courses.languageCode,
      level:s.learningLevels.code,version:s.packageReleases.version,manifestDigest:s.packageReleases.manifestDigest})
      .from(s.packageReleases).innerJoin(s.units,eq(s.units.id,s.packageReleases.unitId)).innerJoin(s.courses,eq(s.courses.id,s.units.courseId))
      .innerJoin(s.learningLevels,eq(s.learningLevels.id,s.courses.levelId))
      .where(and(eq(s.packageReleases.status,'published'),available,cursor?lt(s.packageReleases.id,cursor):undefined,id?eq(s.packageReleases.id,id):undefined))
      .orderBy(desc(s.packageReleases.id)).limit(isCatalogue?101:1);
    if(isCatalogue){const releases=rows.slice(0,100);return {releases,nextCursor:rows.length>100?releases.at(-1)!.id:null};}
    if(!rows.length)throw new ActivationError(403,'This content is not published or available.');
    const [release]=await tx.select().from(s.packageReleases).where(eq(s.packageReleases.id,id!));
    const manifest=validateManifest(release.manifest,true);
    if(manifestDigest(manifest)!==release.manifestDigest)throw new ActivationError(503,'Published manifest failed verification.');
    if(!path.endsWith('/downloads'))return {manifest:signManifest(manifest,config)};
    if(!store)throw new ActivationError(503,'Private downloads are not configured.');
    const files=await tx.select({asset:s.assets,path:s.packageAssets.relativePath}).from(s.packageAssets)
      .innerJoin(s.assets,eq(s.assets.id,s.packageAssets.assetId)).where(eq(s.packageAssets.releaseId,id!));
    return {expiresAt:new Date(Date.now()+300000).toISOString(),assets:await Promise.all(files.map(async row=>({id:row.asset.id,url:await store.signedUrl(row.asset.objectKey),
      relative_path:row.path,sha256:row.asset.sha256,byte_size:Number(row.asset.byteSize)})))};
  });
}

