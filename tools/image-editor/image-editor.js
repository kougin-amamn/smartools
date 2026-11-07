/* 画像編集の画面。開いた画像に WebGL で効果(絵画・線とドット・印刷・模様)と色のフィルターを掛けて表示し、元の画像と見比べて保存できる。
   効果の一覧と計算は image-editor-core.js、シェーダーは image-editor-shaders.js */
(function () {
  'use strict';
  var C = window.ImageEditorCore,
    SH = window.ImageEditorShaders,
    $ = function (id) {
      return document.getElementById(id);
    };
  var view = $('view'),
    stage = $('stage'),
    dropText = $('dropText'),
    fileInput = $('fileInput'),
    compareBtn = $('compareBtn'),
    compareBadge = $('compareBadge'),
    effectRow = $('effectRow'),
    groupRow = $('groupRow'),
    filterRow = $('filterRow'),
    filtRow = $('filtRow'),
    filtAmt = $('filtAmt'),
    filtVal = $('filtVal'),
    params = $('params'),
    amount = $('amount'),
    amountVal = $('amountVal'),
    savePng = $('savePng'),
    saveJpg = $('saveJpg');

  var KEY = 'image-editor-settings',
    PREVIEW = 1600 /* 表示用に描く大きさ(長い辺の画素)。調整中も軽く動くように */,
    SAVE_MAX = 4096; /* 保存する大きさの上限 */
  /* テクスチャの番号: 画像・減色の置き換え表・誤差拡散の白黒 */
  var UNITS = { tex: 0, lut: 1, dith: 3 };
  var state = { effect: 'anime', values: {}, amount: 100, filter: { id: 'none', amount: 100 } },
    viewGroup = null,
    serial = 0 /* 開いた画像の通し番号(パレットなどを作り直す目安) */,
    gl = null,
    tex = null,
    lutTex = null,
    dithTex = null,
    progs = {},
    img = null /* { el: 縮めた元画像のキャンバス, name, w, h(元の大きさ), bytes } */,
    comparing = false,
    queued = false,
    maxTex = 4096;

  /* WebGL */
  function compile(type, src) {
    var s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  }
  function program(id) {
    if (progs[id]) return progs[id];
    var p = gl.createProgram();
    gl.attachShader(p, compile(gl.VERTEX_SHADER, SH.VS));
    gl.attachShader(p, compile(gl.FRAGMENT_SHADER, SH.build(SH.FX[id])));
    gl.bindAttribLocation(p, 0, 'p');
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    var o = { p: p, loc: {} };
    ['size', 'prm', 'dpr', 'amount', 'filt', 'filtAmt'].forEach(function (n) {
      o.loc[n] = gl.getUniformLocation(p, n);
    });
    gl.useProgram(p);
    Object.keys(UNITS).forEach(function (n) {
      var l = gl.getUniformLocation(p, n);
      if (l) gl.uniform1i(l, UNITS[n]);
    });
    progs[id] = o;
    return o;
  }
  function makeTex(unit, nearest) {
    var t = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, t);
    /* 画像の大きさは2のべき乗とは限らないため、端の扱いを CLAMP にする。置き換え表と白黒は色を混ぜないよう補間しない */
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    var f = nearest ? gl.NEAREST : gl.LINEAR;
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, f);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, f);
    return t;
  }
  function initGL() {
    /* 保存時に描いた結果を読み出すため、描画バッファを残す */
    gl = view.getContext('webgl', { preserveDrawingBuffer: true, antialias: false });
    if (!gl) return false;
    maxTex = Math.min(
      SAVE_MAX,
      gl.getParameter(gl.MAX_TEXTURE_SIZE) || 4096,
      gl.getParameter(gl.MAX_RENDERBUFFER_SIZE) || 4096,
    );
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    lutTex = makeTex(UNITS.lut, true);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      1024,
      32,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      C.buildLut(C.evenPalette(256)),
    );
    dithTex = makeTex(UNITS.dith, true);
    tex = makeTex(UNITS.tex);
    return true;
  }
  /* 減色のパレット: 画像を縮めて(長い辺 200 画素)メディアンカットで作り、置き換え表にしてシェーダーに渡す。
     画像か色の数・パレットの種類が変わった時だけ作り直す */
  var palette = { colors: [], key: '' };
  function updatePalette() {
    var n = val({ key: 'colors', value: 256 }),
      kind = val({ key: 'palette', value: 'auto' }),
      key = img.serial + '/' + kind + n;
    if (key === palette.key) return;
    var t1 = performance.now(),
      cols;
    if (kind === 'even') cols = C.evenPalette(n);
    else {
      var s = C.fitSize(img.el.width, img.el.height, 200),
        c = document.createElement('canvas');
      c.width = s[0];
      c.height = s[1];
      var g = c.getContext('2d', { willReadFrequently: true });
      g.drawImage(img.el, 0, 0, s[0], s[1]);
      cols = C.medianCut(g.getImageData(0, 0, s[0], s[1]).data, n, 4);
    }
    gl.activeTexture(gl.TEXTURE0 + UNITS.lut);
    gl.bindTexture(gl.TEXTURE_2D, lutTex);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      1024,
      32,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      C.buildLut(cols),
    );
    palette = { colors: cols, key: key };
    drawPalette();
    log(
      'パレットを作りました(' +
        cols.length +
        '色 / ' +
        (kind === 'auto' ? '画像に合わせる' : '均等') +
        ' / ' +
        Math.round(performance.now() - t1) +
        'ms)',
    );
  }
  /* 使っている色を、明るさの順に帯で見せる */
  function drawPalette() {
    var cv = $('palView'),
      cnt = $('palCount');
    if (!cv) return;
    var g = cv.getContext('2d'),
      cols = palette.colors.slice().sort(function (a, b) {
        return a[0] * 0.3 + a[1] * 0.59 + a[2] * 0.11 - (b[0] * 0.3 + b[1] * 0.59 + b[2] * 0.11);
      }),
      w = cv.width / Math.max(1, cols.length);
    g.clearRect(0, 0, cv.width, cv.height);
    cols.forEach(function (c, i) {
      g.fillStyle = 'rgb(' + c.join(',') + ')';
      g.fillRect(Math.floor(i * w), 0, Math.ceil(w), cv.height);
    });
    cnt.textContent = cols.length ? cols.length + '色' : '';
  }
  /* 2色ディザの誤差拡散: 点1つを1画素にした大きさに画像を縮め、明るさを整えて白黒を決め、dith に入れる。
     描く大きさ(表示用・保存用)ごとに点の数が違うので、大きさと調整が変わった時に作り直す */
  var diffKey = '';
  function updateDiffuse(W, H) {
    var d = val({ key: 'dot', value: 2 }) * C.effectScale(W, H),
      w = Math.max(1, Math.ceil(W / d)),
      h = Math.max(1, Math.ceil(H / d)),
      method = val({ key: 'method', value: 'bayer' }),
      bright = val({ key: 'bright', value: 50 }),
      key = [img.serial, w, h, method, bright].join('/');
    if (key === diffKey) return;
    var c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    var g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(img.el, 0, 0, w, h);
    var px = g.getImageData(0, 0, w, h).data,
      lum = new Float32Array(w * h),
      gm = C.ditherGamma(bright);
    for (var i = 0; i < w * h; i++) {
      var l = (px[i * 4] * 0.299 + px[i * 4 + 1] * 0.587 + px[i * 4 + 2] * 0.114) / 255;
      lum[i] = Math.pow(Math.max(0, Math.min(1, (l - 0.5) * 1.15 + 0.5)), gm);
    }
    var bits = C.diffuse(lum, w, h, method),
      flip = new Uint8Array(w * h);
    /* シェーダーは画面の下から数えるので、上下を入れ替えて渡す */
    for (var r = 0; r < h; r++) flip.set(bits.subarray(r * w, r * w + w), (h - 1 - r) * w);
    gl.activeTexture(gl.TEXTURE0 + UNITS.dith);
    gl.bindTexture(gl.TEXTURE_2D, dithTex);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE, w, h, 0, gl.LUMINANCE, gl.UNSIGNED_BYTE, flip);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
    diffKey = key;
  }
  /* w×h の大きさで描く。効果の大きさは描く大きさに比例させるので、表示用と保存用で見た目がそろう */
  function render(w, h) {
    if (view.width !== w || view.height !== h) {
      view.width = w;
      view.height = h;
    }
    var id = comparing ? 'none' : state.effect,
      pr = program(id),
      p = C.prmOf(id, state.values[id]);
    if (id === 'reduce') updatePalette();
    if (id === 'dither2' && val({ key: 'method', value: 'bayer' }) !== 'bayer') updateDiffuse(w, h);
    gl.activeTexture(gl.TEXTURE0);
    gl.useProgram(pr.p);
    gl.uniform2f(pr.loc.size, w, h);
    gl.uniform1f(pr.loc.filt, comparing ? 0 : C.filterIndex(state.filter.id));
    gl.uniform1f(pr.loc.filtAmt, state.filter.amount / 100);
    gl.uniform4f(pr.loc.prm, p[0], p[1], p[2], p[3]);
    gl.uniform1f(pr.loc.dpr, C.effectScale(w, h));
    gl.uniform1f(pr.loc.amount, comparing ? 0 : state.amount / 100);
    gl.viewport(0, 0, w, h);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }
  function previewSize() {
    return C.fitSize(img.el.width, img.el.height, PREVIEW);
  }
  /* 調整のたびに何度も描かないよう、次の描画の時にまとめて1回だけ描く */
  function redraw() {
    if (!img || queued) return;
    queued = true;
    requestAnimationFrame(function () {
      queued = false;
      try {
        var s = previewSize();
        render(s[0], s[1]);
      } catch (e) {
        log.error('効果を描く所でエラーが発生しました', e);
      }
    });
  }

  /* 画像を開く: 画像を読み込み、長い辺を上限(端末の上限か 4096 画素)まで縮めたキャンバスにして、テクスチャに入れる */
  function openFile(file, how) {
    if (!file || !/^image\//.test(file.type)) {
      log.warn(
        '画像ではないため開けませんでした(' + (file ? file.type || '種類不明' : 'なし') + ')',
      );
      dropText.textContent = '画像のファイルを選んでください';
      return;
    }
    var t1 = performance.now(),
      url = URL.createObjectURL(file),
      el = new Image();
    el.onload = function () {
      URL.revokeObjectURL(url);
      var s = C.fitSize(el.naturalWidth, el.naturalHeight, maxTex),
        cv = document.createElement('canvas');
      cv.width = s[0];
      cv.height = s[1];
      cv.getContext('2d').drawImage(el, 0, 0, s[0], s[1]);
      img = {
        el: cv,
        name: file.name || 'image',
        w: el.naturalWidth,
        h: el.naturalHeight,
        bytes: file.size,
        serial: ++serial,
      };
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, cv);
      view.hidden = false;
      stage.classList.add('has-image');
      [compareBtn, savePng, saveJpg].forEach(function (b) {
        b.disabled = false;
      });
      redraw();
      var ps = previewSize();
      log(
        '画像を開きました(' +
          how +
          ' / ' +
          img.w +
          '×' +
          img.h +
          ' / ' +
          C.bytes(img.bytes) +
          ' / 表示 ' +
          ps[0] +
          '×' +
          ps[1] +
          ' / ' +
          Math.round(performance.now() - t1) +
          'ms)',
      );
    };
    el.onerror = function () {
      URL.revokeObjectURL(url);
      dropText.textContent = 'この画像は開けませんでした。JPEG・PNG・WebP などを選んでください';
      log.warn(
        '画像を読み込めませんでした(' +
          (file.type || '種類不明') +
          ' / ' +
          C.bytes(file.size) +
          ')',
      );
    };
    el.src = url;
  }
  fileInput.addEventListener('change', function () {
    if (fileInput.files[0]) openFile(fileInput.files[0], 'ファイルを選択');
    fileInput.value = '';
  });
  ['dragenter', 'dragover'].forEach(function (t) {
    stage.addEventListener(t, function (e) {
      e.preventDefault();
      stage.classList.add('over');
    });
  });
  ['dragleave', 'drop'].forEach(function (t) {
    stage.addEventListener(t, function (e) {
      e.preventDefault();
      stage.classList.remove('over');
    });
  });
  stage.addEventListener('drop', function (e) {
    var f = e.dataTransfer && e.dataTransfer.files[0];
    log('画像をドロップしました');
    openFile(f, 'ドロップ');
  });
  window.addEventListener('paste', function (e) {
    var items = (e.clipboardData && e.clipboardData.items) || [];
    for (var i = 0; i < items.length; i++)
      if (items[i].kind === 'file' && /^image\//.test(items[i].type)) {
        log('画像を貼り付けました');
        openFile(items[i].getAsFile(), '貼り付け');
        return;
      }
  });

  /* 元の画像と比べる: 押している間だけ効果を外す */
  function compare(on) {
    if (!img || comparing === on) return;
    comparing = on;
    compareBadge.hidden = !on;
    redraw();
  }
  compareBtn.addEventListener('pointerdown', function (e) {
    compareBtn.setPointerCapture(e.pointerId);
    compare(true);
  });
  ['pointerup', 'pointercancel'].forEach(function (t) {
    compareBtn.addEventListener(t, function () {
      compare(false);
    });
  });
  compareBtn.addEventListener('keydown', function (e) {
    if (e.key === ' ' || e.key === 'Enter') compare(true);
  });
  compareBtn.addEventListener('keyup', function () {
    compare(false);
  });

  /* 効果のボタンと調整のスライダー */
  function eff() {
    return C.EFFECTS[C.effectIndex(state.effect)];
  }
  /* 調整の今の値。選ぶ物(type:'choice')は選んだ id、スライダーは数 */
  function val(q) {
    var p =
        eff().params.filter(function (x) {
          return x.key === q.key;
        })[0] || q,
      v = (state.values[state.effect] || {})[p.key];
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
    return v + p.unit;
  }
  function summary() {
    return eff()
      .params.map(function (p) {
        return p.label + ' ' + fmt(p, val(p));
      })
      .concat(
        state.effect === 'none' ? [] : ['強さ ' + state.amount + '%'],
        state.filter.id === 'none'
          ? []
          : [
              '色 ' +
                C.FILTERS[C.filterIndex(state.filter.id)][1] +
                ' ' +
                state.filter.amount +
                '%',
            ],
      )
      .join(' / ');
  }
  /* 効果は分類のタブごとに並べる(「なし」はいつも先頭)。選んでいる効果の分類を最初に開く */
  function renderEffects() {
    var g = viewGroup || (eff().group === 'all' ? C.GROUPS[0][0] : eff().group);
    groupRow.innerHTML = C.GROUPS.map(function (x) {
      return (
        '<button class="tab' +
        (x[0] === g ? ' active' : '') +
        '" data-group="' +
        x[0] +
        '" aria-pressed="' +
        (x[0] === g) +
        '">' +
        x[1] +
        '</button>'
      );
    }).join('');
    effectRow.innerHTML = C.EFFECTS.filter(function (m) {
      return m.group === 'all' || m.group === g;
    })
      .map(function (m) {
        var on = m.id === state.effect;
        return (
          '<button class="chip' +
          (on ? ' active' : '') +
          '" data-effect="' +
          m.id +
          '" aria-pressed="' +
          on +
          '">' +
          m.name +
          '</button>'
        );
      })
      .join('');
  }
  function renderFilters() {
    filterRow.innerHTML =
      '<span class="row-label">色</span>' +
      C.FILTERS.map(function (f) {
        var on = f[0] === state.filter.id;
        return (
          '<button class="chip' +
          (on ? ' active' : '') +
          '" data-filter="' +
          f[0] +
          '" aria-pressed="' +
          on +
          '">' +
          f[1] +
          '</button>'
        );
      }).join('');
    filtRow.hidden = state.filter.id === 'none';
    filtAmt.value = state.filter.amount;
    filtVal.textContent = state.filter.amount + '%';
  }
  function renderParams() {
    params.innerHTML =
      eff()
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
        .join('') +
      (state.effect === 'reduce'
        ? '<div class="pal-row"><canvas id="palView" width="256" height="16" aria-label="使っている色"></canvas><b id="palCount"></b></div>'
        : '');
    if (state.effect === 'reduce') drawPalette();
    $('amountRow').hidden = state.effect === 'none';
  }
  groupRow.addEventListener('click', function (e) {
    var b = e.target.closest('.tab');
    if (!b) return;
    viewGroup = b.dataset.group;
    renderEffects();
  });
  effectRow.addEventListener('click', function (e) {
    var b = e.target.closest('.chip');
    if (!b || b.dataset.effect === state.effect) return;
    ToolKit.vibrate();
    state.effect = b.dataset.effect;
    viewGroup = null;
    renderEffects();
    renderParams();
    save();
    redraw();
    log('効果を「' + b.textContent + '」にしました' + (summary() ? '(' + summary() + ')' : ''));
  });
  filterRow.addEventListener('click', function (e) {
    var b = e.target.closest('.chip');
    if (!b || b.dataset.filter === state.filter.id) return;
    ToolKit.vibrate();
    state.filter.id = b.dataset.filter;
    renderFilters();
    save();
    redraw();
    log(
      '色を「' +
        b.textContent +
        '」にしました' +
        (state.filter.id === 'none' ? '' : '(強さ ' + state.filter.amount + '%)'),
    );
  });
  filtAmt.addEventListener('input', function () {
    state.filter.amount = +filtAmt.value;
    filtVal.textContent = state.filter.amount + '%';
    redraw();
  });
  filtAmt.addEventListener('change', save);
  params.addEventListener('input', function (e) {
    var el = e.target.closest('input[data-key]');
    if (!el) return;
    var p = eff().params.filter(function (x) {
      return x.key === el.dataset.key;
    })[0];
    (state.values[state.effect] = state.values[state.effect] || {})[p.key] = +el.value;
    $('pv-' + p.key).textContent = fmt(p, +el.value);
    redraw();
  });
  params.addEventListener('click', function (e) {
    var b = e.target.closest('button[data-val]');
    if (!b) return;
    var p = eff().params.filter(function (x) {
      return x.key === b.dataset.key;
    })[0];
    (state.values[state.effect] = state.values[state.effect] || {})[p.key] = b.dataset.val;
    renderParams();
    save();
    redraw();
    log(p.label + 'を「' + fmt(p, b.dataset.val) + '」にしました');
  });
  params.addEventListener('change', save);
  amount.addEventListener('input', function () {
    state.amount = +amount.value;
    amountVal.textContent = state.amount + '%';
    redraw();
  });
  amount.addEventListener('change', save);

  /* 保存: 保存用の大きさで描き直して画像にし、表示用の大きさに戻す */
  function saveAs(type, ext) {
    if (!img) return;
    var t1 = performance.now(),
      w = img.el.width,
      h = img.el.height;
    try {
      render(w, h);
    } catch (e) {
      log.error('保存する画像を描く所でエラーが発生しました', e);
      return;
    }
    view.toBlob(
      function (blob) {
        var s = previewSize();
        render(s[0], s[1]);
        if (!blob) {
          log.error('画像を作れませんでした(' + w + '×' + h + ')');
          return;
        }
        var name = C.outName(
            img.name,
            state.effect !== 'none' ? state.effect : state.filter.id,
            ext,
          ),
          a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = name;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(function () {
          URL.revokeObjectURL(a.href);
        }, 10000);
        log(
          '保存しました(' +
            name +
            ' / ' +
            w +
            '×' +
            h +
            ' / ' +
            C.bytes(blob.size) +
            ' / ' +
            Math.round(performance.now() - t1) +
            'ms)',
        );
      },
      type,
      0.92,
    );
  }
  savePng.addEventListener('click', function () {
    saveAs('image/png', 'png');
  });
  saveJpg.addEventListener('click', function () {
    saveAs('image/jpeg', 'jpg');
  });

  /* 設定(効果・調整・強さ)を端末に保存 */
  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch (e) {
      log.warn('設定の保存に失敗しました', e);
    }
  }
  try {
    var s = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (s) {
      if (C.EFFECTS[C.effectIndex(s.effect)].id === s.effect) state.effect = s.effect;
      if (s.values && typeof s.values === 'object') state.values = s.values;
      if (typeof s.amount === 'number') state.amount = Math.max(0, Math.min(100, s.amount));
      if (s.filter && typeof s.filter === 'object') {
        if (C.FILTERS[C.filterIndex(s.filter.id)][0] === s.filter.id) state.filter.id = s.filter.id;
        if (typeof s.filter.amount === 'number')
          state.filter.amount = Math.max(0, Math.min(100, s.filter.amount));
      }
    }
  } catch (e) {
    log.warn('設定の読み込みに失敗しました', e);
  }
  amount.value = state.amount;
  amountVal.textContent = state.amount + '%';
  renderEffects();
  renderFilters();
  renderParams();
  var ok = false;
  try {
    ok = initGL();
  } catch (e) {
    log.error('画像を加工する処理の準備でエラーが発生しました', e);
  }
  if (!ok) {
    dropText.textContent = 'この端末のブラウザでは WebGL が使えないため、画像を加工できません。';
    log.warn('WebGL が使えないため起動できませんでした');
    return;
  }
  log(
    '起動しました(効果 ' +
      eff().name +
      (summary() ? ' / ' + summary() : '') +
      ' / 保存の上限 ' +
      maxTex +
      '画素)',
  );
})();
