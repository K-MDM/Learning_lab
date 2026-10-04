import {database} from '../../../../db';
import {completeActivation,ActivationError} from '../../../../lib/activation';
import {activationConfig,activationRequest} from '../../../../lib/activation-http';
export const runtime='nodejs';
export async function POST(request:Request){return activationRequest(request,async body=>{
  if(typeof body.challengeId!=='string'||typeof body.signature!=='string')throw new ActivationError(400,'Invalid device proof.');
  return completeActivation(database(),{challengeId:body.challengeId,signature:body.signature},activationConfig());
});}
