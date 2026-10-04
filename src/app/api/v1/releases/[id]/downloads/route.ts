import {database} from '../../../../../../db';
import {ActivationError} from '../../../../../../lib/activation';
import {activationRequest,activationConfig} from '../../../../../../lib/activation-http';
import {deviceContent} from '../../../../../../lib/device-content';
import {privateStore} from '../../../../../../lib/content-storage';
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){const {id}=await params;return activationRequest(request,async body=>{
  if(typeof body.challengeId!=='string'||typeof body.signature!=='string')throw new ActivationError(400,'Invalid content proof.');
  return deviceContent(database(),`/api/v1/releases/${id}/downloads`,{challengeId:body.challengeId,signature:body.signature},activationConfig(),privateStore());
});}
