// 引数解析・出力整形 (ブラウザ非依存でテスト可能)
import { parseArgs } from 'node:util';
import { writeFileSync, chmodSync } from 'node:fs';
import { NetprintError, EXIT, usageError } from './errors.mjs';
import { validatePdf, resolvePaper, resolveColor, resolvePin, resolveMail } from './validate.mjs';

export const HELP = `seven-netprint — PDFをセブン-イレブン「かんたんnetprint」に登録して予約番号を取得

使い方: node scripts/netprint.mjs <file.pdf> --accept-terms [options]

設定 (サイトが提供する項目のみ):
  --paper <a4|a3|b5|b4|postcard>   用紙サイズ (既定 a4)。はがき=postcard
  --color <mono|color|auto>        mono=白黒(既定) / color=カラー / auto=店頭で選択
  --small                          「ちょっと小さめ(像欠け防止)」を有効化
  --pin <1234>                     暗証番号(半角4桁)。環境変数 NETPRINT_PIN でも可
  --notify-email <addr>            登録結果をメール通知
  ※ 両面・2in1・小冊子・ページ範囲・部数は店頭マルチコピー機で設定します(登録時の項目なし)

同意:
  --accept-terms                   利用規約・個人情報の取扱い・注意制限に同意する(明示時のみチェック)

ブラウザ/動作:
  --direct                         入口ページを経由せず lite URL へ直接アクセス
  --cookies <accept|reject|ignore> Cookieバナー対応 (既定 reject。バナーが無ければ何もしない)
  --state-file <path>              Playwright storageState を読み書き
  --persist-state                  ~/.cache/seven-netprint/state.json に保存(0700/0600)
  --timeout <sec>                  全体タイムアウト (既定 180)
  --headed                         ブラウザを表示 (既定 headless)
  --slowmo <ms>                    操作間ウェイト
  --debug-dir <dir>                スクリーンショット/trace の保存先
  --trace                          Playwright trace を保存 (予約番号を含みうる)
  --screenshot-on-success          成功時もスクリーンショット保存 (予約番号が写る)

出力:
  --json                           stdout を JSON のみにし、stderr の人間向けログを抑制
  --output <file>                  結果JSONをファイルにも書く (0600)
  --quiet                          stderr ログを抑制
  --verbose-secrets                ログに予約番号/フルパスを出す (非推奨)
  -h, --help

終了コード: 0 成功 / 2 入力・使い方エラー / 3 人手が必要(同意・CAPTCHA・ログイン等) / 4 サイト・ネットワーク・タイムアウト / 5 登録完了だが検証不能
`;

const OPTIONS = {
  paper: { type: 'string' },
  color: { type: 'string' },
  small: { type: 'boolean' },
  pin: { type: 'string' },
  'notify-email': { type: 'string' },
  'accept-terms': { type: 'boolean' },
  direct: { type: 'boolean' },
  cookies: { type: 'string' },
  'state-file': { type: 'string' },
  'persist-state': { type: 'boolean' },
  timeout: { type: 'string' },
  headed: { type: 'boolean' },
  slowmo: { type: 'string' },
  'debug-dir': { type: 'string' },
  trace: { type: 'boolean' },
  'screenshot-on-success': { type: 'boolean' },
  json: { type: 'boolean' },
  output: { type: 'string' },
  quiet: { type: 'boolean' },
  'verbose-secrets': { type: 'boolean' },
  'portal-url': { type: 'string' }, // テスト用 (非公開)
  'lite-url': { type: 'string' }, // テスト用 (非公開)
  help: { type: 'boolean', short: 'h' },
};

const num = (v, name, def, min, max) => {
  if (v == null) return def;
  const n = Number(v);
  if (!Number.isFinite(n) || n < min || n > max) throw usageError('BAD_NUMBER', `--${name} は ${min}〜${max} の数値で指定してください。`);
  return n;
};

/** @returns {{help:true}|{help:false, opts:object}} */
export function parseCli(argv, env = process.env) {
  let parsed;
  try {
    parsed = parseArgs({ args: argv, options: OPTIONS, allowPositionals: true, strict: true });
  } catch (e) {
    throw usageError('BAD_ARGS', `${e.message}\n(--help で使い方を表示)`);
  }
  const { values: v, positionals } = parsed;
  if (v.help) return { help: true };
  if (positionals.length > 1) throw usageError('BAD_ARGS', 'PDFは1ファイルのみ指定できます。');
  const cookies = v.cookies ?? 'reject';
  if (!['accept', 'reject', 'ignore'].includes(cookies))
    throw usageError('BAD_COOKIES', '--cookies は accept|reject|ignore のいずれかです。');
  if (v['state-file'] && v['persist-state']) throw usageError('BAD_ARGS', '--state-file と --persist-state は同時に指定できません。');
  const file = validatePdf(positionals[0]);
  const opts = {
    file,
    paper: resolvePaper(v.paper),
    color: resolveColor(v.color),
    small: !!v.small,
    pin: resolvePin(v.pin ?? env.NETPRINT_PIN),
    notifyEmail: resolveMail(v['notify-email']),
    acceptTerms: !!v['accept-terms'],
    direct: !!v.direct,
    cookies,
    stateFile: v['state-file'] || null,
    persistState: !!v['persist-state'],
    timeoutMs: num(v.timeout, 'timeout', 180, 10, 1800) * 1000,
    uploadTimeoutMs: 120000,
    headed: !!v.headed,
    slowmo: num(v.slowmo, 'slowmo', 0, 0, 10000),
    debugDir: v['debug-dir'] || null,
    trace: !!v.trace,
    screenshotOnSuccess: !!v['screenshot-on-success'],
    json: !!v.json,
    output: v.output || null,
    quiet: !!v.quiet || !!v.json,
    verboseSecrets: !!v['verbose-secrets'],
    portalUrl: v['portal-url'] || env.NETPRINT_PORTAL_URL || null,
    liteUrl: v['lite-url'] || env.NETPRINT_LITE_URL || null,
  };
  opts.uploadTimeoutMs = Math.min(opts.uploadTimeoutMs, opts.timeoutMs);
  return { help: false, opts };
}

export function errorPayload(e) {
  const known = e instanceof NetprintError;
  return {
    ok: false,
    code: known ? e.code : 'SITE_ERROR',
    message: known ? e.message : `想定外のエラー: ${String(e?.message || e).split('\n')[0]}`,
    humanActionRequired: known ? e.humanActionRequired : false,
    ...(e?.screenshot ? { screenshot: e.screenshot } : {}),
  };
}

export const exitCodeFor = (e) => (e instanceof NetprintError ? e.exit : EXIT.SITE);

export function writeOutputFile(path, payload) {
  writeFileSync(path, JSON.stringify(payload, null, 2) + '\n', { mode: 0o600 });
  chmodSync(path, 0o600);
}
