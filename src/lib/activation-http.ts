import 'server-only';
import {createPrivateKey} from 'node:crypto';
import {ActivationError,type ActivationConfig} from './activation';
export function activationConfig():ActivationConfig{
  try{return {digestSecret:process.env.LICENCE_DIGEST_KEY_V1??'',keyId:process.env.ENTITLEMENT_KEY_ID??'',
    signingKey:createPrivateKey({key:Buffer.from(process.env.ENTITLEMENT_PRIVATE_KEY_DER??'','base64'),format:'der',type:'pkcs8'})};}
  catch{throw new ActivationError(503,'Activation is not configured.');}
}
export async function activationRequest(request:Request,run:(body:Record<string,unknown>)=>Promise<unknown>){
  const headers={'Cache-Control':'no-store'};
  try{
    if(!request.headers.get('content-type')?.startsWith('application/json'))throw new ActivationError(415,'Expected JSON.');
    const chunks:Uint8Array[]=[];const reader=request.body?.getReader();let size=0;
    if(reader)while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;
      if(size>8192){await reader.cancel();throw new ActivationError(413,'Request too large.');}chunks.push(value);}
    let body:Record<string,unknown>;
    try{body=JSON.parse(Buffer.concat(chunks).toString('utf8'));if(!body||typeof body!=='object'||Array.isArray(body))throw new Error();}
    catch{throw new ActivationError(400,'Invalid request.');}
    return Response.json(await run(body),{headers});
  }catch(error){
    if(error instanceof ActivationError)return Response.json({error:error.message,code:error.code},{status:error.status,headers:{...headers,...(error.status===429?{'Retry-After':'60'}:{})}});
    return Response.json({error:'Activation service is unavailable. Try again shortly.'},{status:503,headers});
  }
}
