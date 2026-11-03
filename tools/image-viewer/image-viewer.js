/* 画像ビューアの画面。拡大・回転・スライドショー・全画面 */
(function () {
  const fileInput = document.getElementById('fileInput');
  const viewerWrap = document.getElementById('viewerWrap');
  const mainImg = document.getElementById('mainImg');
  const emptyState = document.getElementById('emptyState');
  const prevBtn = document.getElementById('prevBtn');
  const nextBtn = document.getElementById('nextBtn');
  const counterText = document.getElementById('counterText');
  const rotateBtn = document.getElementById('rotateBtn');
  const slideshowBtn = document.getElementById('slideshowBtn');
  const playIcon = document.getElementById('playIcon');
  const pauseIcon = document.getElementById('pauseIcon');
  const zoomSlider = document.getElementById('zoomSlider');
  const fullscreenBtn = document.getElementById('fullscreenBtn');
  const exitFsBtn = document.getElementById('exitFsBtn');
  const thumbStrip = document.getElementById('thumbStrip');
  const statusText = document.getElementById('statusText');

  let images = []; // { id, url, rotate }
  let currentIndex = -1;
  let zoom = 1;
  let panX = 0,
    panY = 0;
  let slideshowId = null;

  function applyTransform() {
    const img = images[currentIndex];
    const rotate = img ? img.rotate : 0;
    mainImg.style.transform = `translate(calc(-50% + ${panX}px), calc(-50% + ${panY}px)) rotate(${rotate}deg) scale(${zoom})`;
  }

  function render() {
    const has = images.length > 0;
    emptyState.style.display = has ? 'none' : 'flex';
    prevBtn.style.display = nextBtn.style.display = has ? '' : 'none';
    if (!has) {
      mainImg.removeAttribute('src');
      counterText.textContent = '';
      renderThumbs();
      return;
    }
    if (currentIndex < 0) currentIndex = 0;
    if (currentIndex >= images.length) currentIndex = images.length - 1;
    mainImg.src = images[currentIndex].url;
    zoom = 1;
    panX = 0;
    panY = 0;
    zoomSlider.value = 100;
    applyTransform();
    counterText.textContent = `${currentIndex + 1} / ${images.length}`;
    renderThumbs();
  }

  function renderThumbs() {
    thumbStrip.innerHTML = '';
    images.forEach((img, i) => {
      const el = document.createElement('div');
      el.className = 'thumb' + (i === currentIndex ? ' active' : '');
      el.innerHTML = `<img src="${img.url}"><button class="remove" type="button">✕</button>`;
      el.querySelector('img').addEventListener('click', () => {
        log(`${i + 1}枚目のサムネイルを押下しました`);
        currentIndex = i;
        render();
        log(`${i + 1}枚目を表示しました(${i + 1} / ${images.length})`);
      });
      el.querySelector('.remove').addEventListener('click', (e) => {
        e.stopPropagation();
        log(`${i + 1}枚目の削除ボタンを押下しました`);
        removeImage(i);
      });
      thumbStrip.appendChild(el);
    });
  }

  function addFiles(fileList) {
    const all = Array.from(fileList),
      files = all.filter((f) => f.type.startsWith('image/'));
    if (all.length > files.length)
      log.warn(`画像ではないファイルを除きました(${all.length - files.length}件)`);
    if (!files.length) {
      log.warn('表示できる画像がありませんでした');
      return;
    }
    files.forEach((f) =>
      images.push({ id: Date.now() + Math.random(), url: URL.createObjectURL(f), rotate: 0 })
    );
    if (currentIndex === -1) currentIndex = 0;
    statusText.textContent = '';
    render();
    log(
      `画像を追加しました(${files.length}枚 / 全 ${images.length}枚 / ${(files.reduce((s, f) => s + f.size, 0) / 1024 / 1024).toFixed(1)}MB)`
    );
  }
  function removeImage(i) {
    ToolKit.vibrate();
    URL.revokeObjectURL(images[i].url);
    images.splice(i, 1);
    if (currentIndex >= i) currentIndex -= 1;
    if (!images.length) stopSlideshow();
    render();
    log(`画像を削除しました(残り ${images.length}枚)`);
  }

  fileInput.addEventListener('change', () => {
    if (!fileInput.files.length) return;
    addFiles(fileInput.files);
    fileInput.value = '';
  });

  function go(delta) {
    if (!images.length) return;
    currentIndex = (currentIndex + delta + images.length) % images.length;
    render();
    log.debug(`${currentIndex + 1}枚目を表示しました(${currentIndex + 1} / ${images.length})`);
  }
  prevBtn.addEventListener('click', () => {
    ToolKit.vibrate();
    go(-1);
    log(`${currentIndex + 1}枚目を表示しました(${currentIndex + 1} / ${images.length})`);
  });
  nextBtn.addEventListener('click', () => {
    ToolKit.vibrate();
    go(1);
    log(`${currentIndex + 1}枚目を表示しました(${currentIndex + 1} / ${images.length})`);
  });

  rotateBtn.addEventListener('click', () => {
    ToolKit.vibrate();
    const img = images[currentIndex];
    if (!img) {
      log.warn('画像が無いため回転しませんでした');
      return;
    }
    img.rotate = (img.rotate + 90) % 360;
    applyTransform();
    log(`画像を回転しました(${img.rotate}°)`);
  });

  zoomSlider.addEventListener('input', () => {
    zoom = zoomSlider.value / 100;
    if (zoom === 1) {
      panX = 0;
      panY = 0;
    }
    applyTransform();
  });

  function setFullscreen(on) {
    if (viewerWrap.classList.contains('is-fullscreen') === on) return;
    viewerWrap.classList.toggle('is-fullscreen', on);
    exitFsBtn.hidden = !on;
    log(on ? '全画面表示にしました' : '全画面表示を終了しました');
  }
  fullscreenBtn.addEventListener('click', () => {
    ToolKit.vibrate();
    setFullscreen(true);
  });
  exitFsBtn.addEventListener('click', () => {
    ToolKit.vibrate();
    setFullscreen(false);
  });
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && viewerWrap.classList.contains('is-fullscreen')) {
      log('Escapeキーを押下しました');
      setFullscreen(false);
    }
  });

  function stopSlideshow() {
    if (slideshowId) log('スライドショーを停止しました');
    clearInterval(slideshowId);
    slideshowId = null;
    playIcon.style.display = '';
    pauseIcon.style.display = 'none';
    slideshowBtn.classList.remove('active');
  }
  slideshowBtn.addEventListener('click', () => {
    ToolKit.vibrate();
    if (slideshowId) {
      stopSlideshow();
      return;
    }
    if (images.length < 2) {
      log.warn('画像が2枚未満のため、スライドショーを開始しませんでした');
      return;
    }
    playIcon.style.display = 'none';
    pauseIcon.style.display = '';
    slideshowBtn.classList.add('active');
    slideshowId = setInterval(() => go(1), 3000);
    log(`スライドショーを開始しました(${images.length}枚 / 3秒ごと)`);
  });

  // スワイプ/ドラッグ
  let dragging = false,
    dragStartX = 0,
    dragStartY = 0,
    startPanX = 0,
    startPanY = 0;
  viewerWrap.addEventListener('pointerdown', (e) => {
    if (e.target.closest('button'))
      return; /* ボタンの押下はそのまま通す(ポインタを捕まえるとボタンが押せなくなるため) */
    dragging = true;
    dragStartX = e.clientX;
    dragStartY = e.clientY;
    startPanX = panX;
    startPanY = panY;
    viewerWrap.setPointerCapture(e.pointerId);
  });
  viewerWrap.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const dx = e.clientX - dragStartX,
      dy = e.clientY - dragStartY;
    if (zoom > 1) {
      panX = startPanX + dx;
      panY = startPanY + dy;
      applyTransform();
    }
  });
  viewerWrap.addEventListener('pointerup', (e) => {
    if (!dragging) return;
    dragging = false;
    const dx = e.clientX - dragStartX,
      dy = e.clientY - dragStartY;
    if (zoom === 1 && Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) {
      stopSlideshow();
      log(`${dx < 0 ? '左' : '右'}にスワイプしました`);
      go(dx < 0 ? 1 : -1);
      log(`${currentIndex + 1}枚目を表示しました(${currentIndex + 1} / ${images.length})`);
    }
  });

  render();
  log('起動しました');
  window.addEventListener('pagehide', () => {
    images.forEach((i) => URL.revokeObjectURL(i.url));
  });
})();
