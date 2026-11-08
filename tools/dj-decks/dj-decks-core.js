/* DJデッキの計算(時間の文字・クロスフェーダー・ピッチ・スクラッチの角度・波形の山)。DOM を使わず Node で試せる */
(function (root) {
  'use strict';

  /* 33⅓回転/分は 1周 1.8 秒。盤をなぞった角度を、この割合で再生位置の秒に直す */
  var SECONDS_PER_TURN = 1.8;

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

  /* なぞった角度の差(ラジアン)→ 秒。半周を超える差は反対回りとして扱う */
  function secondsOfAngle(delta) {
    if (delta > Math.PI) delta -= Math.PI * 2;
    if (delta < -Math.PI) delta += Math.PI * 2;
    return (delta / (Math.PI * 2)) * SECONDS_PER_TURN;
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
    SECONDS_PER_TURN: SECONDS_PER_TURN,
    formatTime: formatTime,
    crossfadeGainsOf: crossfadeGainsOf,
    rateOf: rateOf,
    secondsOfAngle: secondsOfAngle,
    peaksOf: peaksOf,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.DjDecksCore = api;
})(this);
