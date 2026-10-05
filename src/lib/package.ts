import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import contract from '../../resources/contracts/package.schema.json';
import {createHash,sign} from 'node:crypto';
import type {ActivationConfig,Envelope} from './activation';
import {validateActivity,type Activity} from './activity-contract';
export type {Activity,ActivityType} from './activity-contract';
export type Lesson={id:string;version:number;title:string;skill:string;curriculum_references:string[];learning_outcomes?:string[];activities:Activity[]};
export type Asset={id:string;relative_path:string;sha256:string;byte_size:number;mime_type:string};
export type Manifest={schema_version:1|2;age_reviewed?:boolean;release_id:string;unit_id:string;version:string;language:string;level:string;
  thumbnail_asset?:string;minimum_app_version:string;publication_status:'draft'|'reviewed';lessons:Lesson[];assets:Asset[]};
const ajv=new Ajv({allErrors:true});addFormats(ajv);const validate=ajv.compile(contract);
export function validateManifest(value:unknown,publish=false):Manifest{
  if(!validate(value))throw new Error('Package structure is invalid.');
  const manifest=value as Manifest;
  if(Buffer.byteLength(canonical(manifest),'utf8')>512*1024)throw new Error('Package metadata is too large.');
  const minimum=manifest.minimum_app_version.split('.').map(Number);
  if(manifest.schema_version===2&&(minimum[0]<1||(minimum[0]===1&&minimum[1]<2)))throw new Error('Package v2 requires app1.2.0 or newer.');
  if(publish&&manifest.publication_status!=='reviewed')throw new Error('Content review is required.');
  if(publish&&manifest.schema_version===2&&!manifest.age_reviewed)throw new Error('Staff age review is required.');
  const unique=(values:string[])=>new Set(values.map(value=>value.toLowerCase())).size===values.length;
  if(manifest.lessons.length>100||manifest.assets.length>100||!unique(manifest.lessons.map(x=>x.id))||
    !unique(manifest.assets.map(x=>x.id))||!unique(manifest.assets.map(x=>x.relative_path)))throw new Error('Duplicate or excessive package entries.');
  for(const asset of manifest.assets){
    if(asset.byte_size>20*1024*1024||!/^([A-Za-z0-9_-]+\/)*[A-Za-z0-9_-]+\.[A-Za-z0-9]+$/.test(asset.relative_path)||
      asset.relative_path.split('/').some(segment=>/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(segment)))throw new Error('Unsafe asset path or size.');
  }
  if(manifest.assets.reduce((sum,x)=>sum+x.byte_size,0)>100*1024*1024)throw new Error('Package is too large.');
  if(manifest.thumbnail_asset&&!manifest.assets.some(asset=>asset.id===manifest.thumbnail_asset&&['image/png','image/jpeg'].includes(asset.mime_type)))throw new Error('Library thumbnail must reference an attached PNG or JPEG image.');
  for(const lesson of manifest.lessons){
    if(lesson.activities.length>100||!unique(lesson.activities.map(x=>x.id)))throw new Error('Duplicate or excessive activities.');
    for(const activity of lesson.activities){
      validateActivity(activity,manifest.assets,manifest.schema_version);
      if(['speaking','error_correction'].includes(activity.type)&&(minimum[0]<1||(minimum[0]===1&&minimum[1]<3)))throw new Error('This activity requires app1.3.0 or newer.');
      if(activity.reference_asset&&!manifest.assets.some(x=>x.id===activity.reference_asset))throw new Error('Referenced asset is missing.');
      if(activity.type==='quiz'&&(activity.correct_index!>=activity.options!.length))throw new Error('Invalid quiz answer.');
    }
  }
  return manifest;
}
export function canonical(value:unknown):string{
  if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';
  if(value!==null&&typeof value==='object')return '{'+Object.entries(value).sort(([a],[b])=>a<b?-1:a>b?1:0).map(([k,v])=>JSON.stringify(k)+':'+canonical(v)).join(',')+'}';
  return JSON.stringify(value);
}
export function manifestDigest(manifest:Manifest){return createHash('sha256').update(canonical(manifest)).digest('hex');}
export function signManifest(manifest:Manifest,config:ActivationConfig):Envelope{
  const payload=Buffer.from(canonical(validateManifest(manifest,true))).toString('base64url');
  return {keyId:config.keyId,payload,signature:sign(null,Buffer.from(`KEEEL-LANGLAB-PACKAGE-V1\n${config.keyId}\n${payload}`),config.signingKey).toString('base64url')};
}

