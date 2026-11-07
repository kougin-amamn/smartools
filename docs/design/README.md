# 設計書

アプリ(ツール・ランチャー)や共通の部品(`common/` のファイル)を新しく作る時は、**作る前にここへ設計書を書きます**。大きく作り変える時も、先に設計書を直します。

- 置き場所: `docs/design/<名前>.md`。名前はツールなら slug(`file-transfer.md`)、共通部品ならファイル名から(`log.md`)。
- 書き方: 下の型に沿って、決めたことと理由を書きます。図は Mermaid(GitHub でそのまま図になる)。
- 作った後: 実装で変わった所を設計書にも反映し、同じコミットに入れます。設計書と実装が食い違ったら、実装に合わせて設計書を直します。
- 公開しない: `docs/` は `.assetsignore` で公開サイトから外してあります。

## 一覧

| 設計書 | 対象 |
| --- | --- |
| [log.md](./log.md) | ログの仕組み(`common/log.js`) |
| [env.md](./env.md) | 環境の判定(`common/env.js`) |
| [device.md](./device.md) | 端末の機能(`common/device.js`。`tool-kit.js` が読む) |
| [page-base.md](./page-base.md) | ページの土台: ヘッダのボタンと読み込み確認(`common/site.js`・各ページの HTML) |
| [launcher-3d.md](./launcher-3d.md) | 3Dランチャー(本棚・美術館): ES モジュール化と共通部品への組み直し(段 1a まで実装) |
| [dj-turntable-pro.md](./dj-turntable-pro.md) | DJターンテーブル Pro 2台+ミキサー(`tools/dj-turntable-pro`。1台の通常版 `tools/dj-turntable` は別に残す) |
| [file-transfer.md](./file-transfer.md) | ファイル転送(`tools/file-transfer`) |
| [novel-reader.md](./novel-reader.md) | 小説読み上げ(`tools/novel-reader`、検証用の試作) |

## 型

```markdown
# <名前> 設計書

## 概要
何のためのものか、誰がどこで使うか、前提(ブラウザ・https・外部サービス)。

## 課題と方針
作る前に洗い出した課題と、それぞれどう対応するか(表)。採らなかった案があれば理由も。

## 構成
ファイルと役割、外部ライブラリ・サービス、図。

## 仕様
画面・操作・公開する関数やメッセージ・データの形・設定値と理由。

## 処理の流れ
主な流れ(番号付きの手順か図)。

## 制限事項
できないこと、端末やブラウザによる違い。

## 確認
確認したこと(Node・ブラウザ)と、実機で確かめること。
```
