import { runTool } from '@/lib/run-tool';
import { readInboxTool } from '@/lib/tools';

export const maxDuration = 3600;

export async function POST() {
  return runTool(readInboxTool, { max: 5000 }, '/');
}
