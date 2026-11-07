/* 本棚ランチャーのカメラと操作(見回す・拡大・タップ・描画ループ)。タップやスワイプは呼び出し側へ知らせる。
   BookshelfView.create({THREE, core, renderer, stage, canvas, world, card, zoomBtn, onTap, onEmpty, onSwipe, onFirstMove}) */
function create(o) {
  var THREE = o.THREE,
    core = o.core,
    renderer = o.renderer,
    stage = o.stage,
    canvas = o.canvas,
    world = o.world;
  var FOV = 55,
    camera = new THREE.PerspectiveCamera(FOV, 1, 0.05, 80);
  camera.rotation.order = 'YXZ';
  var ZMIN = 1,
    ZMAX = 3;
  var cur = { x: 0, y: 1.2, z: 0, yaw: 0, pitch: 0, zoom: 1 }; /* いまのカメラ(外からも読む) */
  var par = { x: 0, y: 0 },
    parT = { x: 0, y: 0 };
  var tween = null,
    focus = -1,
    hover = -1;
  var books = world.books;

  function applyCamera() {
    camera.position.set(cur.x, cur.y, cur.z);
    camera.rotation.set(cur.pitch + par.y, cur.yaw + par.x, 0);
    if (camera.zoom !== cur.zoom) {
      camera.zoom = cur.zoom;
      camera.updateProjectionMatrix();
    }
  }
  function wideLayout() {
    return stage.clientWidth >= 720 && camera.aspect >= 1.2;
  }
  /* 立ち位置: 本棚の正面、高さの中ほどから水平に見る。横長の画面は植物からランプまで、縦長の画面は本棚の幅がちょうど収まる距離 */
  function homePose() {
    var p = world.plan(),
      t = Math.tan((FOV * Math.PI) / 360),
      a = camera.aspect || 1.5;
    var w = a >= 1 ? p.viewW : p.caseW + 0.06;
    var dist = Math.max((p.caseH + 0.08) / (2 * t), w / (2 * t * a));
    return {
      x: p.frame.x,
      y: p.caseH / 2,
      z: Math.min(p.frame.z + dist, p.hz - 0.3),
      yaw: 0,
      pitch: 0,
      zoom: 1,
    };
  }
  /* 引き出した本の表紙の位置(ワールド座標) */
  function coverWorld(rec) {
    var p = core.pullPose(1),
      s = rec.sec,
      c = Math.cos(s.ry),
      sn = Math.sin(s.ry);
    var lx = rec.base.x,
      lz = rec.base.z + p.dz;
    return { x: s.x + lx * c + lz * sn, y: rec.base.y + p.dy, z: s.z - lx * sn + lz * c };
  }
  /* 本の表紙の正面に立つ姿勢(横長の画面は説明カードを右、縦長は下に出すので、その分ずらす) */
  function viewPose(i) {
    var rec = books[i],
      p = coverWorld(rec);
    var item = {
      x: p.x,
      y: p.y,
      z: p.z,
      ry: rec.sec.ry,
      nx: rec.sec.n.x,
      nz: rec.sec.n.z,
      w: core.TOOL.d + 0.06,
      h: core.TOOL.h + 0.06,
    };
    var opt = { fov: FOV, aspect: camera.aspect, minDist: 0.55, maxDist: 2.4 };
    if (wideLayout()) {
      opt.availW = 0.56;
      opt.availH = 0.84;
      opt.cx = 0.31;
      opt.cy = 0.47;
    } else {
      var sh = stage.clientHeight || 1,
        top = o.card.hidden
          ? sh
          : o.card.getBoundingClientRect().top - stage.getBoundingClientRect().top;
      var free = Math.max(0.35, Math.min(0.9, (top - 12) / sh));
      opt.availW = 0.9;
      opt.availH = free - 0.08;
      opt.cx = 0.5;
      opt.cy = 0.06 + (free - 0.08) / 2;
    }
    return core.framePose(item, opt);
  }
  function moveTo(target, done) {
    var from = { x: cur.x, y: cur.y, z: cur.z, yaw: cur.yaw, pitch: cur.pitch, zoom: cur.zoom };
    var to = {
      x: target.x,
      y: target.y,
      z: target.z,
      yaw: core.nearestAngle(cur.yaw, target.yaw),
      pitch: target.pitch,
      zoom: target.zoom || 1,
    };
    o.zoomBtn.hidden = true;
    tween = { from: from, to: to, t0: performance.now(), dur: core.duration(from, to), done: done };
  }
  /* 本を選ぶ(i>=0)/棚に戻す(i=-1) */
  function setFocus(i, done) {
    focus = i;
    if (i >= 0) world.coverOf(i);
    moveTo(i >= 0 ? viewPose(i) : homePose(), done);
  }

  /* ズーム(画角を狭めて望遠にする。立ち位置は動かないので本棚を突き抜けない) */
  function zoomLabel(z) {
    return z.toFixed(1) + '倍';
  }
  function setZoom(z) {
    cur.zoom = Math.max(ZMIN, Math.min(ZMAX, z));
    o.zoomBtn.hidden = !(focus < 0 && !tween && cur.zoom > 1.05);
  }
  var zoomLog = null; /* ホイール・キーのログは操作が止まってからまとめて1行 */
  function zoomBy(f, how) {
    if (tween) return;
    if (!zoomLog) zoomLog = { from: cur.zoom, how: how, timer: 0 };
    setZoom(cur.zoom * f);
    o.onFirstMove();
    clearTimeout(zoomLog.timer);
    zoomLog.timer = setTimeout(function () {
      var w = zoomLog;
      zoomLog = null;
      if (Math.abs(cur.zoom - w.from) > 0.01)
        log(
          w.how + 'で拡大率を変えました(' + zoomLabel(w.from) + ' → ' + zoomLabel(cur.zoom) + ')',
        );
    }, 350);
  }
  function resetZoom(done) {
    var z0 = cur.zoom;
    moveTo({ x: cur.x, y: cur.y, z: cur.z, yaw: cur.yaw, pitch: cur.pitch, zoom: 1 }, function () {
      if (done) done(z0);
    });
  }
  function look(dyaw) {
    if (!tween) {
      cur.yaw += dyaw;
      o.onFirstMove();
    }
  }

  /* 操作(ドラッグで見回す / 2本指でピンチ / タップで選ぶ / 横スワイプで前後) */
  var ray = new THREE.Raycaster(),
    mouse = new THREE.Vector2();
  var pickDesk = false,
    pickKind = null;
  function pick(e) {
    var r = canvas.getBoundingClientRect();
    mouse.x = ((e.clientX - r.left) / r.width) * 2 - 1;
    mouse.y = -((e.clientY - r.top) / r.height) * 2 + 1;
    applyCamera();
    camera.updateMatrixWorld(true);
    ray.setFromCamera(mouse, camera);
    var hit = ray.intersectObjects(world.pickables(), false);
    pickKind = null;
    if (!hit.length) {
      pickDesk = false;
      return -1;
    }
    pickDesk = !!hit[0].object.userData.desk; /* 机の上の本か */
    pickKind = hit[0].object.userData.kind || null; /* 扉・天井の照明・机のアームライト */
    return pickKind ? -1 : hit[0].object.userData.index;
  }
  var ptr = null,
    hoverPending = null,
    touches = {},
    pinch = null;
  function touchList() {
    return Object.keys(touches).map(function (k) {
      return touches[k];
    });
  }
  function spread() {
    var t = touchList();
    return Math.hypot(t[0].x - t[1].x, t[0].y - t[1].y) || 1;
  }
  canvas.addEventListener('pointerdown', function (e) {
    touches[e.pointerId] = { x: e.clientX, y: e.clientY };
    try {
      canvas.setPointerCapture(e.pointerId);
    } catch (x) {
      log.debug('ポインタの捕捉に失敗しました(ドラッグは続けられます)');
    }
    if (touchList().length === 2) {
      pinch = { d0: spread(), z0: cur.zoom, from: cur.zoom };
      if (ptr) {
        ptr.moved = true;
        ptr.pinch = true;
      }
      o.onFirstMove();
      return;
    }
    if (pinch) return;
    ptr = { sx: e.clientX, sy: e.clientY, x: e.clientX, y: e.clientY, moved: false };
  });
  canvas.addEventListener('pointermove', function (e) {
    if (touches[e.pointerId]) {
      touches[e.pointerId].x = e.clientX;
      touches[e.pointerId].y = e.clientY;
    }
    if (pinch) {
      if (touchList().length >= 2 && !tween) setZoom((pinch.z0 * spread()) / pinch.d0);
      return;
    }
    if (ptr) {
      var dx = e.clientX - ptr.x,
        dy = e.clientY - ptr.y;
      ptr.x = e.clientX;
      ptr.y = e.clientY;
      if (!ptr.moved && Math.hypot(e.clientX - ptr.sx, e.clientY - ptr.sy) > 6) {
        ptr.moved = true;
        canvas.classList.add('drag');
        o.onFirstMove();
      }
      if (ptr.moved && focus < 0 && !tween) {
        cur.yaw += (dx * 0.005) / cur.zoom;
        cur.pitch = Math.max(-0.5, Math.min(1.0, cur.pitch + (dy * 0.004) / cur.zoom));
      } /* 拡大中はゆっくり */
      return;
    }
    if (e.pointerType === 'mouse') {
      var r = canvas.getBoundingClientRect();
      parT.x = -((e.clientX - r.left) / r.width - 0.5) * 0.04;
      parT.y = -((e.clientY - r.top) / r.height - 0.5) * 0.03;
      hoverPending = e;
    }
  });
  function endPointer(e, cancelled) {
    delete touches[e.pointerId];
    if (pinch) {
      if (touchList().length < 2) {
        if (Math.abs(cur.zoom - pinch.from) > 0.01)
          log(
            'ピンチで拡大率を変えました(' +
              zoomLabel(pinch.from) +
              ' → ' +
              zoomLabel(cur.zoom) +
              ')',
          );
        pinch = null;
        ptr = null;
        canvas.classList.remove('drag');
      }
      return;
    }
    if (!ptr) return;
    var p = ptr;
    ptr = null;
    canvas.classList.remove('drag');
    if (cancelled || p.pinch) return;
    if (!p.moved) {
      var i = pick(e);
      if (i >= 0) {
        if (pickDesk && o.onDeskTap) o.onDeskTap(i);
        else o.onTap(i);
      } else if (pickKind && o.onThing) o.onThing(pickKind);
      else if (o.onEmpty) o.onEmpty();
      return;
    }
    if (focus >= 0) {
      var dx = e.clientX - p.sx,
        dy = e.clientY - p.sy;
      if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) o.onSwipe(dx < 0 ? 1 : -1);
    }
  }
  canvas.addEventListener('pointerup', function (e) {
    endPointer(e, false);
  });
  canvas.addEventListener('pointercancel', function (e) {
    endPointer(e, true);
  });
  canvas.addEventListener('pointerleave', function () {
    parT.x = parT.y = 0;
    if (hover !== -1) {
      hover = -1;
      canvas.classList.remove('hover');
    }
  });
  canvas.addEventListener(
    'wheel',
    function (e) {
      e.preventDefault();
      zoomBy(Math.exp(-e.deltaY * 0.0015), 'ホイール');
    },
    { passive: false },
  );

  /* 描画ループ */
  var lastT = 0;
  function animateBooks(dt) {
    var moving = false;
    for (var i = 0; i < books.length; i++) {
      var r = books[i],
        target = i === focus ? 1 : i === hover ? 0.12 : 0;
      if (r.k < 0) r.k = 0; /* 並べ直した直後(棚の位置へ置き直す) */
      else if (Math.abs(target - r.k) < 0.001 && r.k === target) continue;
      r.k += (target - r.k) * Math.min(1, dt * (target > r.k ? 3.2 : 4.5));
      if (Math.abs(target - r.k) < 0.001) r.k = target;
      moving = true;
      var p = core.pullPose(r.k),
        hv = i === hover && i !== focus;
      r.mesh.position.set(r.base.x, r.base.y + p.dy, r.base.z + (hv ? (0.06 * r.k) / 0.12 : p.dz));
      r.mesh.rotation.y = hv ? 0 : p.ry;
    }
    return moving;
  }
  function frame(now) {
    requestAnimationFrame(frame);
    var dt = Math.min(0.1, (now - (lastT || now)) / 1000);
    lastT = now;
    if (tween) {
      var q = (now - tween.t0) / tween.dur;
      if (q >= 1) {
        cur.x = tween.to.x;
        cur.y = tween.to.y;
        cur.z = tween.to.z;
        cur.yaw = tween.to.yaw;
        cur.pitch = tween.to.pitch;
        cur.zoom = tween.to.zoom;
        var d = tween.done;
        tween = null;
        if (d) d();
      } else {
        var eq = core.ease(q),
          l = core.lerpPose(tween.from, tween.to, eq);
        cur.x = l.x;
        cur.y = l.y;
        cur.z = l.z;
        cur.yaw = l.yaw;
        cur.pitch = l.pitch;
        cur.zoom = tween.from.zoom + (tween.to.zoom - tween.from.zoom) * eq;
      }
    }
    if (hoverPending) {
      var e = hoverPending;
      hoverPending = null;
      var h = pick(e);
      if (pickDesk) {
        canvas.classList.add('hover');
        h = -1;
      } else if (h < 0) canvas.classList.remove('hover'); /* 机の本は棚の本を光らせない */
      if (h !== hover) {
        if (hover >= 0)
          books[hover].mats.forEach(function (m) {
            if (m.emissive) m.emissive.setHex(0x000000);
          });
        hover = h;
        canvas.classList.toggle('hover', h >= 0 || pickDesk);
        if (h >= 0 && h !== focus)
          books[h].mats.forEach(function (m) {
            if (m.emissive) m.emissive.setHex(0x0f2a26);
          }); /* ほんのりミント */
      }
    }
    var tx = focus >= 0 && !tween ? parT.x : 0,
      ty = focus >= 0 && !tween ? parT.y : 0;
    if (Math.abs(tx - par.x) > 0.0002 || Math.abs(ty - par.y) > 0.0002) {
      par.x += (tx - par.x) * 0.12;
      par.y += (ty - par.y) * 0.12;
    }
    var moved = animateBooks(dt);
    /* 軽量化: カメラ・本・見た目のどれかが変わった時だけ描く(止まっている間は描かない) */
    var sig = [cur.x, cur.y, cur.z, cur.yaw, cur.pitch, cur.zoom, par.x, par.y, hover].join();
    if (moved || sig !== lastSig || world.needsRender) {
      lastSig = sig;
      world.needsRender = false;
      applyCamera();
      renderer.render(world.scene, camera);
      if (!firstDone) {
        firstDone = true;
        if (o.onFirstRender) o.onFirstRender();
      }
    }
  }
  var lastSig = '',
    firstDone = false;
  /* 画面サイズの変化: 本を見ていない時は、本棚が収まる立ち位置に合わせ直す */
  function resize() {
    var w = stage.clientWidth,
      h = stage.clientHeight;
    if (!w || !h) return;
    var pr = Math.min(window.devicePixelRatio || 1, 2);
    if (w * h * pr * pr > 2.6e6)
      pr = Math.max(1, Math.sqrt(2.6e6 / (w * h))); /* 軽量化: 最大2倍・約260万画素まで */
    renderer.setPixelRatio(pr);
    renderer.setSize(w, h, false);
    world.needsRender = true;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    stage.classList.toggle('wide', wideLayout());
    if (tween) return;
    if (focus >= 0) {
      var v = viewPose(focus);
      cur.x = v.x;
      cur.y = v.y;
      cur.z = v.z;
      cur.yaw = v.yaw;
      cur.pitch = v.pitch;
      return;
    }
    var hp = homePose();
    cur.x = hp.x;
    cur.y = hp.y;
    cur.z = hp.z;
    cur.yaw = 0;
    cur.pitch = 0;
  }
  function start() {
    if (window.ResizeObserver) new ResizeObserver(resize).observe(stage);
    window.addEventListener('resize', resize);
    resize();
    requestAnimationFrame(frame);
  }

  return {
    camera: camera,
    cur: cur,
    start: start,
    setFocus: setFocus,
    homePose: homePose,
    zoomBy: zoomBy,
    resetZoom: resetZoom,
    look: look,
    zoomLabel: zoomLabel,
    moving: function () {
      return !!tween;
    },
    focus: function () {
      return focus;
    },
  };
}

var api = { create: create };

export default api;
