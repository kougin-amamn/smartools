/* 3Dランチャー(本棚・美術館)で共用する計算: 乱数・カテゴリ分け・カメラの姿勢と補間。DOM と three.js を使わず Node で試せる(ES モジュール) */

/* 種(seed)から毎回同じ並びになる乱数 */
export function randomOf(seed) {
  seed = seed >>> 0 || 1;
  return function () {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

/* カテゴリごとに分ける。1区画の上限 maxPer を超えたら「名前 1/2」のように分ける */
export function groupByCategory(tools, maxPer) {
  var order = [],
    map = {},
    out = [];
  tools.forEach(function (t) {
    var c = t.cat || 'ツール';
    if (!map[c]) {
      map[c] = [];
      order.push(c);
    }
    map[c].push(t);
  });
  order.forEach(function (c) {
    var arr = map[c],
      parts = Math.max(1, Math.ceil(arr.length / (maxPer || 15))),
      per = Math.ceil(arr.length / parts);
    for (var p = 0; p < parts; p++)
      out.push({
        cat: parts > 1 ? c + ' ' + (p + 1) + '/' + parts : c,
        base: c,
        tools: arr.slice(p * per, (p + 1) * per),
      });
  });
  return out;
}

/* 作品(本の表紙・絵画)の正面に立つ姿勢。水平に見て、上下・左右に平行移動して作品を画面の (cx,cy) に置く。
   o={fov, aspect, availW, availH(作品に使える画面の割合), cx, cy, minDist, maxDist, minY(これより低い時は少し見下ろす), margin} */
export function framePose(item, o) {
  var t = Math.tan((o.fov * Math.PI) / 360),
    m = o.margin || 1.08;
  var dist = Math.max(
    (item.h * m) / (2 * t * o.availH),
    (item.w * m) / (2 * t * o.aspect * o.availW),
  );
  dist = Math.max(o.minDist || 3, Math.min(o.maxDist || 30, dist));
  var vh = 2 * dist * t,
    vw = vh * o.aspect;
  var y = item.y - (0.5 - o.cy) * vh,
    pitch = 0;
  if (o.minY && y < o.minY) {
    pitch = Math.atan2(y - o.minY, dist);
    y = o.minY;
  }
  var s = (0.5 - o.cx) * vw,
    c = Math.cos(item.ry),
    sn = Math.sin(item.ry);
  return {
    x: item.x + item.nx * dist + c * s,
    y: y,
    z: item.z + item.nz * dist - sn * s,
    yaw: item.ry,
    pitch: pitch,
    dist: dist,
  };
}
/* from から to の方を向く yaw */
export function yawToward(from, to) {
  return Math.atan2(-(to.x - from.x), -(to.z - from.z));
}
/* a から見て b にいちばん近い同じ向きの角度(ぐるっと遠回りしない) */
export function nearestAngle(a, b) {
  var d = (b - a) % (2 * Math.PI);
  if (d > Math.PI) d -= 2 * Math.PI;
  if (d < -Math.PI) d += 2 * Math.PI;
  return a + d;
}
export function easeInOut(t) {
  t = Math.max(0, Math.min(1, t));
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}
export function interpolatePose(a, b, t) {
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    z: a.z + (b.z - a.z) * t,
    yaw: a.yaw + (b.yaw - a.yaw) * t,
    pitch: a.pitch + (b.pitch - a.pitch) * t,
  };
}
export function nextIndex(i, n, dir) {
  return n > 0 ? (((i + dir) % n) + n) % n : -1;
}
