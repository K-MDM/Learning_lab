export const activityTypes=['reading','listening','quiz','multi_select','matching','gap_fill','spelling','token_order','sequencing','picture','comprehension','glossary','writing','media','book','dialogue','speaking','error_correction'] as const;
export type ActivityType=typeof activityTypes[number];
export type Rubric={criterion:string;maximum_score:number};
export type TextItem={id:string;text:string};
export type BookPage={id:string;text:string;image_asset?:string;alt_text?:string;reference_asset?:string};
export type GlossaryEntry={id:string;term:string;definition:string;example?:string;reference_asset?:string};
export type DialogueTurn={speaker:string;text:string;reference_asset?:string};
export const speakingKinds=['words','sentences','phonics','syllables','stress','intonation','fluency','role_play','self_introduction','picture_description','story_narration','question_answer','discussion','presentation','situational'] as const;
export type Activity={topic?:string;source_text?:string;speaking_kind?:typeof speakingKinds[number];id:string;type:ActivityType;prompt:string;scoring_version:number;reference_asset?:string;options?:string[];correct_index?:number;correct_indices?:number[];rubric?:Rubric[];
  explanation?:string;case_sensitive?:boolean;normalization?:'NFC';pairs?:{id:string;left:string;right:string}[];segments?:string[];answers?:string[][];
  accepted_answers?:string[];items?:TextItem[];correct_order?:string[];image_asset?:string;alt_text?:string;passage?:string;
  comprehension_focus?:'literal'|'main_idea'|'inference'|'vocabulary'|'listening';entries?:GlossaryEntry[];writing_mode?:'guided'|'free';starters?:string[];
  pages?:BookPage[];turns?:DialogueTurn[];reading_kind?:'story'|'passage'|'phonics'|'words'|'sentences';};
export function textKey(value:string,caseSensitive=false){const text=value.normalize('NFC').replace(/[\s\u0085]+/gu,' ').trim();return caseSensitive?text:text.toLowerCase();}
export function validateActivity(activity:Activity,assets:{id:string;mime_type:string}[],schema:number){
  const fail=(reason:string):never=>{throw new Error(reason);};
  function checkText(value:unknown,key='') {
    if(typeof value==='string'&&!['id','reference_asset','image_asset','normalization','type','writing_mode','reading_kind','comprehension_focus','segments'].includes(key)&&!value.trim())fail('Activity text must not be blank.');
    if(Array.isArray(value))for(const item of value)checkText(item,key);
    else if(value&&typeof value==='object')for(const [field,item] of Object.entries(value))checkText(item,field);
  }
  checkText(activity);
  if(activity.type==='speaking' && (!speakingKinds.includes(activity.speaking_kind!) || !activity.rubric?.length))fail('Speaking needs a practice format and authored rubric.');
  const unique=(values:string[])=>new Set(values).size===values.length;
  const mime=(id:string|undefined,types:string[])=>!!id&&assets.some(asset=>asset.id===id&&types.includes(asset.mime_type));
  if(schema===1&&!['reading','listening','quiz'].includes(activity.type))fail('New activity types require package schema v2.');
  if(activity.normalization!==undefined&&activity.normalization!=='NFC')fail('Unsupported text normalization.');
  if(activity.reference_asset&&!mime(activity.reference_asset,['audio/wav','video/mp4']))fail('Media reference is missing or unsupported.');
  if(activity.type==='listening'&&schema===1&&!activity.reference_asset)fail('Legacy listening needs audio.');
  if(['listening','comprehension'].includes(activity.type)&&activity.reference_asset&&!mime(activity.reference_asset,['audio/wav']))fail('Listening requires WAV audio.');
  if(['quiz','comprehension'].includes(activity.type)&&(activity.correct_index!>=activity.options!.length))fail('Invalid quiz answer.');
  if(activity.type==='multi_select'&&(!unique(activity.correct_indices!.map(String))||activity.correct_indices!.some(index=>index>=activity.options!.length)))fail('Invalid multi-select answers.');
  if(activity.type==='matching'&&(!unique(activity.pairs!.map(pair=>pair.id))||!unique(activity.pairs!.map(pair=>textKey(pair.left,activity.case_sensitive)))||!unique(activity.pairs!.map(pair=>textKey(pair.right,activity.case_sensitive)))))fail('Matching IDs and labels must be unique.');
  if(activity.type==='gap_fill'&&activity.segments!.length!==activity.answers!.length+1)fail('A gap needs text before and after every answer.');
  if(['token_order','sequencing'].includes(activity.type)&&(!unique(activity.items!.map(item=>item.id))||!unique(activity.correct_order!)||activity.correct_order!.length!==activity.items!.length||activity.correct_order!.some(id=>!activity.items!.some(item=>item.id===id))))fail('Order must contain every item ID exactly once.');
  if(activity.type==='picture'&&!mime(activity.image_asset,['image/png','image/jpeg']))fail('Picture requires an installed image.');
  if(activity.type==='media'&&!mime(activity.reference_asset,['audio/wav','video/mp4']))fail('Media requires audio or video.');
  if(activity.type==='book'){
    if(!unique(activity.pages!.map(page=>page.id)))fail('Book page IDs must be unique.');
    for(const page of activity.pages!){if(page.image_asset&&(!mime(page.image_asset,['image/png','image/jpeg'])||!page.alt_text?.trim()))fail('Book images need alt text and a valid image.');if(page.reference_asset&&!mime(page.reference_asset,['audio/wav']))fail('Book narration requires WAV.');}
  }
  if(activity.type==='glossary'){
    if(!unique(activity.entries!.map(entry=>entry.id)))fail('Glossary entry IDs must be unique.');
    for(const entry of activity.entries!)if(entry.reference_asset&&!mime(entry.reference_asset,['audio/wav']))fail('Glossary narration requires WAV.');
  }
  if(activity.type==='dialogue')for(const turn of activity.turns!)if(turn.reference_asset&&!mime(turn.reference_asset,['audio/wav']))fail('Dialogue narration requires WAV.');
}
