---
name: seven-netprint
description: "Use when printing a PDF at 7-Eleven via netprint."
version: 0.1.0
author: ikeda (ikdsk), Hermes Agent
license: MIT
platforms: [linux, macos]
metadata:
  hermes:
    tags: [netprint, 7-eleven, playwright, pdf, print]
    related_skills: [pdf]
---

# seven-netprint

ローカルのPDFをセブン-イレブンの「かんたんnetprint」(ログイン不要)にPlaywright(Chromium, headless)でアップロードし、
**8桁のプリント予約番号**と**有効期限**を取得するCLI。店頭のマルチコピー機で予約番号を入力すれば印刷できる。

## When to Use / Don't use

使う:
- 「このPDFをコンビニで印刷したい」「ネットプリントに登録して予約番号を教えて」と頼まれたとき。
- CIやスクリプトから非対話でPDFを登録したいとき。

使わない:
- PDF以外(画像・Office文書)や 10MB 超 / 99ページ超のファイル(CLIが拒否する)。
- ログインが必要な「ネットプリント」会員機能(本ツールは `lite.printing.ne.jp` のみ)。
- 機密性の高いPDF。ファイルは富士フイルムのサーバへ送信される(翌日23:59まで保管)。ユーザーに確認すること。

## Prerequisites

- Node.js 20+ (動作確認: 24)。
- 初回のみ(スキルディレクトリで): `npm ci` と `npx playwright install chromium`。
- インストール先: `~/.hermes/skills/productivity/seven-netprint` (以降のパスはスキルディレクトリ基準)。

## How to Run

```
terminal(command="node scripts/netprint.mjs /abs/path/doc.pdf --accept-terms --json", workdir="~/.hermes/skills/productivity/seven-netprint", timeout=240)
```

- 所要時間は通常 15〜30 秒。`timeout` は `--timeout`(既定180秒)より長く(240以上)する。
- stdout は常にJSON 1行、stderr に人間向けログ(予約番号は `AB****34` にマスク)。

## Quick Reference

| フラグ | 内容 |
|---|---|
| `--accept-terms` | 利用規約等への同意チェックを許可(無ければ exit 3 で停止) |
| `--paper a4\|a3\|b5\|b4\|postcard` | 用紙 (既定 a4) |
| `--color mono\|color\|auto` | 白黒(既定)/カラー/店頭で選択 |
| `--small` | ちょっと小さめ(像欠け防止) |
| `--pin 1234`, `--notify-email a@b.c` | 暗証番号(4桁)/登録結果メール |
| `--direct` | 入口ページを経由せず lite URL に直接 |
| `--cookies accept\|reject\|ignore` | Cookieバナー(既定 reject、無ければ何もしない) |
| `--state-file p` / `--persist-state` | storageState の保存(Cookie選択の維持用) |
| `--timeout s` / `--headed` / `--slowmo ms` | 全体タイムアウト/ブラウザ表示/スロー実行 |
| `--debug-dir d` / `--trace` / `--screenshot-on-success` | デバッグ成果物(成功画面・traceには予約番号が写る) |
| `--output f` | 結果JSONを 0600 で保存 |
| `--verbose-secrets` | ログに予約番号/フルパスを出す(通常不要) |

両面・2in1・小冊子・ページ範囲・部数は登録時には設定できず、**店頭で設定**する。

## Procedure (agent)

1. PDFの絶対パスを確認。ユーザーが希望する用紙/カラーを聞く(未指定なら A4・白黒)。
2. **重要: `--accept-terms` は、ユーザーが netprint の利用規約・個人情報の取扱い・注意制限に、この会話で明示的に同意した場合のみ付ける。**
   規約URL: https://www.printing.ne.jp/support/lite/eula_lite.html / privacy_lite.html / attention_lite.html 。
   同意が無ければ付けずに実行せず、ユーザーに確認する(付けずに実行すると exit 3 `TERMS_CONSENT_REQUIRED`)。
3. 上のコマンドを実行し、stdout のJSONを読む。
4. 成功なら `reservationNumber` と `expiresAt` をユーザーに伝える。「店頭のマルチコピー機で『ネットプリント』→予約番号入力」。
5. exit 3 のときは自力で回避せず、`message` をそのままユーザーに伝えて人間に引き継ぐ(同意・CAPTCHA・ログイン)。
6. exit 5 のときは再実行しない(二重登録の恐れ)。`screenshot` の場所を伝え、サイトで確認してもらう。

## Exit codes

| code | 意味 |
|---|---|
| 0 | 成功 (`ok:true`) |
| 2 | 入力/使い方エラー (ファイル不正, 不正な --paper 等) |
| 3 | 人手が必要: `TERMS_CONSENT_REQUIRED`, `CAPTCHA_REQUIRED`, `LOGIN_REQUIRED` |
| 4 | サイト/ネットワーク/タイムアウト/アップロード拒否 (再実行可) |
| 5 | 登録は進んだが結果を検証できない (`REGISTRATION_UNVERIFIED`) |

失敗JSON: `{ok:false, code, message, humanActionRequired, screenshot?}`。成功JSON: `{ok, reservationNumber, expiresAt, expiresAtISO, settings, pages?, fee?}`。

## Pitfalls

- 予約番号は結果画面を閉じると消える。出力JSONを必ずユーザーに渡す。ログには伏字しか出ない。
- exit 4/5 後の再実行は二重登録になりうる。登録ボタン押下後の失敗は、まずスクリーンショットで確認する。
- ファイル名に `& % ' " : * ? < > | \ /` や日本語・英語以外の文字があると登録に失敗することがある(警告を出す)。リネームしたコピーを使う。
- パスワード保護PDFや一部ソフト製のPDFはサイト側で拒否される (exit 4 `UPLOAD_REJECTED`)。
- UIが変わると `UI_CHANGED` になる。直すのは `scripts/lib/selectors.mjs` のみ(調査メモ: `references/site-ui.md`)。
- 登録した番号は他人にも使える(暗証番号を設定しない限り)。必要なら `--pin` を使う。

## Verification

- 成功とは「予約番号が英数8桁」かつ「結果画面(/web/result)で完了表示」かつ「有効期限あり」かつ(白黒/カラー・用紙が結果の要約と一致)。満たさなければ exit 5。
- オフラインテスト: `npm test`。実サイトE2E(実登録される): README 参照。
