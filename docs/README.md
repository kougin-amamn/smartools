# 文書の一覧

このフォルダはサイトを作る人(と Claude)向けの文書で、公開しません。必要な物だけ読みます。

| 文書 | いつ読むか |
| --- | --- |
| [site.md](./site.md) | フォルダ・読み込み順・一覧(index-data.json)・ランチャー・公開の仕組みを知りたい時 |
| [common.md](./common.md) | 共通部品(ToolKit・site.js がすること)を使う・直す時 |
| [ui.md](./ui.md) | 配色・ヘッダ・設定シート・ボタン・アイコンを作る時 |
| [logging.md](./logging.md) | ログを書く時 |
| [naming.md](./naming.md) | 名前を付ける時 |
| [lessons.md](./lessons.md) | カメラ・センサー・音・描画・iPhone など、つまずきやすい機能を使う時 |
| [design/](./design/README.md) | 設計書(作る前に書く)と、その型 |
| [../tests/README.md](../tests/README.md) | 試験の動かし方 |

## 作業の進め方

### 新しいツール

1. `node scripts/new-tool.js <slug> <名称> <英名> [キャッチ] [説明]` でひな形を作る。
2. `docs/design/<slug>.md` を書く(下の「設計書の範囲」)。
3. 作る。計算は `<slug>-core.js` に分け、`tests/core/<slug>.test.js` を足す。
4. アイコンの絵を描き、`index-data.json` に1行足す。
5. `node tests/core.js <slug>` と `node tests/smoke.js tools/<slug>` を通し、Prettier で整える。

### 設計書の範囲

| 変更の大きさ | 設計書 |
| --- | --- |
| 文言・見た目の小さな修正 | 書かない |
| 既存ツールの機能追加 | その設計書の該当する節だけ直す(無ければ書かない) |
| 新しいツール | 短い版: 概要・課題と方針・仕様の要点(構成図は要る時だけ) |
| 共通部品の新規・作り変え | 型の全部の節 |

### 試験の範囲

| 変更の大きさ | 試験 |
| --- | --- |
| 文言・見た目の小さな修正 | 構文チェック(`node --check`)と Prettier |
| 既存ツールの機能追加 | `node tests/core.js <slug>`(計算を変えた時)と `node tests/smoke.js tools/<slug>`、変えた操作だけブラウザで確かめる |
| 新しいツール | 上に加え、主な流れを1本(複雑な物は `tests/scenarios/<slug>.js` に残す) |
| 共通部品の変更 | `node tests/core.js` と `node tests/smoke.js all` |

スクリーンショットは見た目を変えた時だけ撮ります。
