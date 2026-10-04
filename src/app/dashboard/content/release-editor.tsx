'use client';
import {useState} from 'react';
import type {Manifest,Lesson,Activity} from '../../../lib/package';
export default function ReleaseEditor({manifest,busy,onSave,onCancel}:{manifest:Manifest;busy:boolean;onSave:(manifest:Manifest)=>void;onCancel:()=>void}){
  const [draft,setDraft]=useState<Manifest>(()=>structuredClone(manifest));
  function lesson(index:number,change:Partial<Lesson>){setDraft(previous=>({...previous,lessons:previous.lessons.map((value,i)=>i===index?{...value,...change}:value)}));}
  function activity(li:number,ai:number,change:Partial<Activity>){lesson(li,{activities:draft.lessons[li].activities.map((value,i)=>i===ai?{...value,...change}:value)});}
  function addLesson(){setDraft(previous=>({...previous,lessons:[...previous.lessons,{id:crypto.randomUUID(),version:1,title:'New lesson',skill:'reading',curriculum_references:[],activities:[{id:crypto.randomUUID(),type:'reading',prompt:'Enter reading text.',scoring_version:1}]}]}));}
  function addActivity(li:number,type:Activity["type"]){const added:Activity={id:crypto.randomUUID(),type,prompt:'Enter the activity instructions.',scoring_version:1,...(type==='quiz'?{options:['Option 1','Option 2'],correct_index:0}:{}),...(type==='listening'?{reference_asset:draft.assets.find(asset=>asset.mime_type==='audio/wav')!.id}:{})};lesson(li,{activities:[...draft.lessons[li].activities,added]});}
  return <section className="panel"><h2>Edit draft · {draft.version}</h2><p>Saving resets review. Published versions and existing learner results are preserved. Narration files remain attached to this release.</p>
    <form onSubmit={event=>{event.preventDefault();onSave({...draft,publication_status:'draft'});}}>
      {draft.lessons.map((value,li)=><fieldset key={value.id} disabled={busy} style={{marginBottom:24,padding:20,borderRadius:12}}><legend>Lesson {li+1}</legend>
        <label>Lesson title<input value={value.title} required maxLength={120} onChange={event=>lesson(li,{title:event.target.value})}/></label>
        <label>Skill<select value={value.skill} onChange={event=>lesson(li,{skill:event.target.value})}>{['listening','speaking','reading','writing','grammar','vocabulary'].map(skill=><option key={skill}>{skill}</option>)}</select></label>
        <label>Curriculum references (one per line)<textarea value={value.curriculum_references.join('\n')} maxLength={4000} onChange={event=>lesson(li,{curriculum_references:event.target.value.split('\n').filter(x=>x.trim())})}/></label>
        <label>Learning outcomes (one per line)<textarea value={(value.learning_outcomes??[]).join('\n')} maxLength={10000} onChange={event=>lesson(li,{learning_outcomes:event.target.value.split('\n').map(x=>x.trim()).filter(Boolean)})}/></label>
        {value.activities.map((item,ai)=><div key={item.id} className="panel" style={{background:'#f5f7fb'}}><h3>{ai+1}. {item.type}</h3>
          <label>{item.type==='reading'?'Reading text':'Instructions / question'}<textarea rows={4} value={item.prompt} required maxLength={10000} onChange={event=>activity(li,ai,{prompt:event.target.value})}/></label>
          {item.type==='quiz'&&<><label>Options (one per line, 2–8)<textarea value={item.options!.join('\n')} onChange={event=>activity(li,ai,{options:event.target.value.split('\n')})}/></label><label>Correct answer<select value={item.correct_index} onChange={event=>activity(li,ai,{correct_index:Number(event.target.value)})}>{item.options!.map((option,index)=><option key={index} value={index}>{index+1}. {option}</option>)}</select></label></>}
          {item.type==='listening'&&<label>Narration file<select value={item.reference_asset} onChange={event=>activity(li,ai,{reference_asset:event.target.value})}>{draft.assets.filter(asset=>asset.mime_type==='audio/wav').map(asset=><option key={asset.id} value={asset.id}>{asset.relative_path}</option>)}</select></label>}
          <button type="button" className="secondary" disabled={busy||value.activities.length===1} onClick={()=>lesson(li,{activities:value.activities.filter((_,index)=>index!==ai)})}>Remove activity</button>
        </div>)}
        <div className="actions"><button type="button" disabled={value.activities.length>=30} onClick={()=>addActivity(li,'reading')}>Add reading</button><button type="button" disabled={value.activities.length>=30} onClick={()=>addActivity(li,'quiz')}>Add quiz</button><button type="button" disabled={!draft.assets.some(asset=>asset.mime_type==='audio/wav')||value.activities.length>=30} onClick={()=>addActivity(li,'listening')}>Add listening</button><button type="button" className="secondary" disabled={draft.lessons.length===1} onClick={()=>setDraft(previous=>({...previous,lessons:previous.lessons.filter((_,index)=>index!==li)}))}>Remove lesson</button></div>
      </fieldset>)}
      <div className="actions"><button type="button" disabled={busy||draft.lessons.length>=20} onClick={addLesson}>Add lesson</button><button disabled={busy}>Save draft changes</button><button type="button" className="secondary" disabled={busy} onClick={onCancel}>Cancel</button></div>
    </form>
  </section>;
}

