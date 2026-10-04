import {redirect} from 'next/navigation';
import {staffClient,getStaff} from '../../lib/staff-auth';
import {database} from '../../db';
import {listLicences,LicenceError} from '../../lib/licences';
import LicenceManager,{type LicenceSummary} from './licence-manager';
import Link from 'next/link';
export const dynamic = 'force-dynamic';
export default async function Dashboard(){
  const client=await staffClient();if(!client)redirect('/login');
  const staff=await getStaff(client);if(!staff)redirect('/login');
  const canManage=staff.roles.some(role=>['owner','licence_manager'].includes(role));
  let licences:LicenceSummary[]=[];let error='';
  if(canManage){
    try{const rows=await listLicences(database(),staff.id);licences=rows.map(row=>({...row,createdAt:row.createdAt.toISOString(),
      firstActivatedAt:row.firstActivatedAt?.toISOString()??null,expiresAt:row.expiresAt?.toISOString()??null,
      deviceActivatedAt:row.deviceActivatedAt?.toISOString()??null}));}
    catch(cause){error=cause instanceof LicenceError?cause.message:'Licence service is unavailable. Check the server database connection.';}
  }
  return <main className="console"><header className="console-header"><div><p className="brand">KEEEL · COMPANY CONSOLE</p><h1>Licence management</h1>
    <p className="muted">{staff.email} · {staff.roles.join(', ')}</p></div><form action="/api/staff/logout" method="post"><button className="secondary">Sign out</button></form></header>
    <p className="muted">Learning history and recordings stay on each device.</p>
    <nav><Link href="/dashboard/content">Course content and publishing →</Link></nav>
    {!canManage?<section className="panel"><h2>Company access</h2><p>Your role does not include licence management. Use course content for your assigned content tools.</p></section>:
      error?<p className="notice" role="alert">{error}</p>:<LicenceManager licences={licences} issuanceConfigured={/^[a-f0-9]{64}$/i.test(process.env.LICENCE_DIGEST_KEY_V1??'')}/>}
  </main>;
}
