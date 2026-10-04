import type {NextConfig} from 'next';
import path from 'node:path';
const config: NextConfig = {
  turbopack: {root: path.resolve(process.cwd(), '..')},
  outputFileTracingRoot: path.resolve(process.cwd(), '..'),
};
export default config;
