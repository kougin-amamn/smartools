/* DJデッキの計算(時間の文字・クロスフェーダー・ピッチ・盤の角度・波形の山・Int16 への変換)。DOM を使わず Node で試せる */
(function (root) {
  'use strict';

  /* 33⅓回転/分は 1秒に 200度(1周 1.8 秒)。worklet(common/turntable-worklet.js)も同じ割合で角度を曲の位置に直す */
  var DEGREES_PER_SECOND = 200;

  function pad(n) {
    return String(n).padStart(2, '0');
  }

  /* 秒 → '03:25'。数でない時(長さがまだ分からない)は '00:00' */
  function formatTime(seconds) {
    if (!isFinite(seconds) || seconds < 0) return '00:00';
    var s = Math.floor(seconds);
    return pad(Math.floor(s / 60)) + ':' + pad(s % 60);
  }

  /* クロスフェーダーの位置(0 = A だけ、1 = B だけ)→ 両方の音量。中央で両方が約 0.71 になる曲線 */
  function crossfadeGainsOf(position) {
    var x = Math.min(1, Math.max(0, position));
    return { a: Math.cos((x * Math.PI) / 2), b: Math.sin((x * Math.PI) / 2) };
  }

  /* ピッチ(%)→ 再生の速さ */
  function rateOf(pitchPercent) {
    return 1 + pitchPercent / 100;
  }

  /* 角度の差(度)を -180〜180 に直す。指が真上や真下を横切っても、反対回りの1周と取り違えないため */
  function unwrapDegrees(delta) {
    return ((((delta + 180) % 360) + 360) % 360) - 180;
  }

  /* 再生位置(秒)→ 盤の絵の角度(度、0〜360) */
  function platterAngleOf(seconds) {
    return (((seconds * DEGREES_PER_SECOND) % 360) + 360) % 360;
  }

  /* -1〜1 の音 → Int16(worklet へ渡す時、記憶領域を半分にするため) */
  function int16Of(samples) {
    var out = new Int16Array(samples.length);
    for (var i = 0; i < samples.length; i++) {
      var v = samples[i];
      out[i] = (v > 1 ? 1 : v < -1 ? -1 : v) * 32767;
    }
    return out;
  }

  /* 音のチャンネルの配列(Float32Array など)→ count 本の山の高さ(0〜1)。各区間の最大の振れ幅を、全体の最大で割る */
  function peaksOf(channels, count) {
    var length = channels.length ? channels[0].length : 0;
    var peaks = new Array(count).fill(0);
    if (!length || count < 1) return peaks;
    var step = length / count,
      top = 0;
    for (var i = 0; i < count; i++) {
      var from = Math.floor(i * step),
        to = Math.max(from + 1, Math.floor((i + 1) * step)),
        max = 0;
      for (var c = 0; c < channels.length; c++) {
        var data = channels[c];
        for (var j = from; j < to && j < length; j++) {
          var v = Math.abs(data[j]);
          if (v > max) max = v;
        }
      }
      peaks[i] = max;
      if (max > top) top = max;
    }
    return top ? peaks.map((p) => p / top) : peaks;
  }

  var api = {
    DEGREES_PER_SECOND: DEGREES_PER_SECOND,
    formatTime: formatTime,
    crossfadeGainsOf: crossfadeGainsOf,
    rateOf: rateOf,
    unwrapDegrees: unwrapDegrees,
    platterAngleOf: platterAngleOf,
    int16Of: int16Of,
    peaksOf: peaksOf,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.DjDecksCore = api;
})(this);
