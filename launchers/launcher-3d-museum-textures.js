/* ミュージアムの絵・案内プレート・木目などのテクスチャと、共通の材質・形状(three.js r128)。
   MuseumTextures.create({THREE, core, maxAniso, LOW, FONT, BRASS, markOf, iconOf, onChange(=描き直しが必要になった時)}) */
function create(o) {
  var THREE = o.THREE,
    core = o.core,
    maxAniso = o.maxAniso,
    LOW = o.LOW,
    FONT = o.FONT,
    BRASS = o.BRASS,
    markOf = o.markOf,
    iconOf = o.iconOf;
  function rr(g, x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }
  function tex(c) {
    var t = new THREE.CanvasTexture(c);
    t.anisotropy = maxAniso;
    return t;
  }
  function fitText(g, text, maxW, size, min, weight) {
    g.font = (weight || 700) + ' ' + size + 'px ' + FONT;
    while (g.measureText(text).width > maxW && size > min) {
      size -= 2;
      g.font = (weight || 700) + ' ' + size + 'px ' + FONT;
    }
  }

  /* 絵は横長(4:3)の台紙(リネン色)の中央に、アイコンだけを飾る(周りに色の地は付けない)。
   キャンバスは512四方のまま横方向に潰して描き、横長の板に貼ると歪まない(論理座標は 683×512) */
  function paintArt(c, t, img) {
    var g = c.getContext('2d');
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, 512, 512);
    g.scale(0.75, 1);
    var x = 141,
      y = 56,
      s = 400,
      r = 84; /* アイコンを台紙の中で大きめに */
    g.save();
    g.shadowColor = 'rgba(40,30,20,.35)';
    g.shadowBlur = 22;
    g.shadowOffsetY = 8; /* 台紙に落ちる薄い影 */
    rr(g, x, y, s, s, r);
    g.fillStyle = '#4a4e7a';
    g.fill();
    g.restore();
    if (img) {
      g.save();
      rr(g, x, y, s, s, r);
      g.clip();
      g.drawImage(img, x, y, s, s);
      g.restore();
    } else {
      var gr = g.createLinearGradient(x, y, x + s, y + s);
      gr.addColorStop(0, '#5a5f93');
      gr.addColorStop(1, '#2e3157');
      rr(g, x, y, s, s, r);
      g.fillStyle = gr;
      g.fill();
      var m = markOf(t);
      g.fillStyle = '#ffffff';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.font = '700 ' + (m.length > 1 ? 120 : 170) + 'px ' + FONT;
      g.fillText(m, x + s / 2, y + s / 2 + 8);
    }
  }
  /* ツール固有のアイコン(app-icon-<slug>.svg)を絵の中央に飾る。読み込めない/使えない時は頭文字のまま。
   file:// で開くとブラウザがキャンバスを「汚染」扱いにして3Dへ使えないため、その場合も頭文字に戻す */
  var iconStat = { ok: 0, ng: 0, pend: 0, warned: false };
  function iconDone() {
    if (--iconStat.pend > 0) return;
    log(
      'アイコン画像の読み込みが終わりました(使用 ' + iconStat.ok + ' / 使えず ' + iconStat.ng + ')',
    );
  }
  function loadIcon(t, c, texture) {
    iconStat.pend++;
    var img = new Image();
    img.onload = function () {
      try {
        paintArt(c, t, img);
        c.getContext('2d').getImageData(0, 0, 1, 1); /* 汚染されていれば SecurityError */
        texture.needsUpdate = true;
        o.onChange();
        iconStat.ok++;
      } catch (e) {
        c.width = 512; /* 幅の再設定で汚染状態が解除される */
        paintArt(c, t, null);
        texture.needsUpdate = true;
        o.onChange();
        iconStat.ng++;
        if (!iconStat.warned) {
          iconStat.warned = true;
          log.warn(
            'アイコン画像を3Dに使えませんでした(file:// で開くと読めません。https で配信すると表示されます)',
            e,
          );
        }
      }
      iconDone();
    };
    img.onerror = function () {
      iconStat.ng++;
      iconDone();
    };
    img.src = iconOf(t);
  }
  function artTexture(t) {
    var c = document.createElement('canvas');
    c.width = c.height = 512;
    paintArt(c, t, null);
    var texture = tex(c);
    loadIcon(t, c, texture);
    return texture;
  }
  /* 展示室のバナー: 入口の代わりに壁に下げる縦長の幕。部屋の色の地に、部屋番号・展示室名・点数・代表のアイコン4つ。
     アイコンは読めた順に描き足す(file:// で使えない時は描かない) */
  function bannerTexture(e) {
    var c = document.createElement('canvas'),
      W = 512,
      H = 980;
    c.width = W;
    c.height = H;
    var texture = tex(c),
      imgs = [];
    function paint() {
      var g = c.getContext('2d');
      g.fillStyle = e.color || '#3d4270';
      g.fillRect(0, 0, W, H);
      var gr = g.createLinearGradient(0, 0, 0, H);
      gr.addColorStop(0, 'rgba(255,255,255,0.10)');
      gr.addColorStop(1, 'rgba(0,0,0,0.18)');
      g.fillStyle = gr;
      g.fillRect(0, 0, W, H);
      g.fillStyle = 'rgba(255,255,255,0.85)';
      g.fillRect(48, 70, 70, 6);
      g.textBaseline = 'top';
      g.textAlign = 'left';
      g.fillStyle = 'rgba(255,255,255,0.8)';
      g.font = '600 30px ' + FONT;
      g.fillText('展示室 ' + e.no, 48, 100);
      g.fillStyle = '#ffffff';
      fitText(g, e.cat, W - 96, 76, 34, 800);
      g.fillText(e.cat, 48, 150);
      g.fillStyle = 'rgba(255,255,255,0.8)';
      g.font = '500 30px ' + FONT;
      g.fillText(e.count + ' 点', 48, 250);
      var s = 176,
        gap = 24,
        x0 = (W - s * 2 - gap) / 2,
        y0 = 380;
      (e.tools || []).slice(0, 4).forEach(function (t, k) {
        var x = x0 + (k % 2) * (s + gap),
          y = y0 + Math.floor(k / 2) * (s + gap);
        g.save();
        g.shadowColor = 'rgba(0,0,0,.3)';
        g.shadowBlur = 16;
        g.shadowOffsetY = 6;
        rr(g, x, y, s, s, 38);
        g.fillStyle = 'rgba(255,255,255,0.14)';
        g.fill();
        g.restore();
        if (imgs[k]) {
          g.save();
          rr(g, x, y, s, s, 38);
          g.clip();
          g.drawImage(imgs[k], x, y, s, s);
          g.restore();
        }
      });
      g.fillStyle = 'rgba(255,255,255,0.85)';
      g.font = '600 30px ' + FONT;
      g.textAlign = 'center';
      g.fillText('この先へ  →', W / 2, H - 110);
      texture.needsUpdate = true;
    }
    paint();
    (e.tools || []).slice(0, 4).forEach(function (t, k) {
      var img = new Image();
      img.onload = function () {
        imgs[k] = img;
        try {
          paint();
          c.getContext('2d').getImageData(0, 0, 1, 1);
        } catch (er) {
          imgs[k] = null; /* file:// では絵が汚染扱いになるため描かない */
          c.width = W;
          paint();
        }
        o.onChange();
      };
      img.src = iconOf(t);
    });
    return texture;
  }
  /* 展示室の案内プレート: 実物の美術館の案内表示のように、入口の横・目の高さに付ける白いプレート。
   小さな部屋番号、太字の展示室名、細い線、行き先の一言(解説カードと同じ系統のデザイン) */
  function plaqueTexture(kicker, name, sub) {
    var c = document.createElement('canvas');
    c.width = 512;
    c.height = 320;
    var g = c.getContext('2d');
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, 512, 320);
    g.strokeStyle = 'rgba(40,40,40,.16)';
    g.lineWidth = 2;
    g.strokeRect(1, 1, 510, 318);
    g.textBaseline = 'top';
    g.textAlign = 'left';
    try {
      g.letterSpacing = '4px';
    } catch (e) {
      log.debug('文字間隔の指定に未対応のブラウザです');
    }
    g.fillStyle = '#8a8a8e';
    g.font = '600 26px ' + FONT;
    g.fillText(kicker, 36, 34);
    try {
      g.letterSpacing = '0px';
    } catch (e) {
      log.debug('文字間隔の指定に未対応のブラウザです');
    }
    g.fillStyle = '#1f1f22';
    fitText(g, name, 440, 62, 30, 700);
    g.fillText(name, 36, 84);
    g.fillStyle = '#1f1f22';
    g.fillRect(36, 178, 48, 4);
    g.fillStyle = '#55555a';
    g.font = '500 26px ' + FONT;
    g.fillText(sub, 36, 214);
    return tex(c);
  }
  /* 新着バッジ */
  function badgeTexture() {
    var c = document.createElement('canvas');
    c.width = 128;
    c.height = 64;
    var g = c.getContext('2d');
    rr(g, 4, 4, 120, 56, 28);
    g.fillStyle = '#5cc4b6';
    g.fill();
    g.fillStyle = '#0b2b27';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = '800 32px ' + FONT;
    g.fillText('NEW', 64, 34);
    return tex(c);
  }
  function glowTexture() {
    var c = document.createElement('canvas');
    c.width = c.height = 256;
    var g = c.getContext('2d');
    var gr = g.createRadialGradient(128, 128, 0, 128, 128, 128);
    gr.addColorStop(0, 'rgba(255,255,255,1)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 256, 256);
    return new THREE.CanvasTexture(c);
  }
  /* 木目: 縦に並ぶ板(planks枚)を、板ごとの明暗・波うつ木目・継ぎ目で描く。上下は継ぎ目なく繰り返せる */
  function rng(seed) {
    return function () {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };
  }
  function woodCanvas(size, planks, base, seed, streaks) {
    var c = document.createElement('canvas');
    c.width = c.height = size;
    var g = c.getContext('2d'),
      R = rng(seed),
      pw = size / planks,
      p,
      i,
      y;
    for (p = 0; p < planks; p++) {
      var k = 0.82 + R() * 0.28;
      g.fillStyle =
        'rgb(' +
        Math.round(base[0] * k) +
        ',' +
        Math.round(base[1] * k) +
        ',' +
        Math.round(base[2] * k) +
        ')';
      g.fillRect(p * pw, 0, pw, size);
      for (i = 0; i < streaks; i++) {
        var x = p * pw + R() * pw,
          a = 0.04 + R() * 0.1,
          dark = R() < 0.7,
          ph = R() * 6,
          amp = 0.6 + R() * 2.2;
        g.strokeStyle = dark ? 'rgba(60,35,15,' + a + ')' : 'rgba(255,230,190,' + a * 0.8 + ')';
        g.lineWidth = 0.6 + R() * 1.4;
        g.beginPath();
        g.moveTo(x, 0);
        for (y = 0; y <= size; y += 16)
          g.lineTo(x + Math.sin((y / size) * Math.PI * 4 + ph) * amp, y);
        g.stroke();
      }
      g.fillStyle = 'rgba(40,22,10,0.55)';
      g.fillRect(p * pw, 0, 1.5, size);
      var cut = Math.floor(R() * size);
      g.fillStyle = 'rgba(40,22,10,0.4)';
      g.fillRect(p * pw, cut, pw, 1.5);
    }
    return c;
  }
  /* 床: 明るいホワイトオークの幅広の板張り(近現代美術館で主流: MoMA・テート・モダンなど)。
   板の向きと割り付けはワールド座標で決めるので、部屋と通路をまたいでも木目が途切れない(どこでも板は奥行き方向) */
  var FLOOR_S = 4.0; /* 床の絵1枚(板8枚)が覆う大きさ */
  var floorTileMat = (function () {
    var t = tex(woodCanvas(512, 8, [206, 180, 146], 13, 22));
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return new THREE.MeshPhongMaterial({
      color: 0xffffff,
      map: t,
      specular: 0x3a3026,
      shininess: 35,
    });
  })();
  var passFloorMat = new THREE.MeshPhongMaterial({
    color: 0xffffff,
    map: floorTileMat.map,
    vertexColors: true,
    specular: 0x000000,
    shininess: 5,
  }); /* 通路の床(奥ほど黒) */
  /* 床の四角形(ワールド座標 x0..x1 / z0..z1、高さ y) */
  function floorQuad(x0, z0, x1, z1, y, mat) {
    var S = FLOOR_S,
      geo = new THREE.BufferGeometry();
    geo.setAttribute(
      'position',
      new THREE.Float32BufferAttribute([x0, y, z0, x1, y, z0, x1, y, z1, x0, y, z1], 3),
    );
    geo.setAttribute(
      'normal',
      new THREE.Float32BufferAttribute([0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0], 3),
    );
    geo.setAttribute(
      'uv',
      new THREE.Float32BufferAttribute(
        [x0 / S, -z0 / S, x1 / S, -z0 / S, x1 / S, -z1 / S, x0 / S, -z1 / S],
        2,
      ),
    );
    geo.setIndex([0, 2, 1, 0, 3, 2]);
    return new THREE.Mesh(geo, mat || floorTileMat);
  }
  /* 額縁の木材(深いウォールナット)。縦枠は縦目、横枠は90度回して横目にする。面取りの形状は UV がワールド座標なので繰り返し指定 */
  function frameTexture(rot) {
    var t = tex(woodCanvas(256, 1, [86, 54, 32], 21, 34));
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    if (rot) {
      t.center.set(0.5, 0.5);
      t.rotation = Math.PI / 2;
    }
    return t;
  }
  /* 解説カード(作品の右横・目の高さ): 生成りの紙に、番号・題名・説明 */
  function captionTexture(no, title, desc) {
    var c = document.createElement('canvas');
    c.width = 512;
    c.height = 320;
    var g = c.getContext('2d');
    g.fillStyle = '#f3eee3';
    g.fillRect(0, 0, 512, 320);
    g.strokeStyle = 'rgba(60,50,40,.18)';
    g.lineWidth = 2;
    g.strokeRect(1, 1, 510, 318);
    g.fillStyle = '#8a7a62';
    g.font = '600 26px ' + FONT;
    g.textBaseline = 'top';
    g.fillText(no, 32, 30);
    g.fillStyle = '#24201b';
    fitText(g, title, 448, 44, 26);
    g.fillText(title, 32, 70);
    g.fillStyle = '#4e463c';
    g.font = '400 26px ' + FONT;
    var words = String(desc || ''),
      line = '',
      y = 140,
      lines = 0;
    for (var i = 0; i < words.length && lines < 4; i++) {
      var tl = line + words[i];
      if (g.measureText(tl).width > 448) {
        g.fillText(line, 32, y);
        y += 38;
        lines++;
        line = words[i];
      } else line = tl;
    }
    if (line && lines < 4) g.fillText(line, 32, y);
    return tex(c);
  }

  /* 共通の材質(部屋ごとに作るのは床と腰壁だけ。それは下のリストでテーマ色を掛ける) */
  /* 面ごとにライトを計算する Phong にそろえる(Lambert は頂点ごとの計算なので、大きな壁の光だまりが出ない) */
  function matte(o) {
    o.specular = 0x000000;
    o.shininess = 5;
    return new THREE.MeshPhongMaterial(o);
  }
  var ceilMat = matte({ color: 0xffffff });
  var trimMat = new THREE.MeshPhongMaterial({ color: 0xffffff, specular: 0x2a2018, shininess: 25 });
  var brassMat = new THREE.MeshPhongMaterial({ color: BRASS, specular: 0xe6d9b0, shininess: 45 });
  var darkMat = new THREE.MeshPhongMaterial({ color: 0x1c140e, specular: 0x3a3028, shininess: 40 });
  var linerMat = new THREE.MeshPhongMaterial({
    color: 0xd8cfbb,
    specular: 0x222018,
    shininess: 20,
  });
  var frameMatV = new THREE.MeshPhongMaterial({
    color: 0xffffff,
    map: frameTexture(false),
    specular: 0x4a3a2c,
    shininess: 35,
  });
  var frameMatH = new THREE.MeshPhongMaterial({
    color: 0xffffff,
    map: frameTexture(true),
    specular: 0x4a3a2c,
    shininess: 35,
  });
  var benchMat = new THREE.MeshPhongMaterial({
    color: 0xffffff,
    specular: 0x141420,
    shininess: 12,
  });
  var skyMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  var matMat = new THREE.MeshBasicMaterial({ color: 0xf3f1ec }); /* 白い台紙 */
  var frameBlackMat = new THREE.MeshPhongMaterial({
    color: 0x1c1c1e,
    specular: 0x2a2a2c,
    shininess: 18,
  }); /* 黒い額縁 */
  var frameOakMat = (function () {
    var t = tex(woodCanvas(256, 1, [214, 188, 152], 21, 30));
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return new THREE.MeshPhongMaterial({
      color: 0xffffff,
      map: t,
      specular: 0x3a3026,
      shininess: 25,
    });
  })(); /* 明るいオークの額縁 */
  var frameBoxMat = new THREE.MeshPhongMaterial({
    color: 0xf2f1ee,
    specular: 0x111111,
    shininess: 8,
  }); /* 白い箱型の額 */
  /* 額縁の形: out=枠の外寸(作品より大きい分) bar=枠の幅 dp=奥行き in=台紙(作品より大きい分) back/art=台紙と作品の前後位置 */
  var FRAMES = {
    oak: { out: 0.62, bar: 0.16, dp: 0.16, in: 0.32, back: 0.05, art: 0.06, mat: frameOakMat },
    black: { out: 0.62, bar: 0.16, dp: 0.22, in: 0.32, back: 0.05, art: 0.06, mat: frameBlackMat },
    box: { out: 0.7, bar: 0.12, dp: 0.42, in: 0.48, back: 0.03, art: 0.2, mat: frameBoxMat },
  };
  var glowTex = glowTexture();
  panelShadowMat = new THREE.MeshBasicMaterial({
    map: glowTex,
    color: 0x000000,
    transparent: true,
    opacity: 0.08,
    depthWrite: false,
  });
  var badgeTex = badgeTexture();
  var panelShadowMat; /* glowTex を作った所で用意する(ここで null を代入すると上書きしてしまうため宣言だけ) */
  /* 通路の内側: 展示室どうしをつなぐ暗い通路。入口側は部屋の明かりが少し届き、奥はすぐに黒へ沈む。
   突き当たりが見えないので、壁のくぼみではなく「先へ続く通路」に見える(照明の計算をしない面にグラデーションを描く) */
  function passGradient(dir) {
    /* dir: 'a'=左側壁 / 'b'=右側壁 / 'v'=天井(縦向き) */
    var c = document.createElement('canvas'),
      v = dir === 'v';
    c.width = v ? 4 : 256;
    c.height = v ? 256 : 4;
    var g = c.getContext('2d'),
      gr = v ? g.createLinearGradient(0, 0, 0, 256) : g.createLinearGradient(0, 0, 256, 0);
    var near = dir === 'b' ? 1 : 0,
      far = 1 - near;
    if (v) {
      near = 0;
      far = 1;
    }
    gr.addColorStop(near, '#ffffff');
    gr.addColorStop(near + (far - near) * 0.18, '#8a8986');
    gr.addColorStop(near + (far - near) * 0.45, '#1a1a1a');
    gr.addColorStop(far, '#000000');
    g.fillStyle = gr;
    g.fillRect(0, 0, c.width, c.height);
    return new THREE.CanvasTexture(c);
  }
  var passSideA = new THREE.MeshBasicMaterial({ map: passGradient('a') }),
    passSideB = new THREE.MeshBasicMaterial({ map: passGradient('b') });
  var passEndMat = new THREE.MeshBasicMaterial({ color: 0x000000 }),
    passCeilMat = new THREE.MeshBasicMaterial({ map: passGradient('v') });
  var pickMat = new THREE.MeshBasicMaterial({
    visible: false,
  }); /* 入口(開口部)のタップ判定用(見えない板) */
  var lampMat = new THREE.MeshBasicMaterial({ color: 0xfff6e6 });
  var fixtureMat = new THREE.MeshPhongMaterial({
    color: 0x1e1e20,
    specular: 0x555558,
    shininess: 60,
  }); /* レールと器具(つや消しの黒) */ /* ライトヘッドの発光面 */
  var lampGlowMat = new THREE.MeshBasicMaterial({
    map: glowTex,
    color: 0xffe2a8,
    transparent: true,
    opacity: 0.95,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  var beamTex = (function () {
    /* 上が明るく下へ消える台形の光の筋 */
    var c = document.createElement('canvas');
    c.width = 128;
    c.height = 256;
    var g = c.getContext('2d');
    var gr = g.createLinearGradient(0, 0, 0, 256);
    gr.addColorStop(0, 'rgba(255,255,255,.9)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.beginPath();
    g.moveTo(44, 0);
    g.lineTo(84, 0);
    g.lineTo(128, 256);
    g.lineTo(0, 256);
    g.closePath();
    g.fill();
    return new THREE.CanvasTexture(c);
  })();
  var lampBeamMat = new THREE.MeshBasicMaterial({
    map: beamTex,
    color: 0xffe2a8,
    transparent: true,
    opacity: 0.2,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  var washMat = new THREE.MeshBasicMaterial({
    map: glowTex,
    color: 0xffe8c0,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  function mix(a, b, k) {
    function ch(sh) {
      var x = (a >> sh) & 255,
        y = (b >> sh) & 255;
      return Math.round(x + (y - x) * k);
    }
    return (ch(16) << 16) | (ch(8) << 8) | ch(0);
  }
  /* 面取り付きの直方体
     縁に小さな斜面が入り、照明のハイライトが縁に走って角がシャープに見える。同じ寸法の形状は使い回す */
  var geoCache = {};
  function bevelGeo(sx, sy, sz) {
    var b = Math.min(0.03, Math.min(sx, sy, sz) / 4);
    var key = [sx, sy, sz]
      .map(function (v) {
        return v.toFixed(3);
      })
      .join();
    if (geoCache[key]) return geoCache[key];
    var w = sx - 2 * b,
      h = sy - 2 * b,
      s = new THREE.Shape();
    s.moveTo(-w / 2, -h / 2);
    s.lineTo(w / 2, -h / 2);
    s.lineTo(w / 2, h / 2);
    s.lineTo(-w / 2, h / 2);
    s.closePath();
    var gm = new THREE.ExtrudeGeometry(s, {
      depth: sz - 2 * b,
      bevelEnabled: true,
      bevelThickness: b,
      bevelSize: b,
      bevelSegments: LOW ? 1 : 2,
      curveSegments: 1,
    });
    gm.translate(0, 0, -(sz - 2 * b) / 2);
    geoCache[key] = gm;
    return gm;
  }
  /* メッシュの頂点・法線をワールド座標へ変換した配列を返す(形状の clone は使わない。ExtrudeGeometry は引数なしで複製できないため) */
  var tmpV = new THREE.Vector3();
  function worldArrays(m) {
    var a = m.geometry.attributes,
      pa = a.position.array,
      na = a.normal.array;
    var mat = m.matrixWorld,
      nm = new THREE.Matrix3().getNormalMatrix(mat);
    var pos = new Float32Array(pa.length),
      nor = new Float32Array(na.length),
      k;
    for (k = 0; k < pa.length; k += 3) {
      tmpV.set(pa[k], pa[k + 1], pa[k + 2]).applyMatrix4(mat);
      pos[k] = tmpV.x;
      pos[k + 1] = tmpV.y;
      pos[k + 2] = tmpV.z;
      tmpV
        .set(na[k], na[k + 1], na[k + 2])
        .applyMatrix3(nm)
        .normalize();
      nor[k] = tmpV.x;
      nor[k + 1] = tmpV.y;
      nor[k + 2] = tmpV.z;
    }
    return { position: pos, normal: nor, uv: a.uv.array };
  }
  /* 結合: 材質ごとに頂点をまとめて1メッシュにする(描画命令 数百 → 約10) */
  function flushMerged(group, list) {
    var gs = [],
      i;
    list.forEach(function (m) {
      var e = null;
      for (i = 0; i < gs.length; i++)
        if (gs[i].mat === m.material) {
          e = gs[i];
          break;
        }
      if (!e) {
        e = { mat: m.material, parts: [] };
        gs.push(e);
      }
      e.parts.push(worldArrays(m));
    });
    var verts = 0;
    gs.forEach(function (e) {
      var r = core.mergeAttributes(e.parts);
      var mg = new THREE.BufferGeometry();
      mg.setAttribute('position', new THREE.Float32BufferAttribute(r.position, 3));
      mg.setAttribute('normal', new THREE.Float32BufferAttribute(r.normal, 3));
      mg.setAttribute('uv', new THREE.Float32BufferAttribute(r.uv, 2));
      group.add(new THREE.Mesh(mg, e.mat));
      verts += r.position.length / 3;
    });
    return { meshes: gs.length, verts: verts, parts: list.length };
  }

  return {
    bannerTexture: bannerTexture,
    rr: rr,
    tex: tex,
    fitText: fitText,
    iconStat: iconStat,
    artTexture: artTexture,
    plaqueTexture: plaqueTexture,
    badgeTexture: badgeTexture,
    glowTexture: glowTexture,
    woodCanvas: woodCanvas,
    FLOOR_S: FLOOR_S,
    floorTileMat: floorTileMat,
    passFloorMat: passFloorMat,
    floorQuad: floorQuad,
    captionTexture: captionTexture,
    matte: matte,
    ceilMat: ceilMat,
    trimMat: trimMat,
    brassMat: brassMat,
    darkMat: darkMat,
    linerMat: linerMat,
    frameMatV: frameMatV,
    frameMatH: frameMatH,
    benchMat: benchMat,
    skyMat: skyMat,
    matMat: matMat,
    frameBlackMat: frameBlackMat,
    frameOakMat: frameOakMat,
    frameBoxMat: frameBoxMat,
    FRAMES: FRAMES,
    glowTex: glowTex,
    panelShadowMat: panelShadowMat,
    badgeTex: badgeTex,
    passSideA: passSideA,
    passSideB: passSideB,
    passEndMat: passEndMat,
    passCeilMat: passCeilMat,
    pickMat: pickMat,
    lampMat: lampMat,
    fixtureMat: fixtureMat,
    lampGlowMat: lampGlowMat,
    lampBeamMat: lampBeamMat,
    washMat: washMat,
    mix: mix,
    bevelGeo: bevelGeo,
    flushMerged: flushMerged,
  };
}

export default { create: create };
