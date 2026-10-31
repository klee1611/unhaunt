import { readdirSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { DATA_DIR } from '../src/lib/ledger';

// Deletes everything Unhaunt stored on this laptop (census, header cache, labels, model and
// Ultramarine outputs, send log). Run with --yes; without it, only lists what would go.
export function forgettable(entries: string[]) {
  return entries.filter((e) => e !== '.gitkeep');
}

const entries = forgettable(readdirSync(DATA_DIR));
const size = (p: string): number =>
  statSync(p).isDirectory() ? readdirSync(p).reduce((n, c) => n + size(join(p, c)), 0) : statSync(p).size;

if (!entries.length) {
  console.log(`${DATA_DIR} is already empty.`);
  process.exit(0);
}
for (const e of entries) console.log(`${process.argv.includes('--yes') ? 'deleting' : 'would delete'}  data/${e}  (${Math.round(size(join(DATA_DIR, e)) / 1024)} KB)`);
if (!process.argv.includes('--yes')) {
  console.log('\nNothing deleted. Run `npm run forget -- --yes` to delete these.');
  process.exit(0);
}
for (const e of entries) rmSync(join(DATA_DIR, e), { recursive: true, force: true });
console.log('Done. Gmail access is separate: use "Disconnect Gmail" in the app, or revoke at myaccount.google.com/connections.');
