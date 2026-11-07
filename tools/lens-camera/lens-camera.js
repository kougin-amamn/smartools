/* レンズカメラの画面。カメラの映像を WebGL でいろいろなレンズの写りにして映し、撮影できる。
   レンズの一覧と計算は lens-camera-core.js、シェーダーは lens-camera-shaders.js */
(function () {
  'use strict';
  var C = window.LensCameraCore,
    $ = function (id) {
      return document.getElementById(id);
    };
  var video = $('video'),
    view = $('view'),
    emptyState = $('emptyState'),
    statusText = $('statusText'),
    lensRow = $('lensRow'),
    params = $('params'),
    zoomInfo = $('zoomInfo'),
    freezeBtn = $('freezeBtn'),
    lightBtn = $('lightBtn'),
    captureBtn = $('captureBtn'),
    switchCamBtn = $('switchCamBtn'),
    capturedList = $('capturedList');

  var KEY = 'lens-camera-settings';
  var state = { lens: 'fisheye', values: {} },
    stream = null,
    track = null,
    camZoom = null /* カメラが対応する拡大の範囲 { min, max }。対応しない時は null */,
    zoomNow = [1, 1] /* [カメラの倍率, 画像の倍率] */,
    devices = [],
    deviceIndex = 0,
    frozen = false,
    torchOn = false,
    shotCount = 0,
    gl = null,
    raf = 0;

  /* 映像の描き方(シェーダーは lens-camera-shaders.js)。レンズごとにプログラムを作り、初めて使う時に組み立てて取っておく */
  var SH = window.LensCameraShaders,
    progs = {},
    t0 = performance.now();
  function compile(type, src) {
    var s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  }
  function program(id) {
    if (progs[id]) return progs[id];
    var pr = gl.createProgram();
    gl.attachShader(pr, compile(gl.VERTEX_SHADER, SH.VS));
    gl.attachShader(pr, compile(gl.FRAGMENT_SHADER, SH.build(SH.LENS[id])));
    gl.bindAttribLocation(pr, 0, 'p');
    gl.linkProgram(pr);
    if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(pr));
    var o = { p: pr, loc: {} };
    ['tex', 'size', 'cover', 'prm', 'theta', 'dpr', 'time'].forEach(function (n) {
      o.loc[n] = gl.getUniformLocation(pr, n);
    });
    gl.useProgram(pr);
    gl.uniform1i(o.loc.tex, 0);
    progs[id] = o;
    return o;
  }
  function initGL() {
    /* 撮影時に描いた結果を読み出すため、描画バッファを残す */
    gl = view.getContext('webgl', { preserveDrawingBuffer: true, antialias: false });
    if (!gl) return false;
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    var t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    /* 映像の大きさは2のべき乗とは限らないため、端の扱いを CLAMP にする */
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    program(state.lens);
    return true;
  }
  /* 描く解像度: ぼかしを使うレンズは重いので、レンズの scale の分だけ下げる */
  function dpr() {
    return Math.min(window.devicePixelRatio || 1, 2) * (lensOf().scale || 1);
  }
  function draw() {
    raf = requestAnimationFrame(draw);
    if (!video.videoWidth || video.readyState < 2) return;
    var r = view.getBoundingClientRect(),
      w = Math.max(1, Math.round(r.width * dpr())),
      h = Math.max(1, Math.round(r.height * dpr()));
    if (view.width !== w || view.height !== h) {
      view.width = w;
      view.height = h;
    }
    gl.viewport(0, 0, w, h);
    if (!frozen) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, video);
    var cv = C.coverScale(w, h, video.videoWidth, video.videoHeight),
      z = state.lens === 'magnify' ? zoomNow[1] : 1,
      p = C.prmOf(state.lens, state.values[state.lens]);
    var pr;
    try {
      pr = program(state.lens);
    } catch (e) {
      log.error('「' + lensOf().name + '」の処理の準備でエラーが発生しました', e);
      state.lens = 'standard';
      renderLenses();
      renderParams();
      return;
    }
    var L = pr.loc;
    gl.useProgram(pr.p);
    gl.uniform2f(L.size, w, h);
    gl.uniform2f(L.cover, cv[0] / z, cv[1] / z);
    gl.uniform4f(L.prm, p[0], p[1], p[2], p[3]);
    gl.uniform1f(L.theta, C.halfAngle(state.lens === 'fisheye' ? p[1] : 0));
    gl.uniform1f(L.dpr, dpr());
    gl.uniform1f(L.time, frozen ? 0 : (performance.now() - t0) / 1000);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  /* 拡大鏡の倍率: カメラが拡大に対応していれば、まずカメラで拡大し(画質が落ちにくい)、足りない分を画像で拡大する */
  function zoomValue() {
    return val({ key: 'zoom', value: 30 }) / 10;
  }
  var zoomTimer = 0;
  function applyZoom(how) {
    var z = state.lens === 'magnify' ? zoomValue() : 1;
    zoomNow = C.splitZoom(z, camZoom ? camZoom.min : 1, camZoom ? camZoom.max : 1);
    zoomInfo.textContent =
      state.lens === 'magnify'
        ? camZoom
          ? 'カメラ ' + zoomNow[0].toFixed(1) + '倍 × 画像 ' + zoomNow[1].toFixed(1) + '倍'
          : '画像の拡大'
        : '';
    if (camZoom && track) {
      clearTimeout(zoomTimer);
      /* スライダーやピンチの間に何度も切り替えないよう、少し待ってからカメラに伝える */
      zoomTimer = setTimeout(function () {
        track.applyConstraints({ advanced: [{ zoom: zoomNow[0] }] }).catch(function (e) {
          log.warn('カメラの拡大を変えられませんでした', e);
        });
      }, 120);
    }
    if (how)
      log(
        '倍率を ' +
          z.toFixed(1) +
          '倍にしました(' +
          how +
          ' / ' +
          (zoomInfo.textContent || '画像の拡大') +
          ')',
      );
  }

  /* レンズのボタンと調整 */
  function lensOf() {
    return C.LENSES[C.lensIndex(state.lens)];
  }
  function paramOf(key) {
    return lensOf().params.filter(function (x) {
      return x.key === key;
    })[0];
  }
  function val(q) {
    var p = paramOf(q.key) || q,
      v = (state.values[state.lens] || {})[p.key];
    if (p.type === 'choice')
      return p.options.some(function (o) {
        return o[0] === v;
      })
        ? v
        : p.value;
    return typeof v === 'number' ? v : p.value;
  }
  function fmt(p, v) {
    if (p.type === 'choice')
      return p.options.filter(function (o) {
        return o[0] === v;
      })[0][1];
    return p.scale ? (v * p.scale).toFixed(1) + p.unit : v + p.unit;
  }
  function summary() {
    return lensOf()
      .params.map(function (p) {
        return p.label + ' ' + fmt(p, val(p));
      })
      .join(' / ');
  }
  function renderLenses() {
    lensRow.innerHTML = C.LENSES.map(function (m) {
      var on = m.id === state.lens;
      return (
        '<button class="chip' +
        (on ? ' active' : '') +
        '" data-lens="' +
        m.id +
        '" aria-pressed="' +
        on +
        '">' +
        m.name +
        '</button>'
      );
    }).join('');
  }
  function renderParams() {
    params.innerHTML = lensOf()
      .params.map(function (p) {
        var v = val(p);
        if (p.type === 'choice')
          return (
            '<div class="slider-row"><span>' +
            p.label +
            '</span><div class="seg" data-log-group="' +
            p.label +
            '">' +
            p.options
              .map(function (o) {
                return (
                  '<button data-key="' +
                  p.key +
                  '" data-val="' +
                  o[0] +
                  '"' +
                  (o[0] === v ? ' class="active"' : '') +
                  '>' +
                  o[1] +
                  '</button>'
                );
              })
              .join('') +
            '</div></div>'
          );
        return (
          '<div class="slider-row"><span>' +
          p.label +
          '</span><input type="range" data-key="' +
          p.key +
          '" aria-label="' +
          p.label +
          '" min="' +
          p.min +
          '" max="' +
          p.max +
          '" value="' +
          v +
          '" /><b id="pv-' +
          p.key +
          '">' +
          fmt(p, v) +
          '</b></div>'
        );
      })
      .join('');
    lightBtn.hidden = state.lens !== 'magnify';
    zoomInfo.hidden = state.lens !== 'magnify';
  }
  lensRow.addEventListener('click', function (e) {
    var b = e.target.closest('.chip');
    if (!b || b.dataset.lens === state.lens) return;
    ToolKit.vibrate();
    state.lens = b.dataset.lens;
    renderLenses();
    renderParams();
    applyZoom();
    save();
    log('レンズを「' + b.textContent + '」にしました' + (summary() ? '(' + summary() + ')' : ''));
  });
  params.addEventListener('input', function (e) {
    var el = e.target.closest('input[data-key]');
    if (!el) return;
    var p = paramOf(el.dataset.key);
    (state.values[state.lens] = state.values[state.lens] || {})[p.key] = +el.value;
    $('pv-' + p.key).textContent = fmt(p, +el.value);
    if (p.key === 'zoom') applyZoom();
  });
  params.addEventListener('change', save);
  params.addEventListener('click', function (e) {
    var b = e.target.closest('button[data-val]');
    if (!b) return;
    var p = paramOf(b.dataset.key);
    (state.values[state.lens] = state.values[state.lens] || {})[p.key] = b.dataset.val;
    renderParams();
    save();
    log(p.label + 'を「' + fmt(p, b.dataset.val) + '」にしました');
  });

  /* 拡大鏡: 2本指の広げ・すぼめとホイールでも倍率を変える */
  var pinch = null;
  function setZoom(z, how) {
    var p = paramOf('zoom'),
      v = Math.round(Math.max(p.min, Math.min(p.max, z * 10)));
    (state.values.magnify = state.values.magnify || {}).zoom = v;
    var el = params.querySelector('input[data-key="zoom"]');
    if (el) {
      el.value = v;
      $('pv-zoom').textContent = fmt(p, v);
    }
    applyZoom(how);
  }
  function dist(t) {
    return Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY) || 1;
  }
  view.addEventListener(
    'touchstart',
    function (e) {
      if (state.lens === 'magnify' && e.touches.length === 2)
        pinch = { d: dist(e.touches), z: zoomValue() };
    },
    { passive: true },
  );
  view.addEventListener(
    'touchmove',
    function (e) {
      if (pinch && e.touches.length === 2) setZoom((pinch.z * dist(e.touches)) / pinch.d);
    },
    { passive: true },
  );
  view.addEventListener('touchend', function () {
    if (pinch) {
      pinch = null;
      setZoom(zoomValue(), '2本指');
      save();
    }
  });
  view.addEventListener(
    'wheel',
    function (e) {
      if (state.lens !== 'magnify') return;
      e.preventDefault();
      setZoom(zoomValue() * (e.deltaY < 0 ? 1.1 : 1 / 1.1), 'ホイール');
      save();
    },
    { passive: false },
  );

  /* 設定(レンズと調整)を端末に保存 */
  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch (e) {
      log.warn('設定の保存に失敗しました', e);
    }
  }
  function restore() {
    try {
      var s = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (!s) return;
      if (C.LENSES[C.lensIndex(s.lens)].id === s.lens) state.lens = s.lens;
      if (s.values && typeof s.values === 'object') state.values = s.values;
    } catch (e) {
      log.warn('設定の読み込みに失敗しました', e);
    }
  }

  /* カメラ */
  async function startCamera(deviceId) {
    ToolKit.media.stop(stream);
    stream = null;
    torchOn = false;
    lightBtn.setAttribute('aria-pressed', 'false');
    var r = await ToolKit.media.open(
      deviceId
        ? {
            video: {
              deviceId: { exact: deviceId },
              width: { ideal: 1920 },
              height: { ideal: 1440 },
            },
          }
        : {
            video: {
              facingMode: { ideal: 'environment' },
              width: { ideal: 1920 },
              height: { ideal: 1440 },
            },
          },
      'カメラ',
    );
    if (!r.stream) {
      statusText.textContent = r.message;
      emptyState.hidden = false;
      return;
    }
    stream = r.stream;
    track = stream.getVideoTracks()[0];
    /* カメラ自体の拡大に対応しているか(Android の Chrome などで使える。iPhone の Safari は対応していない) */
    var caps = track.getCapabilities ? track.getCapabilities() : {};
    camZoom =
      caps.zoom && caps.zoom.max > caps.zoom.min
        ? { min: caps.zoom.min, max: caps.zoom.max }
        : null;
    video.srcObject = stream;
    try {
      await video.play();
    } catch (e) {
      log.warn('映像の再生を開始できませんでした', e);
    }
    emptyState.hidden = true;
    if (!raf) draw();
    if (!devices.length) {
      try {
        devices = (await navigator.mediaDevices.enumerateDevices()).filter(function (d) {
          return d.kind === 'videoinput';
        });
      } catch (e) {
        log.warn('カメラの一覧を取得できませんでした', e);
      }
    }
    applyZoom();
    log(
      'カメラを開始しました(' +
        ToolKit.media.size(track) +
        ' / カメラ ' +
        devices.length +
        '台 / カメラの拡大 ' +
        (camZoom ? camZoom.min + '〜' + camZoom.max + '倍' : 'なし') +
        ')',
    );
  }
  switchCamBtn.addEventListener('click', function () {
    ToolKit.vibrate();
    if (devices.length < 2) {
      log.warn('切り替えられるカメラが見つかりませんでした(' + devices.length + '台)');
      return;
    }
    deviceIndex = (deviceIndex + 1) % devices.length;
    log('カメラを切り替えます(' + (deviceIndex + 1) + ' / ' + devices.length + '台目)');
    startCamera(devices[deviceIndex].deviceId).catch(function (e) {
      log.error('カメラの切り替えでエラーが発生しました', e);
    });
  });
  freezeBtn.addEventListener('click', function () {
    ToolKit.vibrate();
    frozen = !frozen;
    freezeBtn.setAttribute('aria-pressed', String(frozen));
    log(frozen ? '映像を止めました' : '映像の静止を解除しました');
  });
  lightBtn.addEventListener('click', async function () {
    ToolKit.vibrate();
    if (!track) {
      log.warn('カメラが動いていないためライトを点けられませんでした');
      return;
    }
    var r = await ToolKit.media.torch(track, !torchOn);
    if (r.ok) {
      torchOn = !torchOn;
      lightBtn.setAttribute('aria-pressed', String(torchOn));
    } else statusText.textContent = r.message;
  });

  /* 撮影: 映っている絵をそのまま PNG にする */
  captureBtn.addEventListener('click', function () {
    ToolKit.vibrate(30);
    if (!gl || !video.videoWidth) {
      log.warn('カメラの映像が無いため撮影できませんでした');
      return;
    }
    shotCount += 1;
    var url = view.toDataURL('image/png'),
      a = document.createElement('a'),
      img = document.createElement('img');
    a.href = url;
    a.download = 'lens-' + state.lens + '-' + shotCount + '.png';
    img.src = url;
    img.alt = '撮影した写真 ' + shotCount;
    a.appendChild(img);
    capturedList.prepend(a);
    log(
      '撮影しました(' +
        shotCount +
        '枚目 / ' +
        view.width +
        '×' +
        view.height +
        ' / ' +
        lensOf().name +
        (summary() ? ' / ' + summary() : '') +
        ')',
    );
  });
  capturedList.addEventListener('click', function (e) {
    if (e.target.closest('a')) log('撮影した写真を押下しました(保存します)');
  });

  restore();
  renderLenses();
  renderParams();
  var ok = false;
  try {
    ok = initGL();
  } catch (e) {
    log.error('レンズの処理の準備でエラーが発生しました', e);
  }
  if (!ok) {
    statusText.textContent =
      'この端末のブラウザでは WebGL が使えないため、レンズの写りを表示できません。';
    log.warn('WebGL が使えないため起動できませんでした');
    return;
  }
  log.started('レンズ ' + lensOf().name + (summary() ? ' / ' + summary() : ''));
  startCamera().catch(function (e) {
    log.error('カメラの開始でエラーが発生しました', e);
  });
})();
