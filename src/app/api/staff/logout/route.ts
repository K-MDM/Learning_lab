import {staffClient} from '../../../../lib/staff-auth';
import {isAllowedOrigin,getClientBaseUrl} from '../../../../lib/request-origin';

export async function POST(request:Request){
  if(!isAllowedOrigin(request))return Response.json({error:'Invalid origin'},{status:403});
  const url=getClientBaseUrl(request);
  const client=await staffClient(true);if(client)await client.auth.signOut();
  return Response.redirect(new URL('/login',url),303);
}
