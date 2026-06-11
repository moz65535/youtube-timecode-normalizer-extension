# YouTube Timecode Normalizer

YouTube動画URLのタイムコード表記を `t=秒数` に正規化するChrome拡張機能です。

ホロライブ非公式Wikiのように、YouTube出典リンクを大量に扱う編集画面での利用を想定しています。

YouTubeのタイムコード付きURLには `t=120`、`t=120s`、`t=2m`、`t=1h2m3s` など複数の表記があります。この拡張機能では、PC版ChromeでYouTubeの「現時点の動画URLをコピー」が生成する形式に合わせ、タイムコードを整数秒の `t=秒数` へ統一します。

この方針は、環境差や手入力による表記揺れを減らし、Wiki編集時に大量のリンクを機械的に確認・修正しやすくするためのものです。YouTube公式仕様の全環境での挙動を断定するものではありません。

## 機能

- 右クリックしたリンクをタイムコード正規化URLにしてコピー
- 右クリックしたリンクを正規化した状態で開く
- 選択範囲内のYouTubeタイムコード付きURLを一括正規化
- popupで選択範囲またはページ全体からリンクを抽出
- popupで変換プレビュー、正規化URL一覧、疑わしい対象外リンクを周辺テキスト付きで表示
- popupで変更前後のURL差分を周辺テキスト付きで表示
- popupでカテゴリ別に抽出リンクを絞り込み
- popupで疑わしい対象外を独立したカテゴリで絞り込み
- popupの表示内容をクリップボードへコピー
- `si` 共有パラメータを保持または除去
- タイムコードなしのYouTube動画URLに付いた `si` の除去を任意で実行
- `feature` パラメータを除去
- 直前の一括変更を元に戻す
- 編集欄を書き換える前に、変更前テキストをバックアップとしてローカルに保存
- `list` パラメータを保持するか選択
- `list` パラメータ付きURLを疑わしい対象として表示
- 崩れた時刻指定を救済するか選択
- URL形式を以下から選択
  - 変換前の形式に合わせる
  - `www.youtube.com` にする
  - `youtu.be` にする

## 正規化例

```text
https://www.youtube.com/watch?v=qhH-azW3LJw&t=17m12s
→ https://www.youtube.com/watch?v=qhH-azW3LJw&t=1032

https://www.youtube.com/watch?v=OjVYtizH0ks&t=3h1m45s
→ https://www.youtube.com/watch?v=OjVYtizH0ks&t=10905

https://youtu.be/N3UkUjJ8UiY&t=27m33s
→ https://youtu.be/N3UkUjJ8UiY?t=1653
```

## インストール

1. Chromeで `chrome://extensions/` を開く
2. 右上の「デベロッパー モード」を有効にする
3. 「パッケージ化されていない拡張機能を読み込む」を押す
4. `extension/` ディレクトリを選択する

## 使い方

リンク上で右クリックすると、正規化URLのコピーと正規化URLを開くメニューが表示されます。

Wikiや編集画面では、URLを含む範囲を選択して「選択範囲のタイムコード付きURLを正規化」を実行すると、入力欄内の選択範囲を書き換えます。通常ページの選択範囲では、変換後テキストをクリップボードへコピーします。

popupでは、選択範囲から抽出したリンクを一覧表示します。抽出対象を「ページ全体」に切り替えると、ページ本文とリンク先URLも対象にできます。手動入力欄にテキストを貼り付けてプレビューすることもできます。

popupの「変更差分」では、変更されるURLを周辺テキスト付きで `- 変更前` / `+ 変更後` の形式で確認できます。表示内容はクリップボードへコピーできます。

## 対象URL

変換対象はYouTubeの動画再生リンクのみです。

- `https://www.youtube.com/watch?v=VIDEO_ID&t=17m12s`
- `https://youtu.be/VIDEO_ID?t=17m12s`
- `https://www.youtube.com/live/VIDEO_ID?t=17m12s`
- `https://www.youtube.com/shorts/VIDEO_ID?t=17m12s`
- `start=` または `time_continue=` を含むYouTube動画URL

YouTube以外のURL、動画URLではないYouTube URL、タイムコードがないURLは変換しません。

`si` パラメータはYouTube共有URLに付くことがあります。初期設定では保持します。

popupの「タイムコード付きURLの si を除去する」を有効にすると、タイムコード正規化時に `si` を除去します。

popupの「タイムコードなしの si も除去する」を有効にすると、タイムコードがないYouTube動画URLについても `si` だけを除去します。この設定は初期OFFです。

`feature` パラメータはYouTube共有URLに付くことがあります。popupの「feature パラメータを除去する」は初期ONです。OFFにすると、タイムコード正規化時に `feature` を保持します。

`list` パラメータは再生リスト文脈を表します。初期設定では正規化時に保持しません。

popupの「list パラメータを保持する」を有効にすると、正規化後URLにも `list` と `index` を引き継ぎます。ただし、閲覧者個人の「高く評価した動画」を表す `list=LL` と「後で見る」を表す `list=WL` は共有用URLの文脈として不適切なため、設定に関係なく `list` と `index` を除去します。タイムコードがない動画URLでも同様です。

popupの「list パラメータ付きURLを疑わしい対象として表示する」は初期ONです。変換可能なURLでも、再生リスト文脈があるものを確認しやすくします。

popupの「崩れた時刻指定を救済する」は初期ONです。`/live/VIDEO_ID&t=秒数` や `watch?v=VIDEO_ID%t=秒数` のような、意図は明らかでもURLとして崩れている時刻指定を正規化対象にします。OFFの場合は変換せず、疑わしい対象として表示します。

### 崩れた時刻と未対応の時刻

「崩れた時刻」は、時刻の値は解釈できるものの、URLの区切り記号などが壊れている状態です。例えば `/live/VIDEO_ID&t=17m12s` や `watch?v=VIDEO_ID%t=1032` が該当します。「崩れた時刻指定を救済する」がONなら正規化し、OFFなら変更せず疑わしい対象として表示します。

「未対応の時刻」は、`t`、`start`、`time_continue` に値があるものの、秒数へ変換できない状態です。例えば `t=abc` や、本拡張機能が認識しない時刻表記が該当します。誤変換を避けるため、自動では変更せず疑わしい対象として表示します。

## 元に戻す

「直前の変更を元に戻す」は、直前の1回の実行で変更されたリンク群すべてを対象にします。

テキスト入力欄またはtextareaで選択範囲を正規化した場合は、同じ範囲を変更前のテキストへ戻します。通常ページの選択範囲を正規化してクリップボードへコピーした場合は、変更前の選択テキストをクリップボードへ戻します。

popupの「変更前テキストをバックアップとしてローカルに保存する」を有効にすると、編集欄を書き換える直前に変更前の選択範囲全体を拡張機能のローカルストレージへ保存します。保存されるのは直近の1件で、次の変更時に上書きされます。popupには保存日時、ページ名、文字数が表示され、「バックアップをコピー」から必要なときだけクリップボードへ取り出せます。この設定は初期OFFです。

ChromeおよびFirefoxのWebExtensions APIに対応しています。FirefoxではManifest V3の背景処理をイベントページとして読み込み、アドオンIDを使って設定を保存します。同期ストレージが利用できない環境ではローカルストレージへ保存します。

## リポジトリ構成

- `extension/`: Chrome Manifest V3拡張機能本体
- `test/cases/real/`: 実WikiソースまたはHTML由来のテストケース
- `tools/`: テストケース分析用スクリプト

## テスト

リポジトリルートで基本的なユニットテストと実データの集計を実行します。

```powershell
node tools/run_unit_tests.js
```

```powershell
node tools/analyze_all_test_cases.js
```

出力を短くしたい場合は、集計のみ、またはレビュー対象のみを出力できます。

```powershell
node tools/analyze_all_test_cases.js --summary
node tools/analyze_all_test_cases.js --problems
```

## ライセンス

MIT

この拡張機能はOpenAI Codexにより作成されました。
