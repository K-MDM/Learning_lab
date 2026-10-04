import {createHmac,createHash,randomBytes} from 'node:crypto';
import {and,desc,eq,isNull,sql} from 'drizzle-orm';
import type {PgDatabase,PgQueryResultHKT} from 'drizzle-orm/pg-core';
import * as schema from '../db/schema';

type LabDatabase=PgDatabase<PgQueryResultHKT,typeof schema>;
type Transaction=Parameters<Parameters<LabDatabase['transaction']>[0]>[0];
export class LicenceError extends Error {
  constructor(public status:number,message:string){super(message);}
}
export function digestKey(key:string,secret:string){
  if(!/^[a-f0-9]{64}$/i.test(secret)) throw new LicenceError(503,'Licence issuance is not configured.');
  return createHmac('sha256',Buffer.from(secret,'hex')).update(key).digest('hex');
}
async function authorised(tx:Transaction,actorId:string){
  const [member]=await tx.select().from(schema.adminMemberships)
    .where(eq(schema.adminMemberships.userId,actorId)).for('share');
  const roles=await tx.select().from(schema.adminRoles).where(eq(schema.adminRoles.userId,actorId)).for('share');
  if(member?.status!=='active'||!roles.some(row=>['owner','licence_manager'].includes(row.role)))
    throw new LicenceError(403,'Licence management requires an owner or licence manager.');
}
async function audit(tx:Transaction,actorId:string,id:string,action:string,metadata:Record<string,unknown>,activationId?:string){
  await tx.insert(schema.licenceEvents).values({licenceId:id,actorUserId:actorId,action,metadata,activationId});
  await tx.insert(schema.adminAuditEvents).values({actorUserId:actorId,action,entityType:'licence',entityId:id});
}
export async function issueLicences(db:LabDatabase,actorId:string,count:number,requestId:string,secret:string){
  if(!Number.isInteger(count)||count<1||count>100) throw new LicenceError(400,'Choose between 1 and 100 licences.');
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestId))
    throw new LicenceError(400,'A valid issuance request ID is required.');
  // Validate configuration before starting a transaction. Never store raw keys.
  digestKey('configuration-check',secret);
  return db.transaction(async tx=>{
    await authorised(tx,actorId);
    const claimed=await tx.insert(schema.licenceIssuanceRequests).values({id:requestId,actorUserId:actorId})
      .onConflictDoNothing().returning({id:schema.licenceIssuanceRequests.id});
    if(!claimed.length) throw new LicenceError(409,'This issuance request was already processed. Keys are shown only once; check the licence list before issuing replacements.');
    const issued=[];
    for(let n=0;n<count;n++){
      const key='KEEEL-'+randomBytes(24).toString('hex').toUpperCase().match(/.{1,8}/g)!.join('-');
      const [licence]=await tx.insert(schema.licences).values({keyDigest:digestKey(key,secret),displaySuffix:key.slice(-8),digestKeyVersion:1})
        .returning({id:schema.licences.id,displaySuffix:schema.licences.displaySuffix});
      await audit(tx,actorId,licence.id,'issued',{requestId,durationMonths:12,digestKeyVersion:1});
      issued.push({...licence,key});
    }
    return issued;
  });
}
export async function changeLicence(db:LabDatabase,actorId:string,id:string,action:'revoke'|'reset',reason:string){
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))throw new LicenceError(400,'Invalid licence ID.');
  if(!['reset','revoke'].includes(action))throw new LicenceError(400,'Invalid licence action.');
  const trimmed=reason.trim();
  if(trimmed.length<10||trimmed.length>300)throw new LicenceError(400,'Enter a reason between 10 and 300 characters.');
  return db.transaction(async tx=>{
    await authorised(tx,actorId);
    const [licence]=await tx.select().from(schema.licences).where(eq(schema.licences.id,id)).for('update');
    if(!licence)throw new LicenceError(404,'Licence not found.');
    if(licence.status==='revoked')throw new LicenceError(409,'This licence is already revoked.');
    const [binding]=await tx.select().from(schema.deviceActivations)
      .where(and(eq(schema.deviceActivations.licenceId,id),isNull(schema.deviceActivations.endedAt)));
    if(action==='reset'){
      if(licence.status==='expired'||(licence.expiresAt&&licence.expiresAt.getTime()<=Date.now()))
        throw new LicenceError(409,'An expired licence cannot be reset.');
      if(!binding)throw new LicenceError(409,'This licence has no current device binding.');
    }
    if(binding)await tx.update(schema.deviceActivations).set({endedAt:sql`greatest(clock_timestamp(),${schema.deviceActivations.activatedAt})`}).where(eq(schema.deviceActivations.id,binding.id));
    await tx.update(schema.licences).set({generation:sql`${schema.licences.generation}+1`,
      ...(action==='revoke'?{status:'revoked'}:{})}).where(eq(schema.licences.id,id));
    await audit(tx,actorId,id,action==='reset'?'device_reset':'revoked',{
      reason:trimmed,previousGeneration:licence.generation.toString(),newGeneration:(licence.generation+1n).toString(),
      expiresAt:licence.expiresAt?.toISOString()??null
    },binding?.id);
    return {id,action};
  });
}
export async function listLicences(db:LabDatabase,actorId:string,id?:string){
  return db.transaction(async tx=>{
    await authorised(tx,actorId);
    const rows=await tx.select({id:schema.licences.id,displaySuffix:schema.licences.displaySuffix,status:schema.licences.status,
      firstActivatedAt:schema.licences.firstActivatedAt,expiresAt:schema.licences.expiresAt,generation:schema.licences.generation,
      createdAt:schema.licences.createdAt,platform:schema.deviceActivations.platform,devicePublicKey:schema.deviceActivations.devicePublicKey,
      deviceActivatedAt:schema.deviceActivations.activatedAt})
      .from(schema.licences).leftJoin(schema.deviceActivations,and(eq(schema.licences.id,schema.deviceActivations.licenceId),isNull(schema.deviceActivations.endedAt)))
      .where(id?eq(schema.licences.id,id):undefined)
      .orderBy(desc(schema.licences.createdAt),desc(schema.licences.id)).limit(id?1:1000);
    return rows.map(({devicePublicKey,...row})=>({...row,generation:row.generation.toString(),
      status:row.status!=='revoked'&&row.expiresAt&&row.expiresAt.getTime()<=Date.now()?'expired':row.status,
      deviceFingerprint:devicePublicKey?createHash('sha256').update(devicePublicKey).digest('hex').slice(0,16):null}));
  });
}
export async function licenceHistory(db:LabDatabase,actorId:string,id:string){
  return db.transaction(async tx=>{
    await authorised(tx,actorId);
    return tx.select({id:schema.licenceEvents.id,action:schema.licenceEvents.action,metadata:schema.licenceEvents.metadata,
      createdAt:schema.licenceEvents.createdAt,actorUserId:schema.licenceEvents.actorUserId})
      .from(schema.licenceEvents).where(eq(schema.licenceEvents.licenceId,id)).orderBy(desc(schema.licenceEvents.createdAt)).limit(50);
  });
}
