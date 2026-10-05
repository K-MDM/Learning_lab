'use client';
import topics from '../../../../resources/contracts/curriculum-topics.json';
import type {Activity,Manifest} from '../../../lib/package';
export function newActivity(type:Activity['type'],manifest:Manifest):Activity {
  const base:Activity={id:crypto.randomUUID(),type,prompt:'Enter instructions.',scoring_version:1,normalization:'NFC'};
  const defaults:Partial<Record<Activity['type'],Partial<Activity>>>= {
    quiz:{options:['First answer','Second answer'],correct_index:0},
    multi_select:{options:['First answer','Second answer'],correct_indices:[0]},
    comprehension:{passage:'Enter the passage.',comprehension_focus:'literal',options:['First answer','Second answer'],correct_index:0},
    matching:{pairs:[{id:'pair1',left:'cat',right:'animal'},{id:'pair2',left:'rose',right:'flower'}]},
    gap_fill:{segments:['The sky is ','.'],answers:[['blue']]},
    speaking:{speaking_kind:'sentences',rubric:[{criterion:'Clarity of speech',maximum_score:5},{criterion:'Expression and fluency',maximum_score:5}]},
    error_correction:{source_text:'She go to school.',accepted_answers:['She goes to school.'],explanation:'Use goes with she in the present tense.'},
    spelling:{accepted_answers:['answer']},
    token_order:{items:[{id:'one',text:'I'},{id:'two',text:'learn'}],correct_order:['one','two']},
    sequencing:{items:[{id:'one',text:'First step'},{id:'two',text:'Next step'}],correct_order:['one','two']},
    picture:{image_asset:manifest.assets.find(asset=>asset.mime_type.startsWith('image/'))?.id,alt_text:'Describe the image.',accepted_answers:['answer']},
    writing:{writing_mode:'guided',starters:['I think…']},
    media:{reference_asset:manifest.assets.find(asset=>['audio/wav','video/mp4'].includes(asset.mime_type))?.id},
    glossary:{entries:[{id:'word1',term:'Hello',definition:'A greeting.',example:'Hello, friend!'}]},
    book:{pages:[{id:'page1',text:'Write the first page.'}]},
    dialogue:{turns:[{speaker:'Child',text:'Hello!'},{speaker:'Friend',text:'How are you?'}]},
    reading:{reading_kind:'story'},
  };
  return {...base,...defaults[type]};
}
export default function ActivityFields({item,manifest,onChange}:{item:Activity;manifest:Manifest;onChange:(value:Partial<Activity>)=>void}) {
  const change=(key:string,value:unknown)=>onChange({[key]:value});
  const area=(key:keyof Activity,label:string)=> <label key={key}>{label}<textarea required rows={3} maxLength={10000} value={(item[key] as string[]??[]).join('\n')} onChange={event=>change(key,event.target.value.split('\n'))}/></label>;
  const json=(key:keyof Activity,label:string)=> <StructuredField key={`${item.id}:${key}`} label={label} value={item[key]} onChange={value=>change(key,value)}/>;
  const media=(key:'reference_asset'|'image_asset',label:string,mimes:string[])=><label>{label}<select value={item[key]??''} onChange={event=>change(key,event.target.value||undefined)}><option value="">{key==='reference_asset'?'Installed offline voice / none':'Choose an attached image'}</option>{manifest.assets.filter(asset=>mimes.includes(asset.mime_type)).map(asset=><option key={asset.id} value={asset.id}>{asset.relative_path}</option>)}</select></label>;
  return <>
    <label>Topic / curriculum tag<select value={item.topic??''} onChange={event=>change('topic',event.target.value||undefined)}><option value="">Choose a reviewed curriculum mapping</option>{item.topic&&!topics.topics.some(t=>t.id===item.topic)&&<option>{item.topic}</option>}{topics.topics.map(topic=><option key={topic.id} value={topic.id}>{topic.skill} · {topic.label}</option>)}</select></label>
    {item.type==='error_correction'&&<label>Sentence to correct<textarea required maxLength={10000} value={item.source_text??''} onChange={event=>change('source_text',event.target.value)}/></label>}
    {item.type==='speaking'&&<><label>Speaking practice format<select value={item.speaking_kind} onChange={event=>change('speaking_kind',event.target.value)}>{['words','sentences','phonics','syllables','stress','intonation','fluency','role_play','self_introduction','picture_description','story_narration','question_answer','discussion','presentation','situational'].map(value=><option key={value}>{value}</option>)}</select></label>{media('reference_asset','Optional reference narration',['audio/wav'])}{json('rubric','Adult review rubric: JSON {criterion, maximum_score} list')}<p>Recordings stay encrypted on the device. No automatic pronunciation score.</p></>}

    {['quiz','multi_select','comprehension'].includes(item.type)&&<>{area('options','Answer options (2–8, one per line)')}{item.type==='multi_select'?<label>Correct option numbers (comma separated)<input defaultValue={item.correct_indices?.map(index=>index+1).join(',')} onChange={event=>change('correct_indices',event.target.value.split(',').map(value=>Number(value.trim())-1))}/></label>:<label>Correct answer<select value={item.correct_index} onChange={event=>change('correct_index',Number(event.target.value))}>{item.options?.map((option,index)=><option key={index} value={index}>{index+1}. {option}</option>)}</select></label>}</>}
    {item.type==='matching'&&json('pairs','Pairs: JSON list of {id, left, right}. Each label must be unique.')}
    {item.type==='gap_fill'&&<>{json('segments','Text segments: JSON string list, one more segment than gaps')}{json('answers','Accepted answers per gap: JSON list of string lists')}</>}
    {['spelling','picture','error_correction'].includes(item.type)&&area('accepted_answers','Accepted answers (one per line, accents and punctuation preserved)')}
    {['token_order','sequencing'].includes(item.type)&&<>{json('items','Items: JSON list of {id, text}')}{json('correct_order','Correct order: JSON list of item IDs')}</>}
    {item.type==='picture'&&<>{media('image_asset','Picture',['image/png','image/jpeg'])}<label>Image description<input required maxLength={500} value={item.alt_text??''} onChange={event=>change('alt_text',event.target.value)}/></label></>}
    {item.type==='comprehension'&&<><label>Passage<textarea required maxLength={10000} value={item.passage} onChange={event=>change('passage',event.target.value)}/></label><label>Question focus<select value={item.comprehension_focus} onChange={event=>change('comprehension_focus',event.target.value)}>{['literal','main_idea','inference','vocabulary','listening'].map(value=><option key={value}>{value}</option>)}</select></label>{media('reference_asset','Optional listening narration',['audio/wav'])}</>}
    {item.type==='glossary'&&json('entries','Word cards: JSON list of {id, term, definition, example?, reference_asset?}')}
    {item.type==='book'&&json('pages','Book pages: JSON list of {id, text, image_asset?, alt_text?, reference_asset?}')}
    {item.type==='dialogue'&&json('turns','Dialogue: JSON list of {speaker, text, reference_asset?}')}
    {item.type==='writing'&&<p role="alert">Open-ended writing is unavailable. Remove this activity and add an MCQ with selectable answers.</p>}
    {item.type==='listening'&&media('reference_asset','Optional narration; no file uses offline TTS',['audio/wav'])}
    {item.type==='media'&&media('reference_asset','Audio or video file',['audio/wav','video/mp4'])}
    {item.type==='reading'&&<label>Reading format<select value={item.reading_kind??'story'} onChange={event=>change('reading_kind',event.target.value)}>{['story','passage','phonics','words','sentences'].map(value=><option key={value}>{value}</option>)}</select></label>}
    <label>Explanation / feedback<textarea maxLength={2000} value={item.explanation??''} onChange={event=>change('explanation',event.target.value||undefined)}/></label>
    <label className="checkbox-label"><input type="checkbox" checked={item.case_sensitive??false} onChange={event=>change('case_sensitive',event.target.checked)}/>Case-sensitive text answers</label>
    <p className="muted">Text answers use NFC and collapsed whitespace. Accents and punctuation count. Attach media before editing and use its asset ID for nested pages or word cards. Server validation checks every field on save.</p>
  </>;
}
import {useState} from 'react';
function StructuredField({label,value,onChange}:{label:string;value:unknown;onChange:(value:unknown)=>void}) {
  const [raw,setRaw]=useState(()=>JSON.stringify(value??[],null,2));
  return <label>{label}<textarea required rows={7} maxLength={100000} value={raw} onChange={event=>{setRaw(event.target.value);try {const parsed=JSON.parse(event.target.value);event.target.setCustomValidity('');onChange(parsed);}catch{event.target.setCustomValidity('Enter valid JSON before saving.');}}}/></label>;
}
