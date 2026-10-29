// 結果画面の解析と検証。捏造しない: 取れなければ null。
import { TEXT } from './selectors.mjs';

export const RESERVATION_RE = /^[A-Za-z0-9]{8}$/;

export function parseResultText(text) {
  const m = TEXT.reservation.exec(text);
  const reservationNumber = m ? m[1].replace(/[\u00a0 ]/g, '') : null;
  const e = TEXT.expiry.exec(text);
  let expiresAt = null;
  let expiresAtISO = null;
  if (e) {
    const [, y, mo, d, h, mi] = e;
    expiresAt = `${y}/${mo}/${d} ${h}:${mi}`;
    const p = (s) => String(s).padStart(2, '0');
    expiresAtISO = `${y}-${p(mo)}-${p(d)}T${p(h)}:${mi}:00+09:00`; // サイト表示はJST
  }
  const s = TEXT.summary.exec(text);
  const summary = s ? { paper: s[1], pages: Number(s[2]), color: s[3] } : null;
  const f = TEXT.fee.exec(text);
  return {
    reservationNumber,
    expiresAt,
    expiresAtISO,
    summary,
    fee: f ? Number(f[1].replace(/,/g, '')) : null,
    complete: TEXT.completeMarkers.test(text),
  };
}

/**
 * @returns {{ok: boolean, problems: string[]}}
 */
export function verifyResult(parsed, { url = '', settings } = {}) {
  const problems = [];
  if (!parsed.reservationNumber) problems.push('予約番号が見つかりません');
  else if (!RESERVATION_RE.test(parsed.reservationNumber)) problems.push('予約番号の形式が英数8桁ではありません');
  if (!parsed.expiresAt) problems.push('有効期限が見つかりません');
  if (!parsed.complete) problems.push('登録完了の表示を確認できません');
  if (url && !TEXT.resultUrl.test(url)) problems.push('結果画面のURLではありません');
  if (settings && parsed.summary) {
    const s = parsed.summary;
    if (/^[A-Z]\d$/.test(settings.paperShort) && s.paper !== settings.paperShort)
      problems.push(`用紙が指定と異なります (指定 ${settings.paperShort} / 結果 ${s.paper})`);
    if (settings.color === 'mono' && s.color !== '白黒') problems.push(`色が指定(白黒)と異なります (結果 ${s.color})`);
    if (settings.color === 'color' && s.color !== 'カラー') problems.push(`色が指定(カラー)と異なります (結果 ${s.color})`);
  }
  return { ok: problems.length === 0, problems };
}
