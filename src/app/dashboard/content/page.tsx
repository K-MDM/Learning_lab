import Link from 'next/link';
import {redirect} from 'next/navigation';
import {staffClient,getStaff} from '../../../lib/staff-auth';
import {database} from '../../../db';
import {listContent,ContentError} from '../../../lib/content';
import ContentManager from './content-manager';
import {validateManifest} from '../../../lib/package';
export const dynamic='force-dynamic';
export default async function ContentPage({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){
  const client=await staffClient();if(!client)redirect('/login');const staff=await getStaff(client);if(!staff)redirect('/login');
  try{
    const query=await searchParams;
    const cursor=typeof query.cursor==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(query.cursor)?query.cursor:undefined;
    const search=typeof query.q==='string'?query.q.slice(0,120):'',status=typeof query.status==='string'?query.status:'';
    const rows=await listContent(database(),staff.id,{cursor,search,status}),content=rows.slice(0,100);
    const next=new URLSearchParams({cursor:content.at(-1)?.id??'',q:search,status});
    return <main className="console"><Link href="/dashboard">← Licence management</Link><p className="brand">KEEEL · COMPANY CONSOLE</p><h1>Course content</h1><p><Link href="/dashboard/curriculum">Curriculum coverage, rights and approval evidence →</Link></p>
      <p className="muted">Create drafts, review lessons, publish private packages for every active licensed device.</p>
      <form className="panel" method="get"><label>Search all content<input name="q" defaultValue={search} maxLength={120}/></label><label>Status<select name="status" defaultValue={status}><option value="">All releases</option>{['draft','published','withdrawn'].map(value=><option key={value}>{value}</option>)}</select></label><button>Search catalogue</button></form>
      <ContentManager roles={staff.roles} releases={content.map(row=>({...row,manifest:validateManifest(row.manifest),publishedAt:row.publishedAt?.toISOString()??null}))}
/>{rows.length>100&&<Link href={`?${next}`}>Next 100 releases →</Link>}{cursor&&<p><Link href={`?${new URLSearchParams({q:search,status})}`}>Back to first page</Link></p>}</main>;
  }catch(error){return <main><h1>Content unavailable</h1><p>{error instanceof ContentError?error.message:'Check the server connection and try again.'}</p><Link href="/dashboard">Back to dashboard</Link></main>;}
}
