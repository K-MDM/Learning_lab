import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
export async function staffClient(writable = false) {
  const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return null;
  const store = await cookies();
  return createServerClient(url,key,{cookies:{
    getAll:()=>store.getAll(),
    setAll:(values)=>{if(writable)for(const {name,value,options} of values)store.set(name,value,options);}
  }});
}
export async function getStaff(client:NonNullable<Awaited<ReturnType<typeof staffClient>>>) {
  const {data:{user},error}=await client.auth.getUser();
  if(error||!user)return null;
  const {data:member,error:membershipError}=await client.schema('langlab').from('admin_memberships').select('status').eq('user_id',user.id).maybeSingle();
  if(membershipError||member?.status!=='active')return null;
  const {data:roles,error:roleError}=await client.schema('langlab').from('admin_roles').select('role').eq('user_id',user.id);
  if(roleError||!roles?.length)return null;
  return {id:user.id,email:user.email,roles:roles.map((row:{role:string})=>row.role)};
}
