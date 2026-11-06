# 名前の付け方

このサイトのコードで使う名前の決まりです。新しく書くコードと、手を入れたコードに当てはめます(古いコードを名前のためだけに書き換えることはしません)。

## 決まり

| 対象 | 形 | 例 |
| --- | --- | --- |
| ファイル・フォルダ | 小文字のケバブケース。ツールの部品は `<slug>-<役割>` | `file-transfer-core.js`, `image-classifier-labels.json` |
| 関数 | 小文字始まりのキャメルケース。**動詞から始める** | `startCamera`, `loadModel`, `renderPlaylist` |
| 値を取り出すだけの関数 | `名詞 + Of`(何の何かが読める形) | `nameOf(el)`, `iconOf(tool)`, `posOf(id)` |
| 真偽を返す関数・真偽の変数 | `is` / `has` / `can` で始める | `isReady`, `hasCamera`, `canShare` |
| 変数 | 小文字始まりのキャメルケース。中身を表す名詞 | `queue`, `sending`, `lastSeen` |
| 定数(設定値・表・メッセージ) | 大文字のスネークケース | `CHUNK`, `T_CONNECT`, `MSG`, `STORE` |
| 共通の公開名(`window` に出す物) | パスカルケースか短い1語。ツール間で重ねない | `ToolKit`, `TransferCore`, `log` |
| CSS のクラス・id | クラスはケバブケース、id はキャメルケース | `.site-bar`, `#sendBtn` |

## 略さない

- 関数名と公開する名前は略さずに書きます。読む人が意味を推測しなくて済むようにするためです。例: `format`(`fmt` ではなく)、`percent`(`pct` ではなく)、`random`(`rng` ではなく)。
- 例外として、広く通じる短い名前だけは使ってよいことにします。

| 使ってよい略 | 意味 |
| --- | --- |
| `i`, `j`, `n` | ループの番号・個数 |
| `e` | イベント・エラーの引数 |
| `el` | DOM の要素 |
| `ctx` | canvas の描画コンテキスト |
| `id`, `url`, `json`, `css` | そのままの意味 |
| `ms`, `px`, `kb` | 単位(値の単位が名前で分かるように) |
| `$` | `document.getElementById` の短縮(各ツールの中だけ) |
| `C` | そのツールの core(`var C = window.TransferCore`) |

## 既にある略

古いコードには `fmt`, `pct`, `rng`, `val`, `prmOf`, `pad2`, `rr`, `wf` などの略が残っています。そのファイルに手を入れる時に、合わせて直します。
