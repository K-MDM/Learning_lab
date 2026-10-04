'use client';
import registry from '../../../../../contracts/learning-registry.json';
import {useState} from 'react';
import {useRouter} from 'next/navigation';
import ReleaseEditor from './release-editor';
import type {Manifest} from '../../../lib/package';
type Release={manifestDigest:string;id:string;status:string;manifest:Manifest;publishedAt:string|null;unitTitle:string;courseTitle:string;collectionId:string};
export default function ContentManager({roles,releases}:{roles:string[];releases:Release[]}){
  const router=useRouter(),[busy,setBusy]=useState(false),[notice,setNotice]=useState(''),[showCreate,setShowCreate]=useState(false);
  const [confirm,setConfirm]=useState<{id:string;action:'review'|'publish'}|null>(null);
  const [editing,setEditing]=useState<Release|null>(null),[search,setSearch]=useState(''),[status,setStatus]=useState('all');
  const visible=releases.filter(release=>(status==='all'||release.status===status)&&`${release.unitTitle} ${release.courseTitle} ${release.manifest.language}`.toLowerCase().includes(search.toLowerCase()));
  const [audio,setAudio]=useState<Record<string,string[]>>({});
  const edit=roles.some(role=>['owner','content_editor'].includes(role)),publish=roles.some(role=>['owner','publisher'].includes(role));
  async function send(body:FormData|Record<string,unknown>){
    setBusy(true);setNotice('');try{
      const response=await fetch('/api/staff/content',{method:'POST',...(body instanceof FormData?{body}:{headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})});
      const result=await response.json();if(!response.ok)throw new Error(result.error??'Request failed');
      if(!(body instanceof FormData)&&body.action==='preview'){setAudio(previous=>({...previous,[String(body.id)]:result.urls}));return;}
      setEditing(null);setNotice('Content action completed.');setConfirm(null);setShowCreate(false);router.refresh();
    }catch(error){setNotice(error instanceof Error?error.message:'Content action failed.');}finally{setBusy(false);}
  }
  function create(event:React.FormEvent<HTMLFormElement>){
    event.preventDefault();const fields=new FormData(event.currentTarget),options=String(fields.get('options')).split('\n').filter(x=>x.trim());
    const draft={courseTitle:fields.get('course'),unitTitle:fields.get('unit'),lessonTitle:fields.get('lesson'),language:fields.get('language'),level:fields.get('level'),
      story:fields.get('story'),question:fields.get('question'),options,correctIndex:Number(fields.get('correct'))-1,demonstration:fields.get('demo')==='on'};
    const body=new FormData();body.set('draft',JSON.stringify(draft));const narration=fields.get('audio');if(narration instanceof File&&narration.size>0)body.set('audio',narration);void send(body);
  }
  return <>{editing&&<ReleaseEditor key={editing.id} manifest={editing.manifest} busy={busy} onCancel={()=>setEditing(null)} onSave={manifest=>void send({action:'save',id:editing.id,expectedDigest:editing.manifestDigest,manifest})}/>}<section className="panel"><div className="filters"><label>Search units<input value={search} onChange={event=>setSearch(event.target.value)} placeholder="Title, course or language"/></label><label>Status<select value={status} onChange={event=>setStatus(event.target.value)}><option value="all">All releases</option>{['draft','published','withdrawn'].map(value=><option key={value}>{value}</option>)}</select></label></div></section>{notice&&<p className="notice" role="status">{notice}</p>}
    {edit&&<section className="panel"><h2>Create a unit</h2><p>Start with one reading story and a comprehension question. Narration upload is optional.</p>
      <div className="actions"><button disabled={busy} onClick={()=>setShowCreate(!showCreate)}>New unit</button><button className="secondary" disabled={busy} onClick={()=>void send({action:'demo'})}>Create English demonstration draft</button></div>
      <p className="muted">The demonstration uses original text and locally synthesized narration. It requires staff review before publication.</p>
      {showCreate&&<form onSubmit={create}><div className="filters"><div><label>Course title<input name="course" required maxLength={120}/></label><label>Unit title<input name="unit" required maxLength={120}/></label><label>Lesson title<input name="lesson" required maxLength={120}/></label></div>
        <div><label>Language<select name="language">{[['en','English'],['hi','Hindi'],['sa','Sanskrit'],['fr','French'],['de','German']].map(([code,name])=><option key={code} value={code}>{name}</option>)}</select></label>
          <label>Grade<select name="level">{Array.from({length:12},(_,n)=><option key={n} value={`grade-${n+1}`}>Grade {n+1}</option>)}{[...registry.stages,...registry.proficiencies].map(level=><option key={level} value={level}>{level}</option>)}</select></label><label>Reference narration (optional WAV)<input name="audio" type="file" accept=".wav,audio/wav"/></label></div></div>
        <label>Reading text<textarea name="story" required maxLength={10000} rows={6}/></label><label>Comprehension question<input name="question" required maxLength={500}/></label>
        <label>Answer options (one per line)<textarea name="options" required rows={4}/></label><label>Correct option number<input name="correct" type="number" required min={1} max={8} defaultValue={1}/></label>
        <label className="checkbox-label"><input type="checkbox" name="demo"/>Label as demonstration content</label><button disabled={busy}>Save draft</button></form>}
    </section>}
    {confirm&&<section className="panel"><h2>{confirm.action==='review'?'Confirm content review':'Publish this unit'}</h2>
      <p>{confirm.action==='review'?'Confirm the text, narration, answers and usage rights have been checked. Demonstration content remains labelled as a demonstration.':'The reviewed package will become immutable and available to every active licensed device.'}</p>
      <div className="actions"><button disabled={busy} onClick={()=>void send(confirm)}>Confirm {confirm.action}</button><button className="secondary" disabled={busy} onClick={()=>setConfirm(null)}>Cancel</button></div></section>}
    {!releases.length?<section className="panel"><p>No units yet. Create a draft to get started.</p></section>:visible.map(release=><section className="panel" key={release.id}>
      <div className="section-heading"><h2>{release.unitTitle}</h2><span className="badge">{release.status==='draft'&&release.manifest.publication_status==='reviewed'?'Reviewed draft':release.status}</span></div>
      <p>{release.courseTitle} · {release.manifest.language} · {release.manifest.level} · Version {release.manifest.version}</p><p>{release.manifest.lessons[0].title}</p>
      <details><summary>Preview all lessons</summary>{release.manifest.lessons.map(lesson=><article key={lesson.id}><h3>{lesson.title}</h3>{lesson.learning_outcomes?.map(outcome=><p key={outcome}>Outcome: {outcome}</p>)}{lesson.activities.map(activity=><div key={activity.id}><p>{activity.type}: {activity.prompt}</p>{activity.options&&<ol>{activity.options.map((option,index)=><li key={index}>{option}{index===activity.correct_index?" (correct)":""}</li>)}</ol>}</div>)}</article>)}<details><summary>First lesson quick preview</summary><p>{release.manifest.lessons[0].activities.find(x=>x.type==='reading')?.prompt}</p>
        <p>{release.manifest.lessons[0].activities.find(x=>x.type==='quiz')?.prompt}</p><ol>{release.manifest.lessons[0].activities.find(x=>x.type==='quiz')?.options?.map(option=><li key={option}>{option}</li>)}</ol>
        <p>Correct answer: {release.manifest.lessons[0].activities.find(x=>x.type==='quiz')?.options?.[release.manifest.lessons[0].activities.find(x=>x.type==='quiz')?.correct_index??0]}</p>
        {(edit||publish)&&release.manifest.assets.length>0&&<button className="secondary" disabled={busy} onClick={()=>void send({action:'preview',id:release.id})}>Listen to narration</button>}
        {audio[release.id]?.map(url=><audio key={url} controls preload="none" src={url} aria-label="Reference narration"/>)}
        </details><p className="muted">{release.manifest.assets.length} narration file(s), {release.manifest.assets.reduce((sum,x)=>sum+x.byte_size,0)} bytes.</p></details>
      {edit&&<div className="actions">{release.status==='draft'&&<button disabled={busy} onClick={()=>setEditing(release)}>Edit lessons</button>}{release.status==='published'&&<button className="secondary" disabled={busy} onClick={()=>void send({action:'revision',id:release.id})}>Create next revision</button>}</div>}
      {publish&&release.status==='draft'&&<div className="actions"><button disabled={busy||release.manifest.publication_status==='reviewed'} onClick={()=>setConfirm({id:release.id,action:'review'})}>Mark reviewed</button>
        <button disabled={busy||release.manifest.publication_status!=='reviewed'} onClick={()=>setConfirm({id:release.id,action:'publish'})}>Publish unit</button></div>}
    </section>)}
  </>;
}

