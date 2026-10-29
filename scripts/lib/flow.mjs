// netprint アップロードフロー本体。サイト固有の locator は selectors.mjs に集約。
import { mkdirSync, chmodSync, existsSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { homedir, tmpdir } from 'node:os';
import { chromium } from 'playwright';
import { NetprintError, humanError, siteError, unverifiedError } from './errors.mjs';
import { URLS, PAPER, COLOR, MARGIN, L, BLOCKERS, COOKIE, TEXT } from './selectors.mjs';
import { parseResultText, verifyResult } from './result.mjs';

/** 結果テキストの取得。innerText -> textContent -> HTML(タグ除去) の順で、番号が取れた最初のものを採用。 */
export async function readResultText(page) {
  const cands = [
    () => L.body(page).innerText({ timeout: 3000 }),
    () => L.body(page).textContent({ timeout: 3000 }),
    async () => (await page.content()).replace(/<(script|style)[\s\S]*?<\/\1>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' '),
  ];
  let first = '';
  for (const c of cands) {
    const t = ((await c().catch(() => '')) || '').replace(/[ \t\u3000]+/g, ' ');
    first ||= t;
    const r = parseResultText(t);
    if (r.reservationNumber && r.expiresAt) return t;
  }
  return first;
}

/** 診断用: 予約番号を伏せたテキスト */
export const sanitizeForDump = (t) => t.replace(/(予約番号\s*[:：]?\s*)[A-Za-z0-9\u00a0 ]{4,20}/g, '$1[MASKED]');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function ensurePrivateDir(dir) {
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  try { chmodSync(dir, 0o700); } catch { /* best effort */ }
  return dir;
}

export const defaultStatePath = () => join(homedir(), '.cache', 'seven-netprint', 'state.json');
export const defaultDebugDir = () => join(tmpdir(), `seven-netprint-${process.getuid?.() ?? 'u'}`);

/** CAPTCHA / ログイン / 認証を検出したら humanError を投げる。バイパスはしない。 */
export async function detectBlockers(page) {
  const url = page.url();
  if (BLOCKERS.loginUrl.test(url))
    throw humanError('LOGIN_REQUIRED', 'ログイン画面に遷移しました。人間による操作が必要です。');
  for (const f of page.frames()) {
    if (f !== page.mainFrame() && BLOCKERS.captchaFrame.test(f.url()))
      throw humanError('CAPTCHA_REQUIRED', 'CAPTCHA(ボット検知)が表示されました。人間による操作が必要です。');
  }
  if (await page.locator(BLOCKERS.captchaSelector).count().catch(() => 0))
    throw humanError('CAPTCHA_REQUIRED', 'CAPTCHA(ボット検知)が表示されました。人間による操作が必要です。');
  if (await page.locator(BLOCKERS.loginInput).first().isVisible().catch(() => false))
    throw humanError('LOGIN_REQUIRED', 'ログイン/認証コードの入力欄が表示されました。人間による操作が必要です。');
  const body = await L.body(page).innerText({ timeout: 3000 }).catch(() => '');
  if (BLOCKERS.captchaText.test(body))
    throw humanError('CAPTCHA_REQUIRED', 'CAPTCHA/画像認証と思われる表示を検出しました。人間による操作が必要です。');
  if (BLOCKERS.loginText.test(body.split('お知らせ')[0]))
    throw humanError('LOGIN_REQUIRED', 'ログイン/認証が必要と思われる表示を検出しました。人間による操作が必要です。');
}

async function handleCookies(page, mode, log) {
  if (mode === 'ignore') return;
  const banners = COOKIE.banner(page);
  let visible = false;
  try { visible = await banners.first().isVisible({ timeout: 1500 }); } catch { /* none */ }
  if (!visible) return;
  const banner = banners.first();
  const re = mode === 'accept' ? COOKIE.accept : COOKIE.reject;
  const btn = banner.getByRole('button', { name: re }).first();
  if (await btn.count()) {
    await btn.click({ timeout: 5000 }).catch(() => {});
    log.info(`Cookieバナー: ${mode}`);
  } else if (mode === 'reject') {
    log.warn('Cookieバナーに拒否ボタンが無いため無視します。');
  }
}

async function gotoRetry(page, url, left, log, tries = 3) {
  let last;
  for (let i = 1; i <= tries; i++) {
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: left(30000) });
      return;
    } catch (e) {
      if (e instanceof NetprintError) throw e;
      last = e;
      log.warn(`遷移失敗 (${i}/${tries}): ${String(e.message).split('\n')[0]}`);
      await sleep(Math.min(1000 * i, left(3000)));
    }
  }
  throw siteError('NETWORK_ERROR', `ページを開けませんでした: ${new URL(url).host} (${String(last?.message).split('\n')[0]})`);
}

async function visibleErrorText(page) {
  const texts = await L.alerts(page).evaluateAll((els) =>
    els.filter((e) => e.offsetParent !== null || getComputedStyle(e).display !== 'none').map((e) => e.innerText || ''),
  ).catch(() => []);
  return texts.find((t) => TEXT.errorText.test(t)) || null;
}

async function pickRadio(page, entry, what) {
  const r = L.radio(page, entry.re).first();
  if (!(await r.count())) {
    // value属性でのフォールバック (ラベル文言変更への耐性)
    const name = what === 'paper' ? 'paperSize' : what === 'color' ? 'colorMode' : 'margin';
    const alt = page.locator(`input[name="${name}"][value="${entry.value}"]`);
    if (!(await alt.count())) throw siteError('UI_CHANGED', `設定項目(${what})が見つかりません。サイトのUIが変更された可能性があります。`);
    await alt.check({ timeout: 5000 });
    return;
  }
  await r.check({ timeout: 5000 });
  if (!(await r.isChecked())) throw siteError('UI_CHANGED', `設定項目(${what})を選択できませんでした。`);
}

/**
 * @param {object} o 正規化済みオプション (netprint.mjs 参照)
 */
export async function runNetprint(o, log) {
  const started = Date.now();
  const deadline = started + o.timeoutMs;
  const left = (max = Infinity) => {
    const r = deadline - Date.now();
    if (r <= 0) throw siteError('TIMEOUT', `全体タイムアウト(${Math.round(o.timeoutMs / 1000)}秒)を超過しました。`);
    return Math.min(max, r);
  };

  const debugDir = o.debugDir ? ensurePrivateDir(o.debugDir) : null;
  const shotDir = () => ensurePrivateDir(debugDir || defaultDebugDir());
  const statePath = o.stateFile || (o.persistState ? defaultStatePath() : null);

  const browser = await chromium.launch({ headless: !o.headed, slowMo: o.slowmo || 0 });
  let context;
  let page;
  let outcome;
  try {
    const ctxOpts = { locale: 'ja-JP', timezoneId: 'Asia/Tokyo', viewport: { width: 1280, height: 900 } };
    if (statePath && existsSync(statePath)) ctxOpts.storageState = statePath;
    context = await browser.newContext(ctxOpts);
    context.setDefaultTimeout(15000);
    if (o.trace) await context.tracing.start({ screenshots: true, snapshots: true });
    page = await context.newPage();

    // 1. 入口 -> かんたんnetprint
    const liteUrl = o.liteUrl || URLS.lite;
    let viaLink = false;
    if (!o.direct) {
      await gotoRetry(page, o.portalUrl || URLS.portal, left, log);
      await handleCookies(page, o.cookies, log);
      await detectBlockers(page);
      const link = L.portalLiteLink(page);
      if (await link.count()) {
        const before = page.url();
        await Promise.all([
          page.waitForURL((u) => u.href !== before, { timeout: left(30000) }).catch(() => {}),
          link.click({ timeout: left(10000) }),
        ]);
        viaLink = page.url() !== before;
      }
      if (!viaLink) log.warn('入口ページに「かんたんnetprint」リンクが見つからないため、直接URLへフォールバックします。');
    }
    if (!viaLink) await gotoRetry(page, liteUrl, left, log);
    await page.waitForLoadState('networkidle', { timeout: left(15000) }).catch(() => {});
    await handleCookies(page, o.cookies, log);
    await detectBlockers(page);

    // 2. 利用規約同意 (--accept-terms 時のみ)
    let consent = L.consent(page);
    if (!(await consent.count())) consent = L.consentFallback(page);
    try { await consent.waitFor({ state: 'visible', timeout: left(15000) }); }
    catch { await detectBlockers(page); throw siteError('UI_CHANGED', '同意チェックボックスが見つかりません。サイトのUIが変更された可能性があります。'); }
    if (!o.acceptTerms)
      throw humanError(
        'TERMS_CONSENT_REQUIRED',
        'netprintの利用規約・個人情報の取扱い・注意制限への同意が必要です。内容を確認のうえ、同意する場合のみ --accept-terms を付けて再実行してください。',
      );
    await consent.check({ timeout: left(5000) });
    log.info('利用規約への同意をチェックしました (--accept-terms)。');

    // 3. アップロード
    const fileInput = L.fileInput(page);
    await fileInput.waitFor({ state: 'attached', timeout: left(10000) });
    log.info(`アップロード中: ${log.path(o.file.path)}`);
    await fileInput.setInputFiles(o.file.path, { timeout: left(30000) });

    // 変換待ち: 登録ボタン出現 + ローディング消失 をポーリング
    const reg = L.registerButton(page);
    const waitStart = Date.now();
    for (;;) {
      left();
      await detectBlockers(page);
      const err = await visibleErrorText(page);
      if (err) throw siteError('UPLOAD_REJECTED', `サイトがファイルを受け付けませんでした: ${err.replace(/\s+/g, ' ').trim().slice(0, 200)}`);
      const ready = (await reg.isVisible().catch(() => false)) && !(await L.loading(page).first().isVisible().catch(() => false));
      if (ready) break;
      if (Date.now() - waitStart > o.uploadTimeoutMs) throw siteError('UPLOAD_TIMEOUT', 'ファイル処理の待機がタイムアウトしました。');
      await sleep(500);
    }

    // 4. 設定
    await pickRadio(page, PAPER[o.paper], 'paper');
    await pickRadio(page, COLOR[o.color], 'color');
    await pickRadio(page, o.small ? MARGIN.on : MARGIN.off, 'margin');
    if (o.pin) {
      await L.pinRadio(page, true).check({ timeout: 5000 });
      await L.pinInput(page).fill(o.pin);
    }
    if (o.notifyEmail) {
      await L.mailRadio(page, true).check({ timeout: 5000 });
      await L.mailInput(page).fill(o.notifyEmail);
    }
    log.info(`設定: 用紙=${PAPER[o.paper].label} / カラー=${COLOR[o.color].label}${o.small ? ' / ちょっと小さめ' : ''}${o.pin ? ' / 暗証番号あり' : ''}${o.notifyEmail ? ' / 結果通知あり' : ''}`);

    // 5. 登録 (二重登録を避けるため click のリトライはしない)
    await reg.click({ timeout: left(10000) });
    log.info('登録を実行しました。結果画面を待機中...');

    // 6. 結果待ち
    let parsed;
    let resultSeenAt = 0;
    for (;;) {
      left();
      await detectBlockers(page);
      if (TEXT.resultUrl.test(page.url())) {
        resultSeenAt ||= Date.now();
        const text = await readResultText(page);
        parsed = parseResultText(text);
        if (parsed.reservationNumber && parsed.expiresAt) break;
        // 結果画面に着いたのに番号/期限が出ない場合は30秒(resultGraceMs)待って検証失敗(exit 5)にする
        if (Date.now() - resultSeenAt > (o.resultGraceMs ?? 30000)) break;
      } else {
        const err = await visibleErrorText(page);
        if (err) throw siteError('REGISTER_FAILED', `登録に失敗しました: ${err.replace(/\s+/g, ' ').trim().slice(0, 200)}`);
      }
      await sleep(500);
    }
    if (!parsed) parsed = parseResultText(await readResultText(page));

    const settings = {
      paper: o.paper,
      paperLabel: PAPER[o.paper].label,
      color: o.color,
      colorLabel: COLOR[o.color].label,
      small: !!o.small,
      pin: !!o.pin,
      notifyEmail: !!o.notifyEmail,
    };
    const v = verifyResult(parsed, {
      url: page.url(),
      settings: { color: o.color, paperShort: o.paper === 'postcard' ? 'はがき' : o.paper.toUpperCase() },
    });
    if (!v.ok) {
      try {
        const dp = join(shotDir(), `unverified-${Date.now()}.txt`);
        writeFileSync(dp, `url: ${page.url()}\nproblems: ${v.problems.join(' / ')}\n---\n${sanitizeForDump(await readResultText(page))}\n`, { mode: 0o600 });
        log.warn(`診断テキスト(予約番号は伏字): ${dp}`);
      } catch { /* best effort */ }
      throw unverifiedError('REGISTRATION_UNVERIFIED', `登録結果を検証できませんでした: ${v.problems.join(' / ')}。サイト上で登録済みの可能性があるため、スクリーンショット等で確認してください。`);
    }
    outcome = {
      ok: true,
      reservationNumber: parsed.reservationNumber,
      expiresAt: parsed.expiresAt,
      expiresAtISO: parsed.expiresAtISO,
      settings,
      ...(parsed.summary ? { pages: parsed.summary.pages } : {}),
      ...(parsed.fee != null ? { fee: parsed.fee } : {}),
      ...(o.file.warnings.length ? { warnings: o.file.warnings } : {}),
      elapsedMs: Date.now() - started,
    };
    if (debugDir || o.screenshotOnSuccess) {
      const p = join(shotDir(), `success-${Date.now()}.png`);
      await page.screenshot({ path: p, fullPage: true });
      try { chmodSync(p, 0o600); } catch { /* ignore */ }
      outcome.screenshot = p;
      log.info(`成功スクリーンショット(予約番号を含む): ${p}`);
    }
    if (statePath) {
      ensurePrivateDir(dirname(statePath));
      await context.storageState({ path: statePath });
      try { chmodSync(statePath, 0o600); } catch { /* ignore */ }
    }
    return outcome;
  } catch (e) {
    if (page && !page.isClosed()) {
      try {
        const p = join(shotDir(), `failure-${Date.now()}.png`);
        await page.screenshot({ path: p, fullPage: true, timeout: 10000 });
        try { chmodSync(p, 0o600); } catch { /* ignore */ }
        if (e instanceof NetprintError) e.screenshot = p;
        else e.screenshot = p;
      } catch { /* screenshot best-effort */ }
    }
    throw e;
  } finally {
    if (context && o.trace) {
      const tp = join(shotDir(), `trace-${Date.now()}.zip`);
      await context.tracing.stop({ path: tp }).catch(() => {});
      try { chmodSync(tp, 0o600); } catch { /* ignore */ }
      log.info(`trace: ${tp} (予約番号を含む可能性があります)`);
    }
    await browser.close().catch(() => {});
  }
}
