import {database} from '../../../../../db';
import {ActivationError,type Envelope} from '../../../../../lib/activation';
import {activationRequest,activationConfig} from '../../../../../lib/activation-http';
import {contentChallenge} from '../../../../../lib/device-content';
export async function POST(request:Request){return activationRequest(request,async body=>{
  if(typeof body.path!=='string'||typeof body.devicePublicKey!=='string'||!body.entitlement||typeof body.entitlement!=='object')throw new ActivationError(400,'Invalid content request.');
  return contentChallenge(database(),{path:body.path,devicePublicKey:body.devicePublicKey,entitlement:body.entitlement as Envelope},activationConfig());
});}
