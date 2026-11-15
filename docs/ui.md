---
type: Guide
title: "画面の決まり"
description: "配色・ヘッダ・設定シート・ボタン・アイコンを作る時"
tags: ["見た目", "配色"]
status: stable
resource: "common/site.css"
---

# 画面の決まり(配色・ヘッダ・設定シート・ボタン・アイコン)

新しいツールは `node scripts/new-tool.js` でひな形を作ると、ヘッダや読み込み順はこの決まりどおりになります。

## 配色(Material 3 の標準の色、2026-11-15)

全ツールで同じ色の名前(トークン)を使い、ツールごとの色は作りません。色は M3 の役割の名前で書きます。値の一覧は [design/m3-expressive.md](./design/m3-expressive.md) の 3.2 です。

| 役割 | トークン | 使う所 |
| --- | --- | --- |
| 主 | `--primary` / `--on-primary` | 主なボタン、進み具合、選択中 |
| 主の容器 | `--primary-container` / `--on-primary-container` | 目立たせたい面(知らせ・時間切れ)、浮かぶボタン |
| 第二の容器 | `--secondary-container` / `--on-secondary-container` | 補助のボタン、選んだ札、タグ |
| 第三 | `--tertiary` / `--on-tertiary` | もう一方の状態(止める・休憩) |
| 面 | `--surface` / `--on-surface` | 地と文字 |
| 容器 | `--surface-container-low` / `--surface-container` / `--surface-container-high` | シート / カード・ヘッダ / メニュー・キー |
| 弱い文字 | `--on-surface-variant` | 説明・件数など。面と容器の上で 4.5 以上 |
| 輪郭 | `--outline` / `--outline-variant` | 枠線 / 区切り |
| エラー | `--error` / `--on-error` | 危ない操作だけ |

- 古い名前(`--func` `--accent` `--fn-bg` `--panel` `--bg` `--text` `--sub` `--danger`)は、M3 の役割の別名として残っている(`--func` = 主、`--accent` = 第三、`--fn-bg` = 第二の容器、`--panel` = 容器(低))。新しく書く css は M3 の名前を使い、古い名前のツールは手を入れる時に移す。
- ヘッダは容器の色(`--surface-container`)で、ツールごとに変えない。ダークの値を固定色で置き換えない。
- ツール独自のトークン(`--progress` など)は `<slug>.css` の `:root{}` に、M3 のトークンから作る(固定の色にしない)。
- 2つの状態があるツール(ポモドーロの作業と休憩)は、動いている方に `--primary`、もう一方に `--tertiary`。

## 形と動き(Material 3 Expressive、2026-11-15)

- 角の丸さは段階のトークンだけを使う: `--shape-extra-small` 4px・`--shape-small` 8px・`--shape-medium` 12px・`--shape-large` 16px・`--shape-large-increased` 20px・`--shape-extra-large` 28px・`--shape-extra-large-increased` 32px・`--shape-extra-extra-large` 48px・`--shape-full`。
- 目安: ボタンと札は `--shape-full`(札は `--shape-small` も可)、カード `--shape-large`、大きな容器とシート `--shape-extra-large`、メニュー `--shape-large`。
- ボタンは押している間 角を小さくし(まる → `--shape-medium` くらい)、`transition: border-radius var(--motion-spatial-fast)` でばねのように戻す。`transform: scale()` で縮める押し方はやめる。
- 動きのトークン: `--motion-spatial-fast`(押した時の形)、`--motion-spatial-default`(シート・位置)、`--motion-effects-fast`(色)。
- 主なボタンは大きくする(2026-11-15、全ツール)。`.pill.primary` は `tool.css` が高さ 56px 以上・文字 16px にする(`.small` は除く)。丸い主なボタンは、開始・録音などいちばん大事な1つが 96px、撮影(シャッター)が 80px、再生が 72〜80px。描く場所を広く取るツール(お絵かきの道具の列)は、ツールの css で外してよい。
- 利用者が選ぶ色(時計の文字色、お絵かきの色)は中身なので、テーマに合わせない。
- ライトは `:root`、ダークは `:root[data-theme="dark"]`。`prefers-color-scheme` は使わない(テーマは `site.js` が時刻で決める)。

### 例外: DJ の機械の画面(2026-11-08 決定、2026-11-12 に移した)

DJ の機械を写す画面(暗い地、A ミント・B 琥珀)の例外は、DJターンテーブル Pro と DJデッキを [Toolbox Pro](https://github.com/kougin-amamn/toolbox-pro) へ移した時に、一緒に移した。smartools には、この例外を使う画面は無い。

## 押す所と動き(2026-11-14、docs/concept-review.md の A-2・A-3)

- ヘッダのボタン(`.dbg-btn`)は、絵 22px のまま、押せる範囲を高さ 44px・幅 38px にする(`site.css`)。ヘッダの高さと題名の幅は変えない。
- 端末で「動きを減らす」にしている人には、`site.css` が切り替えの演出(CSS の animation・transition)を止める。時間切れの点滅など意味のある動きは、ツールの css で、止めた時の代わり(色のままにする等)を書く(例: キッチンタイマー)。canvas などで描く時間・進み具合は止めない。

## ヘッダ

HTML に書くのは アイコン・名称だけ(ひな形どおり)。ツールの見出しに英名は出さない(多言語化で英語の画面があるため。2026-11-15。ランチャーは英名を残す)。実行時の並びは次のとおり。

戻るボタン(tool-kit.js)・名称・設定の歯車(設定シートがあるツール)・環境情報(site.js)・カラーテーマ(site.js)・テーマ・デバッグ

- 設定の歯車のほかは自動で入るので、HTML に書かない([design/page-base.md](./design/page-base.md))。
- 埋め込み表示(`?embed=1`)ではヘッダを隠す。
- ツールのページでは、ヘッダは初め隠れていて、右上のつまみで出す(2026-11-15。[design/page-base.md](./design/page-base.md))。本文の上の端にも余白を取り、つまみと重ならないようにする。

## 設定シート(設定が多いツール)

見た目や音の設定(色・字体・大きさ・スライダー・切り替え)が多いツールは、下から出るシートにまとめて主画面を広く使う(アナログ時計・デジタル時計・ピアノ・マルチカメラ)。主な操作(シャッター・モード・録音・描く道具)は画面に残す。`tool-kit.js` が `#setBtn` と `#settings` を見つけると自動で開閉とログを付ける。

```html
<!-- ヘッダ: h1 の直後 -->
<button class="dbg-btn" id="setBtn" aria-label="設定" title="設定"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg></button>

<!-- </main> の直後 -->
<div class="sheet" id="settings" hidden>
  <div class="sheet-panel" role="dialog" aria-modal="true" aria-labelledby="settingsTitle">
    <div class="sheet-head"><span id="settingsTitle">設定</span><button class="sheet-close" id="settingsClose" aria-label="設定を閉じる">×</button></div>
    <!-- 設定の部品 -->
  </div>
</div>
```

シートの中に2つ目の「設定」の見出しは置かない。

## ツールの CSS

- `common/tool.css` は全ツール共通の物だけ(ページの土台、`.content` / `.app` の並べ方、`.status`、`.pill` / `.pill.primary` / `.round`、`.note`、`.time`、設定シート、戻るボタン)。余白・間隔・最大幅は持たないので、各ツールの CSS で決める(ひな形に入っている)。
- `tool.css` にある物を `<slug>.css` で繰り返さない。違う所だけ上書きする。
- 画面いっぱいに広げる(canvas など)時は、`.content` に `align-items: stretch`、`.app` と表示部に `flex: 1; min-height: 0`。
- `env(safe-area-inset-*)` を守る。ボタンは `.pill` / `.pill.primary` / `.pill.small`。主なボタンは `var(--func)` と `var(--func-fg)`、面は `var(--panel)`、補助は `var(--fn-bg)`、危ない操作は `var(--danger)`。
- 利用者が本物らしい見た目(レコード盤・金属の縁)を求めた時だけ、ツールの中身の範囲で固定の色を使ってよい。
- `font:` の短縮形で字体に `inherit` は使えない(大きさが消える)。`font-size` などを別々に書く。

## ボタンの文字と絵

- 分かりやすい文字があれば文字。無い時や頼まれた時は SVG(`currentColor`)。タイマーの開始・一時停止・停止・リセット、カウンター、元に戻す・やり直しは SVG の絵が好み。オンオフの切り替え(ライト)は電源の絵。
- 絵だけのボタンには `aria-label` を付ける(自動ログの名前にもなる)。

## アイコン

64×64、角丸 `rx="16"` の地を `#4a4e7a`(ライトもダークも同じ。M3 の色に合わせるかは [design/m3-expressive.md](./design/m3-expressive.md) の段 2 で決める)にし、**平らな色付きの絵**を 24×24 の枠に描く。白い線画にはしない。**右下のミントの丸(バッジ)は付けない。**

```svg
<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
  <rect width="64" height="64" rx="16" fill="#4a4e7a"/>
  <g transform="translate(9.6 9.6) scale(1.867)">
    <!-- 24x24 の枠に色付きの絵 -->
  </g>
</svg>
```

絵の色(グラデーションなし): 明るい `#e9ecf5`、白 `#ffffff`、暗い `#2f3550`、中間 `#8a90b8`、赤 `#ff6b6b`、黄 `#ffd43b`、橙 `#ff9f43`、緑 `#51cf66`、青緑 `#20c997`、青 `#4dabf7`、藍 `#5c7cfa`、桃 `#f06595`、紫 `#cc5de8`、木 `#c08552`。枠いっぱいに描き、20px(ヘッダの大きさ)で見分けられるか確かめる。
