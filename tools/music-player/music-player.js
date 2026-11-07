/* 音楽プレイヤーの画面。プレイリストの保存は music-player-db.js */
(function () {
  const fileInput = document.getElementById('fileInput');
  const folderInput = document.getElementById('folderInput');
  const albumArt = document.getElementById('albumArt');
  const artPlaceholder = document.getElementById('artPlaceholder');
  const trackTitle = document.getElementById('trackTitle');
  const trackArtist = document.getElementById('trackArtist');
  const seekSlider = document.getElementById('seekSlider');
  const curTime = document.getElementById('curTime');
  const durTime = document.getElementById('durTime');
  const playBtn = document.getElementById('playBtn');
  const playIcon = document.getElementById('playIcon');
  const pauseIcon = document.getElementById('pauseIcon');
  const prevBtn = document.getElementById('prevBtn');
  const nextBtn = document.getElementById('nextBtn');
  const shuffleBtn = document.getElementById('shuffleBtn');
  const repeatBtn = document.getElementById('repeatBtn');
  const repeatIcon = document.getElementById('repeatIcon');
  const repeatOneIcon = document.getElementById('repeatOneIcon');
  const volumeSlider = document.getElementById('volumeSlider');
  const playlistBody = document.getElementById('playlistBody');
  const statusText = document.getElementById('statusText');

  const AUDIO_EXT = /\.(mp3|wav|ogg|m4a|flac|aac|opus)$/i;
  const audio = new Audio();
  let tracks = []; // { id, name, artist, album, blob, pictureDataUrl, order, url }
  let currentTrackId = null;
  let shuffle = false;
  let repeatMode = 'off'; // off | all | one
  let seeking = false;
  let dragState = null;

  function fmtTime(sec) {
    if (!isFinite(sec)) return '0:00';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${String(s).padStart(2, '0')}`;
  }
  const esc = ToolKit.esc;
  function posOf(id) {
    return `${tracks.findIndex((t) => t.id === id) + 1} / ${tracks.length}曲目`;
  }
  const REPEAT = { off: 'オフ', all: '全曲', one: '1曲' };
  function currentIndex() {
    return tracks.findIndex((t) => t.id === currentTrackId);
  }

  // ID3タグ読み取り
  function pictureToDataUrl(picture) {
    if (!picture || !picture.data) return null;
    const bytes = new Uint8Array(picture.data);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    return `data:${picture.format};base64,${btoa(binary)}`;
  }
  function readTags(file) {
    return new Promise((resolve) => {
      if (!window.jsmediatags) {
        resolve({});
        return;
      }
      window.jsmediatags.read(file, {
        onSuccess: (tag) => resolve(tag.tags || {}),
        onError: (e) => {
          log.debug('曲のタグを読めませんでした(' + ((e && e.type) || '不明') + ')');
          resolve({});
        },
      });
    });
  }

  // 描画
  function renderNowPlaying() {
    const t = tracks.find((t) => t.id === currentTrackId);
    if (!t) {
      trackTitle.textContent = '曲を選択してください';
      trackArtist.textContent = '';
      albumArt.hidden = true;
      artPlaceholder.style.display = 'flex';
      return;
    }
    trackTitle.textContent = t.name;
    trackArtist.textContent = t.artist || '';
    if (t.pictureDataUrl) {
      albumArt.src = t.pictureDataUrl;
      albumArt.hidden = false;
      artPlaceholder.style.display = 'none';
    } else {
      albumArt.hidden = true;
      artPlaceholder.style.display = 'flex';
    }
  }

  function renderPlaylist() {
    playlistBody.innerHTML = '';
    tracks.forEach((t, i) => {
      const row = document.createElement('tr');
      row.className = t.id === currentTrackId ? 'playing' : '';
      row.dataset.id = t.id;
      /* 操作ログは曲名を出さず、番号で「曲 3」の「曲名」を押下しました…と書く */
      row.setAttribute('data-log-group', `曲 ${i + 1}`);
      row.innerHTML = `
        <td class="handle-cell">
          <svg viewBox="0 0 24 24" width="16" height="16"><circle cx="9" cy="6" r="1.5" fill="currentColor"/><circle cx="15" cy="6" r="1.5" fill="currentColor"/><circle cx="9" cy="12" r="1.5" fill="currentColor"/><circle cx="15" cy="12" r="1.5" fill="currentColor"/><circle cx="9" cy="18" r="1.5" fill="currentColor"/><circle cx="15" cy="18" r="1.5" fill="currentColor"/></svg>
        </td>
        <td class="thumb-cell">${t.pictureDataUrl ? `<img src="${t.pictureDataUrl}">` : ''}</td>
        <td class="name-cell" data-log="曲名">${esc(t.name)}</td>
        <td class="artist-cell" data-log="アーティスト">${esc(t.artist || '')}</td>
        <td class="album-cell">${esc(t.album || '')}</td>
        <td class="remove-cell"><button type="button" aria-label="削除"><svg viewBox="0 0 24 24" width="14" height="14"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button></td>
      `;
      const pick = () => {
        playTrack(t.id);
      };
      row.querySelector('.name-cell').addEventListener('click', pick);
      row.querySelector('.artist-cell').addEventListener('click', pick);
      row.querySelector('.remove-cell button').addEventListener('click', (e) => {
        e.stopPropagation();
        removeTrack(t.id).catch((er) => log.error('曲の削除でエラーが発生しました', er));
      });
      attachDragHandlers(row.querySelector('.handle-cell'), row);
      playlistBody.appendChild(row);
    });
  }

  // 永続化(IndexedDB)
  async function loadFromDb() {
    const t0 = performance.now();
    let records;
    try {
      records = await window.PlayerDB.getAll();
    } catch (e) {
      log.error('保存したプレイリストの読み込みでエラーが発生しました', e);
      return;
    }
    records.sort((a, b) => a.order - b.order);
    tracks = records.map((r) => ({ ...r, url: URL.createObjectURL(r.blob) }));
    renderPlaylist();
    if (tracks.length) statusText.textContent = '';
    log(
      `起動しました(保存したプレイリスト ${tracks.length}曲 / ${Math.round(performance.now() - t0)}ms)`,
    );
  }

  async function addFiles(fileList) {
    const all = Array.from(fileList),
      files = all.filter((f) => f.type.startsWith('audio/') || AUDIO_EXT.test(f.name));
    if (all.length > files.length)
      log.warn(`音声ではないファイルを除きました(${all.length - files.length}件)`);
    if (!files.length) {
      log.warn('追加できる音声ファイルがありませんでした');
      return;
    }
    statusText.textContent = 'タグを読み込み中…';
    const t0 = performance.now();
    let saved = 0;
    let order = tracks.length ? Math.max(...tracks.map((t) => t.order)) + 1 : 0;
    for (const file of files) {
      const tags = await readTags(file);
      const record = {
        name: tags.title || file.name.replace(/\.[^/.]+$/, ''),
        artist: tags.artist || '',
        album: tags.album || '',
        blob: file,
        pictureDataUrl: pictureToDataUrl(tags.picture),
        order: order++,
      };
      let id;
      try {
        id = await window.PlayerDB.add(record);
        saved++;
      } catch (e) {
        log.warn(
          '曲を端末に保存できませんでした(次回は復元されません / 保存容量を確認してください)',
          e,
        );
        id = 'tmp-' + Date.now() + Math.random();
      }
      tracks.push({ ...record, id, url: URL.createObjectURL(file) });
    }
    statusText.textContent = '';
    log(
      `曲を追加しました(${files.length}曲 / 端末に保存 ${saved}曲 / 全 ${tracks.length}曲 / ${Math.round(performance.now() - t0)}ms)`,
    );
    renderPlaylist();
    if (currentTrackId === null && tracks.length) playTrack(tracks[0].id);
  }

  async function removeTrack(id) {
    ToolKit.vibrate();
    const t = tracks.find((t) => t.id === id);
    if (!t) return;
    URL.revokeObjectURL(t.url);
    if (typeof id === 'number') await window.PlayerDB.remove(id);
    tracks = tracks.filter((t) => t.id !== id);
    if (id === currentTrackId) {
      audio.pause();
      audio.removeAttribute('src');
      currentTrackId = null;
      renderNowPlaying();
    }
    renderPlaylist();
    log(`曲を削除しました(残り ${tracks.length}曲)`);
  }

  // 再生制御
  function playTrack(id) {
    const t = tracks.find((t) => t.id === id);
    if (!t) return;
    currentTrackId = id;
    audio.src = t.url;
    audio.play().then(
      () => log(`再生しました(${posOf(id)})`),
      (e) => log.warn('再生を開始できませんでした(形式に対応していないか、操作が必要です)', e),
    );
    renderNowPlaying();
    renderPlaylist();
    ToolKit.vibrate();
  }

  function pickNextId() {
    if (!tracks.length) return null;
    const idx = currentIndex();
    if (shuffle) {
      if (tracks.length === 1) return tracks[0].id;
      let n;
      do {
        n = Math.floor(Math.random() * tracks.length);
      } while (n === idx);
      return tracks[n].id;
    }
    return tracks[(idx + 1) % tracks.length].id;
  }
  function pickPrevId() {
    if (!tracks.length) return null;
    const idx = currentIndex();
    return tracks[(idx - 1 + tracks.length) % tracks.length].id;
  }

  fileInput.addEventListener('change', () => {
    addFiles(fileInput.files).catch((e) => log.error('曲の追加でエラーが発生しました', e));
    fileInput.value = '';
  });
  folderInput.addEventListener('change', () => {
    addFiles(folderInput.files).catch((e) => log.error('曲の追加でエラーが発生しました', e));
    folderInput.value = '';
  });

  playBtn.addEventListener('click', () => {
    ToolKit.vibrate();
    if (currentTrackId === null) {
      if (tracks.length) playTrack(tracks[0].id);
      else log.warn('曲が無いため再生できませんでした');
      return;
    }
    if (audio.paused)
      audio.play().then(
        () => log(`再生を再開しました(${fmtTime(audio.currentTime)})`),
        (e) => log.warn('再生を開始できませんでした', e),
      );
    else {
      audio.pause();
      log(`一時停止しました(${fmtTime(audio.currentTime)})`);
    }
  });
  prevBtn.addEventListener('click', () => {
    ToolKit.vibrate();
    const id = pickPrevId();
    if (id !== null) playTrack(id);
    else log.warn('曲が無いため移動できませんでした');
  });
  nextBtn.addEventListener('click', () => {
    ToolKit.vibrate();
    const id = pickNextId();
    if (id !== null) playTrack(id);
    else log.warn('曲が無いため移動できませんでした');
  });

  shuffleBtn.addEventListener('click', () => {
    ToolKit.vibrate();
    shuffle = !shuffle;
    shuffleBtn.classList.toggle('active', shuffle);
    log(`シャッフルを ${shuffle ? 'ON' : 'OFF'} にしました`);
  });
  repeatBtn.addEventListener('click', () => {
    ToolKit.vibrate();
    repeatMode = repeatMode === 'off' ? 'all' : repeatMode === 'all' ? 'one' : 'off';
    repeatIcon.style.display = repeatMode === 'one' ? 'none' : '';
    repeatOneIcon.style.display = repeatMode === 'one' ? '' : 'none';
    repeatBtn.classList.toggle('active', repeatMode !== 'off');
    log(`リピートを「${REPEAT[repeatMode]}」にしました`);
  });

  audio.addEventListener('play', () => {
    playIcon.style.display = 'none';
    pauseIcon.style.display = '';
  });
  audio.addEventListener('pause', () => {
    playIcon.style.display = '';
    pauseIcon.style.display = 'none';
  });
  audio.addEventListener('timeupdate', () => {
    if (seeking) return;
    curTime.textContent = fmtTime(audio.currentTime);
    if (audio.duration) seekSlider.value = (audio.currentTime / audio.duration) * 100;
  });
  audio.addEventListener('loadedmetadata', () => {
    durTime.textContent = fmtTime(audio.duration);
  });
  audio.addEventListener('ended', () => {
    log(`曲の再生が終わりました(${posOf(currentTrackId)})`);
    if (repeatMode === 'one') {
      audio.currentTime = 0;
      audio.play().catch((e) => log.warn('リピート再生を開始できませんでした', e));
      return;
    }
    const idx = currentIndex();
    if (repeatMode === 'off' && !shuffle && idx === tracks.length - 1) {
      log('最後の曲が終わったため停止しました');
      return;
    }
    const id = pickNextId();
    if (id !== null) playTrack(id);
  });

  seekSlider.addEventListener('input', () => {
    seeking = true;
  });
  seekSlider.addEventListener('change', () => {
    if (audio.duration) {
      audio.currentTime = (seekSlider.value / 100) * audio.duration;
      log(`再生位置を変更しました(${fmtTime(audio.currentTime)} / ${fmtTime(audio.duration)})`);
    } else {
      seekSlider.value = 0;
      log.warn('再生中の曲が無いため、再生位置を変更できませんでした');
    }
    seeking = false;
  });
  volumeSlider.addEventListener('input', () => {
    audio.volume = parseFloat(volumeSlider.value);
  });
  audio.addEventListener('error', () => {
    if (audio.getAttribute('src'))
      log.error(
        '曲を再生できませんでした(ファイルが壊れているか、形式に対応していません)',
        audio.error && audio.error.message,
      );
  });

  // 並び替え(ポインタドラッグ)
  function attachDragHandlers(handleEl, row) {
    handleEl.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      dragState = { row };
      row.classList.add('dragging');
      handleEl.setPointerCapture(e.pointerId);
    });
  }
  window.addEventListener('pointermove', (e) => {
    if (!dragState) return;
    const rows = [...playlistBody.children];
    const overRow = rows.find((r) => {
      const rect = r.getBoundingClientRect();
      return e.clientY >= rect.top && e.clientY <= rect.bottom;
    });
    if (overRow && overRow !== dragState.row) {
      const overIdx = rows.indexOf(overRow);
      const curIdx = rows.indexOf(dragState.row);
      if (overIdx < curIdx) playlistBody.insertBefore(dragState.row, overRow);
      else playlistBody.insertBefore(dragState.row, overRow.nextSibling);
    }
  });
  window.addEventListener('pointerup', async () => {
    if (!dragState) return;
    dragState.row.classList.remove('dragging');
    dragState = null;
    const newIds = [...playlistBody.children].map((r) => parseInt(r.dataset.id, 10));
    tracks.sort((a, b) => newIds.indexOf(a.id) - newIds.indexOf(b.id));
    tracks.forEach((t, i) => {
      t.order = i;
    });
    log(`曲の並び順を変更しました(${tracks.length}曲)`);
    try {
      await Promise.all(
        tracks
          .filter((t) => typeof t.id === 'number')
          .map((t) =>
            window.PlayerDB.put({
              id: t.id,
              name: t.name,
              artist: t.artist,
              album: t.album,
              blob: t.blob,
              pictureDataUrl: t.pictureDataUrl,
              order: t.order,
            }),
          ),
      );
    } catch (e) {
      log.warn('並び順の保存に失敗しました', e);
    }
    ToolKit.vibrate();
  });

  window.addEventListener('pagehide', () => {
    tracks.forEach((t) => URL.revokeObjectURL(t.url));
  });

  if (!window.jsmediatags)
    log.warn('曲のタグを読むライブラリ(jsmediatags)を読み込めませんでした(ファイル名で表示します)');
  loadFromDb().catch((e) => log.error('起動時の読み込みでエラーが発生しました', e));
})();
