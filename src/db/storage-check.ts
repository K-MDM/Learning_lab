import {loadEnvConfig} from '@next/env';
import {createClient} from '@supabase/supabase-js';
import {randomUUID,createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
async function main(){
 loadEnvConfig(process.cwd());
 const url=process.env.SUPABASE_URL!,key=process.env.SUPABASE_SECRET_KEY??process.env.SUPABASE_SERVICE_ROLE_KEY!;
 if(!url||!key)throw new Error('configuration');
 const client=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}}),bucket='keeel-langlab-content-v1';
 const state=await client.storage.getBucket(bucket);
 if(state.error){
  if(String(state.error.status??state.error.statusCode)!=='404' && state.error.message.toLowerCase()!=='bucket not found')throw new Error('bucket access status '+String(state.error.status??state.error.statusCode));
  const created=await client.storage.createBucket(bucket,{public:false,fileSizeLimit:20*1024*1024,allowedMimeTypes:['audio/wav']});
  if(created.error)throw new Error('bucket creation');
 }else if(state.data.public)throw new Error('bucket must be private');
 const object=`verification/${randomUUID()}.wav`,bytes=await readFile('resources/content/samples/library-story.wav');
 const upload=await client.storage.from(bucket).upload(object,bytes,{contentType:'audio/wav',upsert:false});
 if(upload.error)throw new Error('upload');
 try{
  const signed=await client.storage.from(bucket).createSignedUrl(object,300);if(signed.error)throw new Error('signed link');
  const response=await fetch(signed.data.signedUrl),download=Buffer.from(await response.arrayBuffer());
  if(!response.ok||createHash('sha256').update(download).digest('hex')!==createHash('sha256').update(bytes).digest('hex'))throw new Error('download integrity');
  const anonymous=await fetch(`${url}/storage/v1/object/public/${bucket}/${object}`);
  if(anonymous.ok)throw new Error('anonymous access');
  const range=await fetch(signed.data.signedUrl,{headers:{Range:'bytes=0-31'}});if(range.status!==206)throw new Error('resume support');
  console.log('Private bucket verified: signed download hash matches, anonymous access denied, byte-range resume supported.');
 }finally{const removed=await client.storage.from(bucket).remove([object]);if(removed.error)throw new Error('verification cleanup');}
}
main().catch((error)=>{console.error('Private storage verification failed at stage:', error instanceof Error ? error.message : 'unknown');process.exitCode=1;});



