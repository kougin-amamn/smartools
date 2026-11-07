/* DJターンテーブルの計算(アームの角度・速さ・ミキサーの曲線・拍・表示)。DOM を使わず Node で試せる */
(function (root) {
  'use strict';

  /* 33⅓回転/分は 1秒に 200度。盤の角度は再生位置だけで決め、音と絵を必ずそろえる */
  var DEGREES_PER_SECOND = 200;

  /* 本体(プリンス)を 130×110 の単位で表す(下の帯に START と 33/45)。盤 332mm ≒ 94単位(0.283単位/mm)。
     アームは有効長 230mm ≒ 65、支点から盤の中心まで 215mm ≒ 61(オーバーハング 15mm) */
  var PLINTH = {
    width: 130,
    height: 110,
    centerX: 50,
    centerY: 50,
    platterRadius: 47,
    recordRadius: 43,
    labelRadius: 14.5,
    grooveOuter: 41,
    grooveInner: 17.5,
    pivotX: 105,
    pivotY: 23,
    armLength: 65,
    restAngle: 92,
  };

  var RPM_NOMINAL = 100 / 3;
  var NUDGE_LIMIT = 0.04;

  function clamp(v, lo, hi) {
    return v < lo ? lo : v > hi ? hi : v;
  }

  /* 角度の差を -180〜180 度にそろえる(真横をまたいでも値が飛ばないように) */
  function unwrapDegrees(d) {
    return ((((d + 180) % 360) + 360) % 360) - 180;
  }

  function speedOf(rpm, pitchPercent) {
    return (rpm / RPM_NOMINAL) * (1 + pitchPercent / 100);
  }

  /* ピッチフェーダー(-1〜1)を % にする。中央の少しの幅は 0 に吸い付く(実機の中央の止まり) */
  function pitchOfFader(value, range) {
    return Math.abs(value) < 0.02 ? 0 : value * range;
  }

  /* 再生の進み具合(0〜1)に合わせたアームの角度。針は外の溝から内へ半径に比例して進む。
     余弦定理で、針が盤の中心から半径 r に来る角度を求める */
  function armAngleOf(progress) {
    var p = clamp(progress || 0, 0, 1);
    var r = PLINTH.grooveOuter - p * (PLINTH.grooveOuter - PLINTH.grooveInner);
    var dx = PLINTH.centerX - PLINTH.pivotX,
      dy = PLINTH.centerY - PLINTH.pivotY,
      d = Math.sqrt(dx * dx + dy * dy),
      L = PLINTH.armLength;
    var alpha = Math.acos(clamp((L * L + d * d - r * r) / (2 * L * d), -1, 1));
    return ((Math.atan2(dy, dx) - alpha) * 180) / Math.PI;
  }

  function stylusOf(angle) {
    var a = (angle * Math.PI) / 180;
    return {
      x: PLINTH.pivotX + PLINTH.armLength * Math.cos(a),
      y: PLINTH.pivotY + PLINTH.armLength * Math.sin(a),
    };
  }

  /* アームの角度から進み具合を求める。針がレコードの外なら null */
  function progressOfArmAngle(angle) {
    var s = stylusOf(angle);
    var r = Math.hypot(s.x - PLINTH.centerX, s.y - PLINTH.centerY);
    if (r > PLINTH.recordRadius) return null;
    return clamp((PLINTH.grooveOuter - r) / (PLINTH.grooveOuter - PLINTH.grooveInner), 0, 1);
  }

  /* クロスフェーダー(0=A〜1=B)の音量。なめらか=等パワー、スクラッチ=端の 4% で一気に入る */
  function crossfaderGainsOf(x, curve) {
    x = clamp(x, 0, 1);
    if (curve === 'scratch') return { a: clamp((1 - x) / 0.04, 0, 1), b: clamp(x / 0.04, 0, 1) };
    return { a: Math.cos((x * Math.PI) / 2), b: Math.sin((x * Math.PI) / 2) };
  }

  /* アイソレーターのつまみ(-1〜1)。左いっぱいで消音、右いっぱいで 2倍(約 +6dB) */
  function isolatorGainOf(value) {
    return value < 0 ? Math.pow(1 + value, 2) : 1 + value;
  }

  /* ゲインのつまみ(-1〜1)を ±12dB に */
  function trimGainOf(value) {
    return Math.pow(10, (value * 12) / 20);
  }

  /* フェーダーと音量(0〜1)。耳の感じ方に合わせて2乗にする */
  function volumeOf(value) {
    return value * value;
  }

  /* フィルターのつまみ(-1〜1)。左で高音を削り(ローパス)、右で低音を削る(ハイパス)。中央は素通し */
  function filterOf(value) {
    var t;
    if (value < -0.03) {
      t = (-value - 0.03) / 0.97;
      return { type: 'lowpass', frequency: 20000 * Math.pow(150 / 20000, t), q: 1 };
    }
    if (value > 0.03) {
      t = (value - 0.03) / 0.97;
      return { type: 'highpass', frequency: 20 * Math.pow(6000 / 20, t), q: 1 };
    }
    return { type: 'lowpass', frequency: 22000, q: Math.SQRT1_2 };
  }

  /* 指で縁をこする速さ(度/秒)を、一時的な速さの増減にする */
  function nudgeOf(degreesPerSecond) {
    return clamp(degreesPerSecond / 2500, -NUDGE_LIMIT, NUDGE_LIMIT);
  }

  /* ストロボの点(0% の列)が見かけで流れる速さ(度/秒)。
     点は2度おき、街灯は 100回/秒 光る。1回の光の間に盤が進む角度の、点の間隔に対する余りが見える */
  function strobeDriftOf(speedRatio) {
    var step = 2 * speedRatio;
    var wrapped = ((((step + 1) % 2) + 2) % 2) - 1;
    return wrapped * 100;
  }

  /* 時刻 from〜to の拍の位置(4拍ごとに小節の頭) */
  function beatsBetween(bpm, firstBeat, from, to) {
    if (!(bpm > 0)) return [];
    var period = 60 / bpm,
      out = [];
    for (var n = Math.ceil((from - firstBeat) / period); out.length < 128; n++) {
      var t = firstBeat + n * period;
      if (t > to) break;
      if (t >= 0) out.push({ time: t, isBar: ((n % 4) + 4) % 4 === 0 });
    }
    return out;
  }

  function formatTime(seconds) {
    var s = Math.max(0, Math.floor(seconds || 0));
    return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  }

  function formatPitch(percent) {
    var v = Math.round(percent * 10) / 10;
    return (v > 0 ? '+' : '') + v.toFixed(1) + '%';
  }

  function titleOf(fileName) {
    return String(fileName || '').replace(/\.[A-Za-z0-9]{1,5}$/, '');
  }

  function trackKeyOf(name, size, duration) {
    return name + '|' + size + '|' + Math.round(duration * 10);
  }

  /* ラベルの紙の色。名前から決め、同じ曲はいつも同じ色 */
  function labelColorOf(name) {
    var h = 0;
    for (var i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
    return 'hsl(' + (h % 360) + ' 42% 64%)';
  }

  /* 保存する曲の情報を新しい順に max 件まで残す */
  function pruneTracks(tracks, max) {
    var keys = Object.keys(tracks);
    if (keys.length <= max) return tracks;
    keys.sort(function (a, b) {
      return (tracks[b].used || 0) - (tracks[a].used || 0);
    });
    var out = {};
    keys.slice(0, max).forEach(function (k) {
      out[k] = tracks[k];
    });
    return out;
  }

  var api = {
    DEGREES_PER_SECOND: DEGREES_PER_SECOND,
    PLINTH: PLINTH,
    NUDGE_LIMIT: NUDGE_LIMIT,
    clamp: clamp,
    unwrapDegrees: unwrapDegrees,
    speedOf: speedOf,
    pitchOfFader: pitchOfFader,
    armAngleOf: armAngleOf,
    stylusOf: stylusOf,
    progressOfArmAngle: progressOfArmAngle,
    crossfaderGainsOf: crossfaderGainsOf,
    isolatorGainOf: isolatorGainOf,
    trimGainOf: trimGainOf,
    volumeOf: volumeOf,
    filterOf: filterOf,
    nudgeOf: nudgeOf,
    strobeDriftOf: strobeDriftOf,
    beatsBetween: beatsBetween,
    formatTime: formatTime,
    formatPitch: formatPitch,
    titleOf: titleOf,
    trackKeyOf: trackKeyOf,
    labelColorOf: labelColorOf,
    pruneTracks: pruneTracks,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.DJCore = api;
})(this);
