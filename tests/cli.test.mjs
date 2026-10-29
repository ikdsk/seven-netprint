import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { tmpPdf } from './helpers.mjs';

const CLI = fileURLToPath(new URL('../scripts/netprint.mjs', import.meta.url));
const run = (args) => spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8' });

test('--help は exit 0', () => {
  const r = run(['--help']);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /--accept-terms/);
});

test('入力エラーは exit 2 で stdout はJSON', () => {
  const r = run(['/no/such/file.pdf']);
  assert.equal(r.status, 2);
  const j = JSON.parse(r.stdout);
  assert.equal(j.ok, false);
  assert.equal(j.code, 'FILE_NOT_FOUND');
});

test('不正な --paper は exit 2', () => {
  const r = run([tmpPdf(), '--paper', 'a5']);
  assert.equal(r.status, 2);
  assert.equal(JSON.parse(r.stdout).code, 'BAD_PAPER');
});

test('stderr にPDFのフルパスを出さない', () => {
  const p = tmpPdf('secret-name.pdf');
  const r = run([p, '--paper', 'zz']);
  assert.ok(!r.stderr.includes(p));
});
