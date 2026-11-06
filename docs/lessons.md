# ブラウザと端末の注意(作る前に読む)

実際につまずいたことの記録です。関係する項目だけ読めば足ります。

## 共通

- **`file://` は対象外。** スマホでファイルを直接開くと `common/` も JSON も読めない。手元では `python3 -m http.server 8000 --bind 127.0.0.1` でサイトの根を配信し、`http://127.0.0.1:8000/` を開く(安全な接続として扱われる)。Android は Termux で同じことができる。LAN のアドレス(`192.168.x.x`)は安全な接続にならない。localStorage はアドレスごとに別(https・127.0.0.1・localhost で共有しない)。
- **カメラ・マイク・位置情報・センサー・WebRTC・クリップボードは https が必要。** `Env.requireSecure('用途')` で確かめる(`ToolKit.media.open` は中で確かめている)。
- **CDN のアドレスは検索で確かめてから使う**(版番号まで固定)。以前、間違ったアドレスで読めなかったことがある。
- ツールの複数の `<script>` は同じ場所に名前を置くので、関数名を重ねない。`typeof null === 'object'` に注意。
- **最初の読み込みが遅い物**(AI のモデル・PDF.js・大きなライブラリ・曲全体の展開)は、進み具合と所要時間をログと画面に出す。長い音声はメモリを大きく使う(5分のステレオで約100MB)ので注意書きに書く。
- Claude のプレビュー(Artifact)は4つの CDN の `<script>` 以外の通信を止めるので、外の API やモデルを使うツールは動かない。
- 開発環境(Claude の作業場所)からは CDN と npm に届かない。ライブラリを使う所は偽物(`tests/stubs/`)で試し、未確認と伝える。

## iPhone(Safari)

- 任意の要素の全画面表示(`requestFullscreen()`)が無い。CSS(`position: fixed; inset: 0; z-index: 1000`)と閉じるボタンで代わりにする。
- 振動(`navigator.vibrate`)が無い。`ToolKit.vibrate` が無視するので、振動できるとは書かない。
- iPadOS 13 以降の Safari は UA が Mac と同じ(`Env` がタッチで見分ける)。
- 映像を隠す時に `display: none` にすると、映像が止まることがある。1px・`opacity: 0` で残す。

## カメラ・ライト

- 開いている映像を閉じてから次を開く(閉じないと NotReadableError)。
- ライト(トーチ)はカメラごとに対応が違う機種がある(Galaxy Tab など)。後ろのカメラから順に探し、使えたカメラの deviceId を localStorage に覚えて次から速くする。
- 元の映像と、重ねて描く物は分けて持つ。トーンを変えた結果を、次の計算の元にしない。
- **WebGL のカメラ効果**(魚眼カメラ参照): 毎フレーム映像を WebGL のテクスチャに描き、canvas だけを見せる。`preserveDrawingBuffer: true`(撮影のため)、CLAMP_TO_EDGE(映像の大きさが2の累乗でない)。`getContext('webgl')` が null の時は案内と `log.warn`。歪みの計算はシェーダーと同じ式を `<slug>-core.js` にも置いて Node で試す。

## センサー

- 照度センサー(`AmbientLightSensor`)はほぼ使えない。カメラの明るさで代わりにするが、自動露出があるので明るさだけでは lux にならない。露出時間(`exposureTime`、100µs 単位)と ISO が取れる端末(一部の Android Chrome)だけ lux の目安を出し、既知の明るさで合わせる係数を保存する。取れない時は相対の % にして理由を出す。
- 磁気センサーは Android Chrome のフラグ(`#enable-generic-sensor-extra-classes`)の奥にしか無く、iPhone には無い。ツールに書く。
- iOS 13 以降の傾き・動きのセンサーは、タップの中で許可を求める(`ToolKit.sensor.permit`)。

## 音

- **逆再生・スクラッチ・自由な速さ**(DJ ターンテーブル参照): AudioBufferSourceNode では逆に回せないので、AudioWorklet で自分でサンプルを読む。エンジンは `<slug>-worklet.js` に置き、`registerProcessor` があれば登録、無ければ Node 用に書き出す。`audioWorklet.addModule('./<slug>-worklet.js')` で読み(https か 127.0.0.1 が必要)、展開した音は `getChannelData(c).slice()` の Float32Array を渡して元を手放す。
- 対応の確認は `'audioWorklet' in AudioContext.prototype && typeof AudioWorkletNode !== 'undefined'`。`hasOwnProperty` だと BaseAudioContext にあるため見落とし、ツールが黙って動かなくなる(画面で動かすまで気付かなかった)。
- AudioContext はタップの中で作って `resume()`。`decodeAudioData` は AudioContext の周波数に合わせ直す。絵は worklet が知らせる再生位置(約30回/秒と止まった時)で動かし、音とずれないようにする。
- Playwright で音を確かめる時は、`createGain` を包んで AnalyserNode につなぎ、RMS を読む。

## 描画・操作

- **お絵かき**(ペイント参照): canvas に `touch-action: none` と pointer capture。点の中点を `quadraticCurveTo` でつなぎ、`getCoalescedEvents()` で細かく拾う。座標は `getBoundingClientRect()` から換算(見た目と中の画素数が違う)。中の大きさは長い辺 2048px まで。塗りつぶしは色の許容(約40)が無いと縁が残る。元に戻すの履歴は ImageData を持ち、件数ではなく合計のバイト数で制限する。
- 指で回す SVG(レコード盤)は、SVG に `touch-action: none`、当たり判定に pointer capture、角度の差は ±180° に直す(横の軸を越えた時に跳ばないように)。
- 何周も回る回転は CSS の transition では遠回りしない。`requestAnimationFrame` で `transform` を書く。

## 文字

- 文字コードは自動判定: BOM を先に見て UTF-16、次に UTF-8、だめなら Shift_JIS(UTF-16 を UTF-8 より先に見る)。

## ランチャー

- `launcher-common.js` で読み込み時に `document` や `localStorage` に触る所は `if (typeof document !== 'undefined')` で囲む(Node の試験が読み込むため)。
- 3D ランチャーは three.js を CDN から読むので、開発環境では画面で動かせない。`node --check` だけにし、変更は小さくし、画面で確かめていないと伝える。
