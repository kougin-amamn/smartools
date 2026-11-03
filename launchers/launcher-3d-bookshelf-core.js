/* ランチャーの「本棚」表示の配置とカメラの計算(DOM/three.js非依存。Nodeでテスト可能)
   単位はメートル。本棚は家の書斎の奥の壁に1つ。ツールはジャンル順に本として各マスへ詰めて並び、ジャンルは本の色で分ける */
(function (root) {
  'use strict';
  /* 本棚・ミュージアム共通の計算(launcher-common.js の core3d) */
  var S =
    root.Launcher3DCore || (typeof require !== 'undefined' ? require('./launcher-common.js').core3d : null);
  if (!S) {
    if (typeof window === 'undefined') throw new Error('launcher-common.js が読み込まれていません');
    return;
  } /* ブラウザでは画面側がファイル名を表示する */
  var rng = S.rng,
    groupByCat = S.groupByCat,
    framePose = S.framePose,
    yawToward = S.yawToward,
    nearestAngle = S.nearestAngle,
    ease = S.ease,
    lerpPose = S.lerpPose,
    nextIndex = S.nextIndex;

  /* 寸法 */
  var BAY = 1.0; /* 本棚1連の幅 */
  var CASE = { h: 2.3, d: 0.36, side: 0.04, board: 0.03 };
  var SHELF_Y = [0.1, 0.65, 1.2, 1.75]; /* 各段の棚板の上面の高さ(4段) */
  var TOOL = {
    w: 0.085,
    h: 0.45,
    d: 0.315,
  }; /* 表紙の縦横比は一般的な本(A5・四六判)に近い 7:10 */ /* 本は棚の高さ(段の内のり 0.52m)に近い高さ */ /* 本は大きめ(棚の本はすべてこの大きさ) */ /* ツールの本(厚み・高さ・奥行き) */
  var ROW_MAX = 6; /* 1マス(1列1段)に並べる本の上限 */
  var EYE = 1.6;

  /* 家の書斎(本棚は1つ)
     正方形の部屋の奥の壁に本棚を1つ置く。本はジャンルごとに色を変え、マスへ詰めて並べる。
     本棚が画面いっぱい(本棚の外は映らない)に見える位置に立つ */
  var ROOM_H = 2.75; /* 天井の高さ */
  /* 長方形の部屋の壁(hx=幅の半分, hz=奥行きの半分)。len=壁の長さ */
  function wallOf(name, hx, hz) {
    if (name === 'back')
      return { c: { x: 0, z: -hz }, t: { x: 1, z: 0 }, n: { x: 0, z: 1 }, ry: 0, len: 2 * hx };
    if (name === 'right')
      return { c: { x: hx, z: 0 }, t: { x: 0, z: 1 }, n: { x: -1, z: 0 }, ry: -Math.PI / 2, len: 2 * hz };
    if (name === 'left')
      return { c: { x: -hx, z: 0 }, t: { x: 0, z: -1 }, n: { x: 1, z: 0 }, ry: Math.PI / 2, len: 2 * hz };
    return { c: { x: 0, z: hz }, t: { x: -1, z: 0 }, n: { x: 0, z: -1 }, ry: Math.PI, len: 2 * hx };
  }
  /* 本棚は4段×2列(真ん中に仕切り)。マスは左上から右へ、段が変わったら次の段の左から(読む順)。
     8マスを超えたら、同じ本棚を右に並べる。幅は1台 1.5m(本が入り切らない時だけ広げる)。maxTools=1マスの最大冊数 */
  var CASE_MIN_W = 1.5,
    PROP_GAP = 0.04;
  function roomPlan(nSec, maxTools, aspect) {
    var rows = SHELF_Y.length,
      per = rows * 2,
      nc = Math.max(1, Math.ceil(nSec / per));
    var ch = CASE.h + 0.1;
    var cw = Math.max(CASE_MIN_W, 2 * rowWidth(maxTools || 1) + 3 * CASE.side); /* 本棚1台の幅 */
    var width = nc * cw,
      colW = (cw - 3 * CASE.side) / 2;
    /* 本棚のすぐ左に観葉植物、すぐ右にフロアランプ(すき間 PROP_GAP)。見せたい範囲 viewW は植物からランプまで */
    var props = {
      plant: { x: -(width / 2 + PROP_GAP + 0.38) },
      lamp: { x: width / 2 + PROP_GAP + 0.24 },
    }; /* 葉の右端・かさの左端が本棚の側板に寄る */
    var viewW = width + 2 * (PROP_GAP + 0.74);
    /* 部屋は長方形(約 3.64m × 4.55m、10畳ほど)。本棚の壁が短い辺。本棚が広い時だけ部屋も広げる */
    var hx = Math.max(1.82, viewW / 2 + 0.1),
      hz = Math.max(2.275, hx * 1.25),
      half = hz;
    var R = hz - CASE.d - 0.02;
    var frame = { x: 0, z: -R, ry: 0, n: { x: 0, z: 1 }, t: { x: 1, z: 0 } };
    var sections = [];
    for (var j = 0; j < nSec; j++) {
      var k = Math.floor(j / per),
        cell = j % per,
        row = Math.floor(cell / 2),
        col = cell % 2;
      sections.push({
        caseIndex: k,
        col: col,
        row: row,
        shelf: rows - 1 - row,
        x0: -width / 2 + k * cw + CASE.side + col * (colW + CASE.side),
        colW: colW,
      });
    }
    return {
      cases: nc,
      caseUnitW: cw,
      cols: 2,
      rows: rows,
      caseW: width,
      caseH: ch,
      props: props,
      viewW: viewW,
      R: R,
      half: half,
      hx: hx,
      hz: hz,
      w: 2 * hx,
      d: 2 * hz,
      h: ROOM_H,
      frame: frame,
      sections: sections,
      wallOf: function (n) {
        return wallOf(n, hx, hz);
      },
    };
  }

  /* 1区画の本の並び(本棚のローカル座標: 本棚の前面の中央が原点)。段の x0 から左詰めでツールの本だけを並べ、最後にブックエンド。
     返り値 {books:[{x,tool,w,h,d}], end:{x}|null, width:列に要る幅} */
  var GAP = 0.0015;
  function rowWidth(n) {
    return 0.04 + n * (TOOL.w + GAP) + 0.13;
  } /* 左の余白 + 本 + ブックエンドとその先の余白 */
  function shelfBooks(nTools, x0) {
    var x = (x0 || 0) + 0.04,
      books = [];
    for (var i = 0; i < nTools; i++) {
      books.push({ x: x + TOOL.w / 2, tool: i, w: TOOL.w, h: TOOL.h, d: TOOL.d });
      x += TOOL.w + GAP;
    }
    return { books: books, end: nTools ? { x: x + 0.012 } : null, width: rowWidth(nTools) };
  }
  /* 本の並べ方: ジャンル(カテゴリ)ごとにまとめた順で、左上のマスから詰めて並べる。
     ジャンルは本の色で分かるので、マスはジャンルで区切らない(1冊だけのマスができて見栄えが悪いため)。
     マスの数は 冊数÷per の切り上げで、各マスの冊数ができるだけそろうように分ける。
     戻り値 [{cat:そのマスの最初の本のジャンル, tools:[...], cats:[本ごとのジャンル], colors:[本ごとのジャンルの番号]}] */
  function packShelves(tools, per) {
    var order = [],
      map = {};
    tools.forEach(function (t) {
      var c = t.cat || 'ツール';
      if (!map[c]) {
        map[c] = [];
        order.push(c);
      }
      map[c].push(t);
    });
    var flat = [];
    order.forEach(function (c, ci) {
      map[c].forEach(function (t) {
        flat.push({ tool: t, cat: c, ci: ci });
      });
    });
    var n = Math.max(1, Math.ceil(flat.length / (per || ROW_MAX))),
      out = [],
      i = 0;
    for (var k = 0; k < n && i < flat.length; k++) {
      var size = Math.floor(flat.length / n) + (k < flat.length % n ? 1 : 0),
        part = flat.slice(i, i + size);
      i += size;
      out.push({
        cat: part[0].cat,
        tools: part.map(function (x) {
          return x.tool;
        }),
        cats: part.map(function (x) {
          return x.cat;
        }),
        colors: part.map(function (x) {
          return x.ci;
        }),
      });
    }
    return out;
  }
  function capacity() {
    return ROW_MAX;
  } /* 1区画(1マス)に並べる冊数の上限 */

  /* 箱を並べた頂点配列(三角形ごと・頂点色つき)をまとめて作る。frame={x,z,ry} の座標系で置き、ワールド座標で返す。
     box={x,y,z(中心), sx,sy,sz, rz(z軸回りの傾き), color:[r,g,b], faces:{px,nx,py,ny,pz,nz:[r,g,b]}(面ごとの色), uv:'world'|'spine'} */
  var FACES = [
    /* 法線, u軸, v軸 */ { k: 'px', n: [1, 0, 0], u: [0, 0, -1], v: [0, 1, 0] },
    { k: 'nx', n: [-1, 0, 0], u: [0, 0, 1], v: [0, 1, 0] },
    { k: 'py', n: [0, 1, 0], u: [1, 0, 0], v: [0, 0, -1] },
    { k: 'ny', n: [0, -1, 0], u: [1, 0, 0], v: [0, 0, 1] },
    { k: 'pz', n: [0, 0, 1], u: [1, 0, 0], v: [0, 1, 0] },
    { k: 'nz', n: [0, 0, -1], u: [-1, 0, 0], v: [0, 1, 0] },
  ];
  function boxArrays(boxes, frame) {
    var P = [],
      N = [],
      U = [],
      C = [],
      cs = Math.cos(frame.ry || 0),
      sn = Math.sin(frame.ry || 0);
    function rot(v, rz) {
      var c = Math.cos(rz || 0),
        s = Math.sin(rz || 0);
      return [v[0] * c - v[1] * s, v[0] * s + v[1] * c, v[2]];
    }
    function toWorld(v) {
      return [frame.x + v[0] * cs + v[2] * sn, v[1], frame.z - v[0] * sn + v[2] * cs];
    }
    boxes.forEach(function (b) {
      var hx = b.sx / 2,
        hy = b.sy / 2,
        hz = b.sz / 2;
      FACES.forEach(function (f) {
        var col = (b.faces && b.faces[f.k]) || b.color || [1, 1, 1];
        var ext = [hx, hy, hz],
          nn = f.n,
          uu = f.u,
          vv = f.v;
        var cen = [nn[0] * hx, nn[1] * hy, nn[2] * hz];
        var eu = Math.abs(uu[0]) * ext[0] + Math.abs(uu[1]) * ext[1] + Math.abs(uu[2]) * ext[2];
        var ev = Math.abs(vv[0]) * ext[0] + Math.abs(vv[1]) * ext[1] + Math.abs(vv[2]) * ext[2];
        var corners = [
          [-1, -1],
          [1, -1],
          [1, 1],
          [-1, -1],
          [1, 1],
          [-1, 1],
        ];
        corners.forEach(function (q) {
          var lp = [
            cen[0] + uu[0] * eu * q[0] + vv[0] * ev * q[1],
            cen[1] + uu[1] * eu * q[0] + vv[1] * ev * q[1],
            cen[2] + uu[2] * eu * q[0] + vv[2] * ev * q[1],
          ];
          lp = rot(lp, b.rz);
          lp = [lp[0] + b.x, lp[1] + b.y, lp[2] + b.z];
          var wp = toWorld(lp),
            ln = rot(nn, b.rz),
            wn = [ln[0] * cs + ln[2] * sn, ln[1], -ln[0] * sn + ln[2] * cs];
          P.push(wp[0], wp[1], wp[2]);
          N.push(wn[0], wn[1], wn[2]);
          C.push(col[0], col[1], col[2]);
          if (b.uv === 'spine') {
            /* 背表紙の面(pz)だけ絵の全体、他の面は絵の真ん中の無地の所。rect=[u0,v0,u1,v1] で絵の一部 */
            var rc = b.rect || [0, 0, 1, 1];
            if (f.k === 'pz')
              U.push(rc[0] + ((rc[2] - rc[0]) * (q[0] + 1)) / 2, rc[1] + ((rc[3] - rc[1]) * (q[1] + 1)) / 2);
            else U.push((rc[0] + rc[2]) / 2, (rc[1] + rc[3]) / 2);
          } else if (b.uv === 'panel') {
            /* 手すりなど: 前後の面に絵を横に ru 回くり返す */
            if (f.k === 'pz' || f.k === 'nz') U.push(((q[0] + 1) / 2) * (b.ru || 1), (q[1] + 1) / 2);
            else U.push(0.02, 0.02);
          } else
            U.push(
              (q[0] * eu + cen[0] + cen[2] + b.x + frame.x) * 1.0,
              (q[1] * ev + b.y) * 1.0
            ); /* 木目: およそ1mで1回 */
        });
      });
    });
    return { position: P, normal: N, uv: U, color: C };
  }

  /* 本棚1連の部材(側板・棚板・天板・背板・台輪・笠木)を、本棚のローカル座標(連の中心が原点、前面 z=0)で返す */
  /* o={w:幅, y0:下端の高さ, h:高さ, shelves:[棚板の高さ(下端から)], top:笠木の有無} 省略時は幅1連の本棚 */
  function caseBoxes(x, wood, o) {
    o = o || {};
    var bx = [],
      w = o.w || BAY,
      d = CASE.d,
      s = CASE.side,
      t = CASE.board,
      y0 = o.y0 || 0,
      h = o.h || CASE.h,
      sh = o.shelves || SHELF_Y;
    bx.push({ x: x - w / 2 + s / 2, y: y0 + h / 2, z: -d / 2, sx: s, sy: h, sz: d, color: wood });
    bx.push({ x: x + w / 2 - s / 2, y: y0 + h / 2, z: -d / 2, sx: s, sy: h, sz: d, color: wood });
    sh.forEach(function (y) {
      bx.push({ x: x, y: y0 + y - t / 2, z: -d / 2, sx: w - 2 * s, sy: t, sz: d - 0.02, color: wood });
    });
    bx.push({ x: x, y: y0 + h - 0.02, z: -d / 2, sx: w, sy: 0.04, sz: d, color: wood }); /* 天板 */
    bx.push({
      x: x,
      y: y0 + h / 2,
      z: -d + 0.01,
      sx: w - 2 * s,
      sy: h,
      sz: 0.02,
      color: wood.map(function (v) {
        return v * 0.55;
      }),
    }); /* 背板(暗く) */
    bx.push({
      x: x,
      y: y0 + 0.04,
      z: -d / 2 + 0.02,
      sx: w,
      sy: 0.08,
      sz: d - 0.03,
      color: wood.map(function (v) {
        return v * 0.8;
      }),
    }); /* 台輪 */
    if (o.top !== false)
      bx.push({
        x: x,
        y: y0 + h + 0.05,
        z: -d / 2 + 0.03,
        sx: w + 0.02,
        sy: 0.1,
        sz: d + 0.06,
        color: wood,
      }); /* 笠木 */
    return bx;
  }

  /* 柱などの多角柱(側面のみ・頂点色つき)。p={x,z,y0,y1,r0(下),r1(上),color}。u は面ごとに 0→1(縦溝の模様を1面に1本) */
  function prismArrays(list, sides) {
    var P = [],
      N = [],
      U = [],
      C = [];
    list.forEach(function (p) {
      for (var i = 0; i < sides; i++) {
        var a0 = (i / sides) * 2 * Math.PI,
          a1 = ((i + 1) / sides) * 2 * Math.PI,
          am = (a0 + a1) / 2;
        var q = [
          [a0, p.y0, p.r0, 0, 0],
          [a1, p.y0, p.r0, 1, 0],
          [a1, p.y1, p.r1, 1, 1],
          [a0, p.y0, p.r0, 0, 0],
          [a1, p.y1, p.r1, 1, 1],
          [a0, p.y1, p.r1, 0, 1],
        ];
        q.forEach(function (v) {
          P.push(p.x + Math.sin(v[0]) * v[2], v[1], p.z + Math.cos(v[0]) * v[2]);
          N.push(Math.sin(am), 0, Math.cos(am));
          U.push(v[3], (v[1] - p.y0) * 0.5);
          C.push(p.color[0], p.color[1], p.color[2]);
        });
      }
    });
    return { position: P, normal: N, uv: U, color: C };
  }

  function duration(a, b) {
    var d = Math.hypot(b.x - a.x, b.z - a.z);
    return Math.round(Math.max(600, Math.min(1300, 500 + d * 90)));
  }

  /* 本を引き出して表紙を見せる動き(k=0 棚の中 → 1 手前に出して表紙をこちらへ)。区画のローカル座標でのずれと回転 */
  function pullPose(k) {
    var a = Math.min(1, k * 2),
      b = Math.max(0, k * 2 - 1); /* 前半: まっすぐ引き出す / 後半: さらに手前へ出しながら回す */
    var ea = ease(a),
      eb = ease(b);
    return { dz: 0.24 * ea + 0.26 * eb, dy: 0.06 * eb, ry: (-Math.PI / 2) * eb };
  }

  var api = {
    rowWidth: rowWidth,
    ROW_MAX: ROW_MAX,
    ROOM_H: ROOM_H,
    prismArrays: prismArrays,
    BAY: BAY,
    CASE: CASE,
    SHELF_Y: SHELF_Y,
    TOOL: TOOL,
    EYE: EYE,
    rng: rng,
    groupByCat: groupByCat,
    roomPlan: roomPlan,
    shelfBooks: shelfBooks,
    packShelves: packShelves,
    capacity: capacity,
    boxArrays: boxArrays,
    caseBoxes: caseBoxes,
    framePose: framePose,
    yawToward: yawToward,
    nearestAngle: nearestAngle,
    ease: ease,
    lerpPose: lerpPose,
    nextIndex: nextIndex,
    duration: duration,
    pullPose: pullPose,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.BookshelfCore = api;
})(this);
