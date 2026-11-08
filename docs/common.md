# 共通部品の使い方(common/)

共通部品は `common/` にだけ置き、ツールにコピーしません。全体を変える時はここのファイルだけを直します。ログは [logging.md](./logging.md)、環境の判定は [design/env.md](./design/env.md) に詳しく書いてあります。

| ファイル | 読むページ | 役割 |
| --- | --- | --- |
| `log.js` | 全ページ(最初) | ログ・`log.step`・`log.started`・`log.MSG` / `log.format`・ボタンとリンクの押下の自動ログ(後半) |
| `env.js` | 全ページ | `window.Env`: OS・ブラウザ・端末名・`requireSecure`・`canVibrate`・環境情報の行 |
| `site.css` / `site.js` / `themes.json` | 全ページ | 配色のトークン、ヘッダ、テーマ、カラーテーマ、環境情報、デバッグ画面、埋め込み表示 |
| `tool.css` / `tool-kit.js` | ツールだけ | ページの土台、`window.ToolKit`(`esc`)、設定シート、ランチャーへ戻るボタン |
| `device.js` | ツールだけ(`tool-kit.js` が読む。HTML に書かない) | 端末の機能を `ToolKit` に足す: 振動・コピー・カメラとマイク・ライト・センサー([design/device.md](./design/device.md)) |
| `turntable-worklet.js` | DJ のツールだけ(`audioWorklet.addModule('../../common/turntable-worklet.js')` で読む。HTML に書かない) | 2台の盤から音を読む AudioWorklet(処理の名前 `turntable-decks`)。モーター・指のばね・スリップマット。DJターンテーブル Pro と DJデッキが共有([design/dj-turntable-pro.md](./design/dj-turntable-pro.md) の 5.3) |

## ToolKit(ツールだけ)

`esc` は `tool-kit.js`、ほかは `device.js` にあります。呼び方はどちらも `ToolKit.〜` です。

自分でログを書き、画面に出す文を返すので、ツールは状態の文を出すだけで済みます。ツールに同じ物を書き写さない(振動・エスケープ・コピー・カメラとマイク・ライト・センサーの許可)。

| 呼び方 | すること | 返す物 |
| --- | --- | --- |
| `ToolKit.vibrate(ms?)` | 振動(初期 10ms)。iPhone と、まだ触れていない時は何もしない | — |
| `ToolKit.esc(s)` | innerHTML に入れる文字の `& < > " '` を無害にする | 文字列 |
| `ToolKit.copyText(text, 何を, 詳細?)` | クリップボードへ(だめなら選択してコピー)。`<何を>をコピーしました(<詳細>)`(詳細は件数などで、中身は書かない) | Promise\<bool\> |
| `ToolKit.media.open(条件, 'カメラ' \| 'マイク')` | https・非対応・拒否・無い・使用中を扱ってログを書く。ここで開いた物はページを離れる時に自動で止まる | Promise\<{stream} か {stream: null, message}\> |
| `ToolKit.media.stop(stream)` | 全部止める | 止めた物があれば true |
| `ToolKit.media.size(track)` | ログ用の大きさ `'1280×720'` | 文字列 |
| `ToolKit.media.torch(track, on)` | ライト(対応を確かめる)。`ライトを点灯しました` | Promise\<{ok} か {ok: false, reason, message}\> |
| `ToolKit.addCleanup(fn, 名前)` | ページを離れる時(`pagehide`)に fn() を呼ぶ。true を返したら `<名前>を停止しました(ページを離れたため)`。失敗してもほかは呼ぶ。登録したページは、戻るボタンで戻ると読み込み直す(設計: `design/page-exit.md`) | — |
| `ToolKit.addSave(fn)` | 画面が隠れた時とページを離れる時に fn() を呼ぶ(保存用。ログは出さない) | — |
| `ToolKit.sensor.permit('orientation' \| 'motion')` | iOS 13 以降の許可(タップの中で呼ぶ)。許可が要らない端末では true | Promise\<bool\> |
| `ToolKit.sensor.watchData(ms, got, onTimeout, 名前)` | ms たっても got() が false なら `<秒>秒たっても<名前>のデータが届きませんでした` | タイマーの番号 |

```js
const r = await ToolKit.media.open({ video: { facingMode: { ideal: 'environment' } } }, 'カメラ');
if (!r.stream) { statusEl.textContent = r.message; return; }
stream = r.stream; video.srcObject = stream;
log('カメラを開始しました(背面 / ' + ToolKit.media.size(stream.getVideoTracks()[0]) + ')');
// 止める: if (ToolKit.media.stop(stream)) { stream = null; log('カメラを停止しました'); }
```

- 例外として自分で書く物: カメラを自分で開くライブラリ(QR読み取りの ZXing)、全カメラからライトを探す(ライト)、位置情報。
- 1つのツールだけで使う小さな関数(`formatTime` など)はそのツールに置く。いくつものツールで使う物だけ `tool-kit.js` に足す。
- 共通の名前(`log`・`Env`・`ToolKit`・`__logReplay`)と、core やツールの名前を重ねない。

## site.js がすること

- **テーマ:** 開いた時だけ時刻で決める(18時〜6時はダーク)。ヘッダのボタンでライト⇄ダークを切り替える(保存しない)。`data-theme` を必ず書く。
- **カラーテーマ:** 一覧は `themes.json`(`id`・`no`・`name`・`main`・`sub`。`standard` が標準の配色)。選んだ物は `localStorage['site-color']` に保存し、同じアドレスの全ページで共有する。`--accent`・`--func`・`--fn-bg`(と `-fg`)だけを上書きする。
- **環境情報:** `Env.rows()` の12行(OS・ブラウザ・画面(縦×横)・画面の倍率・表示領域(縦×横)・向き・https・通信・言語・タイムゾーン・振動・保存領域)を出す。テーマの行は無い。開くたびに読み直す。起動時の環境のログは出さない。
- **デバッグ画面:** ボタンを押した時に eruda を読み、それまでの履歴を出し直す。
- **埋め込み表示**(`?embed=1`): ヘッダを隠し、テーマは親に合わせる(今は使うページが無い)。
- **ヘッダのボタン:** 環境情報・カラーテーマ・テーマ・デバッグの4つは `site.js` が `addHeaderButton` で足す(HTML に書かない)。名前は固定の `data-log`。全ページに足すボタンも同じ関数で足す(中の表だけ `data-log="off"`、外を押すか Escape で閉じる、ほかの吹き出しを閉じる)。
- `site.css`: トークン、`box-sizing`、`[hidden]{display:none!important}`、ヘッダ(英名を小さく重ねる `.site-bar h1 .en`)、吹き出し、埋め込み表示。

## tool-kit.js のほか

- **設定シート:** `#setBtn` と `#settings` があれば開閉とログを付ける(書き方は [ui.md](./ui.md))。
- **戻るボタン:** ランチャーから開いた時は履歴で戻り、それ以外はランチャーへ移る(ランチャーが保存した `launcher-return` を使う)。
