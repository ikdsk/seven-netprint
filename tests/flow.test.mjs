import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCli } from '../scripts/lib/cli.mjs';
import { createLogger } from '../scripts/lib/log.mjs';
import { runNetprint } from '../scripts/lib/flow.mjs';
import { startFixture } from './fixture-server.mjs';
import { tmpPdf } from './helpers.mjs';

const log = createLogger({ quiet: true });

async function run(variant, args = [], { timeout = '40' } = {}) {
  const fx = await startFixture(variant);
  try {
    const { opts } = parseCli([tmpPdf(), '--timeout', timeout, '--portal-url', fx.portalUrl, '--lite-url', fx.liteUrl, ...args], {});
    opts.uploadTimeoutMs = 15000;
    opts.resultGraceMs = 3000;
    try {
      return { result: await runNetprint(opts, log), fx };
    } catch (error) {
      return { error, fx };
    }
  } finally {
    await fx.close();
  }
}

test('成功: 既定 A4/白黒、入口リンク経由', async () => {
  const { result, fx, error } = await run({ slow: 300 }, ['--accept-terms']);
  assert.ifError(error);
  assert.equal(result.ok, true);
  assert.equal(result.reservationNumber, 'AB12CD34');
  assert.equal(result.expiresAtISO, '2026-10-30T23:59:00+09:00');
  assert.equal(result.pages, 1);
  assert.deepEqual(fx.submitted[0], { paper: '0', color: '2', margin: '0', pin: '', mail: '' });
});

test('成功: B5 + カラー + ちょっと小さめ + 暗証番号 + 通知', async () => {
  const { result, fx, error } = await run({}, ['--accept-terms', '--paper', 'b5', '--color', 'color', '--small', '--pin', '1234', '--notify-email', 'a@example.com']);
  assert.ifError(error);
  assert.equal(result.settings.paper, 'b5');
  assert.deepEqual(fx.submitted[0], { paper: '2', color: '1', margin: '1', pin: '1234', mail: 'a@example.com' });
});

test('--direct で入口を経由せず成功', async () => {
  const { result, error } = await run({}, ['--accept-terms', '--direct']);
  assert.ifError(error);
  assert.equal(result.ok, true);
});

test('--accept-terms なし: チェックせず TERMS_CONSENT_REQUIRED (exit 3)', async () => {
  const { error, fx } = await run({});
  assert.equal(error.code, 'TERMS_CONSENT_REQUIRED');
  assert.equal(error.exit, 3);
  assert.equal(error.humanActionRequired, true);
  assert.equal(fx.submitted.length, 0);
});

test('CAPTCHA iframe を検出して exit 3', async () => {
  const { error } = await run({ captcha: true }, ['--accept-terms']);
  assert.equal(error.code, 'CAPTCHA_REQUIRED');
  assert.equal(error.exit, 3);
});

test('Cookieバナー: reject / accept / ignore いずれでも成功', async () => {
  for (const mode of ['reject', 'accept', 'ignore']) {
    const { result, error } = await run({ cookie: true }, ['--accept-terms', '--cookies', mode]);
    assert.ifError(error);
    assert.equal(result.ok, true, mode);
  }
});

test('アップロード拒否 -> UPLOAD_REJECTED (exit 4) + 失敗スクリーンショット', async () => {
  const { error } = await run({ uploadError: true }, ['--accept-terms']);
  assert.equal(error.code, 'UPLOAD_REJECTED');
  assert.equal(error.exit, 4);
  assert.ok(error.screenshot);
});

test('予約番号が取れない/形式不正 -> exit 5 (捏造しない)', async () => {
  for (const v of [{ noResultNumber: true }, { badNumber: true }]) {
    const { error } = await run(v, ['--accept-terms']);
    assert.equal(error.code, 'REGISTRATION_UNVERIFIED');
    assert.equal(error.exit, 5);
  }
});

test('--color auto は結果の色表示と照合しない', async () => {
  const { result, error } = await run({}, ['--accept-terms', '--color', 'auto']);
  assert.ifError(error);
  assert.equal(result.settings.color, 'auto');
});
