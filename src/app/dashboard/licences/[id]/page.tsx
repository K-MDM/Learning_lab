import Link from 'next/link';
import {redirect,notFound} from 'next/navigation';
import {staffClient,getStaff} from '../../../../lib/staff-auth';
import {database} from '../../../../db';
import {listLicences,licenceHistory,LicenceError} from '../../../../lib/licences';
export const dynamic='force-dynamic';
export default async function LicenceDetails({params}:{params:Promise<{id:string}>}){
  const client=await staffClient();if(!client)redirect('/login');
  const staff=await getStaff(client);if(!staff)redirect('/login');
  if(!staff.roles.some(role=>['owner','licence_manager'].includes(role)))return <main><h1>Access restricted</h1><p>Licence history requires an owner or licence manager.</p><Link href="/dashboard">Back to dashboard</Link></main>;
  const {id}=await params;if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))notFound();
  let rows:Awaited<ReturnType<typeof listLicences>>,events:Awaited<ReturnType<typeof licenceHistory>>;
  try{rows=await listLicences(database(),staff.id,id);events=await licenceHistory(database(),staff.id,id);}
  catch(error){return <main><h1>Licence history unavailable</h1><p>{error instanceof LicenceError?error.message:'Please try again shortly.'}</p><Link href="/dashboard">Back to dashboard</Link></main>;}
  const licence=rows.find(row=>row.id===id);if(!licence)notFound();
  return <main className="console"><Link href="/dashboard">← Licence management</Link><p className="brand">KEEEL · COMPANY CONSOLE</p>
    <h1>Licence …{licence.displaySuffix}</h1><p className="muted">{licence.id}</p>
    <section className="panel"><h2>Activation details</h2><dl className="details"><dt>Status</dt><dd>{licence.status}</dd>
      <dt>Current device</dt><dd>{licence.platform??'Unbound'} {licence.deviceFingerprint??''}</dd>
      <dt>Generation</dt><dd>{licence.generation}</dd><dt>First activated</dt><dd>{licence.firstActivatedAt?.toISOString()??'Awaiting activation'}</dd>
      <dt>Expires</dt><dd>{licence.expiresAt?.toISOString()??'12 months from first activation'}</dd></dl></section>
    <section className="panel"><h2>Audit history</h2><p className="muted">Latest 50 events. Times shown in UTC.</p>
      {!events.length?<p>No licence events recorded.</p>:<ol className="history">{events.map(event=>{
        const metadata=event.metadata as Record<string,unknown>;
        return <li key={event.id}><strong>{event.action.replaceAll('_',' ')}</strong><time dateTime={event.createdAt.toISOString()}>{event.createdAt.toISOString()}</time>
          <small>Staff ID: {event.actorUserId??'System / device'}</small>{typeof metadata.reason==='string'&&<p>{metadata.reason}</p>}</li>;
      })}</ol>}
    </section>
  </main>;
}
