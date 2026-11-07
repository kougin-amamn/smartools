/* 画像分類の画面の動き。TensorFlow.js は CDN から、MobileNet のモデルは Google のストレージから読み込む。
   計算は image-classifier-core.js、カメラは ToolKit.media、ボタンの操作ログは tool-kit.js に任せる */
(function () {
  'use strict';
  var C = window.ClassifyCore;

  /* 設定
     @tensorflow-models/mobilenet は TF Hub の URL を使うが、2025年10月ごろからブラウザでは 403 で読めない
     報告があるため、同じモデルを Google のストレージから直接読み込む */
  var TF_URL = 'https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.22.0/dist/tf.min.js';
  var GCS = 'https://storage.googleapis.com/tfjs-models/';
  var MODELS = {
    /* v1 は Keras 形式。入力は -1〜1、出力は確率(1000) */
    v1_025: {
      name: '軽量',
      url: GCS + 'tfjs/mobilenet_v1_0.25_224/model.json',
      layers: true,
      signed: true,
    },
    v1_050: {
      name: '標準',
      url: GCS + 'tfjs/mobilenet_v1_0.50_224/model.json',
      layers: true,
      signed: true,
    },
    /* v2 は TF Hub 形式。入力は 0〜1(中で -1〜1 に直す)、出力は先頭に「背景」を含む 1001 個の値 */
    v2_100: {
      name: '高精度',
      url: GCS + 'savedmodel/mobilenet_v2_1.0_224/model.json',
      layers: false,
      signed: false,
    },
  };
  var CACHE_PREFIX = 'indexeddb://image-classifier-'; /* 後ろにモデルの種類 */
  var SIZE = 224; /* モデルの入力の大きさ */
  var MAX_SIDE = 1280; /* 表示用の絵の長い辺 */
  var MIN_INTERVAL = 200; /* カメラの判定の最短間隔(ms)。電池と発熱を抑える */
  var SMOOTH = 0.35; /* カメラの結果をならす時の新しい値の重み */
  var RANGE_NAME = { center: '中央の正方形', whole: '全体' };
  var STORE = 'image-classifier-settings';

  var $ = function (id) {
    return document.getElementById(id);
  };
  var cv = $('cv'),
    ctx = cv.getContext('2d'),
    inCv = document.createElement('canvas'),
    inCtx,
    video = $('video'),
    view = $('view'),
    placeholder = $('placeholder'),
    loader = $('loader'),
    stepsEl = $('steps'),
    elapsedEl = $('elapsed'),
    retryBtn = $('retry'),
    camBtn = $('camBtn'),
    flipBtn = $('flipBtn'),
    pauseBtn = $('pauseBtn'),
    fileIn = $('file'),
    statusEl = $('status'),
    resultEl = $('result'),
    topName = $('topName'),
    topEn = $('topEn'),
    topPct = $('topPct'),
    hintEl = $('hint'),
    rankEl = $('rank');
  inCv.width = inCv.height = SIZE;
  inCtx = inCv.getContext('2d', { willReadFrequently: true });

  var labels = [],
    model = null,
    modelInfo = null,
    loadingModel = false,
    settings = { model: 'v1_025', range: 'center', topN: 5, minScore: 20, smooth: true },
    mode = 'none' /* none / camera / image */,
    stream = null,
    facing = 'environment',
    paused = false,
    raf = 0,
    busy = false,
    lastRun = 0,
    probs = null,
    stats = { runs: 0, ms: 0 },
    camW = 0,
    camH = 0,
    imageSrc = null;

  /* 設定の保存 */
  try {
    var saved = JSON.parse(localStorage.getItem(STORE) || 'null');
    if (saved && MODELS[saved.model]) settings = Object.assign(settings, saved);
  } catch (e) {
    log.warn('保存した設定を読み込めませんでした', e);
  }
  function saveSettings() {
    try {
      localStorage.setItem(STORE, JSON.stringify(settings));
    } catch (e) {
      log.warn('設定の保存に失敗しました', e);
    }
  }
  $('model').value = settings.model;
  $('range').value = settings.range;
  $('topN').value = settings.topN;
  $('minScore').value = settings.minScore;
  $('smooth').checked = settings.smooth;
  function showSliders() {
    $('topNVal').textContent = $('topN').value + '件';
    $('minScoreVal').textContent = $('minScore').value + '%';
  }
  showSliders();

  /* 読み込みの進み具合
     段階ごとに経過秒を出す。止まって見えないよう、全体の経過秒は 0.1 秒ごとに更新する */
  var STEPS = [
    ['lib', 'ライブラリ(TensorFlow.js)'],
    ['model', 'AIモデル'],
    ['warm', '試しの判定(初回の準備)'],
  ];
  var t0 = 0,
    tick = 0;
  function resetSteps() {
    stepsEl.textContent = '';
    STEPS.forEach(function (s) {
      var li = document.createElement('li');
      li.id = 'step-' + s[0];
      li.innerHTML = '<span></span><span class="sec"></span>';
      li.firstChild.textContent = s[1];
      stepsEl.appendChild(li);
    });
  }
  function step(id, state, sec, label) {
    var li = $('step-' + id);
    li.className = state;
    if (label) li.firstChild.textContent = label;
    li.lastChild.textContent = sec != null ? sec.toFixed(1) + '秒' : '';
  }
  function showLoader(on) {
    loader.hidden = !on;
    clearInterval(tick);
    if (on) {
      t0 = performance.now();
      tick = setInterval(function () {
        elapsedEl.textContent = ((performance.now() - t0) / 1000).toFixed(1) + '秒';
      }, 100);
    }
  }
  function loadScript(url) {
    return new Promise(function (ok, ng) {
      var s = document.createElement('script');
      s.src = url;
      s.onload = ok;
      s.onerror = function () {
        ng(new Error('読み込めませんでした: ' + url.split('/npm/')[1]));
      };
      document.head.appendChild(s);
    });
  }
  /* 各段階を時間を計って実行し、画面とログに出す */
  function timed(id, name, fn, detail) {
    var s = performance.now();
    step(id, 'doing');
    return log
      .step(name, fn, function (v) {
        return detail ? detail(v) : '';
      })
      .then(function (r) {
        var sec = (performance.now() - s) / 1000;
        step(id, r.ok ? 'done' : 'fail', sec, r.ok && r.value && r.value.label);
        if (!r.ok) throw r.error;
        return r.value;
      });
  }

  /* ライブラリとモデル */
  var libsReady = null;
  function loadLibs() {
    if (!libsReady)
      libsReady = (
        window.tf
          ? Promise.resolve()
          : timed('lib', 'TensorFlow.js の読み込み', function () {
              return loadScript(TF_URL);
            })
      )
        .then(function () {
          return tf.ready();
        })
        .then(function () {
          var be = tf.getBackend();
          if (be !== 'webgl' && be !== 'webgpu') {
            log.warn('速い処理方式(WebGL)が使えないため、判定が遅くなります(' + be + ')');
            statusEl.textContent = 'この端末では速い処理方式が使えないため、判定が遅くなります';
          } else log('処理方式を確認しました(' + be + ')');
        })
        .catch(function (e) {
          libsReady = null;
          throw e;
        });
    return libsReady;
  }
  function loadFrom(info, url) {
    return info.layers ? tf.loadLayersModel(url) : tf.loadGraphModel(url);
  }
  function loadModel(id) {
    var info = MODELS[id],
      key = CACHE_PREFIX + id;
    return loadFrom(info, key).then(
      function (m) {
        return { m: m, label: 'AIモデル(端末に保存したもの)', from: '端末' };
      },
      function () {
        log('端末に保存したモデルが無いため、ネットから読み込みます(' + info.name + ')');
        return loadFrom(info, info.url).then(function (m) {
          return m.save(key).then(
            function () {
              log('モデルを端末に保存しました(次回から通信せずに開けます)');
              return { m: m, from: 'ネット' };
            },
            function (e) {
              log.warn('モデルを端末に保存できませんでした(次回も通信します)', e);
              return { m: m, from: 'ネット' };
            },
          );
        });
      },
    );
  }
  function prepare() {
    if (loadingModel) return Promise.resolve();
    loadingModel = true;
    retryBtn.hidden = true;
    resetSteps();
    if (window.tf) step('lib', 'done');
    showLoader(true);
    var id = settings.model,
      old = model;
    model = null; /* 入れ替え中は判定を止める */
    disposeLater(old);
    return loadLibs()
      .then(function () {
        return timed(
          'model',
          'AIモデル(' + MODELS[id].name + ')の読み込み',
          function () {
            return loadModel(id);
          },
          function (v) {
            return v.from + 'から';
          },
        );
      })
      .then(function (v) {
        /* 最初の1回はシェーダーの準備で遅いため、読み込みの中で済ませておく */
        return timed('warm', '試しの判定', function () {
          return predict(v.m, MODELS[id], null).then(function () {
            return v;
          });
        });
      })
      .then(function (v) {
        model = v.m;
        modelInfo = MODELS[id];
        loadingModel = false;
        if (settings.model !== id) {
          /* 読み込み中にモデルの種類が変わった時は、選び直された方を読み込む */
          log(
            '読み込み中にモデルが変わったため、読み込み直します(' +
              MODELS[settings.model].name +
              ')',
          );
          return prepare();
        }
        showLoader(false);
        statusEl.textContent = '';
        log(
          '準備ができました(' +
            modelInfo.name +
            'モデル / ' +
            tf.getBackend() +
            ' / 合計 ' +
            ((performance.now() - t0) / 1000).toFixed(1) +
            '秒)',
        );
        if (mode === 'image') classifyImage();
      })
      .catch(function () {
        loadingModel = false;
        clearInterval(tick);
        retryBtn.hidden = false;
        statusEl.textContent =
          '読み込めませんでした。通信状態を確認して「もう一度読み込む」を押してください';
      });
  }
  retryBtn.onclick = prepare;
  /* 判定の途中で捨てるとエラーになるため、終わるのを待ってから捨てる */
  function disposeLater(m) {
    if (!m) return;
    (function wait() {
      if (busy) setTimeout(wait, 50);
      else m.dispose();
    })();
  }

  /* 判定。src は 224×224 の canvas(null なら試しの判定)。戻り値は長さ 1000 の確率 */
  function predict(m, info, src) {
    var y = tf.tidy(function () {
      var x = src ? tf.browser.fromPixels(src).toFloat() : tf.zeros([SIZE, SIZE, 3]);
      x = info.signed ? x.div(127.5).sub(1) : x.div(255);
      var out = m.predict(x.expandDims(0));
      if (Array.isArray(out)) out = out[0];
      if (out.shape[1] === 1001) out = out.slice([0, 1], [-1, 1000]);
      return info.layers ? out : tf.softmax(out);
    });
    return y.data().then(function (d) {
      y.dispose();
      return d;
    });
  }
  /* 判定に使う範囲を 224×224 に写す */
  function toInput(src, w, h) {
    if (settings.range === 'center') {
      var r = C.centerSquare(w, h);
      inCtx.drawImage(src, r.x, r.y, r.s, r.s, 0, 0, SIZE, SIZE);
    } else inCtx.drawImage(src, 0, 0, w, h, 0, 0, SIZE, SIZE);
    return inCv;
  }

  /* 描画 */
  function sizeCanvas(w, h) {
    var k = C.fitScale(w, h, MAX_SIDE),
      cw = Math.round(w * k),
      ch = Math.round(h * k);
    if (cv.width !== cw || cv.height !== ch) {
      cv.width = cw;
      cv.height = ch;
    }
    layout();
  }
  /* 表示枠に収まる大きさで見せる(中の画素数は変えない) */
  function layout() {
    if (cv.hidden || !cv.width) return;
    var s = Math.min(view.clientWidth / cv.width, view.clientHeight / cv.height);
    cv.style.width = Math.floor(cv.width * s) + 'px';
    cv.style.height = Math.floor(cv.height * s) + 'px';
  }
  window.addEventListener('resize', layout);
  /* 判定に使う範囲の外を暗くして、どこを見ているかを示す */
  function drawGuide() {
    if (settings.range !== 'center') return;
    var r = C.centerSquare(cv.width, cv.height),
      k = cv.width / (cv.getBoundingClientRect().width || cv.width);
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,.45)';
    ctx.beginPath();
    ctx.rect(0, 0, cv.width, cv.height);
    ctx.rect(r.x, r.y, r.s, r.s);
    ctx.fill('evenodd');
    ctx.strokeStyle = 'rgba(255,255,255,.9)';
    ctx.lineWidth = Math.max(2, 2 * k);
    ctx.strokeRect(r.x, r.y, r.s, r.s);
    ctx.restore();
  }
  function showCanvas() {
    cv.hidden = false;
    placeholder.hidden = true;
  }
  function topText(list) {
    return list
      .slice(0, 3)
      .map(function (e) {
        return C.name(labels, e.index) + ' ' + C.pct(e.p);
      })
      .join('、');
  }
  function render() {
    if (!probs) {
      resultEl.hidden = true;
      return [];
    }
    var list = C.topK(probs, settings.topN),
      first = list[0],
      level = C.confidence(first.p, settings.minScore / 100);
    resultEl.hidden = false;
    resultEl.className = 'result ' + level;
    topName.textContent = level === 'low' ? 'はっきりしません' : C.name(labels, first.index);
    topEn.textContent = level === 'low' ? '' : C.name(labels, first.index, 'en');
    topPct.textContent = level === 'low' ? '' : C.pct(first.p);
    hintEl.textContent =
      level === 'low'
        ? '物を' +
          (settings.range === 'center' ? '枠の中央に' : '') +
          '大きく写すと当たりやすくなります'
        : level === 'mid'
          ? '似た物と迷っています。下の候補も見てください'
          : '';
    rankEl.textContent = '';
    list.forEach(function (e) {
      var li = document.createElement('li'),
        nm = document.createElement('span'),
        bar = document.createElement('span'),
        pc = document.createElement('span');
      nm.className = 'nm';
      nm.textContent = C.name(labels, e.index);
      bar.className = 'bar';
      bar.style.setProperty('--w', Math.max(1, Math.round(e.p * 100)) + '%');
      pc.className = 'pc';
      pc.textContent = C.pct(e.p);
      li.append(nm, bar, pc);
      rankEl.appendChild(li);
    });
    return list;
  }

  /* 写真 */
  $('openBtn').onclick = function () {
    fileIn.click();
  };
  function decode(file) {
    if (window.createImageBitmap)
      return createImageBitmap(file, { imageOrientation: 'from-image' });
    return new Promise(function (ok, ng) {
      var url = URL.createObjectURL(file),
        im = new Image();
      im.onload = function () {
        URL.revokeObjectURL(url);
        ok(im);
      };
      im.onerror = function () {
        URL.revokeObjectURL(url);
        ng(new Error('画像として読み込めませんでした'));
      };
      im.src = url;
    });
  }
  fileIn.addEventListener('change', function () {
    var file = fileIn.files[0];
    fileIn.value = '';
    if (!file) return;
    stopCamera('写真を開いたため');
    log
      .step(
        '写真の読み込み',
        function () {
          return decode(file).then(function (im) {
            var w = im.width || im.naturalWidth,
              h = im.height || im.naturalHeight;
            sizeCanvas(w, h);
            var off = document.createElement('canvas');
            off.width = cv.width;
            off.height = cv.height;
            off.getContext('2d').drawImage(im, 0, 0, off.width, off.height);
            if (im.close) im.close();
            imageSrc = off;
            mode = 'image';
            probs = null;
            showCanvas();
            layout();
            return w + '×' + h;
          });
        },
        function (v) {
          return v + 'px';
        },
      )
      .then(function (r) {
        if (!r.ok) {
          statusEl.textContent = '写真を読み込めませんでした';
          return;
        }
        drawImage();
        render();
        if (model) classifyImage();
        else statusEl.textContent = 'AIの準備ができたら判定します';
      });
  });
  function drawImage() {
    ctx.drawImage(imageSrc, 0, 0);
    drawGuide();
  }
  function classifyImage() {
    if (!imageSrc || !model) return;
    drawImage();
    busy = true;
    log
      .step(
        '写真の判定',
        function () {
          return predict(model, modelInfo, toInput(imageSrc, imageSrc.width, imageSrc.height));
        },
        function (p) {
          return topText(C.topK(p, 3)) + ' / ' + RANGE_NAME[settings.range];
        },
      )
      .then(function (r) {
        busy = false;
        if (!r.ok) {
          statusEl.textContent = '判定できませんでした';
          return;
        }
        statusEl.textContent = '';
        probs = r.value;
        render();
      });
  }

  /* カメラ */
  function setCamUi(on) {
    camBtn.textContent = on ? 'カメラ停止' : 'カメラ開始';
    camBtn.classList.toggle('primary', !on);
    flipBtn.hidden = pauseBtn.hidden = !on;
    pauseBtn.textContent = '一時停止';
  }
  function startCamera() {
    return ToolKit.media
      .open(
        {
          video: { facingMode: { ideal: facing }, width: { ideal: 1280 }, height: { ideal: 720 } },
        },
        'カメラ',
      )
      .then(function (r) {
        if (!r.stream) {
          statusEl.textContent = r.message;
          return;
        }
        stream = r.stream;
        video.srcObject = stream;
        return video.play().then(function () {
          mode = 'camera';
          paused = false;
          imageSrc = null;
          probs = null;
          render();
          stats = { runs: 0, ms: 0 };
          camW = video.videoWidth;
          camH = video.videoHeight;
          sizeCanvas(camW, camH);
          showCanvas();
          layout();
          setCamUi(true);
          statusEl.textContent = model ? '' : 'AIの準備ができたら判定を始めます';
          log(
            'カメラを開始しました(' +
              (facing === 'user' ? '前面' : '背面') +
              ' / ' +
              ToolKit.media.size(stream.getVideoTracks()[0]) +
              ')',
          );
          cancelAnimationFrame(raf);
          raf = requestAnimationFrame(frame);
        });
      })
      .catch(function (e) {
        log.error('カメラの映像の再生でエラーが発生しました', e);
        statusEl.textContent = 'カメラの映像を表示できませんでした';
      });
  }
  function stopCamera(why) {
    if (mode !== 'camera') return;
    cancelAnimationFrame(raf);
    ToolKit.media.stop(stream);
    stream = null;
    video.srcObject = null;
    mode = 'none';
    setCamUi(false);
    statusEl.textContent = '';
    log(
      'カメラを停止しました(' +
        (why ? why + ' / ' : '') +
        '判定 ' +
        stats.runs +
        '回' +
        (stats.runs ? ' / 平均 ' + Math.round(stats.ms / stats.runs) + 'ms' : '') +
        (probs ? ' / 最後 ' + topText(C.topK(probs, 1)) : '') +
        ')',
    );
  }
  function frame(now) {
    if (mode !== 'camera') return;
    raf = requestAnimationFrame(frame);
    if (paused || !video.videoWidth) return;
    /* 端末を回すと映像の縦横が入れ替わる */
    if (video.videoWidth !== camW || video.videoHeight !== camH) {
      camW = video.videoWidth;
      camH = video.videoHeight;
      sizeCanvas(camW, camH);
    }
    var mirror = facing === 'user';
    ctx.save();
    if (mirror) {
      ctx.translate(cv.width, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(video, 0, 0, cv.width, cv.height);
    ctx.restore();
    drawGuide();
    if (!model || busy || document.hidden || now - lastRun < MIN_INTERVAL) return;
    busy = true;
    lastRun = now;
    var s = performance.now();
    predict(model, modelInfo, toInput(video, video.videoWidth, video.videoHeight)).then(
      function (p) {
        busy = false;
        if (mode !== 'camera' || paused) return;
        stats.runs++;
        stats.ms += performance.now() - s;
        probs = C.smooth(probs, p, settings.smooth ? SMOOTH : 1);
        render();
        statusEl.textContent = '判定 ' + Math.round(stats.ms / stats.runs) + 'ms/回';
      },
      function (e) {
        busy = false;
        log.error('カメラの映像の判定でエラーが発生しました', e);
        statusEl.textContent = '判定できませんでした';
        stopCamera('判定のエラー');
      },
    );
  }
  camBtn.onclick = function () {
    if (mode === 'camera') stopCamera();
    else startCamera();
  };
  flipBtn.onclick = function () {
    stopCamera('切り替えのため');
    facing = facing === 'user' ? 'environment' : 'user';
    startCamera();
  };
  pauseBtn.onclick = function () {
    paused = !paused;
    pauseBtn.textContent = paused ? '再開' : '一時停止';
    if (paused) log('一時停止しました(' + (probs ? topText(C.topK(probs, 3)) : '結果なし') + ')');
    else log('再開しました');
  };

  /* 設定の変更 */
  $('model').addEventListener('change', function () {
    settings.model = this.value;
    saveSettings();
    probs = null;
    render();
    prepare();
  });
  $('range').addEventListener('change', function () {
    settings.range = this.value;
    saveSettings();
    probs = null;
    if (mode === 'image') classifyImage();
    else render();
  });
  $('topN').addEventListener('input', showSliders);
  $('minScore').addEventListener('input', showSliders);
  function applySlider() {
    settings.topN = Number($('topN').value);
    settings.minScore = Number($('minScore').value);
    saveSettings();
    render();
  }
  $('topN').addEventListener('change', applySlider);
  $('minScore').addEventListener('change', applySlider);
  $('smooth').addEventListener('change', function () {
    settings.smooth = this.checked;
    saveSettings();
  });

  /* 判定できる物の一覧は長いため、開いた時に作る */
  $('classes').addEventListener('toggle', function () {
    var p = $('classList');
    if (this.open && !p.textContent)
      p.textContent = labels
        .map(function (e) {
          return e[1];
        })
        .join('、');
  });

  /* 起動 */
  fetch('./image-classifier-labels.json')
    .then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    })
    .then(function (j) {
      labels = j;
      render();
    })
    .catch(function (e) {
      log.warn('日本語の名前の表を読み込めませんでした(番号で表示します)', e);
    });
  log(
    '起動しました(' +
      MODELS[settings.model].name +
      'モデル / 範囲 ' +
      RANGE_NAME[settings.range] +
      ' / 上位 ' +
      settings.topN +
      '件 / 目安 ' +
      settings.minScore +
      '%)',
  );
  prepare();
})();
