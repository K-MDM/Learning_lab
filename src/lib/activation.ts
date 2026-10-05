import {createHash,createPublicKey,randomBytes,sign,verify,type KeyObject} from 'node:crypto';
import {and,eq,isNull,lt,sql} from 'drizzle-orm';
import type {PgDatabase,PgQueryResultHKT} from 'drizzle-orm/pg-core';
import * as schema from '../db/schema';
import {digestKey} from './licences';
type DB=PgDatabase<PgQueryResultHKT,typeof schema>;
type TX=Parameters<Parameters<DB['transaction']>[0]>[0];
export class ActivationError extends Error{constructor(public status:number,message:string,public code='activation_failed'){super(message);}}
export type ActivationConfig={digestSecret:string;signingKey:KeyObject;keyId:string};
export type Envelope={keyId:string;payload:string;signature:string};
export type Claims={version:1;issuer:'keeel-company';audience:'keeel-language-lab';licence_id:string;activation_id:string;
  generation:string;device_key_digest:string;platform:string;issued_at:string;first_activated_at:string;expires_at:string};
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
function bytes(value:string,length:number){
  const decoded=Buffer.from(value,'base64url');
  if(decoded.length!==length||decoded.toString('base64url')!==value)throw new ActivationError(400,'Invalid device key or signature.');
  return decoded;
}
function publicKey(value:string){return createPublicKey({key:Buffer.concat([Buffer.from('302a300506032b6570032100','hex'),bytes(value,32)]),format:'der',type:'spki'});}
export function deviceDigest(value:string){return createHash('sha256').update(bytes(value,32)).digest('hex');}
export function addCalendarMonths(start:Date,months:number){
  const end=new Date(start);const day=end.getUTCDate();end.setUTCDate(1);end.setUTCMonth(end.getUTCMonth()+months);
  const last=new Date(Date.UTC(end.getUTCFullYear(),end.getUTCMonth()+1,0)).getUTCDate();end.setUTCDate(Math.min(day,last));return end;
}
function configured(config:ActivationConfig){
  if(config.signingKey.asymmetricKeyType!=='ed25519'||!/^[-a-zA-Z0-9_]{1,64}$/.test(config.keyId))throw new ActivationError(503,'Activation is not configured.');
  digestKey('config-check',config.digestSecret);
}
function envelopeMessage(keyId:string,payload:string){return Buffer.from(`KEEEL-LANGLAB-ENTITLEMENT-V1\n${keyId}\n${payload}`,'utf8');}
export function signEntitlement(claims:Claims,config:ActivationConfig):Envelope{
  const payload=Buffer.from(JSON.stringify(claims),'utf8').toString('base64url');
  return {keyId:config.keyId,payload,signature:sign(null,envelopeMessage(config.keyId,payload),config.signingKey).toString('base64url')};
}
export function verifyEntitlement(envelope:Envelope,config:ActivationConfig):Claims{
  try{
    if(envelope.keyId!==config.keyId||typeof envelope.payload!=='string'||envelope.payload.length>4096||
      !verify(null,envelopeMessage(envelope.keyId,envelope.payload),createPublicKey(config.signingKey),bytes(envelope.signature,64)))throw new Error();
    const claims=JSON.parse(Buffer.from(envelope.payload,'base64url').toString('utf8')) as Claims;
    if(claims.version!==1||claims.issuer!=='keeel-company'||claims.audience!=='keeel-language-lab'||
      !uuid.test(claims.licence_id)||!uuid.test(claims.activation_id)||!/^\d+$/.test(claims.generation)||
      !/^[a-f0-9]{64}$/.test(claims.device_key_digest)||!['windows','android'].includes(claims.platform)||
      !Number.isFinite(Date.parse(claims.expires_at)))throw new Error();
    return claims;
  }catch{throw new ActivationError(401,'Invalid device entitlement.','invalid_entitlement');}
}
type Challenge=typeof schema.activationChallenges.$inferSelect;
function challengeMessage(row:Challenge){return Buffer.from(['KEEEL-LANGLAB-ACTIVATION-V1',row.id,row.nonce,row.licenceId,
  row.devicePublicKey,row.platform,row.generation.toString(),row.expiresAt.toISOString(),row.purpose].join('\n'),'utf8');}
export async function limited(db:DB,scope:string,now:Date){
  // Limits are committed even when the subsequent activation transaction fails.
  const isContent = scope.startsWith('content:');
  const scopeLimit = isContent ? 1000 : 120;
  await db.transaction(async tx=>{
    for(const [key,max] of [['global',10000],[scope,scopeLimit]] as const){
      const [row]=await tx.insert(schema.activationRateLimits).values({scope:key,windowStart:now,requests:1})
        .onConflictDoUpdate({target:schema.activationRateLimits.scope,set:{
          windowStart:sql`CASE WHEN ${schema.activationRateLimits.windowStart}<=${now.toISOString()}::timestamptz-interval '1 minute' THEN ${now.toISOString()}::timestamptz ELSE ${schema.activationRateLimits.windowStart} END`,
          requests:sql`CASE WHEN ${schema.activationRateLimits.windowStart}<=${now.toISOString()}::timestamptz-interval '1 minute' THEN 1 ELSE ${schema.activationRateLimits.requests}+1 END`
        }}).returning();
      if(row.requests>max)throw new ActivationError(429, isContent ? 'Too many content download requests. Wait one minute and retry.' : 'Too many activation requests. Wait one minute and retry.');
    }
    await tx.execute(sql`DELETE FROM langlab.activation_rate_limits WHERE scope IN
      (SELECT scope FROM langlab.activation_rate_limits WHERE window_start<${now.toISOString()}::timestamptz-interval '1 day' LIMIT 100)`);
    await tx.execute(sql`DELETE FROM langlab.activation_challenges WHERE id IN
      (SELECT id FROM langlab.activation_challenges WHERE expires_at<${now.toISOString()}::timestamptz-interval '1 day' LIMIT 100)`);
  });
}
function validLicence(licence:typeof schema.licences.$inferSelect,now:Date){
  if(licence.status==='revoked'||licence.status==='expired'||(licence.expiresAt&&licence.expiresAt<=now))
    throw new ActivationError(410,'This licence is expired or revoked. Contact your administrator.','licence_inactive');
}
export function verifyDeviceProof(key:string,message:Buffer,signature:string){return verify(null,message,publicKey(key),bytes(signature,64));}
async function binding(tx:TX,licenceId:string){return (await tx.select().from(schema.deviceActivations)
  .where(and(eq(schema.deviceActivations.licenceId,licenceId),isNull(schema.deviceActivations.endedAt))))[0];}
export async function createChallenge(db:DB,input:{licenceKey?:string;entitlement?:Envelope;devicePublicKey:string;platform:string},config:ActivationConfig,now=new Date()){
  configured(config);publicKey(input.devicePublicKey);
  if(!['android','windows'].includes(input.platform)||Boolean(input.licenceKey)===Boolean(input.entitlement))throw new ActivationError(400,'Invalid activation request.');
  let keyDigest:string|undefined,claims:Claims|undefined;
  if(input.licenceKey){
    const normal=input.licenceKey.trim().toUpperCase();
    if(!/^KEEEL-(?:[A-F0-9]{8}-){5}[A-F0-9]{8}$/.test(normal))throw new ActivationError(400,'Enter a valid KEEEL licence key.');
    keyDigest=digestKey(normal,config.digestSecret);
  }else claims=verifyEntitlement(input.entitlement!,config);
  await limited(db,keyDigest??`licence:${claims!.licence_id}`,now);
  return db.transaction(async tx=>{
    const [licence]=await tx.select().from(schema.licences).where(keyDigest?eq(schema.licences.keyDigest,keyDigest):eq(schema.licences.id,claims!.licence_id)).for('update');
    if(!licence)throw new ActivationError(401,'Licence key not recognised.');validLicence(licence,now);
    if(licence.digestKeyVersion!==1)throw new ActivationError(503,'Licence key version is not supported.');
    if(claims){const current=await binding(tx,licence.id);
      if(claims.device_key_digest!==deviceDigest(input.devicePublicKey)||claims.platform!==input.platform||
        claims.generation!==licence.generation.toString()||current?.id!==claims.activation_id||current.devicePublicKey!==input.devicePublicKey)
        throw new ActivationError(409,'This device binding was reset. Contact your administrator.','binding_reset');}
    const [challenge]=await tx.insert(schema.activationChallenges).values({licenceId:licence.id,devicePublicKey:input.devicePublicKey,
      platform:input.platform,purpose:claims?'status':'activate',nonce:randomBytes(32).toString('base64url'),generation:licence.generation,
      expiresAt:new Date(now.getTime()+120000)}).returning();
    return {id:challenge.id,message:challengeMessage(challenge).toString('base64url'),expiresAt:challenge.expiresAt.toISOString()};
  });
}
export async function completeActivation(db:DB,input:{challengeId:string;signature:string},config:ActivationConfig,now=new Date()){
  configured(config);if(!uuid.test(input.challengeId))throw new ActivationError(400,'Invalid challenge.');bytes(input.signature,64);
  // Resolve before taking licence/challenge locks, consistently with reset locking.
  const [lookup]=await db.select().from(schema.activationChallenges).where(eq(schema.activationChallenges.id,input.challengeId));
  await limited(db,lookup?`licence:${lookup.licenceId}`:'unknown-challenge',now);
  if(!lookup)throw new ActivationError(401,'Activation challenge not found.');
  return db.transaction(async tx=>{
    const [licence]=await tx.select().from(schema.licences).where(eq(schema.licences.id,lookup.licenceId)).for('update');
    const [challenge]=await tx.select().from(schema.activationChallenges).where(eq(schema.activationChallenges.id,input.challengeId)).for('update');
    if(!licence||!challenge)throw new ActivationError(401,'Activation challenge not found.');
    if(challenge.consumedAt)throw new ActivationError(409,'Challenge already used. Request a new challenge.');
    if(challenge.expiresAt<=now)throw new ActivationError(410,'Challenge expired. Retry activation.');
    if(!verify(null,challengeMessage(challenge),publicKey(challenge.devicePublicKey),bytes(input.signature,64)))throw new ActivationError(401,'Device proof is invalid.');
    validLicence(licence,now);
    if(challenge.generation!==licence.generation)throw new ActivationError(409,'Device binding changed. Request a new challenge.','binding_reset');
    let current=await binding(tx,licence.id);
    if(current&&(current.devicePublicKey!==challenge.devicePublicKey||current.platform!==challenge.platform))
      throw new ActivationError(409,'This licence is already activated on another device.');
    if(challenge.purpose==='status'&&!current)throw new ActivationError(409,'This device binding was reset.','binding_reset');
    let first=licence.firstActivatedAt,expires=licence.expiresAt;
    if(!current){
      first??=now;expires??=addCalendarMonths(first,12);
      await tx.update(schema.licences).set({status:'active',firstActivatedAt:first,expiresAt:expires}).where(eq(schema.licences.id,licence.id));
      [current]=await tx.insert(schema.deviceActivations).values({licenceId:licence.id,devicePublicKey:challenge.devicePublicKey,
        platform:challenge.platform,generation:licence.generation,activatedAt:now}).returning();
      await tx.insert(schema.licenceEvents).values({licenceId:licence.id,activationId:current.id,action:'activated',metadata:{platform:challenge.platform,generation:licence.generation.toString()}});
    }
    if(!first||!expires)throw new ActivationError(503,'Licence activation state is inconsistent.');
    await tx.update(schema.activationChallenges).set({consumedAt:now}).where(eq(schema.activationChallenges.id,challenge.id));
    return {entitlement:signEntitlement({version:1,issuer:'keeel-company',audience:'keeel-language-lab',licence_id:licence.id,
      activation_id:current.id,generation:licence.generation.toString(),device_key_digest:deviceDigest(current.devicePublicKey),
      platform:current.platform,issued_at:now.toISOString(),first_activated_at:first.toISOString(),expires_at:expires.toISOString()},config)};
  });
}
