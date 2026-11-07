/* 物体検出の画面の動き。TensorFlow.js と COCO-SSD は CDN から読み込み、計算は object-detector-core.js、
   カメラは ToolKit.media、ボタンの操作ログは tool-kit.js に任せる */
(function () {
  'use strict';
  var C = window.DetectCore;

  /* 設定 */
  var TF_URL = 'https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.22.0/dist/tf.min.js';
  var SSD_URL =
    'https://cdn.jsdelivr.net/npm/@tensorflow-models/coco-ssd@2.2.3/dist/coco-ssd.min.js';
  var CACHE_PREFIX =
    'indexeddb://object-detector-ssd-2.2.3-'; /* 版を名前に入れ、版を上げたら取り直す */
  var MAX_SIDE = 1280; /* 表示用の絵の長い辺。検出はモデルの中で 300×300 に縮むので、これ以上は無駄 */
  var MIN_INTERVAL = 150; /* カメラの検出の最短間隔(ms)。電池と発熱を抑える */
  var BASE_NAME = { lite_mobilenet_v2: '軽量', mobilenet_v1: '標準', mobilenet_v2: '高精度' };
  var STORE = 'object-detector-settings';

  var $ = function (id) {
    return document.getElementById(id);
  };
  var cv = $('cv'),
    ctx = cv.getContext('2d'),
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
    foundEl = $('found'),
    baseSel = $('base'),
    minIn = $('minScore'),
    maxIn = $('maxBoxes');

  var labels = {},
    model = null,
    loadingModel = false,
    settings = { base: 'lite_mobilenet_v2', minScore: 50, maxBoxes: 20 },
    mode = 'none' /* none / camera / image */,
    stream = null,
    facing = 'environment',
    paused = false,
    raf = 0,
    busy = false,
    lastRun = 0,
    lastDet = [],
    stats = { runs: 0, ms: 0 },
    imageSrc = null,
    scale = 1;

  /* 設定の保存 */
  try {
    var saved = JSON.parse(localStorage.getItem(STORE) || 'null');
    if (saved && BASE_NAME[saved.base]) settings = Object.assign(settings, saved);
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
  baseSel.value = settings.base;
  minIn.value = settings.minScore;
  maxIn.value = settings.maxBoxes;
  function showSliders() {
    $('minScoreVal').textContent = minIn.value + '%';
    $('maxBoxesVal').textContent = maxIn.value + '件';
  }
  showSliders();

  /* 読み込みの進み具合
     段階ごとに経過秒を出す。止まって見えないよう、全体の経過秒は 0.1 秒ごとに更新する */
  var STEPS = [
    ['lib', 'ライブラリ(TensorFlow.js)'],
    ['ssd', '物体検出ライブラリ(COCO-SSD)'],
    ['model', 'AIモデル'],
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
          return window.cocoSsd
            ? null
            : timed('ssd', 'COCO-SSD の読み込み', function () {
                return loadScript(SSD_URL);
              });
        })
        .then(function () {
          return tf.ready();
        })
        .then(function () {
          var be = tf.getBackend();
          if (be !== 'webgl' && be !== 'webgpu') {
            log.warn('速い処理方式(WebGL)が使えないため、検出が遅くなります(' + be + ')');
            statusEl.textContent = 'この端末では速い処理方式が使えないため、検出が遅くなります';
          } else log('処理方式を確認しました(' + be + ')');
        })
        .catch(function (e) {
          libsReady = null;
          throw e;
        });
    return libsReady;
  }
  function loadModel(base) {
    var key = CACHE_PREFIX + base;
    return cocoSsd.load({ base: base, modelUrl: key }).then(
      function (m) {
        return { m: m, label: 'AIモデル(端末に保存したもの)', from: '端末' };
      },
      function () {
        log('端末に保存したモデルが無いため、ネットから読み込みます(' + BASE_NAME[base] + ')');
        return cocoSsd.load({ base: base }).then(function (m) {
          return m.model.save(key).then(
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
    if (window.cocoSsd) step('ssd', 'done');
    showLoader(true);
    var base = settings.base,
      old = model;
    model = null; /* 入れ替え中は検出を止める */
    disposeLater(old);
    return loadLibs()
      .then(function () {
        return timed(
          'model',
          'AIモデル(' + BASE_NAME[base] + ')の読み込み',
          function () {
            return loadModel(base);
          },
          function (v) {
            return v.from + 'から';
          },
        );
      })
      .then(function (v) {
        model = v.m;
        loadingModel = false;
        if (settings.base !== base) {
          /* 読み込み中にモデルの種類が変わった時は、選び直された方を読み込む */
          log(
            '読み込み中にモデルが変わったため、読み込み直します(' + BASE_NAME[settings.base] + ')',
          );
          return prepare();
        }
        showLoader(false);
        statusEl.textContent = '';
        log(
          '準備ができました(' +
            BASE_NAME[base] +
            'モデル / ' +
            tf.getBackend() +
            ' / 合計 ' +
            ((performance.now() - t0) / 1000).toFixed(1) +
            '秒)',
        );
        if (mode === 'image') detectImage();
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
  /* 検出の途中で捨てるとエラーになるため、終わるのを待ってから捨てる */
  function disposeLater(m) {
    if (!m) return;
    (function wait() {
      if (busy) setTimeout(wait, 50);
      else m.dispose();
    })();
  }

  /* 描画 */
  function sizeCanvas(w, h) {
    scale = C.fitScale(w, h, MAX_SIDE);
    var cw = Math.round(w * scale),
      ch = Math.round(h * scale);
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
  function drawBoxes(list, mirror) {
    var css = cv.getBoundingClientRect().width || cv.width,
      k = cv.width / css /* 画面上でほぼ同じ太さ・文字の大きさにする */,
      fs = Math.round(14 * k);
    ctx.lineWidth = Math.max(2, 2.5 * k);
    ctx.font = '600 ' + fs + 'px sans-serif';
    ctx.textBaseline = 'top';
    list.forEach(function (d) {
      var b = C.mapBox(d.bbox, scale, cv.width, mirror),
        col = 'hsl(' + C.hueOf(d.class) + ', 80%, 40%)',
        text = C.jaName(d.class, labels) + ' ' + C.pct(d.score),
        tw = ctx.measureText(text).width + 8 * k,
        th = fs + 6 * k,
        ty = b.y >= th ? b.y - th : b.y;
      ctx.strokeStyle = col;
      ctx.strokeRect(b.x, b.y, b.w, b.h);
      ctx.fillStyle = col;
      ctx.fillRect(b.x, ty, Math.min(tw, cv.width - b.x), th);
      ctx.fillStyle = '#fff';
      ctx.fillText(text, b.x + 4 * k, ty + 3 * k);
    });
  }
  function showFound(list) {
    var sum = C.summarize(list, labels);
    foundEl.textContent = '';
    if (!sum.length) {
      var li = document.createElement('li');
      li.className = 'none';
      li.textContent = model ? '見つかりませんでした' : '';
      foundEl.appendChild(li);
      return sum;
    }
    sum.forEach(function (e) {
      var li = document.createElement('li'),
        sm = document.createElement('small');
      li.style.setProperty('--c', 'hsl(' + C.hueOf(e.cls) + ', 80%, 40%)');
      li.textContent = e.name + (e.count > 1 ? ' ×' + e.count : '');
      sm.textContent = C.pct(e.best);
      li.appendChild(sm);
      foundEl.appendChild(li);
    });
    return sum;
  }
  function showCanvas() {
    cv.hidden = false;
    placeholder.hidden = true;
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
            /* 検出は縮めた絵で行う(元の大きな写真のままでも結果は変わらず、遅くなるだけのため) */
            sizeCanvas(w, h);
            var off = document.createElement('canvas');
            off.width = cv.width;
            off.height = cv.height;
            off.getContext('2d').drawImage(im, 0, 0, off.width, off.height);
            if (im.close) im.close();
            imageSrc = off;
            scale = 1;
            mode = 'image';
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
        if (model) detectImage();
        else {
          ctx.drawImage(imageSrc, 0, 0);
          statusEl.textContent = 'AIの準備ができたら検出します';
        }
      });
  });
  function detectImage() {
    if (!imageSrc || !model) return;
    ctx.drawImage(imageSrc, 0, 0);
    log
      .step(
        '写真の検出',
        function () {
          return model.detect(imageSrc, settings.maxBoxes, settings.minScore / 100);
        },
        function (list) {
          return list.length + '件 / ' + C.summaryText(C.summarize(list, labels));
        },
      )
      .then(function (r) {
        if (!r.ok) {
          statusEl.textContent = '検出できませんでした';
          return;
        }
        statusEl.textContent = '';
        lastDet = r.value;
        drawBoxes(lastDet, false);
        showFound(lastDet);
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
          stats = { runs: 0, ms: 0 };
          lastDet = [];
          sizeCanvas(video.videoWidth, video.videoHeight);
          showCanvas();
          layout();
          setCamUi(true);
          statusEl.textContent = model ? '' : 'AIの準備ができたら検出を始めます';
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
        '検出 ' +
        stats.runs +
        '回' +
        (stats.runs ? ' / 平均 ' + Math.round(stats.ms / stats.runs) + 'ms' : '') +
        ')',
    );
  }
  function frame(now) {
    if (mode !== 'camera') return;
    raf = requestAnimationFrame(frame);
    if (paused || !video.videoWidth) return;
    if (video.videoWidth !== Math.round(cv.width / scale))
      sizeCanvas(video.videoWidth, video.videoHeight);
    var mirror = facing === 'user';
    ctx.save();
    if (mirror) {
      ctx.translate(cv.width, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(video, 0, 0, cv.width, cv.height);
    ctx.restore();
    drawBoxes(lastDet, mirror);
    if (!model || busy || document.hidden || now - lastRun < MIN_INTERVAL) return;
    busy = true;
    lastRun = now;
    var s = performance.now();
    model.detect(video, settings.maxBoxes, settings.minScore / 100).then(
      function (list) {
        busy = false;
        if (mode !== 'camera' || paused) return;
        stats.runs++;
        stats.ms += performance.now() - s;
        lastDet = list;
        showFound(list);
        statusEl.textContent = '検出 ' + Math.round(stats.ms / stats.runs) + 'ms/回';
      },
      function (e) {
        busy = false;
        log.error('カメラの映像の検出でエラーが発生しました', e);
        statusEl.textContent = '検出できませんでした';
        stopCamera('検出のエラー');
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
    if (paused) log('一時停止しました(' + C.summaryText(C.summarize(lastDet, labels)) + ')');
    else log('再開しました');
  };

  /* 設定の変更 */
  baseSel.addEventListener('change', function () {
    settings.base = baseSel.value;
    saveSettings();
    prepare();
  });
  minIn.addEventListener('input', showSliders);
  maxIn.addEventListener('input', showSliders);
  function applySlider() {
    settings.minScore = Number(minIn.value);
    settings.maxBoxes = Number(maxIn.value);
    saveSettings();
    if (mode === 'image') detectImage();
  }
  minIn.addEventListener('change', applySlider);
  maxIn.addEventListener('change', applySlider);

  /* 起動 */
  fetch('./object-detector-labels.json')
    .then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    })
    .then(function (j) {
      labels = j;
      $('classList').textContent = Object.keys(j)
        .map(function (k) {
          return j[k];
        })
        .join('、');
    })
    .catch(function (e) {
      log.warn('日本語の名前の表を読み込めませんでした(英語の名前で表示します)', e);
    });
  log.started(
    BASE_NAME[settings.base] +
      'モデル / 確からしさ ' +
      settings.minScore +
      '%以上 / 最大 ' +
      settings.maxBoxes +
      '件',
  );
  prepare();
})();
