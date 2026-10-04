import {saveContentDraft,createContentRevision} from '../../../../lib/content-edit';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {staffClient,getStaff} from '../../../../lib/staff-auth';
import {database} from '../../../../db';
import {createDraft,reviewOrPublish,previewContent,ContentError,type DraftInput} from '../../../../lib/content';
import {privateStore} from '../../../../lib/content-storage';
export const runtime='nodejs';
const headers={'Cache-Control':'no-store'};
const demo:DraftInput={courseTitle:'English reading — demonstration',unitTitle:'A visit to the library — demonstration',lessonTitle:'A visit to the library',
  language:'en',level:'grade-6',story:'Riya visits the library after school. She borrows a book about birds. At home, she reads about a small blue bird. The next day, she tells her friend what she learned.',
  question:"What is Riya's book about?",options:['Birds','Cars','Cooking'],correctIndex:0,demonstration:true};
export async function POST(request:Request){
  if(request.headers.get('origin')!==new URL(request.url).origin)return Response.json({error:'Invalid origin'},{status:403,headers});
  try{
    const client=await staffClient(true),staff=client?await getStaff(client):null;
    if(!staff)return Response.json({error:'Sign in to continue.'},{status:401,headers});
    if(Number(request.headers.get('content-length')??0)>21*1024*1024)throw new ContentError(413,'Upload is too large.');
    if(request.headers.get('content-type')?.startsWith('multipart/form-data')){
      const form=await request.formData();const audio=form.get('audio'),draft=form.get('draft');
      if((audio!==null&&!(audio instanceof File))||(audio instanceof File&&audio.size>20*1024*1024)||typeof draft!=='string'||draft.length>20000)throw new ContentError(400,'Provide a valid draft and optional WAV narration up to 20 MB.');
      const hasAudio=audio instanceof File&&audio.size>0;
      let input:DraftInput;try{input=JSON.parse(draft);}catch{throw new ContentError(400,'Invalid draft.');}
      return Response.json(await createDraft(database(),staff.id,input,hasAudio?Buffer.from(await (audio as File).arrayBuffer()):null,hasAudio?privateStore():undefined),{status:201,headers});
    }
    const reader=request.body?.getReader();if(!reader)throw new ContentError(400,'Empty request.');const chunks:Uint8Array[]=[];let bytes=0;while(true){const next=await reader.read();if(next.done)break;bytes+=next.value.byteLength;if(bytes>256*1024){await reader.cancel();throw new ContentError(413,'Request too large.');}chunks.push(next.value);}const text=Buffer.concat(chunks).toString('utf8');
    let body:Record<string,unknown>;try{body=JSON.parse(text);if(!body||typeof body!=='object')throw new Error();}catch{throw new ContentError(400,'Invalid content request.');}
    if(body.action==='demo')return Response.json(await createDraft(database(),staff.id,demo,await readFile(resolve(process.cwd(),'../content/samples/library-story.wav')),privateStore()),{status:201,headers});
    const validId=(value:unknown)=>typeof value==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(value);
    if(body.action==='save'&&validId(body.id)&&typeof body.expectedDigest==='string')return Response.json(await saveContentDraft(database(),staff.id,body.id as string,body.expectedDigest,body.manifest),{headers});
    if(body.action==='revision'&&validId(body.id))return Response.json(await createContentRevision(database(),staff.id,body.id as string),{status:201,headers});
    if(body.action==='preview'&&validId(body.id))return Response.json(await previewContent(database(),staff.id,body.id as string,privateStore()),{headers});
    if((body.action==='review'||body.action==='publish')&&validId(body.id))return Response.json(await reviewOrPublish(database(),staff.id,body.id as string,body.action),{headers});
    throw new ContentError(400,'Invalid content action.');
  }catch(error){return Response.json({error:error instanceof ContentError?error.message:'Content service is unavailable. Try again shortly.'},{status:error instanceof ContentError?error.status:503,headers});}
}
