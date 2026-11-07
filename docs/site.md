# サイトの構成(フォルダ・読み込み順・一覧・ランチャー・公開)

## フォルダ

```
(リポジトリの根 = サイトの根)
├── index.html / index.css / index.js   一覧ページ(icons/app-icon-home.svg)
├── index-data.json       ツールの一覧(これだけが一覧の元)
├── og-image.png          共通の OGP 画像(1200×630)
├── wrangler.jsonc / .assetsignore   Cloudflare の公開設定(公開しない)
├── common/               共通部品(ここにだけ置き、ツールにコピーしない)
│   ├── log.js            全ページ・最初に読む: ログ・log.step・押下の自動ログ
│   ├── env.js            全ページ: 端末・ブラウザ・接続の判定(window.Env)
│   ├── site.css / site.js / themes.json   全ページ: 配色・ヘッダ・テーマ・カラーテーマ・環境情報・デバッグ画面
│   ├── tool.css / tool-kit.js             ツールだけ: 土台・ToolKit・設定シート・戻るボタン
│   └── device.js         ツールだけ: 端末の機能(tool-kit.js が読む。HTML に書かない)
├── tools/<slug>/         ツールごと(slug は英小文字とハイフン)
│   ├── <slug>.html / .css / .js / app-icon-<slug>.svg
│   ├── <slug>-core.js    DOM を使わない計算(Node で試す。ある時だけ)
│   └── <slug>-<役割>.js / <slug>-data.json(要る時だけ)
├── launchers/            ツールを呼ぶ画面(3D本棚・3D美術館・デスクトップ風)と launcher-common.js
├── docs/                 文書(公開しない)
├── tests/                試験(公開しない)
└── scripts/              道具とひな形(公開しない)
```

- ツールは `../../common/<ファイル>` と、自分の `./ファイル` だけを参照する。`../` は common とサイトの根(`index-data.json`・`og-image.png`)にだけ使い、ほかのツールのフォルダには入らない(サブフォルダに置いても動くように相対パスにする)。
- 大きくなって役割が混ざったら `<slug>-<役割>.js` に分ける(ピアノは `piano-core.js` と `piano.js`)。変わるデータ(一覧・辞書)は JSON にして fetch する。ブラウザが自分で読むファイル(AudioWorklet・Web Worker)も別ファイル。

## 読み込み順(ひな形どおり)

`<head>`: `site.css` → `tool.css` → `<slug>.css`

`<body>` の最後: CDN のライブラリ → `log.js` → `env.js` → `site.js` → `tool-kit.js`(→ `device.js` を自分で読む)→ 読み込み確認 → core・データ → `<slug>.js`

ランチャーと一覧ページは `log.js` → `env.js` → `site.js`(tool-kit.js は読まない)。

読み込み確認(ひな形にある `(window.ToolKit && window.ToolKit.media) || …`、ランチャーと一覧は `window.log || …`)は、共通ファイルが読めない時(スマホでファイルを直接開いた時など)に画面の先頭へ案内を出すだけ([design/page-base.md](./design/page-base.md))。ヘッダのテーマ・デバッグ・カラーテーマ・環境情報のボタンは `site.js` が足すので HTML に書かない。

## 一覧(index-data.json)

1行1ツールの JSON(JS に埋め込まない)。新しいツールは自分の分類の並びに1行足す。

```json
{"cat": "定番ツール", "slug": "calculator", "title": "電卓", "en": "Calculator", "desc": "一言説明"}
```

- `en` は英名(ld+json の `alternateName` の1番目と同じ)。`tags` は任意(無ければ書かない)。`href` / `icon` は省くと `tools/<slug>/<slug>.html` と `tools/<slug>/app-icon-<slug>.svg`。
- タグ: `要 カメラ` / `要 マイク` / `要 位置情報` / `要 センサー` / `要 https` / `要 外部通信`、ほかに短い注意書き。**「オフライン可」は付けない**(オフラインは目標にしない)。
- 分類(この順): 定番ツール / センサー・カメラ活用 / QR・共有 / メディア / 情報・言語・テキスト / デザイン / 診断・開発
- 一覧ページは分類ごとに出てきた順に並べ、カードに名称・英名・説明・タグを出す(カードは `data-log` に名称)。描画の作りは変えない。

## head と SEO

ひな形の `{{…}}` を埋める。説明は70〜120字で機能と特徴を具体的に、meta・og・ld+json の3か所を同じにする。機能が変わったら3か所とも直す。別名(日本語・英語)を title・説明・`alternateName` に入れる。オフライン対応はうたわない。

## ランチャー

- `launcher-common.js` だけが一覧とツールの場所を知っている(`ROOT='../'`)。一覧のアイコンは `Launcher.markEl(tool)`(SVG、読めない時は文字)を使い、自分で描かない。3D の質感とデスクトップのアイコン名は日本語名だけ(`nameOf`)。
- 各ランチャーは開いた時に `localStorage['launcher-return'] = {href, title}` を保存し、ツールの戻るボタン(tool-kit.js)がそこへ戻る。title は h1 の日本語の部分だけ。ツールに個別の戻るボタンやリンクを足さない。
- 操作ログは自動(一覧のパネルは `data-log-group="一覧"`、一覧のリンクは `data-log=<名前>`)。手で書くのはキー操作・3D のタップ・デスクトップのメニュー項目だけ。h1 にも英名(3D Bookshelf Launcher / 3D Museum Launcher / Desktop-style Launcher)。
- デスクトップ風ランチャーはアイコンの位置とフォルダ(`folders: [{id, name, tools: [slug…]}]`、1ツールは1フォルダまで)を `launcher-desktop-core.js` で localStorage に保存する。
- 3D 本棚の部屋の照明(天井・机のアームライト・フロアランプ)はタップで点く。新しくタップできる物は `userData.kind` を付けて `extraPicks` に入れ、`onThing` で受ける。
- ランチャーのファイル名を変える時は localStorage のキー(`launcher-museum-state` など)を変えず、古いファイルをサーバーから消すよう伝える。
- ダッシュボード(`launchers/dashboard.html`)は削除した。作り直さない。

## 公開

- リポジトリ `kougin-amamn/smartools` の `main` に push すると、Cloudflare(Workers の静的配信、`wrangler.jsonc`)が公開する。Cloudflare 側は利用者が設定した(Workers & Pages → GitHub → `smartools`、`npx wrangler deploy`)。
- 公開しない物は `.assetsignore` に書く(`docs`・`tests`・`scripts` など)。
