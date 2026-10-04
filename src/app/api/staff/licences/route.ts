import {staffClient,getStaff} from '../../../../lib/staff-auth';
import {database} from '../../../../db';
import {issueLicences,changeLicence,LicenceError} from '../../../../lib/licences';
export const runtime='nodejs';
const headers={'Cache-Control':'no-store'};
export async function POST(request:Request){
  if(request.headers.get('origin')!==new URL(request.url).origin)return Response.json({error:'Invalid origin'},{status:403,headers});
  if(!request.headers.get('content-type')?.startsWith('application/json'))return Response.json({error:'Expected JSON'},{status:415,headers});
  // Bounded body: no learner data or arbitrary payloads belong in this endpoint.
  const reader=request.body?.getReader();const chunks:Uint8Array[]=[];let size=0;
  if(reader){
    while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;
      if(size>2048){await reader.cancel();return Response.json({error:'Request too large'},{status:413,headers});}chunks.push(value);}
  }
  const text=Buffer.concat(chunks).toString('utf8');
  let body:Record<string,unknown>;
  try {body=JSON.parse(text);if(!body||typeof body!=='object'||Array.isArray(body))throw new Error();}
  catch{return Response.json({error:'Invalid request'},{status:400,headers});}
  try {
    const client=await staffClient(true);if(!client)return Response.json({error:'Sign-in is not configured'},{status:503,headers});
    const staff=await getStaff(client);if(!staff)return Response.json({error:'Sign in to continue'},{status:401,headers});
    if(body.action==='issue'){
      if(typeof body.count!=='number'||typeof body.requestId!=='string')throw new LicenceError(400,'Invalid issuance request.');
      const issued=await issueLicences(database(),staff.id,body.count,body.requestId,process.env.LICENCE_DIGEST_KEY_V1??'');
      return Response.json({issued},{status:201,headers});
    }
    if((body.action==='reset'||body.action==='revoke')&&typeof body.id==='string'&&typeof body.reason==='string'){
      const result=await changeLicence(database(),staff.id,body.id,body.action,body.reason);
      return Response.json(result,{headers});
    }
    throw new LicenceError(400,'Invalid licence action.');
  } catch(error){
    if(error instanceof LicenceError)return Response.json({error:error.message},{status:error.status,headers});
    // Do not send driver details, connection strings or key material to clients/logs.
    return Response.json({error:'Licence service is unavailable. Try again shortly.'},{status:503,headers});
  }
}
