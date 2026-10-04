import {database} from '../../../../../db';
import {createChallenge,ActivationError,type Envelope} from '../../../../../lib/activation';
import {activationConfig,activationRequest} from '../../../../../lib/activation-http';
export const runtime='nodejs';
export async function POST(request:Request){return activationRequest(request,async body=>{
  if(typeof body.devicePublicKey!=='string'||typeof body.platform!=='string'||
    (body.licenceKey!==undefined&&typeof body.licenceKey!=='string')||
    (body.entitlement!==undefined&&(!body.entitlement||typeof body.entitlement!=='object')))
    throw new ActivationError(400,'Invalid activation request.');
  return createChallenge(database(),{devicePublicKey:body.devicePublicKey,platform:body.platform,
    licenceKey:body.licenceKey as string|undefined,entitlement:body.entitlement as Envelope|undefined},activationConfig());
});}
