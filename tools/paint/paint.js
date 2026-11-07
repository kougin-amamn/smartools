/* ペイントの画面の動き。計算部分は paint-core.js、ログは common/site.js、ボタンの自動ログは tool-kit.js に任せる */
(function () {
  'use strict';
  var core = window.PaintCore;
  var cv = document.getElementById('cv'),
    ctx = cv.getContext('2d', { willReadFrequently: true }),
    stage = document.getElementById('stage'),
    colorIn = document.getElementById('color'),
    sizeIn = document.getElementById('size'),
    sizeVal = document.getElementById('sizeVal'),
    undoBtn = document.getElementById('undo'),
    redoBtn = document.getElementById('redo'),
    fileIn = document.getElementById('file'),
    statusEl = document.getElementById('status');

  /* 設定 */
  var MAX_SIDE = 2048; /* 読み込む画像・新しい画面の長い辺の上限(端末のメモリを守る) */
  var HISTORY_BYTES = 96 * 1024 * 1024; /* 元に戻す履歴に使うメモリの目安 */
  var FILL_TOL = 40; /* 塗りつぶしで同じ色とみなす差。線のふちのぼかしを塗り残さないため */
  var TOOL_NAME = { pen: 'ペン', eraser: '消しゴム', fill: '塗りつぶし' };
  var SWATCHES = [
    ['黒', '#222222'],
    ['白', '#ffffff'],
    ['赤', '#e03131'],
    ['オレンジ', '#f08c00'],
    ['黄', '#fcc419'],
    ['緑', '#2f9e44'],
    ['青', '#1c7ed6'],
    ['紫', '#7048e8'],
    ['茶', '#8d5a2b'],
  ];

  var tool = 'pen',
    history = new core.History(HISTORY_BYTES, 5),
    stroke = null;

  /* 描く場所の大きさ */
  function newCanvasSize() {
    var dpr = Math.min(window.devicePixelRatio || 1, 2),
      w = Math.max(200, stage.clientWidth),
      h = Math.max(200, stage.clientHeight);
    return core.fitSize(Math.round(w * dpr), Math.round(h * dpr), MAX_SIDE);
  }
  /* 画面に収まる大きさで表示する(中の画素数は変えない)。向きを変えた時にも呼ぶ */
  function layout() {
    var sw = stage.clientWidth,
      sh = stage.clientHeight,
      s = Math.min(sw / cv.width, sh / cv.height);
    cv.style.width = Math.floor(cv.width * s) + 'px';
    cv.style.height = Math.floor(cv.height * s) + 'px';
  }
  function whiten() {
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, cv.width, cv.height);
  }
  function updateButtons() {
    undoBtn.disabled = !history.canUndo();
    redoBtn.disabled = !history.canRedo();
  }
  function snapshot(reset) {
    var img = ctx.getImageData(0, 0, cv.width, cv.height),
      bytes = img.data.length;
    if (reset) history.reset(img, bytes);
    else history.push(img, bytes);
    updateButtons();
  }

  /* 道具・色・太さ */
  function setTool(name) {
    tool = name;
    document.querySelectorAll('[data-tool]').forEach(function (b) {
      var on = b.dataset.tool === name;
      b.classList.toggle('primary', on);
      b.setAttribute('aria-pressed', String(on));
    });
    cv.style.cursor = name === 'fill' ? 'copy' : 'crosshair';
  }
  document.querySelectorAll('[data-tool]').forEach(function (b) {
    b.onclick = function () {
      setTool(b.dataset.tool);
    };
  });
  function setColor(hex) {
    colorIn.value = hex;
    document.querySelectorAll('.swatch').forEach(function (b) {
      b.setAttribute('aria-pressed', String(b.dataset.hex === hex.toLowerCase()));
    });
    if (tool === 'eraser') {
      setTool('pen');
      log('色を選んだので道具を「ペン」にしました');
    }
  }
  var sw = document.getElementById('swatches');
  SWATCHES.forEach(function (c) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'swatch';
    b.style.background = c[1];
    b.dataset.hex = c[1];
    b.setAttribute('aria-label', '色 ' + c[0]);
    b.setAttribute('aria-pressed', 'false');
    b.onclick = function () {
      setColor(c[1]);
    };
    sw.insertBefore(b, colorIn);
  });
  colorIn.addEventListener('input', function () {
    setColor(colorIn.value);
  });
  sizeIn.addEventListener('input', function () {
    sizeVal.textContent = sizeIn.value + 'px';
  });

  /* 描く */
  function pos(e) {
    var r = cv.getBoundingClientRect();
    return {
      x: ((e.clientX - r.left) * cv.width) / r.width,
      y: ((e.clientY - r.top) * cv.height) / r.height,
    };
  }
  function brush() {
    var r = cv.getBoundingClientRect(),
      scale = cv.width / r.width;
    ctx.globalCompositeOperation = 'source-over';
    ctx.strokeStyle = ctx.fillStyle = tool === 'eraser' ? '#ffffff' : colorIn.value;
    ctx.lineWidth = Math.max(1, Number(sizeIn.value) * scale);
    ctx.lineCap = ctx.lineJoin = 'round';
  }
  cv.addEventListener('pointerdown', function (e) {
    if (stroke || (e.pointerType === 'mouse' && e.button !== 0)) return;
    e.preventDefault();
    var p = pos(e);
    if (tool === 'fill') {
      fillAt(p);
      return;
    }
    cv.setPointerCapture(e.pointerId);
    brush();
    stroke = { id: e.pointerId, last: p, mid: p, tool: tool, size: sizeIn.value };
    ctx.beginPath();
    ctx.arc(p.x, p.y, ctx.lineWidth / 2, 0, Math.PI * 2);
    ctx.fill();
  });
  cv.addEventListener('pointermove', function (e) {
    if (!stroke || e.pointerId !== stroke.id) return;
    e.preventDefault();
    var list = e.getCoalescedEvents ? e.getCoalescedEvents() : [];
    if (!list.length) list = [e];
    list.forEach(function (ev) {
      var p = pos(ev),
        mid = { x: (stroke.last.x + p.x) / 2, y: (stroke.last.y + p.y) / 2 };
      /* 点と点の真ん中をつないで曲線にすると、なめらかな線になる */
      ctx.beginPath();
      ctx.moveTo(stroke.mid.x, stroke.mid.y);
      ctx.quadraticCurveTo(stroke.last.x, stroke.last.y, mid.x, mid.y);
      ctx.stroke();
      stroke.last = p;
      stroke.mid = mid;
    });
  });
  function endStroke(e) {
    if (!stroke || e.pointerId !== stroke.id) return;
    ctx.beginPath();
    ctx.moveTo(stroke.mid.x, stroke.mid.y);
    ctx.lineTo(stroke.last.x, stroke.last.y);
    ctx.stroke();
    var s = stroke;
    stroke = null;
    snapshot(false);
    log(
      (s.tool === 'eraser' ? '消しました' : '線を描きました') +
        '(' +
        TOOL_NAME[s.tool] +
        ' / 太さ ' +
        s.size +
        'px / 元に戻せる回数 ' +
        history.index +
        ')',
    );
  }
  cv.addEventListener('pointerup', endStroke);
  cv.addEventListener('pointercancel', endStroke);

  function fillAt(p) {
    var img = ctx.getImageData(0, 0, cv.width, cv.height),
      t0 = performance.now(),
      n = core.floodFill(
        img.data,
        cv.width,
        cv.height,
        p.x,
        p.y,
        core.hexToRgb(colorIn.value),
        FILL_TOL,
      );
    if (!n) {
      log.warn('塗りつぶす場所がありませんでした');
      return;
    }
    ctx.putImageData(img, 0, 0);
    snapshot(false);
    log(
      '塗りつぶしました(' +
        n +
        '画素 / ' +
        colorIn.value +
        ' / ' +
        Math.round(performance.now() - t0) +
        'ms)',
    );
  }

  /* 元に戻す・やり直す・全消し */
  function restore(img) {
    if (img) ctx.putImageData(img, 0, 0);
    updateButtons();
    return !!img;
  }
  undoBtn.onclick = function () {
    if (restore(history.undo())) log('元に戻しました(あと ' + history.index + ' 回戻せます)');
  };
  redoBtn.onclick = function () {
    if (restore(history.redo())) log('やり直しました');
  };
  document.getElementById('clear').onclick = function () {
    whiten();
    snapshot(false);
    log('全部消しました(元に戻すで復活できます)');
  };

  /* 画像を開く・保存 */
  document.getElementById('open').onclick = function () {
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
    log
      .step(
        '画像の読み込み',
        function () {
          return decode(file).then(function (im) {
            var sw0 = im.width || im.naturalWidth,
              sh0 = im.height || im.naturalHeight,
              s = core.fitSize(sw0, sh0, MAX_SIDE);
            cv.width = s.w;
            cv.height = s.h;
            whiten();
            ctx.drawImage(im, 0, 0, s.w, s.h);
            if (im.close) im.close();
            snapshot(true);
            layout();
            return { from: sw0 + '×' + sh0, to: s.w + '×' + s.h };
          });
        },
        function (v) {
          return v.from + ' → ' + v.to + 'px';
        },
      )
      .then(function (r) {
        statusEl.textContent = r.ok ? '' : '画像を読み込めませんでした';
      });
  });
  function stamp() {
    var d = new Date(),
      p = function (n) {
        return String(n).padStart(2, '0');
      };
    return (
      '' +
      d.getFullYear() +
      p(d.getMonth() + 1) +
      p(d.getDate()) +
      '-' +
      p(d.getHours()) +
      p(d.getMinutes()) +
      p(d.getSeconds())
    );
  }
  document.getElementById('save').onclick = function () {
    log.step(
      'PNGの保存',
      function () {
        return new Promise(function (ok, ng) {
          cv.toBlob(function (blob) {
            if (!blob) return ng(new Error('PNGにできませんでした'));
            var a = document.createElement('a'),
              url = URL.createObjectURL(blob);
            a.href = url;
            a.download = 'paint-' + stamp() + '.png';
            document.body.appendChild(a);
            a.click();
            a.remove();
            setTimeout(function () {
              URL.revokeObjectURL(url);
            }, 4000);
            ok(blob.size);
          }, 'image/png');
        });
      },
      function (size) {
        return cv.width + '×' + cv.height + 'px / ' + Math.round(size / 1024) + 'KB';
      },
    );
  };

  /* 起動 */
  var size0 = newCanvasSize();
  cv.width = size0.w;
  cv.height = size0.h;
  whiten();
  snapshot(true);
  setColor(colorIn.value);
  layout();
  window.addEventListener('resize', layout);
  log.started('絵の大きさ ' + cv.width + '×' + cv.height + 'px');
})();
