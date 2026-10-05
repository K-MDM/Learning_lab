import Link from 'next/link';
import {redirect} from 'next/navigation';
import {count} from 'drizzle-orm';
import {database} from '../../../db';
import * as s from '../../../db/schema';
import {staffClient,getStaff} from '../../../lib/staff-auth';
import {contentStaff,listContent} from '../../../lib/content';
export const dynamic='force-dynamic';
export default async function Overview(){
  const client=await staffClient(),staff=client?await getStaff(client):null;if(!staff)redirect('/login');
  try{
    const db=database();
    const totals=await db.transaction(async tx=>{await contentStaff(tx,staff.id,['owner','content_editor','publisher','licence_manager']);return tx.select({status:s.packageReleases.status,total:count()}).from(s.packageReleases).groupBy(s.packageReleases.status);});
    const recent=(await listContent(db,staff.id,{status:'draft'})).slice(0,5);
    return <main className="console"><div className="section-heading"><div><p className="eyebrow">YOUR WORKSPACE</p><h1>A little progress, every day.</h1><p className="muted">Prepare lessons, review content and keep devices ready to learn.</p></div><Link className="button-link" href="/dashboard/content">Create a unit →</Link></div>
      <div className="stat-grid">{['published','draft','withdrawn'].map(status=><Link className={`stat-card stat-${status}`} href={`/dashboard/content?status=${status}`} key={status}><span>{status==='published'?'Published units':status==='draft'?'Drafts to work on':'Withdrawn releases'}</span><strong>{totals.find(t=>t.status===status)?.total??0}</strong><small>Open content library →</small></Link>)}</div>
      <section className="panel"><div className="section-heading"><h2>Continue your work</h2><Link href="/dashboard/content">All content →</Link></div>{recent.length===0?<p className="empty">No drafts yet. Open the content library to create a unit or add an English demo.</p>:recent.map(row=><div className="work-row" key={row.id}><div><strong>{row.unitTitle}</strong><small>{row.courseTitle}</small></div><span className="badge">Draft</span><Link href="/dashboard/content">Open library →</Link></div>)}</section>
      <div className="notice"><strong>Learning stays on each device.</strong><p>This console manages content and licences. Learners' recordings and progress remain local.</p></div></main>;
  }catch{return <main className="console"><h1>Overview</h1><p className="notice" role="alert">Could not load workspace totals. Check the database connection and try again.</p><Link href="/dashboard/content">Open content library</Link></main>;}
}
