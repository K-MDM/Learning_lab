import {copyFileSync, existsSync, mkdirSync, readFileSync} from 'node:fs';
import {dirname, resolve} from 'node:path';
const files = ['contracts/package.schema.json', 'contracts/learning-registry.json',
  'contracts/curriculum-topics.json', 'content/demos/english.json',
  'content/curriculum/english-grade-10.json', 'content/samples/library-story.wav'];
for (const file of files) {
  const original = resolve('..', file), bundled = resolve('resources', file);
  if (existsSync(original)) {
    mkdirSync(dirname(bundled), {recursive: true});
    copyFileSync(original, bundled);
  }
  if (!existsSync(bundled)) throw new Error(`Missing bundled deployment resource: ${file}`);
  if (file.endsWith('.json')) JSON.parse(readFileSync(bundled, 'utf8'));
}
console.log('Deployment resources ready (server-only uploads supported).');
