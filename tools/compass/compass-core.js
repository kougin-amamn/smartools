/* 方位磁石の計算(画面に依存しない。Node でテストできる)。window.CompassCore
   センサーの値から方位を求める・画面の向きの補正・角度の差(近い向き)・なめらかな追従・16方位・水平の気泡の位置・値の揺れ */
(function (root) {
  'use strict';

  var DIRS = [
    '北',
    '北北東',
    '北東',
    '東北東',
    '東',
    '東南東',
    '南東',
    '南南東',
    '南',
    '南南西',
    '南西',
    '西南西',
    '西',
    '西北西',
    '北西',
    '北北西',
  ];

  /* 0〜360 に収める */
  function norm(a) {
    return ((a % 360) + 360) % 360;
  }
  /* a から b への近い向きの差(-180〜180)。359° → 1° は +2° */
  function diff(a, b) {
    var d = norm(b - a);
    return d > 180 ? d - 360 : d;
  }
  /* 16方位の名前 */
  function dirLabel(h) {
    return DIRS[Math.round(norm(h) / 22.5) % 16];
  }

  /* 向きのイベントから方位(北=0、時計回り)を求める。screenAngle は画面の回転(縦持ち 0、横持ち 90 / 270)。
     iPhone は webkitCompassHeading(すでに方位)、ほかは alpha(反時計回り)を反転する。
     画面を横にすると、上の方向が端末の上から screenAngle だけずれるので足す。戻り値 { heading, source } か null */
  function headingOf(e, screenAngle) {
    var h, src;
    if (typeof e.webkitCompassHeading === 'number' && e.webkitCompassHeading >= 0) {
      h = e.webkitCompassHeading;
      src = 'ios';
    } else if (typeof e.alpha === 'number') {
      h = 360 - e.alpha;
      src = e.absolute || e.type === 'deviceorientationabsolute' ? 'absolute' : 'relative';
    } else return null;
    return { heading: norm(h + (screenAngle || 0)), source: src };
  }

  /* なめらかな追従: 今の表示 cur を、目標 target へ時間 dt(秒)の分だけ近づける。tau は追いつくまでの時間の目安(秒)。
     近い向きに回るので、359° と 1° の間で逆回りに1周しない。小さな震えは deadband(度)以下なら無視する */
  function follow(cur, target, dt, tau, deadband) {
    var d = diff(cur, target);
    if (Math.abs(d) <= (deadband || 0)) return cur;
    var k = 1 - Math.exp(-Math.max(0, dt) / (tau || 0.15));
    return norm(cur + d * k);
  }

  /* 水平の気泡の位置: 前後の傾き beta・左右の傾き gamma(度)から、気泡の中心からのずれ(-1〜1)を求める。
     気泡は高い方へ動くので、傾きと逆向き。full 度で枠の端に届き、それ以上は端で止める */
  function bubble(beta, gamma, full) {
    var f = full || 10,
      x = -(gamma || 0) / f,
      y = -(beta || 0) / f,
      r = Math.hypot(x, y);
    if (r > 1) {
      x /= r;
      y /= r;
    }
    return { x: x, y: y, tilt: Math.hypot(beta || 0, gamma || 0) };
  }

  /* 値の細かな揺れ(度): 続く3つの値の「変わり方の変わり方」(2階の差)の中央値。
     一定の速さで回している時は小さく、行ったり来たり震え続ける時だけ大きくなる(回しただけで不安定と言わないため)。
     平均でなく中央値にして、急に向きを変えた1回だけの跳びは数えない */
  function jitter(hs) {
    if (hs.length < 3) return 0;
    var d = [];
    for (var i = 2; i < hs.length; i++) d.push(Math.abs(diff(hs[i - 1], hs[i]) - diff(hs[i - 2], hs[i - 1])));
    d.sort(function (a, b) {
      return a - b;
    });
    return d[d.length >> 1];
  }

  /* 目標の方位までのずれの説明。差が tol 度以内なら「目標の方位です」 */
  function targetText(heading, target, tol) {
    var d = diff(heading, target);
    if (Math.abs(d) <= (tol || 2)) return '目標の方位です';
    return (d > 0 ? '右へ ' : '左へ ') + Math.round(Math.abs(d)) + '°';
  }

  var api = {
    DIRS: DIRS,
    norm: norm,
    diff: diff,
    dirLabel: dirLabel,
    headingOf: headingOf,
    follow: follow,
    bubble: bubble,
    targetText: targetText,
    jitter: jitter,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.CompassCore = api;
})(this);
