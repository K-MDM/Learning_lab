import {staffClient,getStaff} from '../../../../lib/staff-auth';
import {isAllowedOrigin,getClientBaseUrl} from '../../../../lib/request-origin';

export async function POST(request:Request){
  if(!isAllowedOrigin(request))return Response.json({error:'Invalid origin'},{status:403});
  const url=getClientBaseUrl(request);
  const client=await staffClient(true);if(!client)return Response.json({error:'Sign-in is not configured'},{status:503});
  const form=await request.formData(),email=form.get('email'),password=form.get('password');
  if(typeof email!=='string'||typeof password!=='string'||!email.trim()||email.length>254||!password||password.length>1024)return Response.redirect(new URL('/login?error=invalid',url),303);
  const {error}=await client.auth.signInWithPassword({email:email.trim(),password});
  if(error||!await getStaff(client)){await client.auth.signOut();return Response.redirect(new URL('/login?error=denied',url),303);}
  return Response.redirect(new URL('/dashboard/overview',url),303);
}
