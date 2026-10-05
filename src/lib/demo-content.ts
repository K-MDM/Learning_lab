import {randomUUID} from 'node:crypto';
import {eq,sql} from 'drizzle-orm';
import templates from '../../resources/content/demos/english.json';
import * as s from '../db/schema';
import {contentStaff,createDraft,ContentError} from './content';
import {saveContentDraft} from './content-edit';
import {validateManifest,type Activity} from './package';

type DB=Parameters<typeof createDraft>[0];
export async function addEnglishDemo(db:DB,actor:string,key:string){
  const template=templates.find(t=>t.key===key);
  if(!template)throw new ContentError(400,'Choose one of the six English demonstrations.');
  return db.transaction(async tx=>{
    await contentStaff(tx,actor,['owner','content_editor']);
    const code=`demo-english-v1-${key}`;
    // Serialise repeat requests: retries and double clicks reuse the same unit.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${code}))`);
    const [existing]=await tx.select({id:s.packageReleases.id}).from(s.contentCollections)
      .innerJoin(s.collectionUnits,eq(s.collectionUnits.collectionId,s.contentCollections.id))
      .innerJoin(s.packageReleases,eq(s.packageReleases.unitId,s.collectionUnits.unitId))
      .where(eq(s.contentCollections.code,code)).limit(1);
    if(existing)return {...existing,created:false};
    const created=await createDraft(tx,actor,{courseTitle:'English · Little Discoveries demos',unitTitle:`${template.title} — demonstration`,lessonTitle:template.title,language:'en',level:template.level,story:template.summary,question:'Is this a demonstration lesson?',options:['Yes','No'],correctIndex:0,demonstration:true},null);
    const [row]=await tx.select().from(s.packageReleases).where(eq(s.packageReleases.id,created.id));
    const manifest=validateManifest(row.manifest);
    manifest.schema_version=2;manifest.minimum_app_version='1.3.0';manifest.age_reviewed=false;
    const originalId=manifest.lessons[0].id;
    manifest.lessons=[{id:template.skill==='reading'?originalId:randomUUID(),version:1,
      title:`${template.title} — demonstration`,skill:template.skill,curriculum_references:[],
      learning_outcomes:[template.outcome],activities:template.activities.map((activity,index)=>({
        ...activity,id:`${key}-${index+1}`,scoring_version:1,normalization:'NFC',
      } as Activity))}];
    await saveContentDraft(tx,actor,row.id,row.manifestDigest,manifest);
    const [collection]=await tx.select({id:s.collectionUnits.collectionId}).from(s.collectionUnits).where(eq(s.collectionUnits.unitId,row.unitId));
    await tx.update(s.contentCollections).set({code}).where(eq(s.contentCollections.id,collection.id));
    return {id:created.id,created:true};
  });
}
