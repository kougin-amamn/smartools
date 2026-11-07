/* 部屋の作品配置とカメラ姿勢の計算(DOM/three.js非依存。Nodeでテスト可能) */

import * as Shared from './launcher-3d/launcher-3d-core.js';

/* 本棚・美術館で共用する計算(launcher-3d/launcher-3d-core.js)。中の名前は段2で直すまで今のまま */
var S = {
  rng: Shared.randomOf,
  groupByCat: Shared.groupByCategory,
  framePose: Shared.framePose,
  yawToward: Shared.yawToward,
  nearestAngle: Shared.nearestAngle,
  ease: Shared.easeInOut,
  lerpPose: Shared.interpolatePose,
  nextIndex: Shared.nextIndex,
};
var groupByCat = S.groupByCat,
  framePose = S.framePose,
  yawToward = S.yawToward,
  nearestAngle = S.nearestAngle,
  ease = S.ease,
  lerpPose = S.lerpPose,
  nextIndex = S.nextIndex;

/* 壁ごとの作品数: [左壁, 奥壁, 右壁]。余りは奥壁→左壁の順に1点ずつ足す */
function distribute(n) {
  var base = Math.floor(n / 3),
    r = n % 3,
    c = [base, base, base];
  if (r >= 1) c[1]++;
  if (r >= 2) c[0]++;
  return c;
}

/* 作品の配置。巡回順は「左壁(手前→奥)→奥壁(左→右)→右壁(奥→手前)」。
   room={w,d,h} art={size,centerY}。法線(nx,nz)は部屋の内側向き、ry は three.js の rotation.y */
function layout(n, room, art, counts) {
  var out = [];
  if (!(n > 0)) return out;
  var c = counts && counts[0] + counts[1] + counts[2] === n ? counts : distribute(n),
    w = room.w,
    d = room.d;
  var spacings = [];
  if (c[0]) spacings.push(d / c[0]);
  if (c[1]) spacings.push(w / c[1]);
  if (c[2]) spacings.push(d / c[2]);
  var size = Math.min(art.size, Math.min.apply(null, spacings) * 0.7);
  var i,
    idx = 0;
  function push(wall, x, z, ry) {
    out.push({
      index: idx++,
      wall: wall,
      x: x,
      y: art.centerY,
      z: z,
      ry: ry,
      nx: Math.sin(ry),
      nz: Math.cos(ry),
      w: size,
      h: size * (art.ratio || 1),
    });
  }
  for (i = 0; i < c[0]; i++) push('left', -w / 2, d / 2 - (d * (i + 0.5)) / c[0], Math.PI / 2);
  for (i = 0; i < c[1]; i++) push('back', -w / 2 + (w * (i + 0.5)) / c[1], -d / 2, 0);
  for (i = 0; i < c[2]; i++) push('right', w / 2, -d / 2 + (d * (i + 0.5)) / c[2], -Math.PI / 2);
  return out;
}

/* 展示室の壁ごとの点数。3点以下は正面(奥)の壁にまとめて並べる(入った時に全部が正面に見える)。4点以上は3面に分ける */
function roomCounts(n) {
  return n <= 3 ? [0, n, 0] : distribute(n);
}

/* 壁ごとの点数 [左,奥,右] から部屋の大きさを決める。1点あたり 6.6(額縁+右横の解説カード+余白)の間隔を確保する。
   min は最小の幅・奥行き(既定は幅11・奥行き23。奥行きは、立ち位置から正面の壁の作品と天井のスポットライトまで見渡せる距離) */
var PITCH = 6.6;
function roomDims(counts, minW, minD) {
  function r2(v) {
    return Math.round(v * 100) / 100;
  }
  return {
    w: r2(Math.max(minW || 11, PITCH * counts[1])),
    d: r2(Math.max(minD || 23, PITCH * Math.max(counts[0], counts[2]))),
    h: 9.5,
  };
}

/* 新着か。state={base:{slug:1}|null, viewed:{slug:1}}。
   見たことがあれば新着ではない。それ以外は「added が days 日以内」か「初回訪問時の一覧(base)に無かった」ものが新着 */
function isNew(t, now, state, days) {
  if (state.viewed && state.viewed[t.slug]) return false;
  if (t.added) {
    var ms = Date.parse(t.added);
    if (!isNaN(ms)) {
      var d = (now - ms) / 86400000;
      if (d >= -1 && d <= (days || 30)) return true;
    }
  }
  return !!(state.base && !state.base[t.slug]);
}

/* 使用回数が min 回以上のツールを、多い順(同数は一覧の順)に max 件 */
function topFavorites(tools, usage, min, max) {
  var arr = [];
  tools.forEach(function (t, i) {
    var n = (usage && usage[t.slug]) || 0;
    if (n >= min) arr.push({ t: t, n: n, i: i });
  });
  arr.sort(function (a, b) {
    return b.n - a.n || a.i - b.i;
  });
  return arr.slice(0, max).map(function (o) {
    return o.t;
  });
}

/* 入口ホールの壁ごとの点数 [左,奥,右]。新着・よく使うがあれば 左=新着/奥=扉/右=よく使う、無ければ扉を3面に分ける */
function hallCounts(nNew, nFav, nDoors) {
  return nNew || nFav ? [nNew, nDoors, nFav] : distribute(nDoors);
}

/* ホールの入口(開口部)の壁ごとの数 [左,奥,右]。1面に2つまで: 奥→左→右の順に2つずつ置き、それより多い時だけ奥→左→右へ1つずつ足す */
function doorSplit(n) {
  var c = [0, 0, 0],
    order = [1, 1, 0, 0, 2, 2],
    i;
  for (i = 0; i < n; i++) {
    if (i < 6) c[order[i]]++;
    else c[[1, 0, 2][(i - 6) % 3]]++;
  }
  return c;
}

/* 作品が画面に収まる距離(縦fov[度]・アスペクト比・余白倍率) */
function fitDistance(w, h, fovDeg, aspect, margin) {
  var t = Math.tan((fovDeg * Math.PI) / 360);
  var byH = (h * margin) / (2 * t);
  var byW = (w * margin) / (2 * t * aspect);
  return Math.max(byH, byW);
}

/* 作品の正面に立つカメラ姿勢。o={fov,aspect,margin,eyeY,lift,maxDist,minDist}
   yaw は作品の ry と同じ(three.js: rotation.order 'YXZ', 正面 -z が yaw=0, 前方=(-sin yaw, 0, -cos yaw)) */
function poseFor(item, o) {
  var dist = fitDistance(item.w, item.h, o.fov, o.aspect, o.margin || 1.3);
  dist = Math.max(o.minDist || 2.5, Math.min(o.maxDist || 14, dist));
  var x = item.x + item.nx * dist,
    z = item.z + item.nz * dist,
    y = o.eyeY;
  /* 下に出る情報カード分、作品を画面の上寄りに見せる(liftRatio=画面の高さに対する持ち上げ割合) */
  var lift = o.lift || 0;
  if (o.liftRatio) lift = o.liftRatio * 2 * dist * Math.tan((o.fov * Math.PI) / 360);
  var targetY = item.y - lift;
  return { x: x, y: y, z: z, yaw: item.ry, pitch: Math.atan2(targetY - y, dist), dist: dist };
}

/* 作品を「見上げずに」画面の指定位置へ収めるカメラ姿勢(縦の線がゆがまない)。
   o={fov,aspect,availW,availH(画面に対する使える幅・高さの割合),cx,cy(作品の中心を置く画面上の位置。左上が0),margin,minDist,maxDist,minY}
   カメラは作品の正面で水平を向き、上下・左右に平行移動して作品を cx,cy に置く */

/* 移動時間(ms): 距離に応じて 700〜1200 */
function duration(a, b) {
  var d = Math.sqrt(Math.pow(b.x - a.x, 2) + Math.pow(b.z - a.z, 2));
  return Math.round(Math.max(700, Math.min(1200, 600 + d * 45)));
}

/* 複数の形状(非インデックス)の頂点配列をひとつにまとめる。描画命令の数を減らすために使う。
   list=[{position:Float32Array(3つ組), normal:Float32Array(3つ組), uv:Float32Array(2つ組)}] */
function mergeAttributes(list) {
  var np = 0,
    nn = 0,
    nu = 0,
    i;
  for (i = 0; i < list.length; i++) {
    np += list[i].position.length;
    nn += list[i].normal.length;
    nu += list[i].uv.length;
  }
  var out = { position: new Float32Array(np), normal: new Float32Array(nn), uv: new Float32Array(nu) };
  var op = 0,
    on = 0,
    ou = 0;
  for (i = 0; i < list.length; i++) {
    out.position.set(list[i].position, op);
    op += list[i].position.length;
    out.normal.set(list[i].normal, on);
    on += list[i].normal.length;
    out.uv.set(list[i].uv, ou);
    ou += list[i].uv.length;
  }
  return out;
}

/* 見ている方向に近い作品を count 点選ぶ(軽量モードで、少数のスポットを視線の先の作品へ付け替えるため)。
   cam={x,z,yaw}。向きが近いほど優先、同程度なら近い方 */
function nearestByView(items, cam, count) {
  var fx = -Math.sin(cam.yaw),
    fz = -Math.cos(cam.yaw),
    sc = [];
  for (var i = 0; i < items.length; i++) {
    var dx = items[i].x - cam.x,
      dz = items[i].z - cam.z,
      d = Math.sqrt(dx * dx + dz * dz) || 1e-6;
    var c = Math.max(-1, Math.min(1, (dx * fx + dz * fz) / d));
    sc.push({ i: i, s: Math.acos(c) + d * 0.02 });
  }
  sc.sort(function (a, b) {
    return a.s - b.s;
  });
  return sc.slice(0, count).map(function (o) {
    return o.i;
  });
}

var api = {
  distribute: distribute,
  roomCounts: roomCounts,
  doorSplit: doorSplit,
  layout: layout,
  fitDistance: fitDistance,
  poseFor: poseFor,
  framePose: framePose,
  PITCH: PITCH,
  yawToward: yawToward,
  nearestAngle: nearestAngle,
  ease: ease,
  lerpPose: lerpPose,
  nextIndex: nextIndex,
  duration: duration,
  mergeAttributes: mergeAttributes,
  nearestByView: nearestByView,
  roomDims: roomDims,
  groupByCat: groupByCat,
  isNew: isNew,
  topFavorites: topFavorites,
  hallCounts: hallCounts,
};

export default api;
