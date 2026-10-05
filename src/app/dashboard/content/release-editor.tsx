'use client';
import {useState} from 'react';
import ActivityFields,{newActivity} from './activity-fields';
import {availableActivityTypes} from '../../../lib/writing-policy';
import {activityTypes} from '../../../lib/activity-contract';
import type {Manifest,Lesson,Activity} from '../../../lib/package';
export default function ReleaseEditor({manifest,busy,onSave,onCancel}:{manifest:Manifest;busy:boolean;onSave:(manifest:Manifest)=>void;onCancel:()=>void}){
  const [draft,setDraft]=useState<Manifest>(()=>({...structuredClone(manifest),schema_version:2,minimum_app_version:'1.3.0',age_reviewed:false}));
  function lesson(index:number,change:Partial<Lesson>){setDraft(previous=>({...previous,lessons:previous.lessons.map((value,i)=>i===index?{...value,...change}:value)}));}
  function activity(li:number,ai:number,change:Partial<Activity>){lesson(li,{activities:draft.lessons[li].activities.map((value,i)=>i===ai?{...value,...change}:value)});}
  function addLesson(){setDraft(previous=>({...previous,lessons:[...previous.lessons,{id:crypto.randomUUID(),version:1,title:'New lesson',skill:'reading',curriculum_references:[],activities:[{id:crypto.randomUUID(),type:'reading',prompt:'Enter reading text.',scoring_version:1}]}]}));}
  function addActivity(li:number,type:Activity["type"]){lesson(li,{activities:[...draft.lessons[li].activities,newActivity(type,draft)]});}
  return <section className="panel"><h2>Edit draft · {draft.version}</h2><p>Saving resets review. Published versions and existing learner results are preserved. Narration files remain attached to this release.</p>
    <form onSubmit={event=>{event.preventDefault();onSave({...draft,publication_status:'draft'});}}>
      <fieldset disabled={busy} style={{marginBottom:24,padding:20,borderRadius:12}}><legend>Library card</legend>
        <label>Thumbnail (optional)<select value={draft.thumbnail_asset??''} onChange={event=>setDraft(previous=>{const next={...previous};if(event.target.value)next.thumbnail_asset=event.target.value;else delete next.thumbnail_asset;return next;})}>
          <option value="">Use the illustrated default</option>
          {draft.assets.filter(asset=>['image/png','image/jpeg'].includes(asset.mime_type)).map(asset=><option key={asset.id} value={asset.id}>{asset.relative_path}</option>)}
        </select></label>
        <p className="muted">Upload a PNG or JPEG using Attach media before editing, then select it here. A landscape image works best. The image appears above the title and downloads with the lessons for offline use. Saving updates the draft; review and publish when ready.</p>
      </fieldset>
      {draft.lessons.map((value,li)=><fieldset key={value.id} disabled={busy} style={{marginBottom:24,padding:20,borderRadius:12}}><legend>Lesson {li+1}</legend>
        <label>Lesson title<input value={value.title} required maxLength={120} onChange={event=>lesson(li,{title:event.target.value})}/></label>
        <label>Skill<select disabled={manifest.lessons.some(original=>original.id===value.id)} value={value.skill} onChange={event=>lesson(li,{skill:event.target.value})}>{['listening','speaking','reading','writing','grammar','vocabulary'].map(skill=><option key={skill}>{skill}</option>)}</select></label><p className="muted">An existing lesson keeps its skill across versions. Add a new lesson for a different skill.</p>
        {value.skill==='writing'&&<p>Writing is MCQ-only. Learners select an answer; they never type. Add a question, answer options and the correct option.</p>}
        <label>Curriculum references (one per line)<textarea value={value.curriculum_references.join('\n')} maxLength={4000} onChange={event=>lesson(li,{curriculum_references:event.target.value.split('\n').filter(x=>x.trim())})}/></label>
        <label>Learning outcomes (one per line)<textarea value={(value.learning_outcomes??[]).join('\n')} maxLength={10000} onChange={event=>lesson(li,{learning_outcomes:event.target.value.split('\n').map(x=>x.trim()).filter(Boolean)})}/></label>
        {value.activities.map((item,ai)=><div key={item.id} className="panel" style={{background:'#f5f7fb'}}><h3>{ai+1}. {item.type}</h3>
          <label>{item.type==='reading'?'Reading text':'Instructions / question'}<textarea rows={4} value={item.prompt} required maxLength={10000} onChange={event=>activity(li,ai,{prompt:event.target.value})}/></label>
          {value.skill!=='writing'&&<><label>Review rubric (one criterion per line, maximum 5 points each)<textarea value={(item.rubric??[]).map(row=>row.criterion).join('\n')} maxLength={5000} onChange={event=>activity(li,ai,{rubric:event.target.value.split('\n').filter(x=>x.trim()).map(criterion=>({criterion,maximum_score:5}))})}/></label><p className="muted">Rubrics are review metadata. Quiz scores still use the selected correct answer.</p></>}
          <ActivityFields item={item} manifest={draft} onChange={change=>activity(li,ai,change)}/>
          <button type="button" className="secondary" disabled={busy||value.activities.length===1} onClick={()=>lesson(li,{activities:value.activities.filter((_,index)=>index!==ai)})}>Remove activity</button>
        </div>)}
        <div className="actions">{availableActivityTypes(value.skill,activityTypes).map(type=><button key={type} type="button" disabled={busy||value.activities.length>=30} onClick={()=>addActivity(li,type)}>Add {value.skill==='writing'?({gap_fill:'fill in the blanks',quiz:'correct sentence',token_order:'sentence ordering',spelling:'spelling',error_correction:'sentence correction'} as Record<string,string>)[type]??type.replaceAll('_',' '):type.replaceAll('_',' ')}</button>)}<button type="button" className="secondary" disabled={draft.lessons.length===1} onClick={()=>setDraft(previous=>({...previous,lessons:previous.lessons.filter((_,index)=>index!==li)}))}>Remove lesson</button></div>
      </fieldset>)}
      <div className="actions"><button type="button" disabled={busy||draft.lessons.length>=20} onClick={addLesson}>Add lesson</button><button disabled={busy}>Save draft changes</button><button type="button" className="secondary" disabled={busy} onClick={onCancel}>Cancel</button></div>
    </form>
  </section>;
}

