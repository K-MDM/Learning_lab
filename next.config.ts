import type {NextConfig} from 'next';
const config: NextConfig = {
  output: 'standalone',
  turbopack: {root: process.cwd()},
  outputFileTracingRoot: process.cwd(),
  outputFileTracingIncludes: {'/api/staff/content': ['./resources/content/samples/library-story.wav']},
};
export default config;
