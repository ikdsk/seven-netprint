// ライブE2E (実サイトに実際に登録する)。NETPRINT_E2E=1 のときだけ実行。
// ダミーPDF("seven-netprint E2E test")のみを登録する。--accept-terms は利用者が規約に同意した場合のみ使うこと。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildPdf } from '../scripts/make-test-pdf.mjs';

const enabled = process.env.NETPRINT_E2E === '1';
const CLI = fileURLToPath(new URL('../scripts/netprint.mjs', import.meta.url));
const pdf = () => {
  const p = join(mkdtempSync(join(tmpdir(), 'np-e2e-')), 'e2e-test.pdf');
  writeFileSync(p, buildPdf('seven-netprint E2E test'));
  return p;
};

test('E2E: --accept-terms なしは exit 3', { skip: !enabled }, () => {
  const r = spawnSync(process.execPath, [CLI, pdf()], { encoding: 'utf8', timeout: 120000 });
  assert.equal(r.status, 3);
  assert.equal(JSON.parse(r.stdout).code, 'TERMS_CONSENT_REQUIRED');
});

test('E2E: 実登録 (A4/白黒)', { skip: !enabled || process.env.NETPRINT_E2E_REGISTER !== '1' }, () => {
  const r = spawnSync(process.execPath, [CLI, pdf(), '--accept-terms', '--json'], { encoding: 'utf8', timeout: 240000 });
  assert.equal(r.status, 0, r.stderr);
  const j = JSON.parse(r.stdout);
  assert.match(j.reservationNumber, /^[A-Za-z0-9]{8}$/);
  assert.ok(j.expiresAt);
});
