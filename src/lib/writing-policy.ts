import type {ActivityType} from './activity-contract';
import type {Manifest} from './package';

export const writingActivityTypes: ActivityType[] = ['quiz','multi_select','token_order','sequencing','matching','comprehension'];
export const typedAnswerTypes: ActivityType[] = ['writing','gap_fill','spelling','error_correction','picture'];
export function availableActivityTypes(skill: string, types: readonly ActivityType[]) {
  return skill === 'writing' ? writingActivityTypes : types.filter(type => !typedAnswerTypes.includes(type));
}
export function assertKnownAnswerWriting(manifest: Manifest) {
  for (const lesson of manifest.lessons) {
    for (const activity of lesson.activities) {
      if (typedAnswerTypes.includes(activity.type) ||
          (lesson.skill === 'writing' && !writingActivityTypes.includes(activity.type))) {
        throw new Error('Learner answers must use choices or reordering, without typing. Use MCQs for blanks, matching or sentence ordering.');
      }
    }
  }
}
