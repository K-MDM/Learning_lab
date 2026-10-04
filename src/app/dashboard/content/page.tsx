import Link from 'next/link';
import {redirect} from 'next/navigation';
import {staffClient,getStaff} from '../../../lib/staff-auth';
import {database} from '../../../db';
import {listContent,ContentError} from '../../../lib/content';
import ContentManager from './content-manager';
import {validateManifest} from '../../../lib/package';
export const dynamic='force-dynamic';
export default async function ContentPage(){
  const client=await staffClient();if(!client)redirect('/login');const staff=await getStaff(client);if(!staff)redirect('/login');
  try{
    const content=await listContent(database(),staff.id);
    return <main className="console"><Link href="/dashboard">← Licence management</Link><p className="brand">KEEEL · COMPANY CONSOLE</p><h1>Course content</h1>
      <p className="muted">Create drafts, review lessons, publish private packages for every active licensed device.</p>
      <ContentManager roles={staff.roles} releases={content.map(row=>({...row,manifest:validateManifest(row.manifest),publishedAt:row.publishedAt?.toISOString()??null}))}
/></main>;
  }catch(error){return <main><h1>Content unavailable</h1><p>{error instanceof ContentError?error.message:'Check the server connection and try again.'}</p><Link href="/dashboard">Back to dashboard</Link></main>;}
}
