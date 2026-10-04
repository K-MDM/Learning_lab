import 'server-only';
import {createClient} from '@supabase/supabase-js';
import type {AssetStore} from './content';
import {ContentError} from './content';
export const contentBucket='keeel-langlab-content-v1';
export function privateStore():AssetStore{
  const url=process.env.SUPABASE_URL,key=process.env.SUPABASE_SECRET_KEY??process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!url||!key)throw new ContentError(503,'Private content storage is not configured.');
  const client=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
  async function ensure(){
    const {data,error}=await client.storage.getBucket(contentBucket);
    if(error){
      if(String(error.status??error.statusCode)!=='404' && error.message.toLowerCase()!=='bucket not found')throw new ContentError(503,'Private content storage is unavailable.');
      const created=await client.storage.createBucket(contentBucket,{public:false,fileSizeLimit:20*1024*1024,allowedMimeTypes:['audio/wav']});
      if(created.error)throw new ContentError(503,'Cannot create the private content bucket.');
    }else if(data.public)throw new ContentError(503,'The content bucket must be private.');
  }
  return {
    async upload(key,bytes,mime){await ensure();const {error}=await client.storage.from(contentBucket).upload(key,bytes,{contentType:mime,upsert:false});if(error)throw new ContentError(503,'Audio upload failed.');},
    async remove(key){const {error}=await client.storage.from(contentBucket).remove([key]);if(error)throw new ContentError(503,'Private cleanup failed.');},
    async signedUrl(key){await ensure();const {data,error}=await client.storage.from(contentBucket).createSignedUrl(key,300);if(error)throw new ContentError(503,'Download authorisation failed.');return data.signedUrl;}
  };
}

