# ブラウザの対応と許可の確認 設計書

状態: 確認中(5章の答えを入れた。3章と4章の確認を待つ)。作成 2026-11-08。

## 1. 概要

ツールが「このブラウザで使えるか」「許可されているか」を確かめる書き方を、`window.Env` の関数にそろえます。今は `'speechSynthesis' in window`(13か所)、`window.AudioContext`(8か所)、`'wakeLock' in navigator` などを、各ツールがそれぞれの書き方で確かめています。

- うまくいったと言える目安: ツールの確認が `Env.supports('音声合成')` のように読める形になる。許可を拒んだ後に開いたツールで、押す前に「設定から許可してください」が分かる。
- 前提: `common/env.js` はすべてのページが読む(ツール以外でも使える)。
- やらないこと:
  - 対応しない時の画面の文とログを、関数が出すこと。ツールごとに画面の作りが違うため、文とログはツールが書く(決定 2026-11-08)。
  - 対応しない機能の代わり(ポリフィル)を入れること。
  - 許可を求める画面を、関数が出すこと。許可は今どおり、カメラを開く時(`ToolKit.media.open`)やセンサーの許可(`ToolKit.sensor.permit`)で求める。

## 2. 基本設計

### 2.1 要件と課題

要件:

| 番号 | 要件(受け入れの条件) |
| --- | --- |
| R-01 | `Env.supports(名前)` は、その機能がこのブラウザにある時 `true`、無い時 `false` を返す |
| R-02 | 一覧に無い名前を渡した時、`false` を返し、エラーのログを出す(書き間違いに気づくため) |
| R-03 | `Env.permissionOf(名前)` は、カメラ・マイク・位置の許可の状態を `'許可済み'` / `'拒否'` / `'未確認'` / `'不明'` で返す。確かめられないブラウザでは `'不明'` |
| R-04 | 情報の画面(ℹ)に、そのページで確かめた機能と許可の状態を足す。確かめていない物は出さない |
| R-05 | https の確認は、今の `Env.isSecure()`(真偽)と `Env.requireSecure()`(文)をそのまま使う |

課題と方針:

| 課題 | 方針 |
| --- | --- |
| 同じ機能を、ツールごとに違う書き方で確かめている(`in`、`typeof`、`window.X` など) | 名前と確かめ方の表を `env.js` に1つ持ち、`Env.supports(名前)` で引く |
| 許可を拒んだ後に開くと、押してから失敗して初めて分かる | `Env.permissionOf` で開いた時に確かめ、拒否なら先に案内を出せるようにする |
| 情報の画面に、そのツールが使う機能が出ていない | 確かめた名前を覚えておき、`Env.rows()` に足す |

採らなかった案:

| 案 | 理由 |
| --- | --- |
| 関数が文を返し、警告のログも出す | 決定 2026-11-08: 真偽を返すだけにする。文とログはツールが書く |
| 関数が画面に文を出すところまで行う | 同上 |
| 情報の画面に、一覧の機能をすべて出す | 決定 2026-11-08: そのツールが確かめた物だけにする。関係の無い行が増えるため |
| 約30か所をまとめて置き換える | 決定 2026-11-08: 数ツールで試し、ほかは手を入れる時に移す |

### 2.2 外部仕様

使う人から見える事:

| 場面 | 見える事 |
| --- | --- |
| 対応しないブラウザでツールを開く | 今と同じ(文はツールが出す) |
| 許可を拒んだ後にボイスメモを開く | 録音を押す前から「マイクが許可されていません。ブラウザの設定から許可してください」が出る |
| 情報の画面(ℹ)を開く | 今の12行の後に、例えば「音声合成 対応」「マイクの許可 拒否」が出る |

ログに出す事: 一覧に無い名前を渡した時だけ、`「<名前>」は対応の一覧にありません`(エラー)。対応する・しないのログは、ツールが書く。

### 2.4 処理方式

- 置き場所: `common/env.js`(`window.Env`)。
- 許可の確認は、ブラウザの Permissions API(`navigator.permissions.query`)を使う。無いブラウザ・その名前に対応しないブラウザでは `'不明'` を返す。その時ツールは、今どおり開いてみて判断する。
- 名前は日本語にする(情報の画面にそのまま出すため。ボタンの `data-log` と同じ考え方)。

## 3. 詳細設計

### 3.1 プログラム構成

| ファイル | 変える事 | 行数の目安 |
| --- | --- | --- |
| `common/env.js` | 機能の表、`Env.supports`、`Env.permissionOf`、`Env.rows()` に確かめた物を足す | +50 |
| `tools/text-to-speech/text-to-speech.js` | `'speechSynthesis' in window` を `Env.supports('音声合成')` に | 数行 |
| `tools/step-counter/step-counter.js` | `'wakeLock' in navigator` を `Env.supports('スリープ防止')` に | 数行 |
| `tools/voice-memo/voice-memo.js` | 開いた時に `Env.permissionOf('マイク')` を確かめ、拒否なら案内を出す。`window.MediaRecorder` を `Env.supports('録音')` に | +8 |
| `tests/core/env.test.js` | T-01〜T-04 | +40 |
| `docs/design/env.md`・`docs/common.md` | 公開する関数を足す | 数行 |

### 3.2 部品の仕様

| 関数 | 返す物 | 例 |
| --- | --- | --- |
| `Env.supports(名前)` | 真偽 | `Env.supports('音声合成')` → `true` |
| `Env.permissionOf(名前)` | Promise<`'許可済み'` / `'拒否'` / `'未確認'` / `'不明'`> | `await Env.permissionOf('マイク')` → `'拒否'` |

`Env.supports` の名前と確かめ方:

| 名前 | 確かめ方 | 今使っているツール(例) |
| --- | --- | --- |
| 音声合成 | `'speechSynthesis' in window` かつ `'SpeechSynthesisUtterance' in window` | 読み上げ・小説読み上げ・OCR |
| 音声の処理 | `window.AudioContext` か `window.webkitAudioContext` | メトロノーム・ピアノ・DJ |
| AudioWorklet | `typeof AudioWorkletNode !== 'undefined'` | DJ Pro・ボイスチェンジャー |
| 録音 | `typeof MediaRecorder !== 'undefined'` | ボイスメモ |
| カメラとマイク | `navigator.mediaDevices` と `getUserMedia` がある | (`ToolKit.media.open` の中) |
| 位置 | `'geolocation' in navigator` | サイクルメーター・天気 |
| スリープ防止 | `'wakeLock' in navigator` | 歩数計・ファイル転送 |
| 共有 | `typeof navigator.share === 'function'` | |
| クリップボード | `navigator.clipboard` と `writeText` がある | (`ToolKit.copyText` の中) |
| 振動 | `typeof navigator.vibrate === 'function'`(`Env.canVibrate()` と同じ) | |
| 傾きセンサー | `typeof DeviceOrientationEvent !== 'undefined'` | 水準器・方位磁針 |
| モーションセンサー | `typeof DeviceMotionEvent !== 'undefined'` | 歩数計 |
| 明るさセンサー | `'AmbientLightSensor' in window` | 照度計 |

`Env.permissionOf` の名前: カメラ(`camera`)、マイク(`microphone`)、位置(`geolocation`)。返す文は Permissions API の `granted` / `denied` / `prompt` を、それぞれ `'許可済み'` / `'拒否'` / `'未確認'` にした物。

### 3.3 データ設計

`env.js` の中に持つ物(外には出さない):

| 名前 | 中身 |
| --- | --- |
| `FEATURES` | 名前 → 確かめる関数 の表(3.2) |
| `PERMISSIONS` | 名前 → Permissions API の名前 |
| `checked` | そのページで確かめた名前と結果(情報の画面用)。`{ 名前: '対応' / '非対応' }` と `{ '<名前>の許可': 状態 }` |

### 3.4 処理の流れ

1. ツールが `Env.supports('音声合成')` を呼ぶ → 表の関数で確かめ、結果を `checked` に覚えて返す。
2. ツールが `Env.permissionOf('マイク')` を呼ぶ → `navigator.permissions.query({ name: 'microphone' })`。失敗・無い時は `'不明'`。結果を `checked` に覚えて返す。
3. 情報の画面を開く → `Env.rows()` が今の12行の後に `checked` の行を足す。

## 4. 制限事項と試験

### 4.1 制限事項

- Permissions API でカメラ・マイクを確かめられるかは、ブラウザと版で違います。Chrome は対応、Safari は 16 以降で対応しています。Firefox は版によって対応しない事があり、その時は `'不明'` になります(要確認)。
- iPhone の Safari は、許可を「毎回確認」にしていると、拒否した後も `'未確認'` を返すことがあります(要確認)。そのため `'拒否'` の時だけ先に案内し、ほかの時は今どおり開いてみて判断します。
- 機能が「ある」ことと「動く」ことは違います。例えば、音声合成があっても日本語の声が無い端末があります。そこは今どおりツールが確かめます。

### 4.2 試験

| 番号 | 要件 | 方法 |
| --- | --- | --- |
| T-01 | R-01 | Node の試験(`tests/core/env.test.js`): 機能を置いた窓・置かない窓で `true` / `false` |
| T-02 | R-02 | Node の試験: 一覧に無い名前で `false` とエラーのログ |
| T-03 | R-03 | Node の試験: `permissions.query` の偽物で `'拒否'` など、無い時に `'不明'` |
| T-04 | R-04 | Node の試験: 確かめた物だけ `Env.rows()` に足される |
| T-05 | R-01, R-03 | 画面の試験(smoke): 試すツール3つが、今と同じに開ける |
| T-06 | R-03 | 実機: マイクを拒否した後にボイスメモを開き、押す前に案内が出る(iPhone と Android) |

## 5. 決めてほしいこと

- Q1 関数が引き受ける所: 決定(2026-11-08)。真偽を返すだけ。文とログはツールが書く。
- Q2 許可の確かめに使う所: 決定(2026-11-08)。拒否済みを先に知らせる。
- Q3 情報の画面に出す物: 決定(2026-11-08)。そのツールが確かめた物だけ。
- Q4 進め方: 決定(2026-11-08)。読み上げ・歩数計・ボイスメモで試し、ほかは手を入れる時に移す。
