/* メモ帳(端末の localStorage に保存。内容はログに出さない) */
(function () {
  'use strict';
  const listView = document.getElementById('listView');
  const editorView = document.getElementById('editorView');
  const newBtn = document.getElementById('newBtn');
  const noteList = document.getElementById('noteList');
  const statusText = document.getElementById('statusText');
  const backBtn = document.getElementById('backBtn');
  const deleteBtn = document.getElementById('deleteBtn');
  const savedLabel = document.getElementById('savedLabel');
  const noteText = document.getElementById('noteText');

  const STORAGE_KEY = 'notepad-notes';
  let notes = [];
  let currentId = null;
  let saveTimer = null;

  function load() {
    try {
      notes = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
      if (!Array.isArray(notes)) notes = [];
    } catch (e) {
      notes = [];
      log.warn('メモの読み込みに失敗しました(空として扱います)', e);
    }
  }
  function persist() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(notes));
      return true;
    } catch (e) {
      log.error('メモの保存でエラーが発生しました(端末の保存容量を確認してください)', e);
      return false;
    }
  }

  function titleOf(content) {
    const firstLine = (content || '').split('\n')[0].trim();
    return firstLine || '無題のメモ';
  }
  function previewOf(content) {
    const lines = (content || '').split('\n');
    return lines.slice(1).join(' ').trim() || (lines[0] || '').trim();
  }
  function formatDate(ts) {
    const d = new Date(ts);
    return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }
  function div(cls, text) {
    const el = document.createElement('div');
    el.className = cls;
    el.textContent = text;
    return el;
  }

  function renderList() {
    const sorted = [...notes].sort((a, b) => b.updatedAt - a.updatedAt);
    noteList.innerHTML = '';
    sorted.forEach((n) => {
      const row = document.createElement('div');
      row.className = 'note-row';
      row.appendChild(div('title', titleOf(n.content)));
      row.appendChild(div('preview', previewOf(n.content)));
      row.appendChild(div('date', formatDate(n.updatedAt)));
      row.addEventListener('click', () => {
        log('一覧のメモを押下しました');
        openNote(n.id);
      });
      noteList.appendChild(row);
    });
    statusText.textContent = notes.length ? '' : 'メモがありません';
  }

  function showList() {
    currentId = null;
    listView.hidden = false;
    editorView.hidden = true;
    renderList();
  }

  function openNote(id) {
    ToolKit.vibrate();
    const n = notes.find((n) => n.id === id);
    if (!n) {
      log.warn('メモが見つかりませんでした');
      return;
    }
    currentId = id;
    noteText.value = n.content;
    savedLabel.textContent = `保存済み ${formatDate(n.updatedAt)}`;
    listView.hidden = true;
    editorView.hidden = false;
    noteText.focus();
    log(`メモを開きました(${n.content.length}文字)`);
  }

  function newNote() {
    const n = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      content: '',
      updatedAt: Date.now(),
    };
    notes.push(n);
    persist();
    log(`メモを作成しました(全 ${notes.length}件)`);
    openNote(n.id);
    savedLabel.textContent = '';
  }

  /* 入力中の内容を保存する(入力が止まって 0.4 秒後、または一覧へ戻る時) */
  function saveNow() {
    clearTimeout(saveTimer);
    saveTimer = null;
    const n = notes.find((n) => n.id === currentId);
    if (!n || n.content === noteText.value) return;
    n.content = noteText.value;
    n.updatedAt = Date.now();
    if (persist()) {
      savedLabel.textContent = `保存済み ${formatDate(n.updatedAt)}`;
      log.debug(`メモを保存しました(${n.content.length}文字)`);
    }
  }
  function scheduleSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveNow, 400);
  }

  function deleteNote() {
    ToolKit.vibrate();
    if (!confirm('このメモを削除しますか?')) {
      log('削除をやめました');
      return;
    }
    clearTimeout(saveTimer);
    notes = notes.filter((n) => n.id !== currentId);
    persist();
    log(`メモを削除しました(残り ${notes.length}件)`);
    showList();
  }

  newBtn.addEventListener('click', newNote);
  backBtn.addEventListener('click', () => {
    saveNow();
    showList();
    log('一覧に戻りました');
  });
  deleteBtn.addEventListener('click', deleteNote);
  noteText.addEventListener('input', scheduleSave);
  ToolKit.addSave(saveNow); // 画面が隠れた時とページを離れる時に保存する(払って閉じた時も残すため)

  load();
  showList();
  log.started(`メモ ${notes.length}件`);
})();
