import Link from 'next/link';
import {redirect} from 'next/navigation';
import {staffClient,getStaff} from '../../../lib/staff-auth';
import {database} from '../../../db';
import {curriculumCoverage} from '../../../lib/curriculum';
import {listContent,ContentError} from '../../../lib/content';
import CoveragePanel from './coverage-panel';
export const dynamic='force-dynamic';
export default async function CurriculumPage({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){
 const client=await staffClient(),staff=client?await getStaff(client):null;if(!staff)redirect('/login');
 try{const query=await searchParams,search=typeof query.q==='string'?query.q.slice(0,120):'';const report=await curriculumCoverage(database(),staff.id),releases=(await listContent(database(),staff.id,{search})).slice(0,100);
 return <main className="console"><Link href="/dashboard/content">← Content authoring</Link><p className="brand">KEEEL · CURRICULUM REVIEW</p><h1>Curriculum coverage and evidence</h1><form method="get" className="panel"><label>Find a release for evidence (first100 matching releases)<input name="q" defaultValue={search} maxLength={120}/></label><button>Search releases</button></form><CoveragePanel report={report} releases={releases.map(r=>({id:r.id,unitTitle:r.unitTitle,manifestDigest:r.manifestDigest}))} roles={staff.roles}/></main>;
 }catch(error){return <main><h1>Curriculum tools unavailable</h1><p>{error instanceof ContentError?error.message:'Apply the reviewed database migration and check server connectivity.'}</p><Link href="/dashboard/content">Back to content</Link></main>;}
}
