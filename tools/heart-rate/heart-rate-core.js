/* 心拍数の計算(画面に依存しない。Node でテストできる)。window.HeartRateCore
   指先をカメラとライトでふさぐと、脈のたびに血液の量が変わって赤の明るさがわずかに揺れる(光電容積脈波)。
   その揺れを一定間隔に並べ直し、脈の速さの範囲だけを通すフィルターをかけてから、自己相関で周期を求める */
(function (root) {
  'use strict';
  var FS = 60; /* 並べ直す間隔(1秒あたりの点の数)。カメラは30コマ前後だが、細かく並べると速い脈でも周期の分解能が上がる */

  /* 指でふさいでいるか: ライトが指を透けた光は赤が強く、全体も明るい */
  function isFinger(r, g, b, noTorch) {
    /* ライトが使えない端末(iPhone など)は周りの光だけなので、暗めでも赤が勝っていればよしとする */
    if (noTorch) return r > 35 && r > g * 1.25 && r > b * 1.25;
    return r > 80 && r > g * 1.5 && r > b * 1.5;
  }

  /* 時刻つきの値 [{t: 秒, v}] を、一定間隔 1/FS 秒に並べ直す(線形補間) */
  function resample(samples, fs) {
    fs = fs || FS;
    if (samples.length < 2) return [];
    var out = [],
      t0 = samples[0].t,
      t1 = samples[samples.length - 1].t,
      j = 0;
    for (var t = t0; t <= t1; t += 1 / fs) {
      while (j < samples.length - 2 && samples[j + 1].t < t) j++;
      var a = samples[j],
        b = samples[j + 1],
        f = b.t === a.t ? 0 : (t - a.t) / (b.t - a.t);
      out.push(a.v + (b.v - a.v) * Math.max(0, Math.min(1, f)));
    }
    return out;
  }
  /* 2次のフィルター(RBJ の式)。type は 'hp'(高い周波数を通す)か 'lp'(低い周波数を通す) */
  function biquad(x, fs, f0, type) {
    var w = (2 * Math.PI * f0) / fs,
      cw = Math.cos(w),
      al = Math.sin(w) / (2 * Math.SQRT1_2),
      b0 = type === 'hp' ? (1 + cw) / 2 : (1 - cw) / 2,
      b1 = type === 'hp' ? -(1 + cw) : 1 - cw,
      a0 = 1 + al,
      a1 = -2 * cw,
      a2 = 1 - al,
      out = [],
      x1 = x[0],
      x2 = x[0],
      y1 = type === 'hp' ? 0 : x[0],
      y2 = y1;
    for (var i = 0; i < x.length; i++) {
      var y = (b0 * x[i] + b1 * x1 + b0 * x2 - a1 * y1 - a2 * y2) / a0;
      x2 = x1;
      x1 = x[i];
      y2 = y1;
      y1 = y;
      out.push(y);
    }
    return out;
  }
  /* 前から後ろから2回かけて、波形の位置がずれないようにする */
  function zeroPhase(x, fs, f0, type) {
    return biquad(biquad(x, fs, f0, type).reverse(), fs, f0, type).reverse();
  }
  /* 脈の成分だけを取り出す: 0.65Hz(39bpm)より遅い変化(呼吸・指の押し加減)と、4Hz(240bpm)より速い雑音を消す */
  function bandpass(x, fs) {
    fs = fs || FS;
    return zeroPhase(zeroPhase(x, fs, 0.65, 'hp'), fs, 4, 'lp');
  }

  /* 心拍数を求める。戻り値 { bpm, quality(0〜1。0.5 以上なら信用できる), peaks(脈の位置の番号) } */
  function estimate(samples, fs) {
    fs = fs || FS;
    var x = bandpass(resample(samples, fs), fs),
      n = x.length;
    if (n < fs * 4) return { bpm: 0, quality: 0, peaks: [] };
    var mean =
        x.reduce(function (s, v) {
          return s + v;
        }, 0) / n,
      y = x.map(function (v) {
        return v - mean;
      }),
      e0 = y.reduce(function (s, v) {
        return s + v * v;
      }, 0);
    if (e0 <= 0) return { bpm: 0, quality: 0, peaks: [] };
    /* 40〜200 bpm に当たるずれ(点の数)の範囲で自己相関がいちばん高い所 */
    var lo = Math.floor((fs * 60) / 200),
      hi = Math.ceil((fs * 60) / 40),
      ac = [];
    for (var lag = 0; lag <= hi + 1; lag++) {
      var s = 0;
      for (var i = 0; i + lag < n; i++) s += y[i] * y[i + lag];
      /* 重なる点の数で割って平均にする(そのまま足すと、ずれが大きいほど小さくなり、周期を短めに読んでしまう) */
      ac.push((s / (n - lag)) * (n / e0));
    }
    /* 周期の整数倍のずれでも同じくらい高くなるので、いちばん高い山の 9割以上ある山のうち、最も短いものを周期にする */
    var tops = [];
    for (var L = lo; L <= hi; L++) if (ac[L] > ac[L - 1] && ac[L] >= ac[L + 1]) tops.push(L);
    if (!tops.length) return { bpm: 0, quality: 0, peaks: [] };
    var maxv = Math.max.apply(
        null,
        tops.map(function (t) {
          return ac[t];
        })
      ),
      best = tops.filter(function (t) {
        return ac[t] >= maxv * 0.9;
      })[0],
      bv = ac[best];
    /* 前後の点で放物線を当てて、点と点の間の位置まで求める */
    var a = ac[best - 1],
      b = ac[best],
      c = ac[best + 1],
      den = a - 2 * b + c,
      off = den ? (0.5 * (a - c)) / den : 0,
      period = (best + Math.max(-0.5, Math.min(0.5, off))) / fs,
      peaks = [];
    /* 波形に印を付けるための脈の位置: 周期の 6割より離れた山 */
    var gap = Math.round(best * 0.6);
    for (var p = 1; p < n - 1; p++)
      if (
        y[p] > 0 &&
        y[p] >= y[p - 1] &&
        y[p] > y[p + 1] &&
        (!peaks.length || p - peaks[peaks.length - 1] > gap)
      )
        peaks.push(p);
    var quality = Math.max(0, Math.min(1, bv));
    return { bpm: 60 / period, quality: quality, peaks: peaks, signal: y };
  }

  /* 心拍数の目安(安静時の成人) */
  function zone(bpm) {
    if (bpm < 50) return 'ゆっくり';
    if (bpm <= 100) return 'ふつう';
    return '速め';
  }

  var api = {
    FS: FS,
    isFinger: isFinger,
    resample: resample,
    bandpass: bandpass,
    biquad: biquad,
    estimate: estimate,
    zone: zone,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.HeartRateCore = api;
})(this);
