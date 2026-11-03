/* デスクトップ風ランチャーのアイコン配置の計算(DOM非依存。Nodeでテスト可能)
   座標はマス目 [列, 行]。Windows と同じく「左上から下へ、列が埋まったら右の列へ」の順(列優先)で並べる */
(function (root) {
  'use strict';

  /* アイコンの大きさ(Windows の 大/中/小 アイコン): icon=絵の大きさ, cw/ch=1マスの幅・高さ(px) */
  var SIZES = {
    large: { icon: 72, cw: 112, ch: 124, label: '大アイコン' },
    medium: { icon: 48, cw: 92, ch: 96, label: '中アイコン' },
    small: { icon: 32, cw: 80, ch: 74, label: '小アイコン' },
  };
  var PAD = 8; /* デスクトップの端の余白(px) */

  /* 表示領域 w×h から、マスの数と左上の位置を求める(最低 1×1) */
  function metrics(w, h, size) {
    var s = SIZES[size] || SIZES.medium;
    var cols = Math.max(1, Math.floor((w - PAD * 2) / s.cw)),
      rows = Math.max(1, Math.floor((h - PAD * 2) / s.ch));
    return { cw: s.cw, ch: s.ch, icon: s.icon, cols: cols, rows: rows, ox: PAD, oy: PAD };
  }
  function key(c, r) {
    return c + ',' + r;
  }
  function inside(p, cols, rows) {
    return p && p[0] >= 0 && p[1] >= 0 && p[0] < cols && p[1] < rows;
  }

  /* 列優先で最初の空きマス(空きが無ければ null) */
  function firstFree(occ, cols, rows) {
    for (var c = 0; c < cols; c++) for (var r = 0; r < rows; r++) if (!occ[key(c, r)]) return [c, r];
    return null;
  }
  /* (c,r) に最も近い空きマス。距離が同じなら列優先の順で先のもの */
  function nearestFree(occ, c, r, cols, rows) {
    var best = null,
      bd = Infinity;
    for (var x = 0; x < cols; x++)
      for (var y = 0; y < rows; y++) {
        if (occ[key(x, y)]) continue;
        var d = (x - c) * (x - c) + (y - r) * (y - r);
        if (d < bd) {
          bd = d;
          best = [x, y];
        }
      }
    return best;
  }

  /* 表示する配置を決める。order=アイコンのid順(並び順の優先度)、saved={id:[c,r]}。
     保存位置が画面内で空いていればそこに、画面外・重なり・未保存のものは空きマスへ(列優先)。
     マスが足りない時は、はみ出す分を最後の列の下へ続けて置く(スクロールで見える) */
  function resolve(order, saved, cols, rows) {
    var out = {},
      occ = {},
      rest = [];
    order.forEach(function (id) {
      var p = saved && saved[id];
      if (inside(p, cols, rows) && !occ[key(p[0], p[1])]) {
        out[id] = [p[0], p[1]];
        occ[key(p[0], p[1])] = id;
      } else rest.push(id);
    });
    var extra = 0;
    rest.forEach(function (id) {
      var p = firstFree(occ, cols, rows);
      if (!p) {
        p = [cols - 1, rows + extra];
        extra++;
      }
      out[id] = p;
      occ[key(p[0], p[1])] = id;
    });
    return out;
  }

  /* 選んだアイコン(ids)をまとめて (dc,dr) マス動かす。相対的な並びは保つ。
     行き先が画面外なら端に寄せ、他のアイコンと重なる時はいちばん近い空きマスへ */
  function moveGroup(pos, ids, dc, dr, cols, rows) {
    var out = {},
      occ = {},
      id,
      set = {};
    ids.forEach(function (i) {
      set[i] = 1;
    });
    for (id in pos)
      if (!set[id]) {
        out[id] = pos[id].slice();
        occ[key(pos[id][0], pos[id][1])] = id;
      }
    /* 動かす先に近い順(先頭=つかんだアイコン)ではなく、元の並び順で置く。重なりは後の方がよける */
    ids.forEach(function (i) {
      var p = pos[i];
      if (!p) return;
      var c = Math.max(0, Math.min(cols - 1, p[0] + dc)),
        r = Math.max(0, Math.min(rows - 1, p[1] + dr));
      var q = occ[key(c, r)] ? nearestFree(occ, c, r, cols, rows) : [c, r];
      if (!q) q = p.slice();
      out[i] = q;
      occ[key(q[0], q[1])] = i;
    });
    return out;
  }

  /* 並べ替え: list=[{id,title,cat}] を by('name'|'cat') の順に列優先で詰める */
  function sorted(list, by, cols, rows) {
    var arr = list.slice();
    var cmp = function (a, b) {
      return String(a.title).localeCompare(String(b.title), 'ja');
    };
    if (by === 'cat') {
      var catOrder = {};
      list.forEach(function (t) {
        if (!(t.cat in catOrder)) catOrder[t.cat] = Object.keys(catOrder).length;
      });
      arr.sort(function (a, b) {
        return catOrder[a.cat] - catOrder[b.cat] || cmp(a, b);
      });
    } else arr.sort(cmp);
    return resolve(
      arr.map(function (t) {
        return t.id;
      }),
      {},
      cols,
      rows
    );
  }

  /* 画面上の点(x,y)が入るマス(画面外なら端のマスに丸める) */
  function cellAt(x, y, m) {
    var c = Math.floor((x - m.ox) / m.cw),
      r = Math.floor((y - m.oy) / m.ch);
    return [Math.max(0, Math.min(m.cols - 1, c)), Math.max(0, Math.min(m.rows - 1, r))];
  }
  /* マスの左上の画面座標 */
  function cellXY(p, m) {
    return { x: m.ox + p[0] * m.cw, y: m.oy + p[1] * m.ch };
  }

  /* 範囲選択: 矩形 a(x0,y0,x1,y1) とアイコンの矩形 b が重なるか */
  function overlaps(a, b) {
    return a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0;
  }

  /* 矢印キーで選択を動かす: from から dir 方向にある、いちばん近いアイコンの id */
  function neighbor(pos, from, dir) {
    var p = pos[from];
    if (!p) return null;
    var dx = { left: -1, right: 1, up: 0, down: 0 }[dir],
      dy = { left: 0, right: 0, up: -1, down: 1 }[dir],
      best = null,
      bd = Infinity,
      id;
    for (id in pos) {
      if (id === from) continue;
      var q = pos[id],
        vx = q[0] - p[0],
        vy = q[1] - p[1];
      var along = vx * dx + vy * dy;
      if (along <= 0) continue;
      var side = Math.abs(vx * dy) + Math.abs(vy * dx),
        d = along + side * 2;
      if (d < bd) {
        bd = d;
        best = id;
      }
    }
    return best;
  }

  /* 保存データの読み込み(壊れていても安全に既定値へ) */
  function parseState(raw) {
    var st = { size: 'medium', pos: {}, folders: [] };
    if (!raw) return st;
    var o = JSON.parse(raw);
    if (o && typeof o === 'object') {
      if (SIZES[o.size]) st.size = o.size;
      if (o.pos && typeof o.pos === 'object') {
        for (var k in o.pos) {
          var p = o.pos[k];
          if (Array.isArray(p) && p.length === 2 && isFinite(p[0]) && isFinite(p[1]))
            st.pos[k] = [p[0] | 0, p[1] | 0];
        }
      }
      if (Array.isArray(o.folders)) {
        var seenF = {},
          seenT = {};
        o.folders.forEach(function (f) {
          if (!f || typeof f.id !== 'string' || !/^f\d+$/.test(f.id) || seenF[f.id]) return;
          seenF[f.id] = 1;
          var items = (Array.isArray(f.items) ? f.items : []).filter(function (id) {
            if (typeof id !== 'string' || seenT[id]) return false; /* 1つのツールは1つのフォルダだけ */
            seenT[id] = 1;
            return true;
          });
          st.folders.push({ id: f.id, name: String(f.name || '新しいフォルダ').slice(0, 40), items: items });
        });
      }
    }
    return st;
  }

  /* フォルダ。デスクトップ上の id は 'folder:f1' の形にして、ツールの id と区別する */
  var FKEY = 'folder:';
  function folderKey(fid) {
    return FKEY + fid;
  }
  function isFolderKey(id) {
    return String(id).indexOf(FKEY) === 0;
  }
  function folderById(st, fid) {
    return st.folders.filter(function (f) {
      return f.id === fid;
    })[0];
  }
  /* 名前が重なる時は「新しいフォルダ (2)」のように番号を付ける */
  function uniqueName(st, base) {
    var names = st.folders.map(function (f) {
      return f.name;
    });
    if (names.indexOf(base) < 0) return base;
    for (var n = 2; ; n++) if (names.indexOf(base + ' (' + n + ')') < 0) return base + ' (' + n + ')';
  }
  function addFolder(st, name) {
    var n = 1;
    while (folderById(st, 'f' + n)) n++;
    var f = { id: 'f' + n, name: uniqueName(st, name || '新しいフォルダ'), items: [] };
    st.folders.push(f);
    return f;
  }
  /* ツールをフォルダへ入れる(別のフォルダに入っていたら移す)。フォルダ自体は入れない。入れた数を返す */
  function moveToFolder(st, ids, fid) {
    var f = folderById(st, fid);
    if (!f) return 0;
    var n = 0;
    ids.forEach(function (id) {
      if (isFolderKey(id)) return;
      st.folders.forEach(function (g) {
        var i = g.items.indexOf(id);
        if (i >= 0) g.items.splice(i, 1);
      });
      f.items.push(id);
      delete st.pos[id];
      n++;
    });
    return n;
  }
  /* フォルダから出す(デスクトップに戻す)。出した数を返す */
  function takeOut(st, ids) {
    var n = 0;
    st.folders.forEach(function (f) {
      f.items = f.items.filter(function (id) {
        if (ids.indexOf(id) < 0) return true;
        n++;
        return false;
      });
    });
    return n;
  }
  /* フォルダを消す。中のツールはデスクトップに戻す。戻した数を返す */
  function deleteFolder(st, fid) {
    var f = folderById(st, fid);
    if (!f) return 0;
    st.folders = st.folders.filter(function (g) {
      return g !== f;
    });
    delete st.pos[folderKey(fid)];
    return f.items.length;
  }
  function renameFolder(st, fid, name) {
    var f = folderById(st, fid);
    name = String(name || '')
      .trim()
      .slice(0, 40);
    if (!f || !name) return false;
    f.name = name;
    return true;
  }
  /* デスクトップに出すアイコンの並び: フォルダに入っていないツール(一覧の順) + フォルダ */
  function desktopOrder(toolIds, st) {
    var inside = {};
    st.folders.forEach(function (f) {
      f.items.forEach(function (id) {
        inside[id] = 1;
      });
    });
    return toolIds
      .filter(function (id) {
        return !inside[id];
      })
      .concat(
        st.folders.map(function (f) {
          return folderKey(f.id);
        })
      );
  }

  var api = {
    folderKey: folderKey,
    isFolderKey: isFolderKey,
    folderById: folderById,
    addFolder: addFolder,
    moveToFolder: moveToFolder,
    takeOut: takeOut,
    deleteFolder: deleteFolder,
    renameFolder: renameFolder,
    desktopOrder: desktopOrder,
    SIZES: SIZES,
    metrics: metrics,
    firstFree: firstFree,
    nearestFree: nearestFree,
    resolve: resolve,
    moveGroup: moveGroup,
    sorted: sorted,
    cellAt: cellAt,
    cellXY: cellXY,
    overlaps: overlaps,
    neighbor: neighbor,
    parseState: parseState,
    key: key,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.DesktopCore = api;
})(this);
