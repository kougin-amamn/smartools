/* 曲の解析(Web Worker)。波形の点と3帯域の強さ、BPM と最初の拍、無音の区間を出す。Node でも試せる。
   受け取る音はモノラル・約11kHz に間引いた物(画面の側で作る) */
(function () {
  'use strict';

  var POINTS_PER_SECOND = 150;
  /* 拍を探す時の、低い音の強さの刻み(200回/秒 = 5ms) */
  var ENVELOPE_RATE = 200;
  var BPM_MIN = 70,
    BPM_MAX = 180;

  function onePoleOf(cutoff, rate) {
    return 1 - Math.exp((-2 * Math.PI * cutoff) / rate);
  }

  function analyze(mono, rate) {
    var perPoint = rate / POINTS_PER_SECOND,
      count = Math.floor(mono.length / perPoint);
    var peak = new Float32Array(count),
      low = new Float32Array(count),
      mid = new Float32Array(count),
      high = new Float32Array(count);
    var perFrame = rate / ENVELOPE_RATE,
      frames = Math.floor(mono.length / perFrame);
    var envelope = new Float32Array(frames);
    var lowCoef = onePoleOf(200, rate),
      midCoef = onePoleOf(2000, rate);
    var lowState = 0,
      midState = 0;
    for (var j = 0; j < mono.length; j++) {
      var x = mono[j];
      lowState += lowCoef * (x - lowState);
      midState += midCoef * (x - midState);
      var k = Math.floor(j / perPoint);
      if (k < count) {
        var a = Math.abs(x);
        if (a > peak[k]) peak[k] = a;
        low[k] += Math.abs(lowState);
        mid[k] += Math.abs(midState - lowState);
        high[k] += Math.abs(x - midState);
      }
      var f = Math.floor(j / perFrame);
      if (f < frames) envelope[f] += lowState * lowState;
    }

    var maxPeak = 0,
      maxBand = 0;
    for (var i = 0; i < count; i++) {
      if (peak[i] > maxPeak) maxPeak = peak[i];
      maxBand = Math.max(maxBand, low[i], mid[i], high[i]);
    }
    var points = new Uint8Array(count * 4);
    for (i = 0; i < count; i++) {
      points[i * 4] = maxPeak ? Math.round((peak[i] / maxPeak) * 255) : 0;
      points[i * 4 + 1] = maxBand ? Math.round((low[i] / maxBand) * 255) : 0;
      points[i * 4 + 2] = maxBand ? Math.round((mid[i] / maxBand) * 255) : 0;
      points[i * 4 + 3] = maxBand ? Math.round((high[i] / maxBand) * 255) : 0;
    }

    var tempo = tempoOf(onsetOf(envelope), ENVELOPE_RATE);
    return {
      points: points,
      pointsPerSecond: POINTS_PER_SECOND,
      duration: mono.length / rate,
      bpm: tempo.bpm,
      firstBeat: tempo.firstBeat,
      silences: silencesOf(peak, maxPeak),
    };
  }

  /* 低い音の強さが増えた所(拍の候補)。強さは対数で縮め、増えた分だけ残す */
  function onsetOf(envelope) {
    var out = new Float32Array(envelope.length),
      prev = 0;
    for (var i = 0; i < envelope.length; i++) {
      var v = Math.log(1 + 1000 * envelope[i]);
      out[i] = Math.max(0, v - prev);
      prev = v;
    }
    return out;
  }

  /* 自己相関で拍の間隔を探す。1〜4拍先の相関を足して(櫛形)山をはっきりさせ、0.05 BPM 刻みで調べる。
     その間隔で一番よく重なる位置を最初の拍にする */
  function tempoOf(onset, rate) {
    var n = Math.min(onset.length, rate * 120);
    var mean = 0;
    for (var i = 0; i < n; i++) mean += onset[i];
    mean /= n || 1;
    var o = new Float32Array(n);
    for (i = 0; i < n; i++) o[i] = onset[i] - mean;
    var maxLag = Math.ceil(((60 * rate) / BPM_MIN) * 4) + 2;
    var ac = new Float32Array(maxLag + 1);
    for (var lag = 1; lag <= maxLag && lag < n; lag++) {
      var s = 0;
      for (i = 0; i + lag < n; i++) s += o[i] * o[i + lag];
      ac[lag] = s;
    }
    function at(x) {
      var i0 = Math.floor(x),
        f = x - i0;
      return i0 + 1 <= maxLag ? ac[i0] * (1 - f) + ac[i0 + 1] * f : 0;
    }
    var best = 0,
      bestScore = 0;
    for (var bpm = BPM_MIN; bpm <= BPM_MAX; bpm += 0.05) {
      var period = (60 * rate) / bpm,
        score = 0;
      for (var m = 1; m <= 4; m++) score += at(period * m);
      if (score > bestScore) {
        bestScore = score;
        best = bpm;
      }
    }
    if (!best) return { bpm: 0, firstBeat: 0 };
    /* 半分・倍の取り違えを 88〜176 に寄せる */
    while (best < 88) best *= 2;
    while (best > 176) best /= 2;
    best = Math.round(best * 20) / 20;
    var beatPeriod = (60 * rate) / best,
      bestPhase = 0,
      phaseScore = -1;
    for (var phase = 0; phase < beatPeriod; phase += 0.5) {
      var sum = 0;
      for (var t = phase; t < onset.length; t += beatPeriod) sum += onset[Math.round(t)] || 0;
      if (sum > phaseScore) {
        phaseScore = sum;
        bestPhase = phase;
      }
    }
    return { bpm: best, firstBeat: bestPhase / rate };
  }

  /* 1.5秒以上ほぼ無音の所(レコードの溝の切れ目として描く)。秒の組で返す */
  function silencesOf(peak, maxPeak) {
    var out = [],
      start = -1,
      limit = maxPeak * 0.02,
      min = POINTS_PER_SECOND * 1.5;
    for (var i = 0; i <= peak.length; i++) {
      var quiet = i < peak.length && peak[i] <= limit;
      if (quiet && start < 0) start = i;
      if (!quiet && start >= 0) {
        if (i - start >= min) out.push([start / POINTS_PER_SECOND, i / POINTS_PER_SECOND]);
        start = -1;
      }
    }
    return out;
  }

  if (typeof module !== 'undefined' && module.exports)
    module.exports = { analyze: analyze, tempoOf: tempoOf };
  else if (typeof importScripts === 'function') {
    self.onmessage = function (e) {
      var result = analyze(e.data.mono, e.data.rate);
      result.id = e.data.id;
      self.postMessage(result, [result.points.buffer]);
    };
  }
})();
