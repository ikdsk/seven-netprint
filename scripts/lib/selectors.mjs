// サイトUIに依存するものは全てこのファイルに集約する(UI変更時はここだけ直す)。
// 2026-10-29 に https://lite.printing.ne.jp/web で確認。詳細は references/site-ui.md。

export const URLS = {
  portal: 'https://www.printing.ne.jp/',
  lite: 'https://lite.printing.ne.jp/web',
};

// 用紙: CLI値 -> { label(サイト表示), re, value(inputのvalue属性) }
export const PAPER = {
  a4: { label: '普通紙 A4', re: /^普通紙\s*A4$/, value: '0' },
  a3: { label: '普通紙 A3', re: /^普通紙\s*A3$/, value: '1' },
  b5: { label: '普通紙 B5', re: /^普通紙\s*B5$/, value: '2' },
  b4: { label: '普通紙 B4', re: /^普通紙\s*B4$/, value: '3' },
  postcard: { label: 'はがき', re: /^はがき$/, value: '5' },
};
export const PAPER_ALIASES = { 'はがき': 'postcard', hagaki: 'postcard', card: 'postcard' };

export const COLOR = {
  auto: { label: 'マルチコピー機でのプリント時に選択', re: /マルチコピー機でのプリント時に選択/, value: '0' },
  color: { label: 'カラー', re: /^カラー$/, value: '1' },
  mono: { label: '白黒', re: /^白黒$/, value: '2' },
};
export const COLOR_ALIASES = { bw: 'mono', gray: 'mono', grey: 'mono', '白黒': 'mono', 'カラー': 'color' };

export const MARGIN = {
  off: { re: /^しない$/, value: '0' },
  on: { re: /^する（像欠け防止）$/, value: '1' },
};

const T = {
  consentLabel: /同意する/,
  fileInput: 'input[type="file"]',
  register: /^登録する$/,
  loading: '[data-testid="oval-loading"], [role="status"][aria-busy="true"]',
  settingsHeading: /プリントの設定をしてください/,
  resultUrl: /\/web\/result/,
  reservation: /予約番号\s*[:：]?\s*([A-Za-z0-9][A-Za-z0-9\u00a0 ]{2,20}?)(?=[^A-Za-z0-9\u00a0 ]|$)/,
  expiry: /有効期限\s*[:：]?\s*(\d{4})\/(\d{1,2})\/(\d{1,2})\s+(\d{1,2}):(\d{2})/,
  summary: /([A-Z]\d|はがき)\s*,\s*(\d+)\s*枚\s*,\s*(白黒|カラー|[^\s,]+?)(?:詳細|\s|$)/,
  completeMarkers: /アップロード完了|プリントできます/,
  fee: /(\d[\d,]*)\s*円/,
  errorText: /エラー|失敗|登録できません|登録できませんでした|変換できません|サイズ.{0,8}超|アップロードできません/,
};
export { T as TEXT };

// ---- locator 関数群 (Playwright Page を受ける) ----
export const L = {
  portalLiteLink: (page) => page.getByRole('link', { name: /かんたん\s*netprint/i }).first(),
  consent: (page) => page.getByRole('checkbox', { name: T.consentLabel }).or(page.getByLabel(T.consentLabel)).first(),
  consentFallback: (page) => page.locator('input[type="checkbox"]').first(),
  fileInput: (page) => page.locator(T.fileInput).first(),
  registerButton: (page) => page.getByRole('button', { name: T.register }),
  loading: (page) => page.locator(T.loading),
  radio: (page, re) => page.getByRole('radio', { name: re }),
  pinRadio: (page, on) => page.locator(`input[name="secretNumberCondition"][value="${on ? 1 : 0}"]`),
  pinInput: (page) => page.locator('input[name="secretNumber"]'),
  mailRadio: (page, on) => page.locator(`input[name="mailAddressCondition"][value="${on ? 1 : 0}"]`),
  mailInput: (page) => page.locator('input[name="mailAddress"]'),
  alerts: (page) => page.locator('[role="alert"], [role="alertdialog"], [role="dialog"]'),
  body: (page) => page.locator('body'),
};

// CAPTCHA / ログイン / 認証系の検出パターン
export const BLOCKERS = {
  captchaFrame: /recaptcha|hcaptcha|turnstile|challenges\.cloudflare\.com|arkoselabs|funcaptcha/i,
  captchaSelector:
    '.g-recaptcha, .h-captcha, .cf-turnstile, [data-sitekey], iframe[src*="recaptcha"], iframe[src*="hcaptcha"], iframe[src*="turnstile"], iframe[src*="challenges.cloudflare.com"]',
  captchaText: /私はロボットではありません|ロボットではありません|画像認証|reCAPTCHA|CAPTCHA|Verify you are human|セキュリティチェック/i,
  loginUrl: /\/(login|signin|auth|sso)(\/|\?|$)/i,
  loginText: /ログインしてください|ログインが必要|ユーザーID|パスワードを入力|認証コード|SMS|ワンタイム/,
  // 暗証番号(secretNumber)以外のパスワード入力欄 = ログイン要求
  loginInput: 'input[type="password"]:not([name="secretNumber"]), input[autocomplete="one-time-code"], input[name*="login" i]',
};

// Cookieバナー: Cookie/クッキー を含む領域内のボタンのみ操作する
export const COOKIE = {
  banner: (page) =>
    page
      .locator('[id*="cookie" i], [class*="cookie" i], [role="dialog"], [aria-label*="cookie" i]')
      .filter({ hasText: /cookie|クッキー/i }),
  accept: /すべて(を)?(許可|受け入れ|同意)|同意(して続ける|する)|許可する|Accept( all)?|OK/i,
  reject: /(必須|必要)(な)?(Cookie|クッキー)?のみ|拒否|同意しない|すべて(を)?拒否|Reject( all)?|Decline|Necessary only/i,
};
