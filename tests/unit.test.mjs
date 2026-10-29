import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { validatePdf, resolvePaper, resolveColor, resolvePin, MAX_BYTES } from '../scripts/lib/validate.mjs';
import { parseResultText, verifyResult } from '../scripts/lib/result.mjs';
import { maskReservation } from '../scripts/lib/log.mjs';
import { parseCli, errorPayload } from '../scripts/lib/cli.mjs';
import { tmpPdf } from './helpers.mjs';

const code = (fn) => { try { fn(); } catch (e) { return e.code; } return null; };

test('validatePdf: 正常 / 各種エラー', () => {
  const p = tmpPdf();
  assert.equal(validatePdf(p).name, 'sample.pdf');
  assert.equal(code(() => validatePdf('/nonexistent/x.pdf')), 'FILE_NOT_FOUND');
  assert.equal(code(() => validatePdf(undefined)), 'NO_FILE');
  assert.equal(code(() => validatePdf(tmpPdf('a.txt'))), 'NOT_PDF');
  assert.equal(code(() => validatePdf(tmpPdf('b.pdf', Buffer.from('hello world')))), 'NOT_PDF');
  assert.equal(code(() => validatePdf(tmpPdf('c.pdf', Buffer.alloc(0)))), 'NOT_PDF');
  const big = tmpPdf('big.pdf');
  writeFileSync(big, Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(MAX_BYTES)]));
  assert.equal(code(() => validatePdf(big)), 'FILE_TOO_LARGE');
});

test('validatePdf: 問題のあるファイル名は警告', () => {
  assert.ok(validatePdf(tmpPdf("a&b.pdf")).warnings.length > 0);
  assert.equal(validatePdf(tmpPdf('日本語.pdf')).warnings.length, 0);
});

test('paper/color/pin の解決とエラー', () => {
  assert.equal(resolvePaper(), 'a4');
  assert.equal(resolvePaper('B5'), 'b5');
  assert.equal(resolvePaper('はがき'), 'postcard');
  assert.equal(code(() => resolvePaper('a5')), 'BAD_PAPER');
  assert.equal(code(() => resolvePaper('L')), 'BAD_PAPER');
  assert.equal(resolveColor(), 'mono');
  assert.equal(resolveColor('白黒'), 'mono');
  assert.equal(code(() => resolveColor('sepia')), 'BAD_COLOR');
  assert.equal(resolvePin('1234'), '1234');
  assert.equal(code(() => resolvePin('12a4')), 'BAD_PIN');
});

test('parseResultText / verifyResult', () => {
  const t = 'プリント予約番号：6BMZ2HN8\nファイル名：e2e-test\nA4,1枚,白黒詳細\n有効期限：2026/10/30 23:59\nアップロード完了';
  const r = parseResultText(t);
  assert.equal(r.reservationNumber, '6BMZ2HN8');
  assert.equal(r.expiresAt, '2026/10/30 23:59');
  assert.equal(r.expiresAtISO, '2026-10-30T23:59:00+09:00');
  assert.deepEqual(r.summary, { paper: 'A4', pages: 1, color: '白黒' });
  const url = 'https://lite.printing.ne.jp/web/result';
  assert.ok(verifyResult(r, { url, settings: { color: 'mono', paperShort: 'A4' } }).ok);
  assert.ok(!verifyResult(r, { url, settings: { color: 'color', paperShort: 'A4' } }).ok);
  assert.ok(!verifyResult(r, { url, settings: { color: 'mono', paperShort: 'B5' } }).ok);
  assert.ok(!verifyResult(r, { url: 'https://lite.printing.ne.jp/web' }).ok);
  assert.ok(!verifyResult(parseResultText('有効期限：2026/10/30 23:59 アップロード完了'), { url }).ok);
  assert.ok(!verifyResult(parseResultText('プリント予約番号：AB12\n有効期限：2026/10/30 23:59 アップロード完了'), { url }).ok);
  assert.ok(!verifyResult(parseResultText('プリント予約番号：AB12CD34\n有効期限：2026/10/30 23:59'), { url }).ok);
});

test('parseResultText: 改行/空白区切りでも解析し、警告文の「予約番号」を誤検出しない', () => {
  const warn = '※このウィンドウを閉じると予約番号は消去されます。\n予約番号はQRコードの保存などで必ず記録してください。\n';
  assert.equal(parseResultText(warn).reservationNumber, null);
  const r = parseResultText(warn + 'プリント予約番号\n6BMZ 2HN8\n有効期限\n2026/10/30 23:59\nアップロード完了');
  assert.equal(r.reservationNumber, '6BMZ2HN8');
  assert.equal(r.expiresAt, '2026/10/30 23:59');
});

test('maskReservation', () => {
  assert.equal(maskReservation('AB12CD34'), 'AB****34');
  assert.equal(maskReservation(''), '****');
});

test('parseCli: 既定値・エラー・--help', () => {
  const p = tmpPdf();
  const { opts } = parseCli([p, '--accept-terms'], {});
  assert.equal(opts.paper, 'a4');
  assert.equal(opts.color, 'mono');
  assert.equal(opts.cookies, 'reject');
  assert.equal(opts.acceptTerms, true);
  assert.equal(parseCli([p], {}).opts.acceptTerms, false);
  assert.equal(parseCli(['--help']).help, true);
  assert.equal(code(() => parseCli([p, '--bogus'])), 'BAD_ARGS');
  assert.equal(code(() => parseCli([p, '--duplex'])), 'BAD_ARGS');
  assert.equal(code(() => parseCli([p, '--cookies', 'x'])), 'BAD_COOKIES');
  assert.equal(code(() => parseCli([p, '--timeout', '1'])), 'BAD_NUMBER');
  assert.equal(parseCli([p], { NETPRINT_PIN: '0000' }).opts.pin, '0000');
  assert.equal(errorPayload(Object.assign(new Error('x'), {})).ok, false);
});
