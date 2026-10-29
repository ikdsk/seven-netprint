# かんたんnetprint UI 調査メモ (2026-10-29)

headless Chromium (Playwright) で実サイトを調査した結果。秘匿情報なし。UIが変わったら `scripts/lib/selectors.mjs` を直す。

## 画面遷移
1. `https://www.printing.ne.jp/` — リンク「かんたんnetprint」(2箇所) → `https://lite.printing.ne.jp/web` (同一タブ、target なし)。Cookieバナーは観測されず。
2. `/web` (SPA, Next.js + MUI)
   - 文言: 「ご利用の際には必ず利用規約および個人情報の取扱い、注意制限をご確認頂き、同意してください。」
   - `<input type=checkbox>` + ラベル「同意する」。同意するまで「ファイルを選択」ボタンは disabled。
   - 隠し `<input type=file multiple accept=".xdw,.pdf,.xps,.oxps,.doc,.docx,.rtf,.xls,.xlsx,.ppt,.pptx,.jpg,.jpe,.jpeg,.png,.tif,.tiff">` に `setInputFiles` で投入できる。
   - 「印刷期限はプリント予約日＋1日です。」
3. ファイル投入後、同一URLのまま「プリントの設定をしてください」フォームが表示。変換中は `[data-testid=oval-loading]` (role=status, aria-busy) が出る。消えたら設定可能。
4. 「登録する」(`type=submit`) → `https://lite.printing.ne.jp/web/result` (history 遷移)。
5. 結果画面 (テキスト):
   ```
   プリント予約番号：XXXXXXXX
   ファイル名：e2e-test
   A4,1枚,白黒詳細
   有効期限：2026/10/30 23:59
   ```
   +「アップロード完了」モーダル (「続けてファイルを選択」「閉じる」)。「このウィンドウを閉じると予約番号は消去されます」。料金は表示されない。

## 設定項目 (すべて radio, `name`/`value`)
| 項目 | name | 値 (value: 表示) | 既定 |
|---|---|---|---|
| 用紙サイズ | `paperSize` | 0:普通紙 A4 / 1:A3 / 2:B5 / 3:B4 / 5:はがき | **未選択** (必ず選ぶ) |
| カラーモード | `colorMode` | 0:マルチコピー機でのプリント時に選択 / 1:カラー / 2:白黒 | 0 |
| ちょっと小さめ | `margin` | 0:しない / 1:する（像欠け防止） | 0 |
| 暗証番号 | `secretNumberCondition` + `secretNumber`(password, 4桁数字) | 0:設定しない / 1:設定する | 0 |
| 登録結果通知 | `mailAddressCondition` + `mailAddress`(text, 1件) | 0:設定しない / 1:設定する | 0 |

- 両面/片面、2枚を1枚、小冊子、ページ範囲、部数は**登録時の項目に無く**、店頭のマルチコピー機で設定する (公式「注意制限」ページ)。よって CLI に該当フラグは無い。
- L判/2L (フォト用紙) は JPEG のみ・最大5ファイルで PDF 不可。CLI は対象外。
- ラベル中の空白は全角スペース (`普通紙　A4`)。

## 制限 (https://www.printing.ne.jp/support/lite/attention_lite.html)
- 普通紙/はがき: 1ファイル 10MB 以下、99ページ超不可。
- 預かり期限: 登録日の翌日 23:59。プリント予約番号は **英数8桁**。
- ファイル名に `\ / : * ? " < > | & ' %`、日本語・英語以外の文字、絵文字があると登録できない場合あり。
- パスワード保護PDF等は不可。PDFはプリンタが解釈可能か検証され、失敗すると登録エラー。
- 1ファイルの料金合計は 10,000 円まで。

## 未確認
- CAPTCHA/ログイン/Cookieバナーはこの調査では一度も出現していない (検出ロジックはローカルのフィクスチャでのみ検証)。
- 登録エラー時のモーダル文言 (ファイル不正など) は実サイトで未観測。`TEXT.errorText` は推測。
- 2026/11/14 21:00-24:00 は Office 文書のみメンテナンス (PDF は影響なし)。
