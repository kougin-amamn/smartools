/* 動画プレイヤーの画面。プレイリスト・速度・全画面 */
(function () {
  const fileInput = document.getElementById('fileInput');
  const video = document.getElementById('video');
  const emptyState = document.getElementById('emptyState');
  const trackTitle = document.getElementById('trackTitle');
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
  const speedBtn = document.getElementById('speedBtn');
  const volumeSlider = document.getElementById('volumeSlider');
  const fullscreenBtn = document.getElementById('fullscreenBtn');
  const playlistEl = document.getElementById('playlist');
  const statusText = document.getElementById('statusText');
  const playerWrap = document.querySelector('.player-wrap');
  const exitFsBtn = document.getElementById('exitFsBtn');

  const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];
  let speedIdx = 2;
  let videos = []; // { id, name, url, thumb }
  let currentId = null;
  let shuffle = false;
  let repeatMode = 'off'; // off | all | one
  let seeking = false;

  function fmtTime(sec) {
    if (!isFinite(sec)) return '0:00';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${String(s).padStart(2, '0')}`;
  }
  const esc = ToolKit.esc;
  function posOf(id) {
    return `${videos.findIndex((v) => v.id === id) + 1} / ${videos.length}本目`;
  }
  const REPEAT = { off: 'オフ', all: '全部', one: '1本' };
  function currentIndex() {
    return videos.findIndex((v) => v.id === currentId);
  }

  function makeThumb(url) {
    return new Promise((resolve) => {
      const v = document.createElement('video');
      v.src = url;
      v.muted = true;
      v.playsInline = true;
      v.addEventListener('loadeddata', () => {
        v.currentTime = Math.min(1, (v.duration || 2) / 2);
      });
      v.addEventListener(
        'seeked',
        () => {
          const c = document.createElement('canvas');
          c.width = 112;
          c.height = 63;
          const ctx = c.getContext('2d');
          try {
            ctx.drawImage(v, 0, 0, c.width, c.height);
            resolve(c.toDataURL('image/jpeg', 0.7));
          } catch (e) {
            log.debug('サムネイルを作れませんでした');
            resolve(null);
          }
        },
        { once: true }
      );
      v.addEventListener('error', () => resolve(null));
    });
  }

  function renderPlaylist() {
    playlistEl.innerHTML = '';
    videos.forEach((v) => {
      const row = document.createElement('div');
      row.className = 'video-row' + (v.id === currentId ? ' playing' : '');
      row.innerHTML = `
        ${v.thumb ? `<img class="thumb" src="${v.thumb}">` : '<div class="thumb"></div>'}
        <span class="name">${esc(v.name)}</span>
        <button class="remove" type="button">
          <svg viewBox="0 0 24 24" width="14" height="14"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
        </button>
      `;
      row.addEventListener('click', (e) => {
        if (e.target.closest('.remove')) return;
        log(`プレイリストの動画を押下しました(${posOf(v.id)})`);
        playVideo(v.id);
      });
      row.querySelector('.remove').addEventListener('click', (e) => {
        e.stopPropagation();
        log(`削除ボタンを押下しました(${posOf(v.id)})`);
        removeVideo(v.id);
      });
      playlistEl.appendChild(row);
    });
  }

  async function addFiles(fileList) {
    const all = Array.from(fileList),
      files = all.filter((f) => f.type.startsWith('video/'));
    if (all.length > files.length)
      log.warn(`動画ではないファイルを除きました(${all.length - files.length}件)`);
    if (!files.length) {
      log.warn('追加できる動画がありませんでした');
      return;
    }
    for (const file of files) {
      const url = URL.createObjectURL(file);
      const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      const item = { id, name: file.name.replace(/\.[^/.]+$/, ''), url, thumb: null };
      videos.push(item);
      renderPlaylist();
      if (currentId === null) playVideo(id);
      makeThumb(url).then((thumb) => {
        item.thumb = thumb;
        renderPlaylist();
      });
    }
    statusText.textContent = '';
    log(
      `動画を追加しました(${files.length}本 / 全 ${videos.length}本 / ${(files.reduce((s, f) => s + f.size, 0) / 1024 / 1024).toFixed(1)}MB)`
    );
  }

  function removeVideo(id) {
    ToolKit.vibrate();
    const v = videos.find((v) => v.id === id);
    if (!v) return;
    URL.revokeObjectURL(v.url);
    videos = videos.filter((v) => v.id !== id);
    if (id === currentId) {
      video.pause();
      video.removeAttribute('src');
      currentId = null;
      trackTitle.textContent = '';
      emptyState.style.display = 'flex';
    }
    renderPlaylist();
    log(`動画を削除しました(残り ${videos.length}本)`);
  }

  function playVideo(id) {
    const v = videos.find((v) => v.id === id);
    if (!v) return;
    currentId = id;
    video.src = v.url;
    video.playbackRate = SPEEDS[speedIdx];
    video.play().then(
      () => log(`再生しました(${posOf(id)} / 速度 ${SPEEDS[speedIdx]}x)`),
      (e) => log.warn('再生を開始できませんでした(形式に対応していないか、操作が必要です)', e)
    );
    trackTitle.textContent = v.name;
    emptyState.style.display = 'none';
    renderPlaylist();
    ToolKit.vibrate();
  }

  function pickNextId() {
    if (!videos.length) return null;
    const idx = currentIndex();
    if (shuffle) {
      if (videos.length === 1) return videos[0].id;
      let n;
      do {
        n = Math.floor(Math.random() * videos.length);
      } while (n === idx);
      return videos[n].id;
    }
    return videos[(idx + 1) % videos.length].id;
  }
  function pickPrevId() {
    if (!videos.length) return null;
    const idx = currentIndex();
    return videos[(idx - 1 + videos.length) % videos.length].id;
  }

  fileInput.addEventListener('change', () => {
    addFiles(fileInput.files).catch((e) => log.error('動画の追加でエラーが発生しました', e));
    fileInput.value = '';
  });

  playBtn.addEventListener('click', () => {
    ToolKit.vibrate();
    if (currentId === null) {
      if (videos.length) playVideo(videos[0].id);
      else log.warn('動画が無いため再生できませんでした');
      return;
    }
    if (video.paused)
      video.play().then(
        () => log(`再生を再開しました(${fmtTime(video.currentTime)})`),
        (e) => log.warn('再生を開始できませんでした', e)
      );
    else {
      video.pause();
      log(`一時停止しました(${fmtTime(video.currentTime)})`);
    }
  });
  prevBtn.addEventListener('click', () => {
    ToolKit.vibrate();
    const id = pickPrevId();
    if (id !== null) playVideo(id);
    else log.warn('動画が無いため移動できませんでした');
  });
  nextBtn.addEventListener('click', () => {
    ToolKit.vibrate();
    const id = pickNextId();
    if (id !== null) playVideo(id);
    else log.warn('動画が無いため移動できませんでした');
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

  speedBtn.addEventListener('click', () => {
    ToolKit.vibrate();
    speedIdx = (speedIdx + 1) % SPEEDS.length;
    video.playbackRate = SPEEDS[speedIdx];
    speedBtn.textContent = SPEEDS[speedIdx].toFixed(2).replace(/0$/, '').replace(/\.$/, '.0') + 'x';
    log(`再生速度を ${SPEEDS[speedIdx]}x にしました`);
  });

  fullscreenBtn.addEventListener('click', () => {
    ToolKit.vibrate();
    if (document.fullscreenElement) {
      document.exitFullscreen().then(
        () => log('全画面表示を終了しました'),
        (e) => log.warn('全画面表示を終了できませんでした', e)
      );
      return;
    }
    if (playerWrap.requestFullscreen) {
      playerWrap.requestFullscreen().then(
        () => log('全画面表示にしました'),
        (e) => {
          log.warn('全画面表示にできなかったため、画面いっぱいの表示にします', e);
          setCssFullscreen(true);
        }
      );
      return;
    }
    if (video.webkitEnterFullscreen && video.getAttribute('src')) {
      try {
        video.webkitEnterFullscreen();
        log('動画を全画面で表示しました(端末の全画面表示)');
        return;
      } catch (e) {
        log.warn('端末の全画面表示にできませんでした', e);
      }
    }
    setCssFullscreen(true);
  });
  /* 要素の全画面表示に対応しないブラウザ(iOS Safari など)では、画面いっぱいの表示で代わりにする */
  function setCssFullscreen(on) {
    playerWrap.classList.toggle('is-fullscreen', on);
    exitFsBtn.hidden = !on;
    log(on ? '画面いっぱいの表示にしました' : '画面いっぱいの表示を終了しました');
  }
  exitFsBtn.addEventListener('click', () => {
    ToolKit.vibrate();
    setCssFullscreen(false);
  });
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && playerWrap.classList.contains('is-fullscreen')) {
      log('Escapeキーを押下しました');
      setCssFullscreen(false);
    }
  });

  video.addEventListener('play', () => {
    playIcon.style.display = 'none';
    pauseIcon.style.display = '';
  });
  video.addEventListener('pause', () => {
    playIcon.style.display = '';
    pauseIcon.style.display = 'none';
  });
  video.addEventListener('timeupdate', () => {
    if (seeking) return;
    curTime.textContent = fmtTime(video.currentTime);
    if (video.duration) seekSlider.value = (video.currentTime / video.duration) * 100;
  });
  video.addEventListener('loadedmetadata', () => {
    durTime.textContent = fmtTime(video.duration);
  });
  video.addEventListener('ended', () => {
    log(`動画の再生が終わりました(${posOf(currentId)})`);
    if (repeatMode === 'one') {
      video.currentTime = 0;
      video.play().catch((e) => log.warn('リピート再生を開始できませんでした', e));
      return;
    }
    const idx = currentIndex();
    if (repeatMode === 'off' && !shuffle && idx === videos.length - 1) {
      log('最後の動画が終わったため停止しました');
      return;
    }
    const id = pickNextId();
    if (id !== null) playVideo(id);
  });

  seekSlider.addEventListener('input', () => {
    seeking = true;
  });
  seekSlider.addEventListener('change', () => {
    if (video.duration) {
      video.currentTime = (seekSlider.value / 100) * video.duration;
      log(`再生位置を変更しました(${fmtTime(video.currentTime)} / ${fmtTime(video.duration)})`);
    } else {
      seekSlider.value = 0;
      log.warn('再生中の動画が無いため、再生位置を変更できませんでした');
    }
    seeking = false;
  });
  volumeSlider.addEventListener('input', () => {
    video.volume = parseFloat(volumeSlider.value);
  });
  video.addEventListener('error', () => {
    if (video.getAttribute('src'))
      log.error(
        '動画を再生できませんでした(ファイルが壊れているか、形式に対応していません)',
        video.error && video.error.message
      );
  });

  window.addEventListener('pagehide', () => {
    videos.forEach((v) => URL.revokeObjectURL(v.url));
  });
  log('起動しました');
})();
