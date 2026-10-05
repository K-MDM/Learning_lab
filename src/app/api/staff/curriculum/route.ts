import {staffClient,getStaff} from '../../../../lib/staff-auth';
import {database} from '../../../../db';
import {curriculumCoverage,curriculumEvidence,recordCurriculumEvidence,type EvidenceInput} from '../../../../lib/curriculum';
import {ContentError} from '../../../../lib/content';
export const runtime='nodejs';
const headers={'Cache-Control':'no-store'};
export async function GET(request:Request){try{const client=await staffClient(),staff=client?await getStaff(client):null;if(!staff)return Response.json({error:'Sign in to continue.'},{status:401,headers});const release=new URL(request.url).searchParams.get('release');return Response.json(release?await curriculumEvidence(database(),staff.id,release):await curriculumCoverage(database(),staff.id),{headers});}catch(error){return Response.json({error:error instanceof ContentError?error.message:'Curriculum report unavailable.'},{status:error instanceof ContentError?error.status:503,headers});}}
export async function POST(request:Request){
 if(request.headers.get('origin')!==new URL(request.url).origin)return Response.json({error:'Invalid origin'},{status:403,headers});
 try{
  const client=await staffClient(true),staff=client?await getStaff(client):null;if(!staff)return Response.json({error:'Sign in to continue.'},{status:401,headers});
  const reader=request.body?.getReader();if(!reader)throw new ContentError(400,'Empty evidence.');const chunks:Uint8Array[]=[];let size=0;
  while(true){const next=await reader.read();if(next.done)break;size+=next.value.length;if(size>16*1024){await reader.cancel();throw new ContentError(413,'Evidence is too large.');}chunks.push(next.value);}
  let value:EvidenceInput;try{value=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw new ContentError(400,'Invalid evidence.');}
  return Response.json(await recordCurriculumEvidence(database(),staff.id,value),{status:201,headers});
 }catch(error){return Response.json({error:error instanceof ContentError?error.message:'Evidence could not be recorded. Check the release and correction reference.'},{status:error instanceof ContentError?error.status:503,headers});}
}
