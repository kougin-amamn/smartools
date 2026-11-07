# 端末の機能(common/device.js) 設計書

2026-11-07 作成

## 概要

ツールが使う端末の機能(振動・クリップボード・カメラとマイク・ライト・センサー)を `common/tool-kit.js` から `common/device.js` に分ける。ツールのページだけが使う。HTML の読み込みは増やさず、ツールからの呼び方(`ToolKit.media.open` など)も変えない。

## 課題と方針

| 課題 | 方針 |
| --- | --- |
| `tool-kit.js` に端末の機能と画面の部品(設定シート・戻るボタン)が混ざり、名前から中身がわかりにくい | 端末の機能は `device.js`、画面の部品は `tool-kit.js` に分ける。判定は `env.js`、操作は `device.js` と並べる |
| ファイルを分けると全ツールの HTML に `<script>` が1行増える | 増やさない(利用者の判断)。`tool-kit.js` が自分と同じフォルダの `device.js` を `document.write` で読む |
| 呼び方を変えると多くのツールを書き換える | `device.js` が `ToolKit` に `vibrate`・`copyText`・`media`・`sensor` を足す。ツールの呼び方は今のまま |
| `device.js` だけが読めないと、ツールが途中で止まる | 読み込み確認の条件を `window.ToolKit && window.ToolKit.media` にし、無い時は案内を出す |

採らなかった案:

- 組み立てスクリプトで1ファイルにつなぐ(通信は増えないが、組み立て忘れと二重の中身が出る)。
- `tool-kit.js` から非同期で読む(ツールの js が先に動き、`ToolKit.media` がまだ無いことがある)。

## 構成

| ファイル | 中身 |
| --- | --- |
| `common/tool-kit.js` | `window.ToolKit` を作る。`esc`、設定シート、ランチャーへ戻るボタン。最後に `device.js` を読む |
| `common/device.js` | `ToolKit.vibrate`・`ToolKit.copyText`・`ToolKit.media`(open・stop・size・torch、ページを離れる時の自動停止)・`ToolKit.sensor`(permit・watchData)・`ToolKit.addCleanup` / `addSave`(ページを離れる時の終了処理と保存。設計は [page-exit.md](./page-exit.md)) |

読み込みの順(HTML は今のまま): `tool-kit.js` → (`tool-kit.js` が書き出す)`device.js` → 読み込み確認 → ツールの js。

## 仕様

- `document.write` で書き出した `<script>` は、`tool-kit.js` が終わった直後、HTML の続き(読み込み確認)より先に読まれて実行される。そのため、ツールの js からは今までどおり全部が使える。
- `device.js` の場所は `document.currentScript.src` から求める(ページの深さによらない)。
- 公開する関数と返す物は今と同じ(`docs/common.md` の表)。

## 処理の流れ

1. `tool-kit.js` が `ToolKit` を作り、設定シートと戻るボタンを用意して、`device.js` の `<script>` を書き出す。
2. `device.js` が `ToolKit` に端末の機能を足す。
3. 読み込み確認が `ToolKit.media` を確かめる。
4. ツールの js が動く。

## 制限事項

- 通信が1回増える(同じサーバーからなので差は小さいはずだが未計測)。
- `document.write` は新しい書き方では推奨されていない。Chrome は回線の遅い時に「別のサイトの」スクリプトを止めることがあるが、同じサイトのファイルは対象外。
- ページが読み終わった後に `tool-kit.js` を読むと `document.write` は使えない(ツールでそういう読み方はしない)。

## 確認

- `node tests/smoke.js all`(全ツールの起動と、共通ファイルが無い時の案内)。
- カメラ・ライト・センサーは実機で未確認(中身は移しただけで、変えていない)。
