import type {ActivityType} from './activity-contract';
import type {Manifest} from './package';

export const writingActivityTypes: ActivityType[] = ['quiz'];
export function availableActivityTypes(skill: string, types: readonly ActivityType[]) {
  return skill === 'writing' ? writingActivityTypes : types.filter(type => type !== 'writing');
}
export function assertKnownAnswerWriting(manifest: Manifest) {
  for (const lesson of manifest.lessons) {
    for (const activity of lesson.activities) {
      if (activity.type === 'writing' ||
          (lesson.skill === 'writing' && !writingActivityTypes.includes(activity.type))) {
        throw new Error('Writing is MCQ-only. Use a quiz with selectable options and one correct answer; no typed answers.');
      }
    }
  }
}
