# seven-netprint

ローカルPDFをセブン-イレブン「かんたんnetprint」(<https://lite.printing.ne.jp/web>, ログイン不要)へ Playwright でアップロードし、
**プリント予約番号(英数8桁)**と**有効期限**を返す非対話CLI。headless がデフォルト。Hermes Agent のスキルとしても使える(`SKILL.md`)。

## インストール

```sh
npm ci
npx playwright install chromium     # Linuxで依存が足りない場合: npx playwright install --with-deps chromium
```
Node.js 20 以上 (24 で確認)。

## 使い方

```sh
# 基本 (A4・白黒)。利用規約等に同意する場合のみ --accept-terms
node scripts/netprint.mjs doc.pdf --accept-terms

# B5・カラー・ちょっと小さめ
node scripts/netprint.mjs doc.pdf --accept-terms --paper b5 --color color --small

# CI: stdout のJSONだけを読む
out=$(node scripts/netprint.mjs doc.pdf --accept-terms --json); rc=$?
case $rc in
  0) echo "$out" | jq -r .reservationNumber ;;
  3) echo "人手が必要: $(echo "$out" | jq -r .message)" ;;   # 同意/CAPTCHA/ログイン
  5) echo "登録済みの可能性あり。再実行せず確認を" ;;
  *) echo "失敗($rc): $out" >&2 ;;
esac

# デバッグ: ブラウザ表示 + ゆっくり + 成果物保存
node scripts/netprint.mjs doc.pdf --accept-terms --headed --slowmo 300 --debug-dir ./artifacts --trace
```

`node scripts/netprint.mjs --help` で全オプション。

### オプション設計
サイトが登録時に提供する設定だけを公開している: 用紙(A4/A3/B5/B4/はがき)、カラーモード(白黒/カラー/店頭で選択)、ちょっと小さめ、暗証番号、登録結果メール。
両面・2枚を1枚・小冊子・ページ範囲・部数は**店頭のマルチコピー機で設定**する項目で、登録画面に無いため CLI にも無い(指定すると usage エラー)。
L判/2L はJPEG専用のため対象外。調査結果は `references/site-ui.md`。

### 規約同意
`--accept-terms` を付けたときだけ「同意する」をチェックする。付けなければ何も操作せず exit 3 `TERMS_CONSENT_REQUIRED`。同意は保存しない。

### Cookie
`--cookies accept|reject|ignore` (既定 `reject`: 拒否ボタンがあれば押し、無ければ/バナーが無ければ何もしない)。2026-10-29 時点では実サイトにバナーは出ていない。
`--state-file <path>` で Playwright の storageState を読み書き、`--persist-state` で `~/.cache/seven-netprint/state.json` (ディレクトリ 0700, ファイル 0600)。

## 終了コード

| code | 意味 |
|---|---|
| 0 | 成功。stdout: `{"ok":true,"reservationNumber","expiresAt","expiresAtISO","settings",...}` |
| 2 | 入力/使い方エラー |
| 3 | 人手が必要 (`TERMS_CONSENT_REQUIRED` / `CAPTCHA_REQUIRED` / `LOGIN_REQUIRED`)。CAPTCHA等の回避は一切しない |
| 4 | サイト/ネットワーク/タイムアウト/UI変更/アップロード拒否 |
| 5 | 登録操作は完了したが予約番号・有効期限・完了表示を検証できない (**再実行すると二重登録になりうる**) |

失敗時は `{"ok":false,"code","message","humanActionRequired","screenshot"?}`。失敗スクリーンショットは `--debug-dir` か `$TMPDIR/seven-netprint-<uid>/` (0700)。

## プライバシー

- stderr のログはPDFの**ファイル名のみ**、予約番号は `AB****34` に伏字(`--verbose-secrets` で解除)。PDFの中身は出さない。
- 予約番号がフルで出るのは stdout のJSONと、`--output <file>`(0600)を指定したときのファイルのみ。
- 成功スクリーンショット/trace は `--debug-dir`・`--screenshot-on-success`・`--trace` 指定時のみ保存され、**予約番号が写る**。
- テレメトリなし。PDFは富士フイルムのnetprintサーバへ送信され、登録日の翌日23:59まで保管される。
- 暗証番号は `--pin` よりも環境変数 `NETPRINT_PIN` の方がプロセス一覧に残らない。

## テスト

```sh
npm test                      # オフライン(ローカルのフィクスチャサーバ。ネットワーク不要)
# 実サイトE2E: ダミーPDFを「実際に登録」する。利用規約等に同意した人だけが実行すること。
NETPRINT_E2E=1 node --test tests/e2e.test.mjs                          # --accept-terms なし → exit 3 の確認のみ
NETPRINT_E2E=1 NETPRINT_E2E_REGISTER=1 node --test tests/e2e.test.mjs   # 1件実登録 (A4/白黒)
node scripts/make-test-pdf.mjs out.pdf "text"                           # ダミーPDF生成
```

## 構成

`scripts/netprint.mjs` (CLI) / `scripts/lib/selectors.mjs` (サイト依存の locator・文言はここだけ) / `flow.mjs` (フロー) / `validate.mjs` / `result.mjs` / `cli.mjs` / `log.mjs`、`tests/`、`references/site-ui.md`。

## 既知の制限

- CAPTCHA・ログイン・Cookieバナーの検出は実サイトでは未発生のため、ローカルのフィクスチャでのみ検証。
- サイトのエラー文言は推測ベース。登録失敗時の画面は実サイトで未観測。
- 非公式ツール。サイトの利用規約・仕様変更に従うこと。
