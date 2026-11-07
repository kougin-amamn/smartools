/* ターンテーブル画面の計算(盤の角度・針の位置・波形・時間表示)。画面に依存せず Node でテストできる */
(function (root) {
  'use strict';

  /* 33⅓回転/分は 1 秒あたり 200 度。盤の角度は曲の再生位置だけで決まるので、
     指で回したり逆回転したりしても音と見た目が必ずそろう */
  var DEG_PER_SEC = 200;

  /* 盤の中心 C、トーンアームの支点 P と長さ L。盤の溝は半径 R_OUT(外)〜 R_IN(内) */
  var GEO = { cx: 165, cy: 165, px: 345, py: 52, len: 215, rOut: 130, rIn: 54, restDeg: 90 };

  function fmtTime(sec) {
    var s = Math.max(0, Math.floor(sec || 0));
    return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
  }

  function platterAngle(sec) {
    return (((sec * DEG_PER_SEC) % 360) + 360) % 360;
  }

  /* 回転数(33 / 45)とピッチ(%)から、再生速度の倍率を求める */
  function speedFactor(rpm, pitchPct) {
    return (rpm / (100 / 3)) * (1 + pitchPct / 100);
  }

  /* 角度の差を -180〜180 度にそろえる(真横の 180° をまたいでも値が飛ばないように) */
  function unwrap(d) {
    return ((((d + 180) % 360) + 360) % 360) - 180;
  }

  /* 指で回した角速度(度)から、再生速度の倍率を求める。逆回転は負の値 */
  function scratchRate(dDeg, dtSec) {
    if (!(dtSec > 0)) return 0;
    var r = dDeg / dtSec / DEG_PER_SEC;
    return Math.max(-8, Math.min(8, r));
  }

  /* 再生の進み具合(0〜1)に合わせたアームの角度。針が外側の溝から内側へ半径に比例して進む。
     余弦定理で、針が盤の中心から半径 r の位置に来る角度を求める */
  function armAngle(progress) {
    var p = Math.max(0, Math.min(1, progress || 0));
    var r = GEO.rOut - p * (GEO.rOut - GEO.rIn);
    var dx = GEO.cx - GEO.px,
      dy = GEO.cy - GEO.py,
      d = Math.sqrt(dx * dx + dy * dy);
    var cosA = (GEO.len * GEO.len + d * d - r * r) / (2 * GEO.len * d);
    var alpha = Math.acos(Math.max(-1, Math.min(1, cosA)));
    return ((Math.atan2(dy, dx) - alpha) * 180) / Math.PI;
  }

  /* アームの先(針)の位置 */
  function stylusAt(deg) {
    var a = (deg * Math.PI) / 180;
    return { x: GEO.px + GEO.len * Math.cos(a), y: GEO.py + GEO.len * Math.sin(a) };
  }

  /* 波形の概要(n 本の棒)。左右を平均し、一番大きい所が 1 になるようにそろえる */
  function peaks(a, b, n) {
    var out = new Float32Array(n),
      len = a.length,
      max = 0;
    for (var i = 0; i < n; i++) {
      var s = Math.floor((i * len) / n),
        e = Math.max(s + 1, Math.floor(((i + 1) * len) / n)),
        step = Math.max(1, Math.floor((e - s) / 64)),
        m = 0;
      for (var j = s; j < e && j < len; j += step) {
        var v = Math.abs(b ? (a[j] + b[j]) / 2 : a[j]);
        if (v > m) m = v;
      }
      out[i] = m;
      if (m > max) max = m;
    }
    if (max > 0) for (var k = 0; k < n; k++) out[k] /= max;
    return out;
  }

  function trackTitle(fileName) {
    return String(fileName || '').replace(/\.[A-Za-z0-9]{1,5}$/, '');
  }

  /* ラベルに入れる題名を、最大 2 行・1 行 7 文字に切る(はみ出す分は … で省く) */
  function labelLines(title) {
    var chars = Array.from(String(title || ''));
    if (chars.length <= 7) return [chars.join('')];
    var first = chars.slice(0, 7).join(''),
      rest = chars.slice(7);
    var second = rest.length > 7 ? rest.slice(0, 6).join('') + '…' : rest.join('');
    return [first, second];
  }

  var api = {
    DEG_PER_SEC: DEG_PER_SEC,
    GEO: GEO,
    fmtTime: fmtTime,
    platterAngle: platterAngle,
    speedFactor: speedFactor,
    unwrap: unwrap,
    scratchRate: scratchRate,
    armAngle: armAngle,
    stylusAt: stylusAt,
    peaks: peaks,
    trackTitle: trackTitle,
    labelLines: labelLines,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.DJCore = api;
})(this);
