import {staffClient} from '../../../../lib/staff-auth';
export async function POST(request:Request){
  const url=new URL(request.url);
  if(request.headers.get('origin')!==url.origin)return Response.json({error:'Invalid origin'},{status:403});
  const client=await staffClient(true);if(client)await client.auth.signOut();
  return Response.redirect(new URL('/login',url),303);
}
