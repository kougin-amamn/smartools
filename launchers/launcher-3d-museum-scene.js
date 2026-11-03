/* ミュージアムの展示室を組み立てる(壁・開口部と通路・ベンチ・額縁・照明器具・解説カード)。
   MuseumScene.create({THREE, core, M(=MuseumTextures), scene, 定数, 関数, roomWalls/roomSpots/badgesBySlug(本体と共有する一覧)}).buildRoom(def) */
(function (root) {
  'use strict';
  function create(o) {
    var BANNER = { w: 2.6, h: 5.0, bottom: 1.7 }; /* 入口のバナーの大きさ・下端の高さ */
    var THREE = o.THREE,
      core = o.core,
      M = o.M;
    var artTexture = M.artTexture,
      plaqueTexture = M.plaqueTexture,
      FLOOR_S = M.FLOOR_S,
      passFloorMat = M.passFloorMat,
      floorQuad = M.floorQuad,
      captionTexture = M.captionTexture,
      matte = M.matte,
      ceilMat = M.ceilMat,
      trimMat = M.trimMat,
      brassMat = M.brassMat,
      benchMat = M.benchMat,
      matMat = M.matMat,
      FRAMES = M.FRAMES,
      glowTex = M.glowTex,
      panelShadowMat = M.panelShadowMat,
      badgeTex = M.badgeTex,
      passSideA = M.passSideA,
      passSideB = M.passSideB,
      passEndMat = M.passEndMat,
      passCeilMat = M.passCeilMat,
      pickMat = M.pickMat,
      lampMat = M.lampMat,
      fixtureMat = M.fixtureMat,
      lampGlowMat = M.lampGlowMat,
      washMat = M.washMat,
      bevelGeo = M.bevelGeo,
      flushMerged = M.flushMerged;
    var ART = o.ART,
      OPEN = o.OPEN,
      EYE = o.EYE,
      HOME_Y = o.HOME_Y,
      STAND_GAP = o.STAND_GAP,
      FRAME_STYLE = o.FRAME_STYLE,
      MAX_SPOTS = o.MAX_SPOTS,
      TRACK = o.TRACK,
      HEAD_DROP = o.HEAD_DROP,
      HALL_MODE = o.HALL_MODE,
      HALL_ID = o.HALL_ID,
      LOW = o.LOW,
      isFav = o.isFav,
      isNewTool = o.isNewTool,
      nameOf = o.nameOf,
      pad2 = o.pad2,
      newSpot = o.newSpot,
      placeSpot = o.placeSpot,
      scene = o.scene,
      roomWalls = o.roomWalls,
      roomSpots = o.roomSpots,
      badgesBySlug = o.badgesBySlug;
    function buildRoom(def) {
      var t0 = performance.now();
      var dims = def.dims,
        W = dims.w,
        D = dims.d,
        H = dims.h;
      var group = new THREE.Group();
      group.visible = false;
      var mergeList = [];
      /* 静的な部品は mergeList に集め、最後に材質ごとに結合する */
      function box(sx, sy, sz, mat, x, y, z) {
        var m = new THREE.Mesh(bevelGeo(sx, sy, sz), mat);
        m.position.set(x, y, z);
        m.updateMatrixWorld(true);
        mergeList.push(m);
        return m;
      }
      var entries = def.entries;
      var items = core.layout(entries.length, dims, ART, def.counts);
      entries.forEach(function (e, i) {
        if (e.kind === 'door') {
          items[i].w = BANNER.w;
          items[i].h = BANNER.h;
          items[i].y = BANNER.bottom + BANNER.h / 2;
        }
      }); /* 展示室への入口は、壁に下げたバナー */
      var wallM = matte({ color: 0xffffff });
      roomWalls.push({ mat: wallM, accent: def.accent === undefined ? null : def.accent });

      function plane(w, h, mat, x, y, z, rx, ry) {
        var m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
        m.position.set(x, y, z);
        m.rotation.set(rx || 0, ry || 0, 0);
        group.add(m);
        return m;
      }
      group.add(floorQuad(-W / 2, -D / 2, W / 2, D / 2, 0));
      plane(W, D, ceilMat, 0, H, 0, Math.PI / 2, 0);
      /* 壁(ホワイトキューブ: 巾木や廻り縁のない単色の面)。開口部の所は壁を抜き、奥に短い通路(床・天井・側壁・突き当たりの壁)を付ける。
       通路の突き当たりは明るくして「先に展示室が続いている」ように見せる */
      /* 通路の床(壁の入れ物 wg の座標 a..b × 0..-P をワールド座標の4点へ)。明るさ: 入口1 → 奥0 */
      function passFloor(wg, a, b, P) {
        var cs = Math.cos(wg.rotation.y),
          sn = Math.sin(wg.rotation.y),
          ox = wg.position.x,
          oz = wg.position.z,
          S = FLOOR_S;
        var rows = [
            [0, 1],
            [-P * 0.18, 0.45],
            [-P * 0.45, 0.06],
            [-P, 0],
          ],
          pos = [],
          uv = [],
          col = [],
          idx = [],
          r;
        for (r = 0; r < rows.length; r++) {
          [a, b].forEach(function (lx) {
            var lz = rows[r][0],
              wx = ox + lx * cs + lz * sn,
              wz = oz - lx * sn + lz * cs,
              k = rows[r][1];
            pos.push(wx, 0.002, wz);
            uv.push(wx / S, -wz / S);
            col.push(k, k, k);
          });
        }
        for (r = 0; r < rows.length - 1; r++) {
          var q = r * 2;
          idx.push(q, q + 1, q + 2, q + 1, q + 3, q + 2);
        }
        var geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
        geo.setAttribute(
          'normal',
          new THREE.Float32BufferAttribute(
            [0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0],
            3
          )
        );
        geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
        geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
        geo.setIndex(idx);
        return new THREE.Mesh(geo, passFloorMat);
      }
      function buildWall(L, x, z, ry, holes) {
        var wg = new THREE.Group();
        wg.position.set(x, 0, z);
        wg.rotation.y = ry;
        group.add(wg);
        function pp(pw, ph, mat, px, py, pz, rx, rry) {
          if (pw <= 0.001 || ph <= 0.001) return;
          var m = new THREE.Mesh(new THREE.PlaneGeometry(pw, ph), mat);
          m.position.set(px, py, pz);
          m.rotation.set(rx || 0, rry || 0, 0);
          wg.add(m);
        }
        holes.sort(function (a, b) {
          return a.x - b.x;
        });
        var c = -L / 2;
        holes.forEach(function (hl) {
          var a = hl.x - OPEN.w / 2,
            b = hl.x + OPEN.w / 2,
            P = OPEN.depth,
            h = OPEN.h,
            w = OPEN.w;
          pp(a - c, H, wallM, (c + a) / 2, H / 2, 0); /* 開口部の左の壁 */
          pp(w, H - h, wallM, hl.x, h + (H - h) / 2, 0); /* 開口部の上の壁 */
          /* 通路の床: 部屋と同じ板張り(ワールド座標で割り付け)。奥へ行くほど頂点の色で暗くして黒へ沈める */
          group.add(passFloor(wg, a, b, P));
          /* 通路の天井・側壁・突き当たり(黒) */
          pp(w, P, passCeilMat, hl.x, h, -P / 2, Math.PI / 2, 0);
          pp(P, h, passSideA, hl.x - w / 2, h / 2, -P / 2, 0, Math.PI / 2); /* 左の側壁(奥ほど暗い) */
          pp(P, h, passSideB, hl.x + w / 2, h / 2, -P / 2, 0, -Math.PI / 2); /* 右の側壁 */
          pp(w, h, passEndMat, hl.x, h / 2, -P, 0, 0); /* 突き当たり(闇の中で見えない) */
          c = b;
        });
        pp(L / 2 - c, H, wallM, (c + L / 2) / 2, H / 2, 0);
      }
      var holes = { left: [], back: [], right: [], front: [] };
      if (HALL_MODE && def.id !== HALL_ID) holes.front.push({ x: 0 }); /* ホールへ戻る開口部 */
      buildWall(W, 0, -D / 2, 0, holes.back);
      buildWall(W, 0, D / 2, Math.PI, holes.front);
      buildWall(D, -W / 2, 0, Math.PI / 2, holes.left);
      buildWall(D, W / 2, 0, -Math.PI / 2, holes.right);
      /* 天井のダクトレール(壁から TRACK 内側を一周) */
      box(W - 2 * TRACK + 0.06, 0.06, 0.07, fixtureMat, 0, H - 0.04, -D / 2 + TRACK);
      box(W - 2 * TRACK + 0.06, 0.06, 0.07, fixtureMat, 0, H - 0.04, D / 2 - TRACK);
      box(0.07, 0.06, D - 2 * TRACK, fixtureMat, -W / 2 + TRACK, H - 0.04, 0);
      box(0.07, 0.06, D - 2 * TRACK, fixtureMat, W / 2 - TRACK, H - 0.04, 0);

      /* ベンチ: 木の枠に革張りの座面。座面の高さは人の膝くらい(この部屋の縮尺で約1.1)。脚は木、足元に真鍮の細い貫 */
      var bz =
        -D *
        0.25; /* 入口から見渡した時に画面の下で切れない位置。奥行きの小さい部屋には置かない(手前で大きく見えて邪魔になるため) */
      (D >= 14 ? [-W * 0.21, W * 0.21] : []).forEach(function (bx) {
        box(3.4, 0.16, 1.05, trimMat, bx, 0.88, bz); /* 座枠 */
        box(3.28, 0.2, 0.95, benchMat, bx, 1.06, bz); /* 座面 */
        [
          [-1.55, -0.42],
          [1.55, -0.42],
          [-1.55, 0.42],
          [1.55, 0.42],
        ].forEach(function (o) {
          box(0.14, 0.8, 0.14, trimMat, bx + o[0], 0.4, bz + o[1]);
        });
        box(3.0, 0.05, 0.05, brassMat, bx, 0.22, bz - 0.42);
        box(3.0, 0.05, 0.05, brassMat, bx, 0.22, bz + 0.42);
      });

      /* 額縁の1段: 外寸 ow×oh・枠の幅 bar・奥行き dp の4本の枠(中央は抜ける)。zc は奥行きの中心 */
      function addFrame(g, ow, oh, bar, dp, zc, matH, matV) {
        function bx(sx, sy, x, y, m) {
          var b = new THREE.Mesh(bevelGeo(sx, sy, dp), m);
          b.position.set(x, y, zc);
          g.add(b);
          mergeList.push(b);
        }
        bx(ow, bar, 0, (oh - bar) / 2, matH);
        bx(ow, bar, 0, -(oh - bar) / 2, matH);
        bx(bar, oh - bar * 2, -(ow - bar) / 2, 0, matV);
        bx(bar, oh - bar * 2, (ow - bar) / 2, 0, matV);
      }

      /* 案内プレートを入口の右横・目の高さに付ける(g は入口と同じ位置・向き、原点は入口の中心) */
      function plaque(g, kicker, name, sub) {
        var m = new THREE.Mesh(
          new THREE.PlaneGeometry(1.5, 0.94),
          new THREE.MeshBasicMaterial({ map: plaqueTexture(kicker, name, sub) })
        );
        m.position.set(OPEN.w / 2 + 0.45 + 0.75, EYE - 0.2 - OPEN.h / 2, 0.03);
        g.add(m);
        var sh = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 1.3), panelShadowMat);
        sh.position.set(m.position.x, m.position.y - 0.05, 0.006);
        g.add(sh);
      }

      /* 作品 */
      var arts = [],
        artMeshes = [],
        spots = [];
      items.forEach(function (it, i) {
        var e = entries[i];
        var isTool = e.kind === 'tool';
        var fav = isTool && isFav(e.tool);
        var g = new THREE.Group();
        g.position.set(it.x + it.nx * 0.01, it.y, it.z + it.nz * 0.01);
        g.rotation.y = it.ry;
        /* fg: 結合用の部品(額縁・照明器具)を置く、g と同じ位置・向きの入れ物。シーンには追加しない */
        var fg = new THREE.Group();
        fg.position.set(g.position.x, g.position.y, g.position.z);
        fg.rotation.y = it.ry;
        var wash = new THREE.Mesh(new THREE.PlaneGeometry(it.w + 4, it.h + 4.5), washMat);
        wash.position.set(0, 0.4, 0.003);
        g.add(wash);
        /* 光の輪: 通常は消えていて、ホバー・選択で点く。「よく使う」作品は常に暖色で少し灯る */
        var base = fav ? 0.38 : 0;
        var haloMat = new THREE.MeshBasicMaterial({
          map: glowTex,
          color: fav ? 0xffd9a0 : 0x5cc4b6,
          transparent: true,
          opacity: base,
          depthWrite: false,
        });
        var halo = new THREE.Mesh(new THREE.PlaneGeometry(it.w + 2.6, it.h + 2.6), haloMat);
        halo.position.set(0, 0, 0.004);
        g.add(halo);
        /* 額縁: ウォールナットの太い外枠 → 黒檀色の溝 → 象牙色の細い内縁。中央の台紙(リネン色)と絵は枠より奥まって見える */
        if (isTool) {
          /* 額縁: 細身のつや消しの黒(幅0.09)。中は白い台紙で、作品の周りに余白を大きく取る */
          var fs = FRAMES[FRAME_STYLE];
          addFrame(fg, it.w + fs.out, it.h + fs.out, fs.bar, fs.dp, fs.dp / 2, fs.mat, fs.mat);
          var back = new THREE.Mesh(new THREE.PlaneGeometry(it.w + fs.in, it.h + fs.in), matMat);
          back.position.z = fs.back;
          g.add(back);
        }
        var art = new THREE.Mesh(
          new THREE.PlaneGeometry(it.w, it.h),
          new THREE.MeshBasicMaterial({
            map: isTool ? artTexture(e.tool) : M.bannerTexture(e),
            transparent: isTool,
          })
        );
        art.position.z = isTool ? FRAMES[FRAME_STYLE].art : 0.08;
        if (!isTool) {
          /* バナーを下げる真鍮の棒と、壁に落ちる薄い影 */
          var rod = new THREE.Mesh(bevelGeo(it.w + 0.36, 0.07, 0.07), brassMat);
          rod.position.set(0, it.h / 2 + 0.04, 0.09);
          g.add(rod);
          var sh = new THREE.Mesh(new THREE.PlaneGeometry(it.w + 0.7, it.h + 0.6), panelShadowMat);
          sh.position.set(0.06, -0.1, 0.01);
          g.add(sh);
        }
        art.userData.index = i;
        g.add(art);
        if (isTool) {
          /* 円筒形のスポットライト: 天井のレールから短い吊り棒で下がり、作品の方へ傾けて向ける。先端の発光面が見える */
          var hp = { x: it.x + it.nx * TRACK, z: it.z + it.nz * TRACK },
            dy = H - HEAD_DROP - (it.y - 0.15),
            dh = TRACK - 0.1;
          var hg = new THREE.Group();
          hg.position.set(hp.x, H - HEAD_DROP, hp.z);
          hg.rotation.y = it.ry;
          group.add(hg);
          var stem = new THREE.Mesh(
            new THREE.CylinderGeometry(0.025, 0.025, HEAD_DROP - 0.1, 8, 1, false),
            fixtureMat
          );
          stem.position.y = (HEAD_DROP - 0.1) / 2 + 0.05;
          hg.add(stem);
          var tilt = new THREE.Group();
          tilt.rotation.x = Math.atan2(dh, dy);
          hg.add(tilt);
          var body = new THREE.Mesh(
            new THREE.CylinderGeometry(0.13, 0.13, 0.52, LOW ? 12 : 24, 1, false),
            fixtureMat
          );
          tilt.add(body);
          var lens = new THREE.Mesh(
            new THREE.CylinderGeometry(0.1, 0.1, 0.02, LOW ? 12 : 24, 1, false),
            lampMat
          );
          lens.position.y = -0.265;
          tilt.add(lens);
          var lg = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.9), lampGlowMat);
          lg.position.y = -0.3;
          lg.rotation.x = -Math.PI / 2;
          tilt.add(lg);
        }
        fg.updateMatrixWorld(true);
        /* 作品を照らすスポット(影なし)。通常画質は作品ごとに1灯、軽量は共通の3灯を後から付け替える */
        if (!LOW && isTool && i < MAX_SPOTS) {
          var sp = newSpot();
          placeSpot(sp, it, H);
          group.add(sp);
          group.add(sp.target);
          spots.push(sp);
          roomSpots.push(sp);
        }
        /* 解説カード: 実物の美術館のように、額縁の右横・目の高さに貼る */
        if (isTool) {
          var plate = new THREE.Mesh(
            new THREE.PlaneGeometry(1.2, 0.75),
            new THREE.MeshBasicMaterial({
              map: captionTexture('No.' + pad2(i + 1), nameOf(e.tool), e.tool.desc || ''),
            })
          );
          plate.position.set((it.w + FRAMES[FRAME_STYLE].out) / 2 + 0.35 + 0.6, EYE - 0.2 - it.y, 0.03);
          g.add(plate);
        }
        /* 新着バッジ(見るまで付いている) */
        var badge = null;
        if (isTool && isNewTool(e.tool)) {
          badge = new THREE.Mesh(
            new THREE.PlaneGeometry(0.62, 0.31),
            new THREE.MeshBasicMaterial({ map: badgeTex, transparent: true })
          );
          badge.position.set(it.w / 2 + 0.36, it.h / 2 + 0.4, 0.3);
          g.add(badge);
          (badgesBySlug[e.tool.slug] = badgesBySlug[e.tool.slug] || []).push(badge);
        }
        group.add(g);
        arts.push({ halo: haloMat, base: base, badge: badge });
        artMeshes.push(art);
      });

      /* 出口: 手前の壁の中央にホールへ戻る開口部(タップで歩いて出る) */
      var exitMesh = null;
      if (HALL_MODE && def.id !== HALL_ID) {
        var fx = new THREE.Group();
        fx.position.set(0, OPEN.h / 2, D / 2);
        fx.rotation.y = Math.PI;
        group.add(fx);
        plaque(fx, '出口', 'エントランスホール', 'ホールへ戻る →');
        exitMesh = new THREE.Mesh(new THREE.PlaneGeometry(OPEN.w, OPEN.h), pickMat);
        exitMesh.position.set(0, OPEN.h / 2, D / 2 - 0.02);
        exitMesh.rotation.y = Math.PI;
        exitMesh.userData.exit = true;
        group.add(exitMesh);
      }
      var stat = flushMerged(group, mergeList);
      scene.add(group);
      var R = {
        id: def.id,
        def: def,
        group: group,
        items: items,
        entries: entries,
        arts: arts,
        artMeshes: artMeshes,
        exit: exitMesh,
        spots: spots,
        dims: dims,
        home: { x: 0, y: HOME_Y, z: D / 2 - STAND_GAP, pitch: 0.02 },
        sig: def.sig,
      }; /* 立ち位置: 引きで、天井のスポットライトまで見える */
      log(
        '展示室「' +
          (def.title || '展示室') +
          '」を組み立てました(' +
          entries.length +
          '点 / 結合 ' +
          stat.parts +
          '個→' +
          stat.meshes +
          'メッシュ / ' +
          Math.round(performance.now() - t0) +
          'ms)'
      );
      return R;
    }

    return { buildRoom: buildRoom };
  }
  root.MuseumScene = { create: create };
})(this);
