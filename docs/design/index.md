# 設計書の一覧

書く前に [設計書の型と書き方](./template.md) を読みます。新しい設計書を書いたら、ここに1行足します。

## 共通部品

* [ログの仕組み](./log-system.md) - ログの仕組み(common/log.js・autolog.js)
* [環境の判定](./env.md) - OS・ブラウザ・端末の判定と環境情報の表(common/env.js)
* [端末の機能](./device.md) - 振動・コピー・カメラ・センサーなどの部品(common/device.js)
* [ページの土台](./page-base.md) - ヘッダのボタンと読み込み確認(common/site.js・各ページの HTML)
* [カラーテーマ(6つのテーマ)](./color-theme.md) - 6つのカラーテーマ(common/themes.json・site.css・site.js)
* [Material 3 Expressive に合わせた見た目](./m3-expressive.md) - 色・形・動き・文字の共通トークン(common/site.css・tool.css)。段 1 は確認中
* [ツールの並べ替え](./tool-sort.md) - 一覧の並び順(分類・最近・よく使う・名前。common/tool-usage.js)
* [多言語化(日本語・英語)](./i18n.md) - 画面の文の言語(lang/*.json・common/i18n.js)
* [ページを離れる時の終了処理](./page-exit.md) - 画面を離れる時の保存と後片付け(common/device.js)。段 2 まで実装
* [ブラウザの対応と許可の確認](./support-check.md) - Env.supports・Env.permissionOf(common/env.js)

## ツール

* [電卓](./calculator.md) - 電卓の計算の履歴と表示の窓
* [ファイル転送](./file-transfer.md) - 端末どうしのファイル転送(tools/file-transfer)
* [頭痛予報](./headache-forecast.md) - 気圧の下がり方から頭痛に注意したい時間を知らせる(tools/headache-forecast)
* [時計](./clock.md) - アナログとデジタルを切り替えられる時計(tools/clock)
* [ストップウォッチ](./stopwatch.md) - 輪で時間の経過を見せる(tools/stopwatch)
* [方位磁石](./compass.md) - 向いている方角と北を一目で見せる(tools/compass)

## ランチャー

* [3Dランチャー(本棚・美術館)](./launcher-3d.md) - ES モジュール化と共通部品への組み直し。段 1a まで実装(前の型)
* [3D本棚ランチャー](./launcher-3d-bookshelf.md) - 3D本棚ランチャー(新しい型の最初の見本)

## 移した・消した設計書

* `dj-turntable-pro.md`・`dj-decks.md` - 2026-11-11・12 に [Toolbox Pro](https://github.com/kougin-amamn/toolbox-pro) へ移した
* `novel-reader.md` - 2026-11-14 にツールと一緒に消した(git の履歴に残っている)
