/* 本棚ランチャーの3Dの組み立て(書斎・本棚・本・照明・昼夜)。画面の形が大きく変わったら relayout(aspect) で組み直す。
   BookshelfScene.create({THREE, core, T, groups, aspect, iconOf, nameOf}) */
(function (root) {
  'use strict';
  function create(o) {
    var THREE = o.THREE,
      core = o.core,
      T = o.T,
      groups = o.groups,
      CS = core.CASE;
    var scene = new THREE.Scene();
    var api = { needsRender: true }; /* needsRender: 次の描画が必要(見た目が変わった時に立てる) */

    /* 材質 */
    /* 貼る場所ごとの見本(launcher-3d-bookshelf-textures.json の assign)から絵を描く。見本の「大きさ」でくり返し、「ツヤ」「凹凸」で材質を決める */
    var D = {
      case: T.slot('case'),
      floor: T.slot('floor'),
      wall: T.slot('wall'),
      curtain: T.slot('curtain'),
      brass: T.slot('brass'),
      glass: T.slot('glass'),
      rug: T.slot('rug'),
    };
    function repeatTex(d, size, linear) {
      var t = T.tex(T.paint(d, size), true, linear);
      var k = 1 / T.val(d, 'scale');
      t.repeat.set(k, k);
      return t;
    }
    var woodCv = T.paint(D.case, 1024),
      woodTex = T.tex(woodCv, true),
      woodBump = T.tex(woodCv, true, true);
    woodTex.repeat.set(1 / T.val(D.case, 'scale'), 1 / T.val(D.case, 'scale'));
    woodBump.repeat.set(woodTex.repeat.x, woodTex.repeat.y);
    var caseMat = new THREE.MeshPhongMaterial({
      color: 0xffffff,
      map: woodTex,
      bumpMap: woodBump,
      bumpScale: T.bumpScale(D.case),
      vertexColors: true,
      specular: 0x1a120c,
      shininess: T.shininess(D.case),
    });
    var clothBumpTex = T.clothBump();
    var floorCv = T.paint(D.floor, 1024),
      floorTex = T.tex(floorCv, true),
      floorBump = T.tex(floorCv, true, true);
    var floorMat = new THREE.MeshPhongMaterial({
      color: 0xffffff,
      map: floorTex,
      bumpMap: floorBump,
      bumpScale: T.bumpScale(D.floor),
      specular: 0x3a2a1c,
      shininess: T.shininess(D.floor),
    });
    var wallCv = T.paint(D.wall, 512),
      wallTex = T.tex(wallCv, true),
      wallBump = T.tex(wallCv, true, true);
    var wallMat = new THREE.MeshPhongMaterial({
      color: 0xffffff,
      map: wallTex,
      bumpMap: wallBump,
      bumpScale: T.bumpScale(D.wall),
      specular: 0x111111,
      shininess: T.shininess(D.wall),
    });
    var ceilMat = new THREE.MeshPhongMaterial({
      color: T.linHex(0xf6f3ee),
      specular: 0x000000,
      shininess: 2,
    });
    var trimMat = new THREE.MeshPhongMaterial({
      color: 0xffffff,
      vertexColors: true,
      specular: 0x333333,
      shininess: 30,
    });
    var curtainMat = new THREE.MeshPhongMaterial({
      color: 0xffffff,
      map: repeatTex(D.curtain, 512),
      vertexColors: true,
      bumpMap: clothBumpTex,
      bumpScale: T.bumpScale(D.curtain) * 0.4,
      specular: 0x111111,
      shininess: T.shininess(D.curtain),
    });
    var chairMat = new THREE.MeshPhongMaterial({
      color: T.linHex(0x3f5a4a),
      vertexColors: true,
      bumpMap: clothBumpTex,
      bumpScale: 0.003,
      specular: 0x111111,
      shininess: 8,
    });
    var glassMat = new THREE.MeshBasicMaterial({ color: 0xdfeaf4 }); /* 窓の外の明るさ(テーマで色を変える) */
    var glassOverMat = new THREE.MeshBasicMaterial({
      map: T.tex(T.paint(D.glass, 512)),
      transparent: true,
      depthWrite: false,
    }); /* ガラスの映り込み・くもり */
    var rugMat = new THREE.MeshPhongMaterial({
      map: T.tex(T.paint(D.rug, 1024)),
      bumpMap: clothBumpTex,
      bumpScale: T.bumpScale(D.rug) * 0.6,
      specular: 0x000000,
      shininess: T.shininess(D.rug),
    });
    var potMat = new THREE.MeshPhongMaterial({
      color: T.linHex(0xb06a48),
      specular: 0x221111,
      shininess: 10,
    });
    var leafMat = new THREE.MeshPhongMaterial({
      color: T.linHex(0x3f6b3a),
      specular: 0x112211,
      shininess: 12,
      flatShading: true,
    });
    var woodMatPlain = new THREE.MeshPhongMaterial({
      color: 0xffffff,
      map: woodTex,
      specular: 0x2a1a10,
      shininess: 30,
    });
    var shadeMat = new THREE.MeshPhongMaterial({
      color: T.linHex(0xf0e6d2),
      emissive: 0x000000,
      side: THREE.DoubleSide,
      specular: 0x000000,
      shininess: 2,
    });
    var pendMat = new THREE.MeshPhongMaterial({
      color: T.linHex(0x2f3a34),
      side: THREE.DoubleSide,
      specular: 0x555555,
      shininess: 40,
    });
    var cordMat = new THREE.MeshBasicMaterial({ color: 0x222222 });
    var bulbMat = new THREE.MeshBasicMaterial({ color: 0x5a554c });
    var pickMat = new THREE.MeshBasicMaterial({ visible: false });
    var extraPicks = [];
    var pendOn = null; /* 天井の照明。null の間はテーマに合わせる(夜は点ける) */
    var bankMat = new THREE.MeshPhongMaterial({
      color: T.linHex(0x2a3a35),
      emissive: 0x000000,
      specular: 0x667770,
      shininess: 50,
      side: THREE.DoubleSide,
    }); /* アームライトのかさ(深い緑の金属) */
    var lampBodyMat = new THREE.MeshPhongMaterial({
      color: T.linHex(0x2a3a35),
      specular: 0x667770,
      shininess: 50,
    });
    var lampBulbMat = new THREE.MeshBasicMaterial({
      color: 0x5a554c,
    }); /* アームライトの電球(ペンダントとは別に点ける) */
    var floorBulbMat = new THREE.MeshBasicMaterial({ color: 0x5a554c }); /* フロアランプの電球 */
    var floorOn = null; /* フロアランプ。null の間はテーマに合わせる(夜は点ける) */
    var deskOn = null; /* アームライト。null の間はテーマに合わせる(夜は点ける) */
    var sofaCv = T.paint({ kind: 'cloth', color: '#5b6f5f', contrast: 0.3, grain: 0.9, seed: 37 }, 256),
      sofaTex = T.tex(sofaCv, true);
    sofaTex.repeat.set(10, 10); /* 織り目は細かく */
    var sofaMat = new THREE.MeshPhongMaterial({
      color: 0xffffff,
      map: sofaTex,
      bumpMap: clothBumpTex,
      bumpScale: 0.004,
      specular: 0x0a0a0a,
      shininess: 6,
    }); /* 織りの布 */
    var sofaMat2 = new THREE.MeshPhongMaterial({
      color: T.linHex(0xf2f2f2),
      map: sofaTex,
      bumpMap: clothBumpTex,
      bumpScale: 0.004,
      specular: 0x0a0a0a,
      shininess: 6,
    }); /* クッションは少し明るく */
    /* 角を丸めた箱(角の丸み r)。形を少し小さく描いて押し出し、面取り(ベベル)で丸める */
    var rbCache = {};
    function rbShared(gm) {
      for (var k in rbCache) if (rbCache[k] === gm) return true;
      return false;
    }
    function roundedBox(w, h, d, r) {
      var key = [w, h, d, r].join(),
        g0 = rbCache[key];
      if (g0) return g0;
      var a = w / 2 - r,
        b = h / 2 - r,
        rc = Math.min(a, b) * 0.5,
        sh = new THREE.Shape(),
        n = 4,
        i,
        t;
      function arc(cx, cy, a0) {
        for (i = 0; i <= n; i++) {
          t = a0 + ((i / n) * Math.PI) / 2;
          var px = cx + Math.cos(t) * rc,
            py = cy + Math.sin(t) * rc;
          if (i === 0 && a0 === 0) sh.moveTo(px, py);
          else sh.lineTo(px, py);
        }
      }
      arc(a - rc, b - rc, 0);
      arc(-a + rc, b - rc, Math.PI / 2);
      arc(-a + rc, -b + rc, Math.PI);
      arc(a - rc, -b + rc, Math.PI * 1.5);
      sh.closePath();
      g0 = new THREE.ExtrudeGeometry(sh, {
        depth: Math.max(0.001, d - 2 * r),
        bevelEnabled: true,
        bevelThickness: r,
        bevelSize: r,
        bevelSegments: 4,
        curveSegments: 4,
      });
      g0.translate(0, 0, -(d - 2 * r) / 2);
      rbCache[key] = g0;
      return g0;
    }
    var shadowMat = new THREE.MeshBasicMaterial({
      map: T.shelfShadow(),
      transparent: true,
      depthWrite: false,
    });
    var pageMat = new THREE.MeshPhongMaterial({
      color: T.linHex(0xece2c8),
      specular: 0x000000,
      shininess: 4,
    });
    var brassTex = repeatTex(D.brass, 512);
    var brassMat = new THREE.MeshPhongMaterial({
      color: 0xffffff,
      map: brassTex,
      specular: 0xf0dca0,
      shininess: T.shininess(D.brass),
    });
    var brassMatV = new THREE.MeshPhongMaterial({
      color: 0xffffff,
      map: brassTex,
      vertexColors: true,
      specular: 0xc8b080,
      shininess: T.shininess(D.brass) * 0.85,
    });

    /* 頂点配列(core.boxArrays の結果)をまとめて1つのメッシュにする */
    function arrays() {
      return { position: [], normal: [], uv: [], color: [] };
    }
    function merge(into, a) {
      ['position', 'normal', 'uv', 'color'].forEach(function (k) {
        Array.prototype.push.apply(into[k], a[k]);
      });
    }
    function meshOf(a, mat) {
      var geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(a.position, 3));
      geo.setAttribute('normal', new THREE.Float32BufferAttribute(a.normal, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(a.uv, 2));
      geo.setAttribute('color', new THREE.Float32BufferAttribute(a.color, 3));
      return new THREE.Mesh(geo, mat);
    }

    /* ツールの本(1冊ずつ動かせるよう別のメッシュ。作るのは1回だけ) */
    var bookGeo = new THREE.BoxGeometry(core.TOOL.w, core.TOOL.h, core.TOOL.d);
    var booksGroup = new THREE.Group();
    scene.add(booksGroup);
    var books = [],
      iconStat = { ok: 0, ng: 0, pend: 0 };
    function iconDone() {
      if (--iconStat.pend === 0)
        log('アイコン画像の読み込みが終わりました(使用 ' + iconStat.ok + ' / 使えず ' + iconStat.ng + ')');
    }
    groups.forEach(function (grp, gi) {
      grp.tools.forEach(function (t, ti) {
        /* 本の色はジャンルごと(マスはジャンルで区切らないので、色でジャンルが分かるようにする) */
        var cat = grp.cats ? grp.cats[ti] : grp.cat,
          color = T.CAT_HEX[(grp.colors ? grp.colors[ti] : gi) % T.CAT_HEX.length],
          art = T.bookArt(t, color, cat);
        /* 軽量化: 本の材質は凹凸なし。表紙の面は、引き出すまで布の色だけ(絵は coverOf で後から貼る) */
        var cloth = new THREE.MeshPhongMaterial({
          color: T.linHex(color),
          specular: 0x080604,
          shininess: 10,
          emissive: 0x000000,
        });
        var mats = [
          cloth,
          cloth,
          pageMat,
          pageMat,
          new THREE.MeshPhongMaterial({
            map: art.spine,
            specular: 0x0c0a08,
            shininess: 12,
            emissive: 0x000000,
          }),
          pageMat,
        ];
        var m = new THREE.Mesh(bookGeo, mats);
        booksGroup.add(m);
        books.push({
          mesh: m,
          tool: t,
          secIndex: gi,
          order: ti,
          cat: cat,
          base: { x: 0, y: 0, z: 0 },
          k: 0,
          mats: mats,
          sec: null,
          art: art,
        });
        /* アイコン画像が読めたら背表紙と表紙を描き直す */
        iconStat.pend++;
        var img = new Image();
        img.onload = function () {
          try {
            art.redraw(img);
            iconStat.ok++;
            api.needsRender = true;
          } catch (e) {
            log.warn('アイコン画像を本に描けませんでした(「' + o.nameOf(t) + '」)', e);
            iconStat.ng++;
          }
          iconDone();
        };
        img.onerror = function () {
          iconStat.ng++;
          iconDone();
        };
        img.src = o.iconOf(t);
      });
    });
    /* 巡回順: 区画の順(上の段から) → 段の中は左から */
    books.forEach(function (r, i) {
      r.mesh.userData.index = i;
    });
    var bookMeshes = books.map(function (r) {
      return r.mesh;
    });
    /* よく使うツール(o.favorites = ツールの配列)。机の上に置く本 */
    var deskBooks = [],
      favorites = (o.favorites || []).slice(0, 3);
    function favRecs() {
      return favorites
        .map(function (t) {
          for (var i = 0; i < books.length; i++) if (books[i].tool === t) return books[i];
          return null;
        })
        .filter(Boolean);
    }

    /* 部屋と本棚(画面の形で幅が変わるので、組み直せるよう1つのグループにまとめる) */
    var layout = null,
      plan = null,
      layoutAspect = 0,
      lights = {},
      nEnds = 0;
    var maxTools = Math.max.apply(
      null,
      groups.map(function (g) {
        return g.tools.length;
      })
    );
    function plane(parent, w, h, mat, x, y, z, rx, ry) {
      var m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
      m.position.set(x, y, z);
      m.rotation.set(rx || 0, ry || 0, 0);
      parent.add(m);
      return m;
    }

    function buildCase(g) {
      var f = plan.frame,
        wb = [],
        ao = [],
        ends = arrays(),
        W = plan.caseW;
      for (var ci = 0; ci < plan.cases; ci++) {
        /* 本棚(4段・真ん中に仕切り)。8カテゴリを超える時は右に並べる */
        var cx = (ci + 0.5) * plan.caseUnitW - W / 2,
          cu = plan.caseUnitW;
        wb = wb.concat(core.caseBoxes(cx, [1, 1, 1], { w: cu }));
        wb.push({
          x: cx,
          y: CS.h / 2,
          z: -CS.d / 2,
          sx: CS.side,
          sy: CS.h - 0.04,
          sz: CS.d - 0.02,
          color: [1, 1, 1],
        }); /* 真ん中の仕切り */
        core.SHELF_Y.forEach(function (y, si) {
          /* 棚板の下の影 */
          var top = si + 1 < core.SHELF_Y.length ? core.SHELF_Y[si + 1] - CS.board : CS.h - 0.04;
          ao.push({
            x: cx,
            y: top - 0.075,
            z: -0.005,
            sx: cu - 2 * CS.side,
            sy: 0.15,
            sz: 0.001,
            uv: 'spine',
            color: [1, 1, 1],
          });
        });
      }
      var woodA = arrays(),
        aoA = arrays();
      merge(woodA, core.boxArrays(wb, f));
      merge(aoA, core.boxArrays(ao, f));
      /* 本を区画の段に並べる(ブックエンドも) */
      nEnds = 0;
      groups.forEach(function (grp, gi) {
        var sec = plan.sections[gi],
          sy = core.SHELF_Y[sec.shelf],
          sb = core.shelfBooks(grp.tools.length, sec.x0);
        if (sb.end) {
          nEnds++;
          merge(
            ends,
            core.boxArrays(
              [
                { x: sb.end.x, y: sy + 0.11, z: -0.15, sx: 0.006, sy: 0.22, sz: 0.14, color: [1, 1, 1] },
                {
                  x: sb.end.x + 0.05,
                  y: sy + 0.003,
                  z: -0.15,
                  sx: 0.1,
                  sy: 0.006,
                  sz: 0.14,
                  color: [1, 1, 1],
                },
              ],
              f
            )
          );
        }
        books.forEach(function (r) {
          if (r.secIndex !== gi) return;
          var b = sb.books[r.order];
          r.sec = { x: f.x, z: f.z, ry: f.ry, n: f.n };
          r.base = { x: b.x, y: sy + core.TOOL.h / 2, z: -core.TOOL.d / 2 - 0.008 };
          r.k = -1; /* 次の描画で位置を置き直す */
        });
      });
      booksGroup.position.set(f.x, 0, f.z);
      booksGroup.rotation.y = f.ry;
      g.add(meshOf(woodA, caseMat));
      g.add(meshOf(aoA, shadowMat));
      g.add(meshOf(ends, brassMatV));
    }

    /* 絵(額縁つき)。抽象画を Canvas で描く(3種類) */
    var artMats = [];
    function artTexture(k) {
      var c = document.createElement('canvas');
      c.width = 512;
      c.height = 512;
      var x = c.getContext('2d');
      var pal = [
        ['#e9e1d0', '#c8643c', '#2f4a5a', '#d9a441', '#7a8c6e'],
        ['#f1ece2', '#3d5a73', '#b9895a', '#e2c79a', '#2e2e33'],
        ['#ece6da', '#6e8a74', '#c9b48f', '#a64b3c', '#2f3a52'],
      ][k % 3];
      x.fillStyle = pal[0];
      x.fillRect(0, 0, 512, 512);
      if (k % 3 === 0) {
        x.fillStyle = pal[1];
        x.beginPath();
        x.arc(190, 230, 120, 0, Math.PI * 2);
        x.fill();
        x.fillStyle = pal[2];
        x.fillRect(250, 90, 170, 300);
        x.fillStyle = pal[3];
        x.fillRect(80, 380, 360, 40);
      } else if (k % 3 === 1) {
        x.fillStyle = pal[1];
        x.fillRect(60, 60, 180, 390);
        x.fillStyle = pal[2];
        x.beginPath();
        x.arc(350, 170, 90, 0, Math.PI * 2);
        x.fill();
        x.fillStyle = pal[4];
        x.fillRect(280, 300, 150, 150);
      } else {
        for (var i = 3; i >= 0; i--) {
          x.fillStyle = pal[1 + i];
          x.beginPath();
          x.moveTo(0, 512 - i * 90);
          x.bezierCurveTo(160, 400 - i * 100, 340, 470 - i * 110, 512, 380 - i * 95);
          x.lineTo(512, 512);
          x.lineTo(0, 512);
          x.closePath();
          x.fill();
        }
        x.fillStyle = pal[4];
        x.beginPath();
        x.arc(380, 120, 46, 0, Math.PI * 2);
        x.fill();
      }
      return T.tex(c);
    }
    var frameMat = new THREE.MeshPhongMaterial({
      color: T.linHex(0x2a2522),
      specular: 0x222222,
      shininess: 30,
    });
    var curRoom = null;
    function picture(nm, u, y, w, h, k) {
      if (!artMats[k % 3])
        artMats[k % 3] = new THREE.MeshPhongMaterial({
          map: artTexture(k),
          specular: 0x111111,
          shininess: 6,
        });
      var w0 = plan.wallOf(nm),
        f = { x: w0.c.x, z: w0.c.z, ry: w0.ry },
        b = 0.035,
        fb = [];
      fb.push(
        { x: u, y: y + h / 2 + b / 2, z: 0.02, sx: w + 2 * b, sy: b, sz: 0.04, color: [1, 1, 1] },
        { x: u, y: y - h / 2 - b / 2, z: 0.02, sx: w + 2 * b, sy: b, sz: 0.04, color: [1, 1, 1] }
      );
      fb.push(
        { x: u - w / 2 - b / 2, y: y, z: 0.02, sx: b, sy: h, sz: 0.04, color: [1, 1, 1] },
        { x: u + w / 2 + b / 2, y: y, z: 0.02, sx: b, sy: h, sz: 0.04, color: [1, 1, 1] }
      );
      curRoom.add(meshOf(core.boxArrays(fb, f), frameMat));
      var m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), artMats[k % 3]);
      m.position.set(w0.c.x + w0.t.x * u + w0.n.x * 0.015, y, w0.c.z + w0.t.z * u + w0.n.z * 0.015);
      m.rotation.y = w0.ry;
      curRoom.add(m);
    }
    function buildRoom(g) {
      curRoom = g;
      var HX = plan.hx,
        HZ = plan.hz,
        RH = plan.h,
        houseA = arrays(),
        fabricA = arrays(),
        fabricB = arrays(),
        woodA = arrays();
      var fs = 1 / T.val(D.floor, 'scale');
      floorTex.repeat.set(HX * 2 * fs, HZ * 2 * fs);
      floorBump.repeat.set(HX * 2 * fs, HZ * 2 * fs);
      plane(g, HX * 2, HZ * 2, floorMat, 0, 0, 0, -Math.PI / 2, 0);
      plane(g, HX * 2, HZ * 2, ceilMat, 0, RH, 0, Math.PI / 2, 0);
      var ws = T.val(D.wall, 'scale');
      wallTex.repeat.set((HZ * 2) / ws, RH / ws);
      wallBump.repeat.set((HZ * 2) / ws, RH / ws);
      var TRIM = [0.96, 0.95, 0.92].map(T.lin),
        DOOR = [0.62, 0.62, 0.62],
        BRASS = [0.72, 0.56, 0.3].map(T.lin);
      ['back', 'right', 'left', 'front'].forEach(function (nm) {
        var w = plan.wallOf(nm),
          f = { x: w.c.x, z: w.c.z, ry: w.ry };
        plane(g, w.len, RH, wallMat, w.c.x, RH / 2, w.c.z, 0, w.ry);
        merge(
          houseA,
          core.boxArrays(
            [
              { x: 0, y: 0.05, z: 0.008, sx: w.len, sy: 0.1, sz: 0.016, color: TRIM } /* 幅木 */,
              { x: 0, y: RH - 0.04, z: 0.02, sx: w.len, sy: 0.08, sz: 0.04, color: TRIM } /* 回り縁 */,
            ],
            f
          )
        );
      });
      /* 壁ごとの家具・建具(書斎のよくある配置: 奥=本棚、右=窓と机、左=ドアと飾り棚と絵、手前=ソファと絵)
         壁の座標: x=壁に沿った位置(壁の t の向き)、z=壁から部屋側への距離。wf(名前) でその壁の座標系 */
      function wf(nm) {
        var w = plan.wallOf(nm);
        return { x: w.c.x, z: w.c.z, ry: w.ry, w: w };
      }
      function onWall(nm, u, y, dz, mesh) {
        var w = plan.wallOf(nm);
        mesh.position.set(w.c.x + w.t.x * u + w.n.x * dz, y, w.c.z + w.t.z * u + w.n.z * dz);
        mesh.rotation.y = w.ry;
        g.add(mesh);
        return mesh;
      }
      function add(m, x, y, z) {
        m.position.set(x, y, z);
        g.add(m);
        return m;
      }
      var WOODK = [0.85, 0.85, 0.85],
        LEG = [0.7, 0.7, 0.7];

      /* 右の壁: 腰窓(窓台は床から0.9m)・カーテン(窓枠の外側に寄せ、丈は窓台のすぐ下まで)・机と椅子 */
      var RW = wf('right'),
        WU = -0.25,
        WW = 1.2,
        WH = 1.1,
        WY = 0.9 + WH / 2,
        bx = [];
      bx.push({
        x: WU,
        y: WY + WH / 2 + 0.04,
        z: 0.04,
        sx: WW + 0.16,
        sy: 0.08,
        sz: 0.08,
        color: TRIM,
      }); /* 上枠 */
      bx.push({
        x: WU,
        y: WY - WH / 2 - 0.03,
        z: 0.06,
        sx: WW + 0.2,
        sy: 0.05,
        sz: 0.12,
        color: TRIM,
      }); /* 窓台 */
      [-1, 1].forEach(function (sd) {
        bx.push({
          x: WU + sd * (WW / 2 + 0.04),
          y: WY,
          z: 0.04,
          sx: 0.08,
          sy: WH + 0.16,
          sz: 0.08,
          color: TRIM,
        });
      });
      bx.push(
        { x: WU, y: WY, z: 0.03, sx: 0.04, sy: WH, sz: 0.04, color: TRIM },
        { x: WU, y: WY + 0.15, z: 0.03, sx: WW, sy: 0.035, sz: 0.04, color: TRIM }
      );
      var railY = WY + WH / 2 + 0.16,
        curBot = WY - WH / 2 - 0.07,
        curH = railY - curBot,
        cu = []; /* 丈は窓台のすぐ下まで(左右とも同じ) */
      bx.push({
        x: WU,
        y: railY + 0.03,
        z: 0.15,
        sx: WW + 0.9,
        sy: 0.03,
        sz: 0.03,
        color: BRASS,
      }); /* カーテンレール */
      [-1, 1].forEach(function (sd) {
        for (var i = 0; i < 5; i++)
          cu.push({
            x: WU + sd * (WW / 2 + 0.17 + i * 0.06),
            y: curBot + curH / 2,
            z: 0.15 + (i % 2 ? 0.025 : 0),
            sx: 0.07,
            sy: curH,
            sz: 0.035,
            color: i % 2 ? [0.86, 0.86, 0.86] : [1, 1, 1],
          });
      });
      merge(houseA, core.boxArrays(bx, RW));
      merge(fabricA, core.boxArrays(cu, RW));
      onWall('right', WU, WY, 0.012, new THREE.Mesh(new THREE.PlaneGeometry(WW, WH), glassMat));
      onWall('right', WU, WY, 0.016, new THREE.Mesh(new THREE.PlaneGeometry(WW, WH), glassOverMat));
      /* 机(窓の下)と椅子 */
      var desk = [
        { x: WU, y: 0.72, z: 0.3, sx: 1.2, sy: 0.035, sz: 0.56, color: [1, 1, 1] },
        { x: WU, y: 0.64, z: 0.3, sx: 0.5, sy: 0.12, sz: 0.5, color: WOODK },
      ];
      [
        [-0.56, 0.06],
        [0.56, 0.06],
        [-0.56, 0.54],
        [0.56, 0.54],
      ].forEach(function (q) {
        desk.push({ x: WU + q[0], y: 0.35, z: q[1], sx: 0.045, sy: 0.7, sz: 0.045, color: LEG });
      });
      merge(woodA, core.boxArrays(desk, RW));
      var chair = [
        { x: WU, y: 0.45, z: 0.82, sx: 0.44, sy: 0.04, sz: 0.42, color: [1, 1, 1] },
        { x: WU, y: 0.82, z: 1.02, sx: 0.42, sy: 0.3, sz: 0.03, color: [1, 1, 1] },
      ];
      [
        [-0.19, 0.63],
        [0.19, 0.63],
        [-0.19, 1.01],
        [0.19, 1.01],
      ].forEach(function (q) {
        chair.push({ x: WU + q[0], y: 0.22, z: q[1], sx: 0.035, sy: 0.44, sz: 0.035, color: LEG });
      });
      [-0.17, 0.17].forEach(function (dx) {
        chair.push({ x: WU + dx, y: 0.66, z: 1.02, sx: 0.035, sy: 0.4, sz: 0.035, color: LEG });
      });
      merge(woodA, core.boxArrays(chair, RW));
      /* 机の上: アームライト(左端)と、よく使うツールの本(右端に寄せる) */
      var brassA = arrays();
      /* よく使うツールの本(最大3冊)を机の上に立てる。棚の本と同じ絵で、タップすると棚のその本を引き出す */
      deskBooks.forEach(function (m) {
        if (m.parent) m.parent.remove(m);
      });
      deskBooks.length = 0;
      var fav = favRecs(),
        bw = core.TOOL.w + 0.004,
        bu = WU + 0.55 - core.TOOL.w / 2 - (fav.length - 1) * bw; /* 右端の本の外側が机の右端から5cm */
      fav.forEach(function (rec, i) {
        var m = new THREE.Mesh(bookGeo, rec.mats);
        m.userData.index = rec.mesh.userData.index;
        m.userData.desk = true;
        onWall('right', bu + i * bw, 0.737 + core.TOOL.h / 2, 0.33, m);
        deskBooks.push(m); /* 窓台に当たらないよう手前に */
      });
      if (fav.length) {
        var ex = bu - core.TOOL.w / 2 - 0.01; /* ブックエンドは本の左側 */
        merge(
          brassA,
          core.boxArrays(
            [
              { x: ex, y: 0.737 + 0.11, z: 0.33, sx: 0.006, sy: 0.22, sz: 0.14, color: [1, 1, 1] },
              { x: ex - 0.05, y: 0.74, z: 0.33, sx: 0.1, sy: 0.006, sz: 0.14, color: [1, 1, 1] },
            ],
            RW
          )
        );
      }
      g.add(meshOf(brassA, brassMatV));
      /* アームライト: 丸い台から2本の腕を折って伸ばし、先の円すいのかさを机の上に向ける(腕は壁と平行な面の中) */
      var arm = onWall('right', WU - 0.45, 0.737, 0.2, new THREE.Group());
      function rod(x0, y0, x1, y1, r) {
        var dx = x1 - x0,
          dy = y1 - y0,
          m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, Math.hypot(dx, dy), 10), lampBodyMat);
        m.position.set((x0 + x1) / 2, (y0 + y1) / 2, 0);
        m.rotation.z = Math.atan2(-dx, dy);
        arm.add(m);
      }
      function joint(x, y) {
        var m = new THREE.Mesh(new THREE.SphereGeometry(0.014, 12, 8), brassMat);
        m.position.set(x, y, 0);
        arm.add(m);
      }
      var base = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.085, 0.025, 28), lampBodyMat);
      base.position.set(0, 0.0125, 0);
      base.userData.kind = 'desklamp';
      extraPicks.push(base);
      arm.add(base);
      rod(0, 0.025, 0.05, 0.36, 0.009);
      joint(0, 0.03);
      joint(0.05, 0.36);
      rod(0.05, 0.36, 0.27, 0.43, 0.008);
      joint(0.27, 0.43);
      var shade = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.075, 0.13, 24, 1, true), bankMat);
      shade.position.set(0.31, 0.38, 0);
      shade.rotation.z = 0.5;
      shade.userData.kind = 'desklamp';
      extraPicks.push(shade);
      arm.add(shade);
      var cap = new THREE.Mesh(new THREE.SphereGeometry(0.024, 12, 8), bankMat);
      cap.position.set(0.28, 0.435, 0);
      arm.add(cap);
      var bulb = new THREE.Mesh(new THREE.SphereGeometry(0.03, 12, 8), lampBulbMat);
      bulb.position.set(0.335, 0.335, 0);
      bulb.userData.kind = 'desklamp';
      extraPicks.push(bulb);
      arm.add(bulb);
      /* かさの向きに机の上を丸く照らす(届く距離を短くして、部屋全体は明るくしない) */
      lights.desk = new THREE.SpotLight(0xffd8a8, 0, 2.6, 0.75, 0.6, 2);
      lights.desk.position.set(0.335, 0.335, 0);
      lights.desk.target.position.set(0.5, 0, 0);
      arm.add(lights.desk);
      arm.add(lights.desk.target);

      /* 左の壁: ドア(手前寄り)・飾り棚(奥寄り)とその上の絵 */
      var LW = wf('left'),
        DU = -(HZ - 0.75),
        door = [],
        dwood = [];
      /* 閉じたドア: 白い額縁(枠)の内側に、枠とほぼ同じ面で収まる扉。扉の板は木目、彫り込みの羽目板2枚、レバーの取っ手、丁番 */
      [
        [-0.47, 1.06, 0.06, 2.12],
        [0.47, 1.06, 0.06, 2.12],
        [0, 2.15, 1.0, 0.06],
      ].forEach(function (q) {
        door.push({ x: DU + q[0], y: q[1], z: 0.03, sx: q[2], sy: q[3], sz: 0.06, color: TRIM });
      });
      dwood.push({
        x: DU,
        y: 1.06,
        z: 0.025,
        sx: 0.88,
        sy: 2.12,
        sz: 0.03,
        color: [0.92, 0.92, 0.92],
      }); /* 扉の板(枠の内側) */
      [
        [0.55, 0.72],
        [1.47, 0.98],
      ].forEach(function (q) {
        dwood.push({ x: DU, y: q[0], z: 0.042, sx: 0.62, sy: q[1], sz: 0.006, color: [0.72, 0.72, 0.72] });
      }); /* 羽目板の彫り込み(少し暗く) */
      door.push(
        { x: DU + 0.34, y: 1.0, z: 0.05, sx: 0.05, sy: 0.12, sz: 0.012, color: BRASS },
        { x: DU + 0.3, y: 1.0, z: 0.075, sx: 0.12, sy: 0.018, sz: 0.02, color: BRASS }
      ); /* 座金とレバー */
      [0.35, 1.75].forEach(function (y) {
        door.push({ x: DU - 0.435, y: y, z: 0.045, sx: 0.012, sy: 0.1, sz: 0.012, color: BRASS });
      }); /* 丁番 */
      merge(houseA, core.boxArrays(door, LW));
      // タップの判定用の見えない板(扉を押すと戻る・閉じる)
      var dp = onWall('left', DU, 1.06, 0.09, new THREE.Mesh(new THREE.PlaneGeometry(1.0, 2.15), pickMat));
      dp.userData.kind = 'door';
      extraPicks.push(dp);
      merge(woodA, core.boxArrays(dwood, LW));
      var SU = 0.75,
        side = [
          { x: SU, y: 0.4, z: 0.22, sx: 1.1, sy: 0.62, sz: 0.42, color: [1, 1, 1] },
          { x: SU, y: 0.73, z: 0.23, sx: 1.14, sy: 0.035, sz: 0.45, color: [0.9, 0.9, 0.9] },
        ];
      [-0.27, 0.27].forEach(function (dx) {
        side.push({ x: SU + dx, y: 0.4, z: 0.44, sx: 0.52, sy: 0.56, sz: 0.01, color: [0.78, 0.78, 0.78] });
      });
      [
        [-0.5, 0.06],
        [0.5, 0.06],
        [-0.5, 0.38],
        [0.5, 0.38],
      ].forEach(function (q) {
        side.push({ x: SU + q[0], y: 0.045, z: q[1], sx: 0.04, sy: 0.09, sz: 0.04, color: LEG });
      });
      merge(woodA, core.boxArrays(side, LW));
      picture('left', SU, 1.55, 0.7, 0.88, 0); /* 飾り棚の上に絵を1枚 */

      /* 手前の壁: 2人掛けのソファと、その上の横長の絵 */
      /* 2人掛けソファ(一般的な寸法: 幅160 / 奥行88 / 高さ85 / 座面高43 / 脚13cm)。
         台・座クッション2つ・背もたれ・背クッション2つ(少し後ろに傾ける)・ひじ掛け・木の細い脚・差し色のクッション */
      var FW = wf('front'),
        SW = 1.6,
        SD = 0.88;
      function sofaPart(u, y, dz, w, h, d, r, mat, tilt, turn) {
        var m = onWall('front', u, y, dz, new THREE.Mesh(roundedBox(w, h, d, r), mat));
        if (tilt || turn) {
          m.rotation.order = 'YXZ';
          m.rotation.x = tilt || 0;
          m.rotation.z = turn || 0;
        }
        return m;
      }
      sofaPart(0, 0.215, SD / 2, SW - 0.02, 0.17, SD - 0.02, 0.045, sofaMat); /* 台(床から13cmの脚の上) */
      [-0.335, 0.335].forEach(function (u) {
        sofaPart(u, 0.365, 0.53, 0.66, 0.13, 0.62, 0.055, sofaMat2);
      }); /* 座クッション(座面高43cm) */
      sofaPart(0, 0.57, 0.1, SW - 0.02, 0.56, 0.18, 0.07, sofaMat); /* 背もたれ */
      [-0.335, 0.335].forEach(function (u) {
        sofaPart(u, 0.64, 0.28, 0.64, 0.42, 0.17, 0.075, sofaMat2, -0.16);
      }); /* 背クッション */
      [-1, 1].forEach(function (sd) {
        sofaPart(sd * (SW / 2 - 0.08), 0.45, SD / 2, 0.16, 0.34, SD - 0.02, 0.07, sofaMat);
      }); /* ひじ掛け(高さ62cm) */
      [
        [-SW / 2 + 0.07, 0.07],
        [SW / 2 - 0.07, 0.07],
        [-SW / 2 + 0.07, SD - 0.07],
        [SW / 2 - 0.07, SD - 0.07],
      ].forEach(function (q) {
        onWall(
          'front',
          q[0],
          0.065,
          q[1],
          new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.012, 0.13, 12), woodMatPlain)
        ); /* 先細りの木の脚 */
      });
      picture('front', 0, 1.62, 1.1, 0.6, 2);

      /* 奥の壁: 本棚のすぐ左に観葉植物、右奥の角にフロアランプ */
      var PX = plan.props.plant.x,
        LX = HX - 0.28,
        BZ = -plan.hz,
        PZ = BZ + 0.36,
        LZ = BZ + 0.28; /* 植物は本棚の左に、ランプは右奥の角(奥と右の壁際)に */
      add(new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.15, 0.38, 20), potMat), PX, 0.19, PZ);
      [
        [0, 0.82, 0, 0.34],
        [0.12, 1.12, 0.05, 0.26],
        [-0.1, 1.05, -0.08, 0.24],
        [0.02, 1.36, -0.02, 0.2],
        [0.14, 0.7, -0.1, 0.22],
      ].forEach(function (l) {
        add(new THREE.Mesh(new THREE.IcosahedronGeometry(l[3], 1), leafMat), PX + l[0], l[1], PZ + l[2]);
      });
      add(new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.025, 0.6, 8), woodMatPlain), PX, 0.6, PZ);
      var fBase = add(
          new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.18, 0.03, 24), brassMat),
          LX,
          0.015,
          LZ
        ),
        fPole = add(
          new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 1.45, 10), brassMat),
          LX,
          0.74,
          LZ
        ),
        fShade = add(
          new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.24, 0.32, 28, 1, true), shadeMat),
          LX,
          1.56,
          LZ
        ),
        fBulb = add(new THREE.Mesh(new THREE.SphereGeometry(0.045, 12, 8), floorBulbMat), LX, 1.52, LZ),
        fHit = add(
          new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 1.5, 8), floorBulbMat),
          LX,
          0.75,
          LZ
        ); /* 細いポールでも押せるよう、見えない太めの当たり判定を重ねる */
      fHit.visible = false;
      [fBase, fPole, fShade, fBulb, fHit].forEach(function (m) {
        m.userData.kind = 'floorlamp';
        extraPicks.push(m);
      });
      lights.lamp = add(new THREE.PointLight(0xffd29a, 0.4, 7, 2), LX, 1.5, LZ + 0.25);
      plane(
        g,
        Math.min(2.4, HX * 2 - 1.0),
        1.7,
        rugMat,
        0,
        0.004,
        0.15,
        -Math.PI / 2,
        0
      ); /* ラグ(部屋の中ほど) */
      add(
        new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.5, 6), cordMat),
        0,
        RH - 0.25,
        0
      ); /* 天井のペンダント */
      var shade = add(
        new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.26, 0.2, 32, 1, true), pendMat),
        0,
        RH - 0.56,
        0
      );
      shade.userData.kind = 'pendant';
      extraPicks.push(shade);
      var bulb = add(new THREE.Mesh(new THREE.SphereGeometry(0.055, 16, 12), bulbMat), 0, RH - 0.6, 0);
      bulb.userData.kind = 'pendant';
      extraPicks.push(bulb);
      lights.pend = add(new THREE.PointLight(0xffe2b0, 0, 9, 2), 0, RH - 0.68, 0);
      g.add(meshOf(houseA, trimMat));
      g.add(meshOf(fabricA, curtainMat));
      g.add(meshOf(fabricB, chairMat));
      g.add(meshOf(woodA, caseMat));
    }

    /* 照明: 昼は窓の光、夜は天井とフロアランプ。本棚は天井のダウンライトで照らす */
    function buildLights(g) {
      var HZ = plan.hz,
        RH = plan.h,
        f = plan.frame;
      lights.ambient = new THREE.AmbientLight(0xffffff, 0.3);
      g.add(lights.ambient);
      lights.hemi = new THREE.HemisphereLight(0xfff6ea, 0x6b5040, 0.5);
      g.add(lights.hemi);
      lights.sun = new THREE.DirectionalLight(0xfff4e0, 0.5);
      lights.sun.position.set(plan.hx + 3, 2.9, -0.6);
      lights.sun.target.position.set(-0.8, 0.6, -0.6);
      /* 右の壁の窓から */ g.add(lights.sun);
      g.add(lights.sun.target);
      var n = Math.max(1, Math.round(plan.caseW / 1.1));
      lights.spots = [];
      for (var i = 0; i < n; i++) {
        var x = ((i + 0.5) * plan.caseW) / n - plan.caseW / 2;
        var sp = new THREE.SpotLight(0xfff0d8, 0.5, 6, 0.75, 0.7, 1.2);
        sp.position.set(x, RH - 0.05, f.z + 1.1);
        sp.target.position.set(x, plan.caseH * 0.5, f.z);
        g.add(sp);
        g.add(sp.target);
        lights.spots.push(sp);
      }
    }
    var THEME = {
      light: {
        bg: 0xe9e4da,
        ambient: 0.08,
        hemi: 0.4,
        sun: 0.28,
        spot: 0.3,
        pend: 0.18,
        lamp: 0.1,
        glass: 0xe2edf7,
        shade: 0x000000,
        bank: 0x000000,
      },
      dark: {
        bg: 0x0b0d12,
        ambient: 0.03,
        hemi: 0.12,
        sun: 0.0,
        spot: 0.35,
        pend: 0.35,
        lamp: 0.5,
        glass: 0x18213a,
        shade: 0x6a4a20,
        bank: 0x1a2a22,
      },
    };
    var dark = false;
    function setPendant(on) {
      if (!lights.pend) return;
      lights.pend.intensity = on ? (dark ? 0.7 : 0.4) : 0;
      bulbMat.color.setHex(on ? 0xfff3d6 : 0x5a554c);
      if (pendMat.emissive) pendMat.emissive.setHex(on ? 0x2a2418 : 0x000000);
      api.needsRender = true;
    }
    function setFloorLamp(on) {
      var th = dark ? THEME.dark : THEME.light;
      lights.lamp.intensity = on ? th.lamp : 0;
      floorBulbMat.color.setHex(on ? 0xfff3d6 : 0x5a554c);
      shadeMat.emissive.setHex(on ? th.shade : 0x000000);
      api.needsRender = true;
    }
    function setDeskLamp(on) {
      if (!lights.desk) return;
      lights.desk.intensity = on ? (dark ? 3.2 : 1.6) : 0;
      lampBulbMat.color.setHex(on ? 0xfff3d6 : 0x5a554c);
      if (bankMat.emissive)
        bankMat.emissive.setHex(on ? 0x221a0e : dark ? THEME.dark.bank : THEME.light.bank);
      api.needsRender = true;
    }
    function applyTheme() {
      var th = THEME[document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light'];
      scene.background = new THREE.Color(th.bg);
      lights.ambient.intensity = th.ambient;
      lights.hemi.intensity = th.hemi;
      lights.sun.intensity = th.sun;
      lights.spots.forEach(function (l) {
        l.intensity = th.spot;
      });
      dark = th === THEME.dark;
      setPendant(pendOn === null ? dark : pendOn);
      api.needsRender = true;
      glassMat.color.setHex(th.glass);
      bankMat.emissive.setHex(th.bank);
      setDeskLamp(deskOn === null ? dark : deskOn);
      setFloorLamp(floorOn === null ? dark : floorOn);
    }
    function dispose(g) {
      (function walk(x) {
        (x.children || []).forEach(walk);
        if (x.geometry && x.geometry.dispose && !x.userData.desk && !rbShared(x.geometry))
          x.geometry.dispose();
      })(g);
    }

    /* 画面の縦横比 aspect に合わせて部屋と本棚を組む。前と大きく変わらない時は何もしない(false) */
    /* 部屋と本棚を組む(配置は画面の形によらないので、組むのは最初の1回) */
    function relayout(aspect, force) {
      if (!force && layout) return false;
      if (layout) {
        scene.remove(layout);
        dispose(layout);
      }
      layoutAspect = aspect;
      plan = core.roomPlan(groups.length, maxTools, aspect);
      layout = new THREE.Group();
      scene.add(layout);
      extraPicks.length = 0;
      buildCase(layout);
      buildRoom(layout);
      buildLights(layout);
      applyTheme();
      return true;
    }
    relayout(o.aspect || 1.5, true);

    /* 表紙の絵を貼る(初めて引き出す時) */
    function coverOf(i) {
      var r = books[i];
      if (r.mats[0].map) return;
      var mat = new THREE.MeshPhongMaterial({
        map: r.art.cover(),
        specular: 0x0c0a08,
        shininess: 12,
        emissive: 0x000000,
      });
      r.mats[0] = mat;
      r.mesh.material = r.mats;
      api.needsRender = true;
    }
    Object.assign(api, {
      coverOf: coverOf,
      scene: scene,
      books: books,
      bookMeshes: bookMeshes,
      deskCount: function () {
        return deskBooks.length;
      },
      pickables: function () {
        return bookMeshes.concat(deskBooks, extraPicks);
      },
      /* 天井の照明を切り替える。戻り値は点いたかどうか */
      togglePendant: function () {
        pendOn = !(lights.pend && lights.pend.intensity > 0);
        setPendant(pendOn);
        return pendOn;
      },
      toggleDeskLamp: function () {
        deskOn = !(lights.desk && lights.desk.intensity > 0);
        setDeskLamp(deskOn);
        return deskOn;
      },
      toggleFloorLamp: function () {
        floorOn = !(lights.lamp && lights.lamp.intensity > 0);
        setFloorLamp(floorOn);
        return floorOn;
      },
      floorLampOn: function () {
        return !!(lights.lamp && lights.lamp.intensity > 0);
      },
      deskLampOn: function () {
        return !!(lights.desk && lights.desk.intensity > 0);
      },
      pendantOn: function () {
        return !!(lights.pend && lights.pend.intensity > 0);
      },
      relayout: relayout,
      applyTheme: applyTheme,
      plan: function () {
        return plan;
      },
      ends: function () {
        return nEnds;
      },
    });
    return api;
  }

  var api = { create: create };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.BookshelfScene = api;
})(this);
