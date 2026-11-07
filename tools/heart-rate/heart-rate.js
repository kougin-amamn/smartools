/* 心拍数計の画面。背面カメラとライトを指でふさいでもらい、赤の明るさの揺れから心拍数を測る。計算は heart-rate-core.js */
(function () {
  'use strict';
  var H = window.HeartRateCore,
    $ = function (id) {
      return document.getElementById(id);
    };
  var video = $('video'),
    statusEl = $('status'),
    bpmEl = $('bpm'),
    heart = $('heart'),
    bar = $('bar'),
    wave = $('wave'),
    startBtn = $('startBtn'),
    historyEl = $('history'),
    clearBtn = $('clearBtn'),
    sample = $('sample');
  var sctx = sample.getContext('2d', { willReadFrequently: true }),
    wctx = wave.getContext('2d');
  var KEY = 'heart-rate-history',
    MEASURE = 20 /* 指を当て続けて測る秒数 */,
    WINDOW = 12; /* 計算に使う直近の秒数 */

  var stream = null,
    track = null,
    torch = false,
    running = false,
    samples = [],
    coveredSince = 0,
    lastCalc = 0,
    lastPeak = -1,
    live = null,
    raf = 0,
    lostLogged = false;

  function setStatus(text, ok) {
    statusEl.textContent = text;
    statusEl.classList.toggle('ok', !!ok);
  }

  /* 記録(端末に保存。直近10件) */
  function loadHistory() {
    try {
      return JSON.parse(localStorage.getItem(KEY) || '[]');
    } catch (e) {
      log.warn('記録の読み込みに失敗しました', e);
      return [];
    }
  }
  function renderHistory() {
    var h = loadHistory();
    historyEl.innerHTML = h.length
      ? h
          .map(function (r) {
            var d = new Date(r.t);
            return (
              '<li><span>' +
              (d.getMonth() + 1) +
              '/' +
              d.getDate() +
              ' ' +
              String(d.getHours()).padStart(2, '0') +
              ':' +
              String(d.getMinutes()).padStart(2, '0') +
              '</span><span><b>' +
              r.bpm +
              '</b> bpm(' +
              H.zone(r.bpm) +
              ')</span></li>'
            );
          })
          .join('')
      : '<li class="empty">まだありません</li>';
    clearBtn.hidden = !h.length;
  }
  function addHistory(bpm) {
    var h = loadHistory();
    h.unshift({ t: Date.now(), bpm: bpm });
    try {
      localStorage.setItem(KEY, JSON.stringify(h.slice(0, 10)));
    } catch (e) {
      log.warn('記録の保存に失敗しました', e);
    }
    renderHistory();
  }

  /* 波形: 直近5秒をフィルター後の値で描き、脈の位置に印を付ける */
  function drawWave(sig, peaks) {
    var w = wave.width,
      h = wave.height,
      css = getComputedStyle(document.documentElement);
    wctx.clearRect(0, 0, w, h);
    if (!sig || sig.length < 10) return;
    var n = Math.min(sig.length, H.FS * 5),
      s = sig.slice(sig.length - n),
      max = Math.max.apply(null, s.map(Math.abs)) || 1;
    wctx.strokeStyle = css.getPropertyValue('--wave').trim() || '#5cc4b6';
    wctx.lineWidth = 3;
    wctx.beginPath();
    s.forEach(function (v, i) {
      var x = (i / (n - 1)) * w,
        y = h / 2 - (v / max) * h * 0.4;
      if (i) wctx.lineTo(x, y);
      else wctx.moveTo(x, y);
    });
    wctx.stroke();
    wctx.fillStyle = css.getPropertyValue('--beat').trim() || '#e05a6a';
    (peaks || []).forEach(function (p) {
      var i = p - (sig.length - n);
      if (i < 0) return;
      wctx.beginPath();
      wctx.arc((i / (n - 1)) * w, h / 2 - (s[i] / max) * h * 0.4, 5, 0, Math.PI * 2);
      wctx.fill();
    });
  }
  function beat() {
    heart.classList.add('beat');
    ToolKit.vibrate(15);
    setTimeout(function () {
      heart.classList.remove('beat');
    }, 140);
  }

  /* 1コマごと: 映像の中央を 32×32 に縮めて赤・緑・青の平均を取る */
  function frame() {
    raf = requestAnimationFrame(frame);
    if (!running || video.readyState < 2) return;
    var vw = video.videoWidth,
      vh = video.videoHeight,
      s = Math.min(vw, vh) * 0.5;
    sctx.drawImage(video, (vw - s) / 2, (vh - s) / 2, s, s, 0, 0, 32, 32);
    var d = sctx.getImageData(0, 0, 32, 32).data,
      r = 0,
      g = 0,
      b = 0;
    for (var i = 0; i < d.length; i += 4) {
      r += d[i];
      g += d[i + 1];
      b += d[i + 2];
    }
    var n = d.length / 4;
    r /= n;
    g /= n;
    b /= n;
    var now = performance.now() / 1000;
    if (!H.isFinger(r, g, b, !torch)) {
      if (samples.length && !lostLogged) {
        lostLogged = true;
        log.warn('指が離れたため測り直します(' + Math.round(now - coveredSince) + '秒で中断)');
      }
      samples = [];
      coveredSince = 0;
      live = null;
      bpmEl.textContent = '--';
      bar.style.width = '0';
      setStatus('背面のカメラとライトを、人差し指の腹でそっとふさいでください');
      drawWave(null);
      return;
    }
    if (!coveredSince) {
      coveredSince = now;
      lostLogged = false;
      log(
        '指を検出しました(赤 ' +
          Math.round(r) +
          ' / 緑 ' +
          Math.round(g) +
          ' / 青 ' +
          Math.round(b) +
          ')',
      );
    }
    /* 赤は明るすぎて飽和しやすいので、赤と緑を混ぜた明るさを使う(緑は脈の揺れが大きい) */
    samples.push({ t: now, v: r * 0.5 + g * 0.5 });
    while (samples.length && samples[0].t < now - WINDOW) samples.shift();
    var held = now - coveredSince;
    bar.style.width = Math.min(100, (held / MEASURE) * 100) + '%';
    if (now - lastCalc > 0.25) {
      lastCalc = now;
      var est = H.estimate(samples);
      if (est.signal) drawWave(est.signal, est.peaks);
      /* いちばん新しい脈の時刻が変わったら、ハートを動かす */
      var pt =
        est.peaks && est.peaks.length ? samples[0].t + est.peaks[est.peaks.length - 1] / H.FS : -1;
      if (pt > lastPeak + 0.25) {
        lastPeak = pt;
        if (est.quality >= 0.5) beat();
      }
      if (held > 6 && est.quality >= 0.5) {
        live = est;
        bpmEl.textContent = Math.round(est.bpm);
        setStatus(
          '測っています…そのまま動かさないでください(あと ' +
            Math.max(0, Math.ceil(MEASURE - held)) +
            '秒)',
          true,
        );
      } else
        setStatus(
          held < 6 ? '脈を探しています…' : '波形が乱れています。指の力を少しゆるめてください',
          true,
        );
    }
    if (held >= MEASURE) finish();
  }

  function finish() {
    var est = H.estimate(samples);
    stop(false);
    if (est.quality >= 0.5) {
      var bpm = Math.round(est.bpm);
      bpmEl.textContent = bpm;
      setStatus('測り終えました:' + bpm + ' bpm(' + H.zone(bpm) + ')', true);
      addHistory(bpm);
      log(
        '測定が終わりました(' +
          bpm +
          ' bpm / 品質 ' +
          est.quality.toFixed(2) +
          ' / ' +
          samples.length +
          '点)',
      );
    } else {
      bpmEl.textContent = '--';
      setStatus('うまく測れませんでした。指の力をゆるめ、明るい所でもう一度お試しください');
      log.warn('脈の波形が安定せず測れませんでした(品質 ' + est.quality.toFixed(2) + ')');
    }
  }

  async function start() {
    var r = await ToolKit.media.open(
      {
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 640 },
          height: { ideal: 480 },
          frameRate: { ideal: 30 },
        },
      },
      'カメラ',
    );
    if (!r.stream) {
      setStatus(r.message);
      return;
    }
    stream = r.stream;
    track = stream.getVideoTracks()[0];
    video.srcObject = stream;
    try {
      await video.play();
    } catch (e) {
      log.warn('映像の再生を開始できませんでした', e);
    }
    var t = await ToolKit.media.torch(track, true);
    torch = !!t.ok;
    if (!torch)
      log.warn('ライトが使えないため、周りの光で測ります(' + (t.message || '非対応') + ')');
    running = true;
    samples = [];
    coveredSince = 0;
    lastPeak = -1;
    live = null;
    startBtn.textContent = '測定をやめる';
    setStatus(
      torch
        ? '背面のカメラとライトを、人差し指の腹でそっとふさいでください'
        : 'この端末はライトが使えません。明るい所で、指先をカメラにそっと当ててください',
    );
    log(
      '測定を始めました(' +
        ToolKit.media.size(track) +
        ' / ライト ' +
        (torch ? 'あり' : 'なし') +
        ')',
    );
  }
  function stop(byUser) {
    running = false;
    if (track && torch) ToolKit.media.torch(track, false);
    if (ToolKit.media.stop(stream) && byUser)
      log('測定をやめました' + (live ? '(途中の値 ' + Math.round(live.bpm) + ' bpm)' : ''));
    stream = null;
    track = null;
    bar.style.width = '0';
    startBtn.textContent = '測定を始める';
  }

  startBtn.addEventListener('click', function () {
    ToolKit.vibrate();
    if (running) {
      stop(true);
      setStatus('測定をやめました');
    } else
      start().catch(function (e) {
        log.error('測定の開始でエラーが発生しました', e);
      });
  });
  clearBtn.addEventListener('click', function () {
    try {
      localStorage.removeItem(KEY);
    } catch (e) {
      log.warn('記録の削除に失敗しました', e);
    }
    renderHistory();
    log('記録を消しました');
  });

  renderHistory();
  raf = requestAnimationFrame(frame);
  log('起動しました(記録 ' + loadHistory().length + '件)');
})();
