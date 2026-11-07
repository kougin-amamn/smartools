# 試験

公開しないフォルダです(`.assetsignore` で除外)。必要な物(Node・Python・Playwright と Chromium)は開発環境に入っている物を使います。CDN のライブラリは読み込まず、止めるか `stubs/` の偽物に差し替えます。

| コマンド | 確かめること | かかる時間の目安 |
| --- | --- | --- |
| `node tests/core.js` | 計算部分(`*-core.js` と `common/env.js`)の試験を全部 | 1秒 |
| `node tests/core.js env` | 名前が `env` で始まる試験だけ | 1秒 |
| `node tests/smoke.js tools/<slug>` | そのページの起動・昼夜のテーマ・テーマボタン・幅 390px・環境情報12行・エラーが無いこと | 1ページ2〜3秒 |
| `node tests/smoke.js all` | 一覧・ランチャー・全ツールで同じ確認 | 2〜3分 |
| `node tests/smoke.js tools/<slug> --logs` | 上に加えて、各ページのログを出す | — |
| `node tests/scenarios/file-transfer.js` | ファイル転送の通し試験(2つのタブ・確認番号・圧縮・切断からの再開) | 10秒 |
| `node tests/scenarios/novel-reader.js` | 小説読み上げの通し試験(偽のカクヨムでブックマークレット・別タブへ受け渡し・1文ずつの読み上げ) | 5秒 |
| `node tests/scenarios/dj-turntable-pro.js` | DJターンテーブル Pro の通し試験(作った曲を2台に読み込み、BPM・START・メーター・クロスフェーダー・スクラッチ・ホットキュー) | 10秒 |

出力は合格なら `OK <名前>` の1行、不合格なら理由を並べます。

## 中身

| 場所 | 役割 |
| --- | --- |
| `lib/harness.js` | サイトを http で配信し、ページを開いてログを集める共通部品(`launch()` → `open(パス, 設定)`) |
| `core/*.test.js` | 計算部分の試験(`assert` を使う。1ファイル1対象) |
| `scenarios/*.js` | ツールごとの通し試験 |
| `stubs/fake-peer.js` | PeerJS の偽物(同じブラウザのタブ間を BroadcastChannel でつなぐ。`window.__delay` で遅らせ、`window.__drop()` で切る) |
| `stubs/fake-tf.js` | TensorFlow.js の偽物(画像分類の試験用。どの画像でも「トラ猫」を返す) |

## 書き足す時

- 計算部分を作ったら `core/<slug>.test.js` を足す。
- 画面の操作が複雑なツール(通信・カメラ・音)は `scenarios/<slug>.js` を足し、`lib/harness.js` の `open()` を使う。
- 3D ランチャーは three.js が開発環境で読めないため、構文チェック(`node --check`)だけにする。
