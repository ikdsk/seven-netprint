import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildPdf } from '../scripts/make-test-pdf.mjs';

export function tmpPdf(name = 'sample.pdf', buf = buildPdf()) {
  const dir = mkdtempSync(join(tmpdir(), 'np-test-'));
  const p = join(dir, name);
  writeFileSync(p, buf);
  return p;
}
