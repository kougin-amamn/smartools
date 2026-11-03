/* エフェクトカメラの画面。カメラの映像を WebGL で加工して映し(効果8種・色温度)、撮影できる。
   効果の一覧と計算は effect-camera-core.js、シェーダーは effect-camera-shaders.js */
(function () {
  'use strict';
  var C = window.EffectCameraCore,
    $ = function (id) {
      return document.getElementById(id);
    };
  var video = $('video'),
    view = $('view'),
    wrap = $('camWrap'),
    emptyState = $('emptyState'),
    statusText = $('statusText'),
    modeRow = $('modeRow'),
    params = $('params'),
    kelvin = $('kelvin'),
    kelvinVal = $('kelvinVal'),
    freezeBtn = $('freezeBtn'),
    captureBtn = $('captureBtn'),
    switchCamBtn = $('switchCamBtn'),
    capturedList = $('capturedList'),
    vhsOsd = $('vhsOsd'),
    vhsTime = $('vhsTime');

  var KEY = 'effect-camera-settings';
  var state = {
      mode: 'normal',
      kelvin: 6500,
      values: {},
    },
    stream = null,
    track = null,
    devices = [],
    deviceIndex = 0,
    frozen = false,
    shotCount = 0,
    gl = null,
    loc = {},
    raf = 0,
    t0 = performance.now();

  /* 映像の加工(シェーダーは effect-camera-shaders.js)
     効果ごとにプログラムを作り、初めて使う時に組み立てて取っておく。テクスチャの番号は UNITS の通り */
  var SH = window.EffectCameraShaders,
    UNITS = { tex: 0, pal: 1, prev: 3, prevSrc: 4, atlas: 5 },
    UNIF = ['size', 'cover', 'center', 'prm', 'gains', 'time', 'dpr', 'head'],
    progs = {},
    trailT = [null, null],
    prevSrcT = null,
    atlasT = null,
    head = 0,
    frameNo = 0;
  var SLOT = 240; /* スリットスキャンで保存する1コマの大きさ(画素)。6×4 コマを1枚に並べる */

  function compile(type, src) {
    var sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh));
    return sh;
  }
  function program(key, body, raw) {
    if (progs[key]) return progs[key];
    var t1 = performance.now(),
      pr = gl.createProgram();
    gl.attachShader(pr, compile(gl.VERTEX_SHADER, SH.VS));
    gl.attachShader(pr, compile(gl.FRAGMENT_SHADER, SH.build(body, raw)));
    gl.bindAttribLocation(pr, 0, 'p');
    gl.linkProgram(pr);
    if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(pr));
    var o = { p: pr, loc: {} };
    gl.useProgram(pr);
    Object.keys(UNITS).forEach(function (n) {
      var l = gl.getUniformLocation(pr, n);
      if (l) gl.uniform1i(l, UNITS[n]);
    });
    UNIF.forEach(function (n) {
      o.loc[n] = gl.getUniformLocation(pr, n);
    });
    progs[key] = o;
    if (key.indexOf('fx-') === 0)
      log.debug(
        '効果の処理を準備しました(' + key.slice(3) + ' / ' + Math.round(performance.now() - t1) + 'ms)'
      );
    return o;
  }
  function makeTex(unit, nearest) {
    var t = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, t);
    /* 映像の大きさは2のべき乗とは限らないため、端の扱いを CLAMP にする */
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    var f = nearest ? gl.NEAREST : gl.LINEAR;
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, f);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, f);
    return t;
  }
  /* 描き込める絵(テクスチャ+フレームバッファ)。unit に結び付けておく */
  function target(unit, w, h) {
    var t = makeTex(unit);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    var fb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.activeTexture(gl.TEXTURE0);
    return { tex: t, fb: fb, w: w, h: h, unit: unit };
  }
  function bindTo(unit, t) {
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, t.tex);
    gl.activeTexture(gl.TEXTURE0);
  }
  function initGL() {
    /* 撮影時に描いた結果を読み出すため、描画バッファを残す */
    gl = view.getContext('webgl', { preserveDrawingBuffer: true, antialias: false });
    if (!gl) return false;
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    makeTex(UNITS.pal);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 256, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, C.thermoTable());
    makeTex(UNITS.tex);
    program('fx-' + state.mode, SH.FX[state.mode]);
    return true;
  }

  function modeOf(id) {
    return C.MODES[C.modeIndex(id || state.mode)];
  }
  function dprNow() {
    return Math.min(window.devicePixelRatio || 1, 2) * (modeOf().scale || 1);
  }
  function fitCanvas() {
    var r = view.getBoundingClientRect(),
      d = dprNow(),
      w = Math.max(1, Math.round(r.width * d)),
      h = Math.max(1, Math.round(r.height * d));
    if (view.width !== w || view.height !== h) {
      view.width = w;
      view.height = h;
    }
  }
  function val(key) {
    var p = modeOf().params.filter(function (x) {
        return x.key === key;
      })[0],
      v = (state.values[state.mode] || {})[key];
    if (p && p.type === 'choice')
      return p.options.some(function (o) {
        return o[0] === v;
      })
        ? v
        : p.value;
    return typeof v === 'number' ? v : p ? p.value : 0;
  }

  /* 共通の値を、使うプログラムに渡す */
  function setCommon(pr, w, h) {
    var L = pr.loc,
      cv = C.coverScale(w, h, video.videoWidth, video.videoHeight),
      g = C.wbGains(state.kelvin),
      p = C.prmOf(state.mode, state.values[state.mode]);
    gl.uniform2f(L.size, w, h);
    gl.uniform2f(L.cover, cv[0], cv[1]);
    gl.uniform2f(L.center, 0.5, 0.5);
    gl.uniform4f(L.prm, p[0], p[1], p[2], p[3]);
    gl.uniform3f(L.gains, g[0], g[1], g[2]);
    gl.uniform1f(L.time, frozen ? 0 : (performance.now() - t0) / 1000);
    gl.uniform1f(L.dpr, dprNow());
    gl.uniform1f(L.head, head);
  }
  function pass(pr, fb, x, y, w, h, sw, sh) {
    gl.useProgram(pr.p);
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.viewport(x, y, w, h);
    setCommon(pr, sw || w, sh || h);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  function draw() {
    raf = requestAnimationFrame(draw);
    if (!video.videoWidth || video.readyState < 2) return;
    fitCanvas();
    var W = view.width,
      H = view.height,
      m = state.mode;
    gl.activeTexture(gl.TEXTURE0);
    if (!frozen) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, video);
    var fx;
    try {
      fx = program('fx-' + m, SH.FX[m], m === 'trail');
    } catch (e) {
      log.error('「' + modeOf().name + '」の処理の準備でエラーが発生しました', e);
      state.mode = 'normal';
      renderModes();
      renderParams();
      return;
    }
    /* スリットスキャン: 数コマごとに今の映像を保存の列に足す */
    if (m === 'slit') {
      if (!atlasT) atlasT = target(UNITS.atlas, SLOT * 6, SLOT * 4);
      /* 選んだ直後は、まだ保存していない古いコマが黒いので、24コマとも今の映像で埋める */
      if (frameNo === 0)
        for (var k = 0; k < 24; k++)
          pass(
            program('capture', SH.CAPTURE, true),
            atlasT.fb,
            (k % 6) * SLOT,
            Math.floor(k / 6) * SLOT,
            SLOT,
            SLOT,
            W,
            H
          );
      if (!frozen && frameNo++ % val('step') === 0) {
        head = (head + 1) % 24;
        pass(
          program('capture', SH.CAPTURE, true),
          atlasT.fb,
          (head % 6) * SLOT,
          Math.floor(head / 6) * SLOT,
          SLOT,
          SLOT,
          W,
          H
        );
      }
      bindTo(UNITS.atlas, atlasT);
    }
    if (m === 'motion' && prevSrcT) bindTo(UNITS.prevSrc, prevSrcT);
    /* 残像: 前の絵に重ねた結果を描き込める絵に残し、それを画面へ写す(色のフィルターは写す時だけ掛ける) */
    if (m === 'trail') {
      if (!trailT[0] || trailT[0].w !== W || trailT[0].h !== H) {
        trailT = [target(UNITS.prev, W, H), target(UNITS.prev, W, H)];
      }
      bindTo(UNITS.prev, trailT[0]);
      pass(fx, trailT[1].fb, 0, 0, W, H);
      bindTo(UNITS.prev, trailT[1]);
      pass(program('blit', SH.BLIT), null, 0, 0, W, H);
      trailT.reverse();
    } else pass(fx, null, 0, 0, W, H);
    /* 動いた所に色: 次のコマで比べるため、今の映像を小さく残す */
    if (m === 'motion' && !frozen) {
      if (!prevSrcT) prevSrcT = target(UNITS.prevSrc, 320, 320);
      pass(program('capture', SH.CAPTURE, true), prevSrcT.fb, 0, 0, 320, 320, W, H);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }
  }

  /* 設定の保存(端末に) */
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
      if (typeof s.mode === 'string' && C.MODES[C.modeIndex(s.mode)].id === s.mode) state.mode = s.mode;
      if (typeof s.kelvin === 'number') state.kelvin = Math.max(2000, Math.min(12000, s.kelvin));
      if (s.values && typeof s.values === 'object') state.values = s.values;
    } catch (e) {
      log.warn('設定の読み込みに失敗しました', e);
    }
  }

  /* 効果のボタンと調整のスライダー */
  function fmt(p, v) {
    if (p.type === 'choice')
      return p.options.filter(function (o) {
        return o[0] === v;
      })[0][1];
    return p.scale ? (v * p.scale).toFixed(1) + p.unit : v + (p.unit === '%' ? '%' : p.unit);
  }
  function renderModes() {
    modeRow.innerHTML = C.MODES.map(function (m) {
      return (
        '<button class="chip' +
        (m.id === state.mode ? ' active' : '') +
        '" data-mode="' +
        m.id +
        '" aria-pressed="' +
        (m.id === state.mode) +
        '">' +
        m.name +
        '</button>'
      );
    }).join('');
  }
  function renderParams() {
    var m = C.MODES[C.modeIndex(state.mode)];
    params.innerHTML = m.params
      .map(function (p) {
        var v = val(p.key);
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
          '" data-log-value="#pv-' +
          p.key +
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
    vhsOsd.hidden = state.mode !== 'vhs';
  }
  params.addEventListener('input', function (e) {
    var el = e.target.closest('input[data-key]');
    if (!el) return;
    var m = C.MODES[C.modeIndex(state.mode)],
      p = m.params.filter(function (x) {
        return x.key === el.dataset.key;
      })[0];
    (state.values[state.mode] = state.values[state.mode] || {})[p.key] = +el.value;
    $('pv-' + p.key).textContent = fmt(p, +el.value);
  });
  params.addEventListener('change', save);
  params.addEventListener('click', function (e) {
    var b = e.target.closest('button[data-val]');
    if (!b) return;
    var m = C.MODES[C.modeIndex(state.mode)],
      p = m.params.filter(function (x) {
        return x.key === b.dataset.key;
      })[0];
    (state.values[state.mode] = state.values[state.mode] || {})[p.key] = b.dataset.val;
    renderParams();
    save();
    log(p.label + 'を「' + fmt(p, b.dataset.val) + '」にしました');
  });

  modeRow.addEventListener('click', function (e) {
    var b = e.target.closest('.chip');
    if (!b || b.dataset.mode === state.mode) return;
    ToolKit.vibrate();
    state.mode = b.dataset.mode;
    frameNo = 0;
    renderModes();
    renderParams();
    save();
    log('効果を「' + b.textContent + '」にしました(' + summary() + ')');
  });
  function summary() {
    var m = C.MODES[C.modeIndex(state.mode)];
    return m.params
      .map(function (p) {
        return p.label + ' ' + fmt(p, val(p.key));
      })
      .concat(['色温度 ' + state.kelvin + 'K'])
      .join(' / ');
  }

  kelvin.addEventListener('input', function () {
    state.kelvin = +kelvin.value;
    kelvinVal.textContent = C.kelvinLabel(state.kelvin);
  });
  kelvin.addEventListener('change', save);
  $('kelvinReset').addEventListener('click', function () {
    state.kelvin = 6500;
    kelvin.value = 6500;
    kelvinVal.textContent = C.kelvinLabel(6500);
    save();
    log('色温度を基準の 6500K に戻しました');
  });

  /* VHS の画面表示(再生の印と日時)。撮影した写真にも書き込む */
  var MON = ['JAN.', 'FEB.', 'MAR.', 'APR.', 'MAY', 'JUN.', 'JUL.', 'AUG.', 'SEP.', 'OCT.', 'NOV.', 'DEC.'];
  function vhsText() {
    var d = new Date(),
      h = d.getHours();
    return [
      (h < 12 ? 'AM ' : 'PM ') + (h % 12 || 12) + ':' + String(d.getMinutes()).padStart(2, '0'),
      MON[d.getMonth()] + ' ' + String(d.getDate()).padStart(2, '0') + ' ' + d.getFullYear(),
    ];
  }
  function tickOsd() {
    var t = vhsText();
    vhsTime.innerHTML = t[0] + '<br>' + t[1];
  }
  setInterval(tickOsd, 1000);
  tickOsd();

  /* カメラ */
  async function startCamera(deviceId) {
    ToolKit.media.stop(stream);
    stream = null;
    var r = await ToolKit.media.open(
      deviceId
        ? { video: { deviceId: { exact: deviceId }, width: { ideal: 1280 }, height: { ideal: 960 } } }
        : { video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 960 } } },
      'カメラ'
    );
    if (!r.stream) {
      statusText.textContent = r.message;
      emptyState.hidden = false;
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
    log('カメラを開始しました(' + ToolKit.media.size(track) + ' / カメラ ' + devices.length + '台)');
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
    freezeBtn.classList.toggle('active', frozen);
    log(frozen ? '映像を止めました(静止画で調整できます)' : '映像の静止を解除しました');
  });
  /* 撮影: WebGL の絵に、VHS の文字を重ねて PNG にする */
  captureBtn.addEventListener('click', function () {
    ToolKit.vibrate(30);
    if (!gl || !video.videoWidth) {
      log.warn('カメラの映像が無いため撮影できませんでした');
      return;
    }
    var out = document.createElement('canvas');
    out.width = view.width;
    out.height = view.height;
    var g = out.getContext('2d');
    g.drawImage(view, 0, 0);
    if (state.mode === 'vhs') {
      var s = out.height / 22,
        t = vhsText();
      g.font = '700 ' + s + 'px ui-monospace, Menlo, Consolas, monospace';
      g.fillStyle = '#f4f4f4';
      g.shadowColor = 'rgba(0,0,0,.6)';
      g.shadowBlur = s * 0.2;
      g.fillText('PLAY ▶', s * 0.9, s * 1.6);
      g.fillText(t[0], s * 0.9, out.height - s * 2.4);
      g.fillText(t[1], s * 0.9, out.height - s * 1.1);
    }
    shotCount += 1;
    var url = out.toDataURL('image/png'),
      a = document.createElement('a'),
      img = document.createElement('img');
    a.href = url;
    a.download = 'effect-' + state.mode + '-' + shotCount + '.png';
    img.src = url;
    img.alt = '撮影した写真 ' + shotCount;
    a.appendChild(img);
    capturedList.prepend(a);
    log(
      '撮影しました(' +
        shotCount +
        '枚目 / ' +
        out.width +
        '×' +
        out.height +
        ' / ' +
        C.MODES[C.modeIndex(state.mode)].name +
        ' / ' +
        summary() +
        ')'
    );
  });
  capturedList.addEventListener('click', function (e) {
    if (e.target.closest('a')) log('撮影した写真を押下しました(保存します)');
  });

  restore();
  kelvin.value = state.kelvin;
  kelvinVal.textContent = C.kelvinLabel(state.kelvin);
  renderModes();
  renderParams();
  var ok = false;
  try {
    ok = initGL();
  } catch (e) {
    log.error('映像を加工する処理の準備でエラーが発生しました', e);
  }
  if (!ok) {
    statusText.textContent = 'この端末のブラウザでは WebGL が使えないため、加工した映像を表示できません。';
    log.warn('WebGL が使えないため起動できませんでした');
    return;
  }
  log('起動しました(効果 ' + C.MODES[C.modeIndex(state.mode)].name + ' / ' + summary() + ')');
  startCamera().catch(function (e) {
    log.error('カメラの開始でエラーが発生しました', e);
  });
})();
