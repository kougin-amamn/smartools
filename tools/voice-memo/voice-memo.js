/* ボイスメモの画面。録音して再生・保存する */
(function () {
  const recBtn = document.getElementById('recBtn');
  const timerEl = document.getElementById('timer');
  const statusText = document.getElementById('statusText');
  const listEl = document.getElementById('list');

  let mediaRecorder = null;
  let chunks = [];
  let stream = null;
  let recording = false;
  let startedAt = 0;
  let timerId = null;
  let count = 0;

  function pad(n) {
    return String(n).padStart(2, '0');
  }
  function tick() {
    const sec = Math.floor((Date.now() - startedAt) / 1000);
    timerEl.textContent = `${pad(Math.floor(sec / 60))}:${pad(sec % 60)}`;
  }

  function pickMimeType() {
    const candidates = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm', 'audio/ogg'];
    for (const c of candidates) {
      if (window.MediaRecorder && MediaRecorder.isTypeSupported(c)) return c;
    }
    return '';
  }

  function addItem(blob, mimeType) {
    count += 1;
    const url = URL.createObjectURL(blob);
    const ext = mimeType.includes('mp4') ? 'm4a' : mimeType.includes('ogg') ? 'ogg' : 'webm';
    const time = new Date().toLocaleTimeString('ja-JP', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });

    const item = document.createElement('div');
    item.className = 'item';
    item.dataset.logGroup = `録音 ${count}`;
    item.innerHTML = `
      <div class="item-head"><span>録音 ${count}(${time})</span></div>
      <audio controls src="${url}"></audio>
      <div class="item-actions">
        <a href="${url}" download="voice-memo-${count}.${ext}">ダウンロード</a>
        <button type="button">削除</button>
      </div>
    `;
    const no = count;
    item.querySelector('button').addEventListener('click', () => {
      URL.revokeObjectURL(url);
      item.remove();
      log(`録音 ${no} を削除しました(残り ${listEl.children.length}件)`);
    });
    listEl.prepend(item);
  }

  async function startRecording() {
    const r = await ToolKit.media.open({ audio: true }, 'マイク');
    if (!r.stream) {
      statusText.textContent = r.message;
      return;
    }
    stream = r.stream;
    const mimeType = pickMimeType();
    chunks = [];
    try {
      mediaRecorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);
    } catch (e) {
      log.warn('この端末・ブラウザは録音に対応していません', e);
      statusText.textContent = 'この端末・ブラウザは録音に対応していません。';
      ToolKit.media.stop(stream);
      return;
    }
    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };
    mediaRecorder.onstop = () => {
      const blob = new Blob(chunks, { type: mediaRecorder.mimeType || 'audio/webm' });
      addItem(blob, mediaRecorder.mimeType || 'audio/webm');
      log(
        `録音を保存しました(録音 ${count} / ${timerEl.textContent} / ${(blob.size / 1024).toFixed(0)}KB / ${mediaRecorder.mimeType || 'audio/webm'})`,
      );
      ToolKit.media.stop(stream);
      stream = null;
    };
    mediaRecorder.start();
    recording = true;
    recBtn.classList.add('recording');
    statusText.textContent = '録音中… タップして停止';
    startedAt = Date.now();
    timerEl.textContent = '00:00';
    timerId = setInterval(tick, 250);
    ToolKit.vibrate(30);
    log(`録音を開始しました(${mediaRecorder.mimeType || mimeType || '既定の形式'})`);
  }

  function stopRecording() {
    recording = false;
    recBtn.classList.remove('recording');
    statusText.textContent = 'タップして録音開始';
    clearInterval(timerId);
    if (mediaRecorder && mediaRecorder.state !== 'inactive') mediaRecorder.stop();
    ToolKit.vibrate(30);
    log(`録音を停止しました(${timerEl.textContent})`);
  }

  recBtn.addEventListener('click', () => {
    if (recording) stopRecording();
    else startRecording().catch((e) => log.error('録音の開始でエラーが発生しました', e));
  });

  log.started(`録音 ${window.MediaRecorder ? '対応' : '非対応'}`);
})();
