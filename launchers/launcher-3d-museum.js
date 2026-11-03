/* ミュージアムランチャーの画面と操作。絵画をタップで正面へ、もう一度タップでツールを開く。
   カテゴリが2つ以上なら入口ホールから展示室に入る。3Dは -textures / -scene、計算は -core */
(function () {
  'use strict';
  if (!window.Launcher) return; /* launcher-common.js が無い時は、ページ末尾の確認でファイル名を表示する */
  var L =
    window.Launcher; /* 共通(launcher-common.js): 一覧の読み込み・リンク・開いた回数・読み込み中の表示 */
  L.loading(30, 'ツールの一覧を読み込んでいます…');
  L.run(main);

  /* 本体(list=ツール一覧 / source=読んだファイル名 / loadMsg・loadErr=読めなかった時の説明) */
  function main(list, source, loadMsg, loadErr) {
    var core = window.MuseumCore;
    if (!core) {
      L.showMissing(L.missingParts({ MuseumCore: 'launcher-3d-museum-core.js' }));
      return;
    }
    var $ = function (id) {
      return document.getElementById(id);
    };

    /* データ */
    var tools = (list || []).slice();
    var N = tools.length;
    var hrefOf = L.hrefOf,
      iconOf = L.iconOf,
      markOf = L.markOf,
      nameOf = L.nameOf;
    function pad2(n) {
      return String(n).padStart(2, '0');
    }

    /* 利用状況(localStorage: base=初回訪問時の一覧 / viewed=見たツール。開いた回数は全モード共通の L.usage) */
    var STATE_KEY = 'launcher-museum-state';
    var state = { base: null, viewed: {}, usage: {} };
    (function loadState() {
      try {
        var raw = localStorage.getItem(STATE_KEY);
        if (raw) {
          var o = JSON.parse(raw);
          if (o && typeof o === 'object') {
            if (o.base && typeof o.base === 'object') state.base = o.base;
            if (o.viewed && typeof o.viewed === 'object') state.viewed = o.viewed;
          }
        }
      } catch (e) {
        log.warn('保存済みの利用状況を読み込めませんでした(初期状態で始めます)', e);
      }
    })();
    state.usage = L.usage.all(); /* 開いた回数(全モード共通) */
    function saveState() {
      try {
        localStorage.setItem(STATE_KEY, JSON.stringify({ base: state.base, viewed: state.viewed }));
      } catch (e) {
        log.warn('利用状況を保存できませんでした', e);
      }
    }
    if (!state.base) {
      state.base = {};
      tools.forEach(function (t) {
        state.base[t.slug] = 1;
      });
      saveState();
    }
    function isNewTool(t) {
      return core.isNew(t, Date.now(), state, 30);
    }
    function favTools() {
      return core.topFavorites(tools, state.usage, 2, 4);
    }
    function isFav(t) {
      return favTools().indexOf(t) >= 0;
    }

    /* 定数 */
    var FRAME_STYLE = 'black';
    var ART = {
      size: 3.2,
      ratio: 0.75,
      centerY: 5.3,
    }; /* 絵のサイズ。壁の余白(ネガティブスペース)は残しつつ、部屋が寂しく見えない大きさ */
    var FOV = 55,
      EYE = 3.9,
      HOME_Y = 4.0;
    var FONT = '"Hiragino Sans","Yu Gothic","Noto Sans JP",sans-serif';
    var BRASS = 0xa89462; /* 落ち着いたシャンパン真鍮(細線・脚・照明器具のみ。額縁には使わない) */
    var MAX_SPOTS = 16; /* 通常画質: 1部屋あたり作品ごとのスポットライトの上限 */
    var MAX_PER_ROOM = 15; /* 1つの展示室に飾る最大点数(超えたら「名前 1/2」のように分ける) */
    var HALL_ID = 'hall';

    /* 画質: スマホ(タッチ操作で短辺600px未満)は自動で軽量モード。URLに ?q=low / ?q=high で強制できる
       軽量モード: 解像度の上限1.5倍・アンチエイリアスなし・スポットは3灯だけ(視線の先の作品へ付け替え)・補助光2灯・面取りは1段 */
    function isPhone() {
      var touch = (navigator.maxTouchPoints || 0) > 0 || 'ontouchstart' in window;
      return touch && Math.min(screen.width, screen.height) < 600;
    }
    var qm = /[?&]q=(low|high)\b/.exec(location.search);
    var LOW = qm ? qm[1] === 'low' : isPhone();
    var MAX_DPR = LOW ? 1.5 : 2,
      LOW_SPOTS = 3;
    var THEME = {
      /* floor / wain は木目テクスチャに掛ける色味(白=そのまま)。trim は腰壁・梁・モールディングの木材色。
       ambient=全体の底上げ / point=天井の補助光 / spot=作品ごとの照明 / wash=壁に重ねる光だまりの加算 */
      light: {
        pass: 0xd8d6d2,
        passCeil: 0xc8c6c2,
        bg: 0xd8d6d2,
        wall: 0xf6f5f2,
        ceil: 0xf4f3f0,
        floor: 0xffffff,
        passFloor: 0xb8b2aa,
        trim: 0x7d6a58,
        wain: 0xcfc4ba,
        bench: 0x5a2f33,
        sky: 0xfff0d4,
        frame: 0xffffff,
        ambient: 0.46,
        point: 0.2,
        spot: 0.8,
        wash: 0.05,
      },
      dark: {
        pass: 0x6a6967,
        passCeil: 0x4a4947,
        bg: 0x18181a,
        wall: 0x3e3d3b,
        ceil: 0x2e2d2c,
        floor: 0x7a7470,
        passFloor: 0x5a5652,
        trim: 0x5a4636,
        wain: 0xc4b4a6,
        bench: 0x4a2a2c,
        sky: 0xb8a588,
        frame: 0xe2d8ca,
        ambient: 0.44,
        point: 0.3,
        spot: 1.05,
        wash: 0.12,
      },
    };

    /* 部屋の定義(カテゴリが2つ以上ならホール+展示室、1つなら従来の1部屋) */
    var groups = core.groupByCat(tools, MAX_PER_ROOM);
    var HALL_MODE = groups.length >= 2;
    function toolEntry(t) {
      return { kind: 'tool', tool: t };
    }
    var roomDefs = {};
    var roomIds = [];
    if (HALL_MODE) {
      groups.forEach(function (g, gi) {
        var counts = core.roomCounts(g.tools.length);
        roomDefs['c' + gi] = {
          id: 'c' + gi,
          accent: null,
          title: g.cat,
          entries: g.tools.map(toolEntry),
          counts: counts,
          dims: core.roomDims(counts),
        };
        roomIds.push('c' + gi);
      });
    } else {
      var mc = core.roomCounts(N);
      roomDefs.main = {
        id: 'main',
        title: '',
        entries: tools.map(toolEntry),
        counts: mc,
        dims: core.roomDims(mc),
      };
      roomIds.push('main');
    }
    /* ホール: 左=新着 / 奥=展示室への入口 / 右=よく使う(どちらも無ければ入口だけを3面に分ける)。状態が変わったら作り直す */
    /* 展示室のバナーの色(落ち着いた美術館の幕の色) */
    var BANNER_COLORS = [
      '#3d4270',
      '#2f6f6a',
      '#9a4f3a',
      '#a8842f',
      '#6a4366',
      '#3f5f80',
      '#5f6b3a',
      '#7a3343',
    ];
    function hallDef() {
      var newList = tools
        .filter(isNewTool)
        .sort(function (a, b) {
          return String(b.added || '').localeCompare(String(a.added || ''));
        })
        .slice(0, 4);
      var favList = favTools();
      var doors = groups.map(function (g, gi) {
        return {
          kind: 'door',
          cat: g.cat,
          roomId: 'c' + gi,
          count: g.tools.length,
          no: pad2(gi + 1),
          tools: g.tools.slice(0, 4),
          color: BANNER_COLORS[gi % BANNER_COLORS.length],
        };
      });
      /* 入口は1面に2つまで(奥→左→右の順に2つずつ、それ以上は順に足す)。左の壁は新着の後ろ(奥寄り)に、右の壁はよく使うの前に入口 */
      var ds = core.doorSplit(doors.length),
        di = 0;
      var back = doors.slice(di, (di += ds[1])),
        left = doors.slice(di, (di += ds[0])),
        right = doors.slice(di, (di += ds[2]));
      var L = newList.map(toolEntry).concat(left),
        R = right.concat(favList.map(toolEntry));
      var entries = L.concat(back, R),
        counts = [L.length, back.length, R.length];
      return {
        id: HALL_ID,
        title: 'エントランスホール',
        entries: entries,
        counts: counts,
        dims: core.roomDims(counts, 18, 23),
        sig:
          newList
            .map(function (t) {
              return t.slug;
            })
            .join() +
          '|' +
          favList
            .map(function (t) {
              return t.slug;
            })
            .join(),
      };
    }

    /* 一覧(3Dが使えない時の代替も兼ねる) */
    var listPanel = $('listPanel');
    function buildList() {
      var ul = $('list');
      ul.innerHTML = '';
      tools.forEach(function (t) {
        var li = document.createElement('li'),
          a = document.createElement('a');
        a.href = hrefOf(t);
        var mk = L.markEl(t);
        var tx = document.createElement('span');
        tx.className = 'tx';
        var nm = document.createElement('div');
        nm.className = 'nm';
        nm.textContent = nameOf(t);
        var ds = document.createElement('div');
        ds.className = 'ds';
        ds.textContent = t.desc || '';
        tx.appendChild(nm);
        tx.appendChild(ds);
        a.appendChild(mk);
        a.appendChild(tx);
        li.appendChild(a);
        ul.appendChild(li);
        a.addEventListener('click', function () {
          log('一覧の「' + nameOf(t) + '」を押下しました');
          countUse(t);
        });
      });
    }
    buildList();
    $('listBtn').onclick = function () {
      log('「一覧」ボタンを押下しました');
      listPanel.hidden = false;
      log('一覧を表示しました(' + N + '件)');
    };
    $('listClose').onclick = function () {
      log('一覧の「閉じる」ボタンを押下しました');
      listPanel.hidden = true;
      log('一覧を閉じました');
    };

    /* ツールを開いた回数を記録する(「よく使う」の元になる) */
    function countUse(t) {
      var n = L.usage.count(t.slug);
      log('使用回数を記録しました(「' + nameOf(t) + '」' + n + '回目)');
    }

    function fallback(msg, err) {
      if (err) log.error(msg, err);
      else log.error(msg);
      $('gl').hidden = true;
      $('hint').hidden = true;
      $('bar').hidden = true;
      $('card').hidden = true;
      $('roomName').hidden = true;
      $('listClose').hidden = true;
      var note = $('listNote');
      note.textContent = msg + (N ? '。代わりに一覧を表示しています。' : '。');
      note.hidden = false;
      listPanel.hidden = false;
      L.loadingDone();
    }

    if (loadMsg) {
      fallback(loadMsg, loadErr);
      return;
    }
    if (!N) {
      fallback('表示するツールがありません');
      return;
    }
    var miss = L.missingParts({
      MuseumCore: 'launcher-3d-museum-core.js',
      MuseumTextures: 'launcher-3d-museum-textures.js',
      MuseumScene: 'launcher-3d-museum-scene.js',
    });
    if (miss.length) {
      fallback(L.missingMessage(miss));
      return;
    }
    if (window.__threeFailed || typeof THREE === 'undefined') {
      fallback('3D表示用のライブラリ(three.js)を読み込めませんでした(通信が必要です)');
      return;
    }

    /* three.js 初期化 */
    var stage = $('stage'),
      canvas = $('gl'),
      renderer;
    try {
      renderer = new THREE.WebGLRenderer({
        canvas: canvas,
        antialias: !LOW,
        powerPreference: 'high-performance',
      });
    } catch (e) {
      fallback('このブラウザでは3D表示(WebGL)を開始できませんでした', e);
      return;
    }
    var maxAniso = 1;
    try {
      maxAniso = Math.min(renderer.capabilities.getMaxAnisotropy(), LOW ? 2 : 8);
    } catch (e) {
      log.warn('テクスチャの異方性フィルタ上限を取得できませんでした(既定値を使います)', e);
    }

    var scene = new THREE.Scene();
    var camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 80);
    camera.rotation.order = 'YXZ';
    var dirty = true;

    /* テクスチャ・材質・形状(launcher-3d-museum-textures.js) */
    var M = window.MuseumTextures.create({
      THREE: THREE,
      core: core,
      maxAniso: maxAniso,
      LOW: LOW,
      FONT: FONT,
      BRASS: BRASS,
      markOf: markOf,
      iconOf: iconOf,
      onChange: function () {
        dirty = true;
      },
    });
    var floorTileMat = M.floorTileMat,
      passFloorMat = M.passFloorMat,
      ceilMat = M.ceilMat,
      trimMat = M.trimMat,
      frameMatV = M.frameMatV,
      frameMatH = M.frameMatH,
      benchMat = M.benchMat,
      skyMat = M.skyMat,
      passSideA = M.passSideA,
      passSideB = M.passSideB,
      passCeilMat = M.passCeilMat,
      washMat = M.washMat,
      mix = M.mix;
    var OPEN = { w: 3.4, h: 6.4, depth: 9 };
    var STAND_GAP = 7; /* 立ち位置から後ろの壁(出口)までの距離。出口が背中に迫らず、振り返った時も通路全体が見える */
    var roomWalls = [];

    /* 照明(部屋をまたいで共通)
       弱い全体光 + 天井の補助光 + 作品ごとのスポット。補助光を弱くして、スポットの当たる所と当たらない所に明暗の差をつける */
    var ambient = new THREE.AmbientLight(0xffffff, 0.46);
    scene.add(ambient);
    var points = [];
    for (var pi = 0; pi < (LOW ? 2 : 4); pi++) {
      var pl = new THREE.PointLight(0xfff4e0, 0.2, 34);
      scene.add(pl);
      points.push(pl);
    }
    function placePoints(d) {
      [
        [-d.w * 0.29, d.h - 0.9, -d.d * 0.22],
        [d.w * 0.29, d.h - 0.9, -d.d * 0.22],
        [-d.w * 0.29, d.h - 0.9, d.d * 0.28],
        [d.w * 0.29, d.h - 0.9, d.d * 0.28],
      ].forEach(function (p, k) {
        if (points[k]) points[k].position.set(p[0], p[1], p[2]);
      });
    }
    var roomSpots = []; /* 通常画質: 全部屋のスポット(部屋ごとにグループ内。見えている部屋のものだけ働く) */
    var lowSpots = [],
      lowActive = 0,
      spotKey = '';
    /* スポットは天井のダクトレールの円筒形の器具から、作品へ斜めに当てる(壁から TRACK 離れた天井近く) */
    var TRACK = 2.6,
      HEAD_DROP = 0.75;
    function placeSpot(sp, it, H) {
      sp.position.set(it.x + it.nx * TRACK, H - HEAD_DROP, it.z + it.nz * TRACK);
      sp.target.position.set(it.x + it.nx * 0.1, it.y - 0.15, it.z + it.nz * 0.1);
    }
    function newSpot() {
      return new THREE.SpotLight(0xfff0dc, 1.15, 22, 0.4, 0.6, 1.2);
    }
    if (LOW) {
      for (var li = 0; li < LOW_SPOTS; li++) {
        var ls = newSpot();
        scene.add(ls);
        scene.add(ls.target);
        lowSpots.push(ls);
      }
    }
    var curTh = THEME.light;

    /* 部屋の組み立て(初めて入る時に作り、以後は表示を切り替えるだけ) */
    var badgesBySlug = {};
    var buildRoom = window.MuseumScene.create({
      THREE: THREE,
      core: core,
      M: M,
      scene: scene,
      ART: ART,
      OPEN: OPEN,
      EYE: EYE,
      HOME_Y: HOME_Y,
      STAND_GAP: STAND_GAP,
      FRAME_STYLE: FRAME_STYLE,
      MAX_SPOTS: MAX_SPOTS,
      TRACK: TRACK,
      HEAD_DROP: HEAD_DROP,
      HALL_MODE: HALL_MODE,
      HALL_ID: HALL_ID,
      LOW: LOW,
      isFav: isFav,
      isNewTool: isNewTool,
      nameOf: nameOf,
      pad2: pad2,
      newSpot: newSpot,
      placeSpot: placeSpot,
      scene: scene,
      roomWalls: roomWalls,
      roomSpots: roomSpots,
      badgesBySlug: badgesBySlug,
    }).buildRoom;

    var rooms = {};
    function getRoom(id) {
      if (id === HALL_ID) {
        var d = hallDef();
        if (rooms[HALL_ID] && rooms[HALL_ID].sig === d.sig) return rooms[HALL_ID];
        if (rooms[HALL_ID]) scene.remove(rooms[HALL_ID].group); /* 新着・よく使うが変わったので作り直す */
        rooms[HALL_ID] = buildRoom(d);
        return rooms[HALL_ID];
      }
      if (!rooms[id]) rooms[id] = buildRoom(roomDefs[id]);
      return rooms[id];
    }

    /* テーマ */
    function applyTheme() {
      var th = THEME[document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light'];
      curTh = th;
      scene.background = new THREE.Color(th.bg);
      roomWalls.forEach(function (r) {
        r.mat.color.setHex(
          r.accent === null ? th.wall : mix(th.wall, r.accent, th === THEME.dark ? 0.34 : 0.3)
        );
      });
      ceilMat.color.setHex(th.ceil);
      passSideA.color.setHex(th.pass);
      passSideB.color.setHex(th.pass);
      passCeilMat.color.setHex(th.passCeil);
      floorTileMat.color.setHex(th.floor);
      passFloorMat.color.setHex(th.passFloor);
      trimMat.color.setHex(th.trim);
      benchMat.color.setHex(th.bench);
      frameMatV.color.setHex(th.frame);
      frameMatH.color.setHex(th.frame);
      skyMat.color.setHex(th.sky);
      ambient.intensity =
        th.ambient + (LOW ? 0.1 : 0); /* 軽量モードは補助光とスポットが少ない分、全体光で底上げ */
      points.forEach(function (l) {
        l.intensity = th.point;
      });
      roomSpots.forEach(function (s) {
        s.intensity = th.spot;
      });
      lowSpots.forEach(function (s, k) {
        s.intensity = k < lowActive ? th.spot : 0;
      });
      washMat.opacity =
        th.wash *
        (LOW ? 2.4 : 1); /* 軽量モードはスポットが3灯だけなので、残りの作品は加算の光だまりで見せる */
      dirty = true;
    }

    /* カメラ状態 */
    var cr = null; /* 今いる部屋 */
    var cur = { x: 0, y: HOME_Y, z: 2, yaw: 0, pitch: 0, zoom: 1 };
    var ZMIN = 1,
      ZMAX = 3;
    var par = { x: 0, y: 0 },
      parT = { x: 0, y: 0 };
    var tween = null,
      focus = -1,
      hover = -1;

    function applyCamera() {
      camera.position.set(cur.x, cur.y + bobY, cur.z);
      camera.rotation.set(cur.pitch + par.y, cur.yaw + par.x, 0);
      if (camera.zoom !== cur.zoom) {
        camera.zoom = cur.zoom;
        camera.updateProjectionMatrix();
      }
    }
    /* ズーム(画角を狭めて望遠にする。立ち位置は動かないので壁を突き抜けない) */
    function zoomLabel(z) {
      return z.toFixed(1) + '倍';
    }
    function setZoom(z) {
      cur.zoom = Math.max(ZMIN, Math.min(ZMAX, z));
      dirty = true;
      zoomBtn.hidden = !(focus < 0 && !tween && !switching && cur.zoom > 1.05);
    }
    /* 作品の正面に立つ姿勢。見上げず水平に見るので額縁がゆがまない。
     横長の広い画面はカードを右に出すので作品を左寄りに、縦長・狭い画面はカードを下に出すので作品をカードの上に収める */
    function wideLayout() {
      return stage.clientWidth >= 720 && camera.aspect >= 1.2;
    }
    function viewPose(i) {
      var it = cr.items[i],
        door = cr.entries[i].kind === 'door';
      var item = {
        x: it.x,
        y: it.y,
        z: it.z,
        ry: it.ry,
        nx: it.nx,
        nz: it.nz,
        w: it.w + 1.0,
        h: door ? it.h + 0.8 : it.h + 1.0,
      };
      var across =
        it.wall === 'left' || it.wall === 'right' ? cr.dims.w : cr.dims.d; /* 作品の壁から反対側の壁まで */
      var o = {
        fov: FOV,
        aspect: camera.aspect,
        minDist: 4.8,
        maxDist: Math.max(4.8, across - STAND_GAP),
        minY: 2.2,
      };
      if (wideLayout()) {
        o.availW = 0.56;
        o.availH = 0.84;
        o.cx = 0.31;
        o.cy = 0.47;
      } else {
        var sh = stage.clientHeight || 1,
          top = card.hidden ? sh : card.getBoundingClientRect().top - stage.getBoundingClientRect().top;
        var free = Math.max(0.35, Math.min(0.9, (top - 12) / sh)); /* カードより上の、使える高さの割合 */
        o.availW = 0.92;
        o.availH = free - 0.1;
        o.cx = 0.5;
        o.cy = 0.08 + (free - 0.1) / 2;
      }
      return core.framePose(item, o);
    }
    /* 部屋全体を見渡す向き。縦長の画面で正面の壁の中央に何もない時は、近くの作品・入口の方を向く */
    function homeYaw(room) {
      if (camera.aspect >= 0.9) return 0;
      var best = null;
      room.items.forEach(function (it) {
        if (Math.abs(it.ry) < 0.01 && (!best || Math.abs(it.x) < Math.abs(best.x))) best = it;
      });
      if (!best || Math.abs(best.x) < 0.5) return 0;
      return core.yawToward(room.home, { x: best.x, z: best.z });
    }
    var bobY = 0; /* 歩く時の上下のゆれ(歩幅ごとに少し沈む) */
    function moveTo(target, done, dur) {
      var from = { x: cur.x, y: cur.y, z: cur.z, yaw: cur.yaw, pitch: cur.pitch, zoom: cur.zoom };
      var to = {
        x: target.x,
        y: target.y,
        z: target.z,
        yaw: core.nearestAngle(cur.yaw, target.yaw),
        pitch: target.pitch,
        zoom: target.zoom || 1,
      };
      zoomBtn.hidden = true;
      var dist = Math.hypot(to.x - from.x, to.z - from.z);
      tween = {
        from: from,
        to: to,
        t0: performance.now(),
        dur: dur || core.duration(from, to),
        done: done,
        steps: dist > 3 ? Math.round(dist / 2.4) : 0,
      };
      dirty = true;
    }
    /* 軽量モード: 見ている方向の作品へ、少数のスポットを付け替える */
    function retargetSpots() {
      if (!LOW || !cr || !lowSpots.length) return;
      var pick = core.nearestByView(cr.items, cur, lowSpots.length),
        key = cr.id + ':' + pick.join();
      if (key === spotKey) return;
      spotKey = key;
      lowActive = pick.length;
      lowSpots.forEach(function (s, k) {
        if (k < pick.length) {
          placeSpot(s, cr.items[pick[k]], cr.dims.h);
          s.intensity = curTh.spot;
        } else s.intensity = 0;
      });
    }

    /* UI */
    var zoomBtn = $('zoomBtn'),
      hint = $('hint'),
      card = $('card'),
      fade = $('fade');
    var prevBtn = $('prevBtn'),
      nextBtn = $('nextBtn'),
      homeBtn = $('homeBtn'),
      hallBtn = $('hallBtn'),
      openBtn = $('openBtn');
    function hideHint() {
      hint.classList.add('off');
    }
    function showNav(on) {
      prevBtn.hidden = nextBtn.hidden = homeBtn.hidden = !on;
    }
    function showCard(i) {
      var e = cr.entries[i],
        tg = $('cardTags');
      tg.innerHTML = '';
      function tag(x) {
        var s = document.createElement('span');
        s.textContent = x;
        tg.appendChild(s);
      }
      if (e.kind === 'door') {
        $('cardNo').textContent = '展示室';
        $('cardTitle').textContent = e.cat;
        $('cardDesc').textContent = '通路を抜けて展示室に入ります';
        openBtn.textContent = '展示室に入る';
      } else {
        var t = e.tool;
        $('cardNo').textContent = 'No.' + pad2(i + 1) + ' / ' + cr.entries.length;
        $('cardTitle').textContent = nameOf(t);
        $('cardDesc').textContent = t.desc || '';
        (t.tags || []).forEach(tag);
        if (isNewTool(t)) tag('新着');
        if (isFav(t)) tag('よく使う(' + state.usage[t.slug] + '回)');
        openBtn.textContent = 'このツールを開く';
      }
      card.hidden = false;
    }
    function updateRoomUI() {
      var chip = $('roomName');
      chip.textContent = cr.def.title || '';
      chip.hidden = !HALL_MODE;
      hallBtn.hidden = !(HALL_MODE && cr.id !== HALL_ID);
    }

    function focusOn(i) {
      if (switching) return;
      focus = i;
      hideHint();
      showNav(true);
      showCard(i);
      var e = cr.entries[i];
      var label = e.kind === 'door' ? e.cat : nameOf(e.tool);
      if (e.kind === 'tool' && isNewTool(e.tool)) {
        /* 見たら新着ではなくなる */
        state.viewed[e.tool.slug] = 1;
        saveState();
        (badgesBySlug[e.tool.slug] || []).forEach(function (b) {
          b.visible = false;
        });
        log('「' + label + '」を新着から外しました(見ました)');
      }
      moveTo(viewPose(i), function () {
        log('「' + label + '」の前に移動しました(' + (i + 1) + '/' + cr.entries.length + ')');
      });
    }
    function goHome() {
      if (focus < 0 || switching) return;
      var from = cr.items[focus];
      focus = -1;
      card.hidden = true;
      showNav(false);
      var yaw = core.yawToward(cr.home, { x: from.x, z: from.z });
      moveTo({ x: cr.home.x, y: cr.home.y, z: cr.home.z, yaw: yaw, pitch: cr.home.pitch }, function () {
        log('部屋全体の表示に戻りました');
      });
    }
    function step(dir) {
      if (focus < 0 || switching) return;
      focusOn(core.nextIndex(focus, cr.entries.length, dir));
    }
    function openTool(t) {
      var href = hrefOf(t);
      countUse(t);
      log('「' + nameOf(t) + '」を開きます(' + href + ')');
      location.href = href;
    }
    /* 選んだ作品を開く(ツールなら開く、入口なら展示室に入る) */
    function activate(i) {
      var e = cr.entries[i];
      if (e.kind === 'door') travel(e.roomId, cr.items[i]);
      else openTool(e.tool);
    }

    /* 部屋の切り替え。入口(開口部)をくぐって通路へ進み、通路の中で画面が暗くなり、
     次の部屋では入口の通路から歩いて入ってくる(ホールへ戻る時は、出てきた入口から現れてホールを見渡す) */
    var switching = false;
    function swapTo(id, fromId, instant) {
      var target = getRoom(id);
      if (cr) cr.group.visible = false;
      cr = target;
      cr.group.visible = true;
      focus = -1;
      hover = -1;
      tween = null;
      bobY = 0;
      card.hidden = true;
      showNav(false);
      zoomBtn.hidden = true;
      canvas.classList.remove('hover');
      par.x = par.y = 0;
      parT.x = parT.y = 0;
      placePoints(cr.dims);
      spotKey = '';
      applyTheme();
      updateRoomUI();
      var home = { x: cr.home.x, y: cr.home.y, z: cr.home.z, yaw: homeYaw(cr), pitch: cr.home.pitch };
      if (instant) {
        cur = { x: home.x, y: home.y, z: home.z, yaw: home.yaw, pitch: home.pitch, zoom: 1 };
      } else {
        var di = -1;
        if (id === HALL_ID && fromId)
          cr.entries.forEach(function (e, k) {
            if (e.kind === 'door' && e.roomId === fromId) di = k;
          });
        if (di >= 0) {
          var it = cr.items[di];
          cur = {
            x: it.x + it.nx * 1.6,
            y: HOME_Y,
            z: it.z + it.nz * 1.6,
            yaw: it.ry + Math.PI,
            pitch: 0,
            zoom: 1,
          }; /* 戻ってきた展示室のバナーの前から */
          moveTo(
            { x: it.x + it.nx * 3.6, y: HOME_Y, z: it.z + it.nz * 3.6, yaw: it.ry + Math.PI, pitch: 0 },
            function () {
              moveTo(home, null, 900); /* 振り返ってホール全体を見渡す */
            },
            1000
          );
        } else {
          cur = {
            x: 0,
            y: HOME_Y,
            z: cr.dims.d / 2 + 1.4,
            yaw: 0,
            pitch: 0,
            zoom: 1,
          }; /* 入口の通路から入ってくる */
          moveTo(home, null, 1500);
        }
      }
      retargetSpots();
      dirty = true;
      log('展示室「' + (cr.def.title || '展示室') + '」に入りました(' + cr.entries.length + '点)');
    }
    /* via = 歩いてくぐる入口({x,z,nx,nz,ry})。着く少し前から画面を暗くする */
    function travel(id, via) {
      if (switching || !cr) return;
      switching = true;
      var fromId = cr.id;
      card.hidden = true;
      showNav(false);
      hover = -1;
      zoomBtn.hidden = true;
      var t1 = setTimeout(function () {
        fade.classList.add('on');
      }, 800);
      moveTo(
        { x: via.x + via.nx * 2.2, y: cur.y, z: via.z + via.nz * 2.2, yaw: via.ry, pitch: 0 },
        function () {
          /* 開口部をくぐって通路へ */
          clearTimeout(t1);
          fade.classList.add('on');
          try {
            swapTo(id, fromId, false);
          } catch (e) {
            log.error('展示室の表示でエラーが発生しました', e);
          }
          setTimeout(function () {
            fade.classList.remove('on');
            switching = false;
          }, 120);
        },
        1200
      );
    }
    function leaveRoom() {
      if (!HALL_MODE || !cr || cr.id === HALL_ID || switching) return;
      travel(HALL_ID, { x: 0, z: cr.dims.d / 2, nx: 0, nz: -1, ry: Math.PI });
    }

    openBtn.onclick = function () {
      log('「' + openBtn.textContent + '」ボタンを押下しました');
      if (focus >= 0 && !switching) activate(focus);
    };
    homeBtn.onclick = function () {
      log('「全体に戻る」ボタンを押下しました');
      goHome();
    };
    prevBtn.onclick = function () {
      log('「前へ」ボタンを押下しました');
      step(-1);
    };
    nextBtn.onclick = function () {
      log('「次へ」ボタンを押下しました');
      step(1);
    };
    hallBtn.onclick = function () {
      log('「ホールへ」ボタンを押下しました');
      leaveRoom();
    };
    zoomBtn.onclick = function () {
      log('「等倍に戻す」ボタンを押下しました');
      var z0 = cur.zoom;
      moveTo(
        { x: cur.x, y: cur.y, z: cur.z, yaw: cur.yaw, pitch: cur.pitch, zoom: 1 },
        function () {
          log('拡大率を等倍に戻しました(' + zoomLabel(z0) + ' → 1.0倍)');
        },
        500
      );
    };

    /* 操作(ドラッグで見回す / タップで選ぶ) */
    var ray = new THREE.Raycaster(),
      mouse = new THREE.Vector2();
    function pick(e) {
      var r = canvas.getBoundingClientRect();
      mouse.x = ((e.clientX - r.left) / r.width) * 2 - 1;
      mouse.y = -((e.clientY - r.top) / r.height) * 2 + 1;
      applyCamera();
      camera.updateMatrixWorld(true);
      ray.setFromCamera(mouse, camera);
      var hit = ray.intersectObjects(cr.exit ? cr.artMeshes.concat([cr.exit]) : cr.artMeshes, false);
      if (!hit.length) return -1;
      return hit[0].object.userData.exit ? -2 : hit[0].object.userData.index;
    }
    function labelOf(i) {
      var e = cr.entries[i];
      return e.kind === 'door' ? e.cat : nameOf(e.tool);
    }
    var ptr = null,
      hoverPending = null,
      touches = {},
      pinch = null;
    function touchList() {
      return Object.keys(touches).map(function (k) {
        return touches[k];
      });
    }
    function spread() {
      var t = touchList();
      return Math.hypot(t[0].x - t[1].x, t[0].y - t[1].y) || 1;
    }
    canvas.addEventListener('pointerdown', function (e) {
      touches[e.pointerId] = { x: e.clientX, y: e.clientY };
      try {
        canvas.setPointerCapture(e.pointerId);
      } catch (x) {
        log.debug('ポインタの捕捉に失敗しました(ドラッグは継続します)');
      }
      if (touchList().length === 2) {
        /* 2本指: ピンチで拡大・縮小(タップやドラッグにはしない) */
        pinch = { d0: spread(), z0: cur.zoom, from: cur.zoom };
        if (ptr) {
          ptr.moved = true;
          ptr.pinch = true;
        }
        hideHint();
        return;
      }
      if (pinch) return;
      ptr = { sx: e.clientX, sy: e.clientY, x: e.clientX, y: e.clientY, moved: false };
    });
    canvas.addEventListener('pointermove', function (e) {
      if (touches[e.pointerId]) {
        touches[e.pointerId].x = e.clientX;
        touches[e.pointerId].y = e.clientY;
      }
      if (pinch) {
        if (touchList().length >= 2 && !tween && !switching) setZoom((pinch.z0 * spread()) / pinch.d0);
        return;
      }
      if (ptr) {
        var dx = e.clientX - ptr.x,
          dy = e.clientY - ptr.y;
        ptr.x = e.clientX;
        ptr.y = e.clientY;
        if (!ptr.moved && Math.hypot(e.clientX - ptr.sx, e.clientY - ptr.sy) > 6) {
          ptr.moved = true;
          canvas.classList.add('drag');
          hideHint();
        }
        if (ptr.moved && focus < 0 && !tween) {
          cur.yaw += (dx * 0.005) / cur.zoom; /* 拡大中はゆっくり */
          cur.pitch = Math.max(-0.35, Math.min(0.35, cur.pitch + (dy * 0.004) / cur.zoom));
          dirty = true;
        }
        return;
      }
      if (e.pointerType === 'mouse') {
        var r = canvas.getBoundingClientRect();
        parT.x = -((e.clientX - r.left) / r.width - 0.5) * 0.05;
        parT.y = -((e.clientY - r.top) / r.height - 0.5) * 0.035;
        hoverPending = e;
      }
    });
    function endPointer(e, cancelled) {
      delete touches[e.pointerId];
      if (pinch) {
        if (touchList().length < 2) {
          if (Math.abs(cur.zoom - pinch.from) > 0.01)
            log('ピンチで拡大率を変えました(' + zoomLabel(pinch.from) + ' → ' + zoomLabel(cur.zoom) + ')');
          pinch = null;
          ptr = null;
          canvas.classList.remove('drag');
        }
        return;
      }
      if (!ptr) return;
      var p = ptr;
      ptr = null;
      canvas.classList.remove('drag');
      if (cancelled || p.pinch || switching || !cr) return;
      if (!p.moved) {
        var i = pick(e);
        if (i === -2) {
          log('ホールへ戻る入口をタップしました');
          leaveRoom();
          return;
        }
        if (i < 0) return;
        if (cr.entries[i].kind === 'door') {
          log('入口「' + labelOf(i) + '」をタップしました');
          activate(i);
          return;
        }
        log('作品「' + labelOf(i) + '」をタップしました');
        if (focus === i) {
          if (!tween) activate(i);
        } else focusOn(i);
        return;
      }
      if (focus >= 0) {
        var dx = e.clientX - p.sx,
          dy = e.clientY - p.sy;
        if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) {
          log('横スワイプで' + (dx < 0 ? '次' : '前') + 'の作品へ移動します');
          step(dx < 0 ? 1 : -1);
        }
      }
    }
    canvas.addEventListener('pointerup', function (e) {
      endPointer(e, false);
    });
    canvas.addEventListener('pointercancel', function (e) {
      endPointer(e, true);
    });
    canvas.addEventListener('pointerleave', function () {
      parT.x = parT.y = 0;
      if (hover !== -1) {
        hover = -1;
        canvas.classList.remove('hover');
      }
    });

    /* ホイール(PC)・＋−キーでも拡大・縮小。ログは操作が止まってからまとめて1行 */
    var wheelLog = null;
    function zoomBy(f, how) {
      if (tween || switching || !cr) return;
      if (!wheelLog) wheelLog = { from: cur.zoom, how: how, timer: 0 };
      setZoom(cur.zoom * f);
      hideHint();
      clearTimeout(wheelLog.timer);
      wheelLog.timer = setTimeout(function () {
        var w = wheelLog;
        wheelLog = null;
        if (Math.abs(cur.zoom - w.from) > 0.01)
          log(w.how + 'で拡大率を変えました(' + zoomLabel(w.from) + ' → ' + zoomLabel(cur.zoom) + ')');
      }, 350);
    }
    canvas.addEventListener(
      'wheel',
      function (e) {
        e.preventDefault();
        zoomBy(Math.exp(-e.deltaY * 0.0015), 'ホイール');
      },
      { passive: false }
    );
    window.addEventListener('keydown', function (e) {
      var tag = e.target && e.target.tagName;
      if (!cr || switching) return;
      if (e.key === 'Escape') {
        if (!listPanel.hidden && !$('listClose').hidden) {
          $('listClose').click();
        } else if (focus >= 0) {
          log('Escapeキーを押下しました');
          goHome();
        } else if (HALL_MODE && cr.id !== HALL_ID) {
          log('Escapeキーを押下しました');
          leaveRoom();
        }
        return;
      }
      if (!listPanel.hidden) return;
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        if (focus >= 0) {
          log('「' + (e.key === 'ArrowRight' ? '→' : '←') + '」キーを押下しました');
          step(e.key === 'ArrowRight' ? 1 : -1);
        } else if (!tween) {
          cur.yaw += (e.key === 'ArrowRight' ? -1 : 1) * 0.15;
          dirty = true;
          hideHint();
        }
      } else if (e.key === '+' || e.key === ';' || e.key === '-') {
        zoomBy(e.key === '-' ? 1 / 1.25 : 1.25, '「' + (e.key === '-' ? '−' : '＋') + '」キー');
      } else if (e.key === 'Enter' && focus >= 0 && tag !== 'BUTTON' && tag !== 'A' && !tween) {
        log('Enterキーを押下しました');
        activate(focus);
      }
    });

    /* 描画ループ(変化があった時だけ描く) */
    function frame(now) {
      requestAnimationFrame(frame);
      if (!cr) return;
      if (tween) {
        var p = (now - tween.t0) / tween.dur;
        if (p >= 1) {
          cur.x = tween.to.x;
          cur.y = tween.to.y;
          cur.z = tween.to.z;
          cur.yaw = tween.to.yaw;
          cur.pitch = tween.to.pitch;
          cur.zoom = tween.to.zoom;
          bobY = 0;
          var d = tween.done;
          tween = null;
          if (d) d();
        } else {
          var eq = core.ease(p),
            q = core.lerpPose(tween.from, tween.to, eq);
          cur.x = q.x;
          cur.y = q.y;
          cur.z = q.z;
          cur.yaw = q.yaw;
          cur.pitch = q.pitch;
          cur.zoom = tween.from.zoom + (tween.to.zoom - tween.from.zoom) * eq;
          bobY = tween.steps ? Math.sin(p * tween.steps * Math.PI * 2) * 0.05 * Math.sin(p * Math.PI) : 0;
        }
        dirty = true;
      }
      if (hoverPending) {
        var e = hoverPending;
        hoverPending = null;
        var h = switching ? -1 : pick(e);
        if (h !== hover) {
          hover = h;
          canvas.classList.toggle('hover', h !== -1);
        }
      }
      var tx = focus >= 0 && !tween ? parT.x : 0,
        ty = focus >= 0 && !tween ? parT.y : 0;
      if (Math.abs(tx - par.x) > 0.0003 || Math.abs(ty - par.y) > 0.0003) {
        par.x += (tx - par.x) * 0.12;
        par.y += (ty - par.y) * 0.12;
        dirty = true;
      }
      for (var i = 0; i < cr.arts.length; i++) {
        var m = cr.arts[i].halo,
          target = i === hover ? 0.75 : i === focus ? 0.45 : cr.arts[i].base;
        if (Math.abs(target - m.opacity) > 0.004) {
          m.opacity += (target - m.opacity) * 0.2;
          dirty = true;
        } else if (m.opacity !== target) {
          m.opacity = target;
          dirty = true;
        }
      }
      if (dirty) {
        dirty = false;
        retargetSpots();
        applyCamera();
        renderer.render(scene, camera);
      }
    }

    function resize() {
      var w = stage.clientWidth,
        h = stage.clientHeight;
      if (!w || !h) return;
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, MAX_DPR));
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      stage.classList.toggle('wide', wideLayout()); /* 横長の広い画面: 説明カードを右に出す */
      if (cr && focus >= 0 && !tween) {
        var v = viewPose(focus);
        cur.x = v.x;
        cur.y = v.y;
        cur.z = v.z;
        cur.yaw = v.yaw;
        cur.pitch = v.pitch;
      }
      dirty = true;
    }
    if (window.ResizeObserver) new ResizeObserver(resize).observe(stage);
    window.addEventListener('resize', resize);
    new MutationObserver(applyTheme).observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });

    resize();
    swapTo(HALL_MODE ? HALL_ID : 'main', null, true);
    requestAnimationFrame(frame);
    log(
      '起動しました(作品 ' +
        N +
        '点 / ' +
        (HALL_MODE ? '展示室 ' + groups.length + '室+ホール' : '1室') +
        ' / 一覧の元データ ' +
        source +
        ' / 画質 ' +
        (LOW ? '軽量(スマホ向け)' : '通常') +
        ')'
    );
    L.loadingDone();
  }
})();
