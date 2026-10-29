// 入力検証 (ネットワーク不要)
import { openSync, readSync, closeSync, statSync, accessSync, constants } from 'node:fs';
import { resolve, extname, basename } from 'node:path';
import { usageError } from './errors.mjs';
import { PAPER, PAPER_ALIASES, COLOR, COLOR_ALIASES } from './selectors.mjs';

// 公式: 普通紙/はがきは1ファイル10MB以下、99ページ超不可 (注意制限事項)
export const MAX_BYTES = 10 * 1024 * 1024;
export const MAX_PAGES = 99;
// ファイル名に含まれていると登録できない場合がある文字
const BAD_NAME = /[\\/:*?"<>|&'%]/;

export function validatePdf(input) {
  if (!input) throw usageError('NO_FILE', 'PDFファイルのパスを指定してください。');
  const path = resolve(input);
  let st;
  try {
    st = statSync(path);
  } catch {
    throw usageError('FILE_NOT_FOUND', `ファイルが見つかりません: ${basename(path)}`);
  }
  if (!st.isFile()) throw usageError('NOT_A_FILE', `通常ファイルではありません: ${basename(path)}`);
  try {
    accessSync(path, constants.R_OK);
  } catch {
    throw usageError('FILE_UNREADABLE', `読み取り権限がありません: ${basename(path)}`);
  }
  if (extname(path).toLowerCase() !== '.pdf')
    throw usageError('NOT_PDF', '拡張子が .pdf ではありません。');
  const fd = openSync(path, 'r');
  const head = Buffer.alloc(1024);
  let n;
  try {
    n = readSync(fd, head, 0, 1024, 0);
  } finally {
    closeSync(fd);
  }
  // 仕様上 %PDF- は先頭1024バイト以内にあればよい
  if (!head.subarray(0, n).includes('%PDF-'))
    throw usageError('NOT_PDF', 'PDFのシグネチャ(%PDF-)が見つかりません。');
  if (st.size === 0) throw usageError('EMPTY_FILE', 'ファイルが空です。');
  if (st.size > MAX_BYTES)
    throw usageError(
      'FILE_TOO_LARGE',
      `ファイルサイズが上限(10MB)を超えています: ${(st.size / 1048576).toFixed(1)}MB`,
    );
  const warnings = [];
  if (BAD_NAME.test(basename(path)) || /[^\x20-\x7e　-ヿ一-鿿＀-￯]/.test(basename(path)))
    warnings.push('ファイル名に登録できない可能性のある文字が含まれています(日本語・英数字以外や \\ / : * ? " < > | & \' %)。');
  return { path, name: basename(path), size: st.size, warnings };
}

const list = (obj) => Object.keys(obj).join(', ');

export function resolvePaper(v = 'a4') {
  const k = String(v).trim();
  const key = PAPER_ALIASES[k] || k.toLowerCase();
  if (!PAPER[key])
    throw usageError('BAD_PAPER', `--paper "${v}" はサイトが提供していません。指定可能: ${list(PAPER)} (はがき=postcard)`);
  return key;
}

export function resolveColor(v = 'mono') {
  const k = String(v).trim();
  const key = COLOR_ALIASES[k] || k.toLowerCase();
  if (!COLOR[key])
    throw usageError('BAD_COLOR', `--color "${v}" は不正です。指定可能: mono, color, auto (auto=店頭で選択)`);
  return key;
}

export function resolvePin(v) {
  if (v == null || v === '') return null;
  if (!/^\d{4}$/.test(String(v))) throw usageError('BAD_PIN', '暗証番号は半角数字4桁で指定してください。');
  return String(v);
}

export function resolveMail(v) {
  if (v == null || v === '') return null;
  if (!/^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/.test(v) || String(v).length > 255)
    throw usageError('BAD_EMAIL', '--notify-email は有効なメールアドレス1件を指定してください。');
  return String(v);
}
