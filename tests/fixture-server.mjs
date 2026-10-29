// netprint の画面を模した最小のローカルHTTPサーバ (ネットワーク不要テスト用)
import { createServer } from 'node:http';

const PORTAL = (lite) => `<!doctype html><meta charset=utf-8><title>portal</title>
<a href="${lite}">かんたんnetprint</a>`;

const LITE = ({ captcha = false, cookie = false, uploadError = false, noResultNumber = false, slow = 0, badNumber = false } = {}) => `<!doctype html><meta charset=utf-8><title>lite</title>
<body>
${cookie ? '<div id="cookie-banner" role="dialog">Cookieを使用します <button id="a">すべて許可</button><button id="r">必須のみ</button></div>' : ''}
${captcha ? '<iframe src="https://www.google.com/recaptcha/api2/anchor"></iframe>' : ''}
<div id="app">
 <p>ご利用の際には必ず利用規約をご確認頂き、同意してください。</p>
 <label><input type="checkbox" id="agree">同意する</label>
 <button id="pick" disabled>ファイルを選択</button>
 <input type="file" id="f" accept=".pdf" style="display:none">
</div>
<form id="settings" style="display:none" onsubmit="return false">
 <div>プリントの設定をしてください</div>
 <div id="spin" data-testid="oval-loading" role="status" aria-busy="true">loading</div>
 <label><input name="paperSize" type="radio" value="0">普通紙　A4</label>
 <label><input name="paperSize" type="radio" value="1">普通紙　A3</label>
 <label><input name="paperSize" type="radio" value="2">普通紙　B5</label>
 <label><input name="paperSize" type="radio" value="3">普通紙　B4</label>
 <label><input name="paperSize" type="radio" value="5">はがき</label>
 <label><div><input name="colorMode" type="radio" value="0" checked>マルチコピー機でのプリント時に選択</div></label>
 <label><div><input name="colorMode" type="radio" value="1"><img alt="">カラー</div></label>
 <label><div><input name="colorMode" type="radio" value="2"><img alt="">白黒</div></label>
 <label><input name="margin" type="radio" value="0" checked>しない</label>
 <label><input name="margin" type="radio" value="1">する（像欠け防止）</label>
 <label><input name="secretNumberCondition" type="radio" value="0" checked>設定しない</label>
 <label><input name="secretNumberCondition" type="radio" value="1">設定する</label>
 <input name="secretNumber" type="password" disabled>
 <label><input name="mailAddressCondition" type="radio" value="0" checked>設定しない</label>
 <label><input name="mailAddressCondition" type="radio" value="1">設定する</label>
 <input name="mailAddress" type="text" disabled>
 <button type="submit" id="reg">登録する</button>
</form>
<div id="err" role="alert" style="display:none">エラー: ファイルを登録できません</div>
<script>
 const $ = (s) => document.querySelector(s);
 $('#agree').onchange = (e) => { $('#pick').disabled = !e.target.checked; };
 $('#pick').onclick = () => $('#f').click();
 document.querySelectorAll('input[name=secretNumberCondition]').forEach(r => r.onchange = () => $('[name=secretNumber]').disabled = r.value !== '1');
 document.querySelectorAll('input[name=mailAddressCondition]').forEach(r => r.onchange = () => $('[name=mailAddress]').disabled = r.value !== '1');
 $('#f').onchange = () => {
   if (${uploadError}) { $('#err').style.display = 'block'; return; }
   $('#settings').style.display = 'block'; $('#reg').style.display = 'none';
   setTimeout(() => { $('#spin').remove(); $('#reg').style.display = ''; }, ${slow});
 };
 $('#reg').onclick = () => {
   const paper = document.querySelector('[name=paperSize]:checked');
   const color = document.querySelector('[name=colorMode]:checked');
   if (!paper) return;
   window.__submitted = { paper: paper.value, color: color.value,
     margin: document.querySelector('[name=margin]:checked').value,
     pin: document.querySelector('[name=secretNumber]').value, mail: document.querySelector('[name=mailAddress]').value };
   fetch('/__submitted', { method: 'POST', body: JSON.stringify(window.__submitted) });
   history.pushState({}, '', '/web/result');
   document.body.innerHTML = '<div>セブン-イレブンのマルチコピー機で<br>プリントできます。</div>' +
     ${noResultNumber ? "''" : `'<div>プリント予約番号：${badNumber ? 'AB-12' : 'AB12CD34'}</div>'`} +
     '<div>ファイル名：x</div><div>' + ({0:'A4',1:'A3',2:'B5',3:'B4',5:'はがき'})[paper.value] + ',1枚,' + ({0:'未設定',1:'カラー',2:'白黒'})[color.value] + '詳細</div>' +
     '<div>有効期限：2026/10/30 23:59</div><div role="dialog">アップロード完了</div>';
 };
</script>`;

/** @param {object} variant LITE のオプション */
export async function startFixture(variant = {}) {
  const submitted = [];
  const server = createServer((req, res) => {
    if (req.method === 'POST' && req.url === '/__submitted') {
      let b = '';
      req.on('data', (c) => (b += c));
      req.on('end', () => { submitted.push(JSON.parse(b)); res.end('ok'); });
      return;
    }
    res.setHeader('content-type', 'text/html; charset=utf-8');
    if (req.url === '/') res.end(PORTAL(`http://127.0.0.1:${server.address().port}/web`));
    else if (req.url.startsWith('/web')) res.end(LITE(variant));
    else { res.statusCode = 404; res.end('nf'); }
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  return { base, portalUrl: `${base}/`, liteUrl: `${base}/web`, submitted, close: () => new Promise((r) => server.close(r)) };
}
