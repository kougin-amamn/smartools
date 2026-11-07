/* 小説読み上げの画面の動き。本文の受け取り(ブックマークレット・貼り付け)・表示・形態素解析の辞書の読み込み・1文ずつの読み上げ。
   共通の log・ToolKit と novel-reader-core.js(NovelReaderCore)を使う。本文は保存・送信せず、ログにも出さない */
(function () {
  'use strict';
  var $ = function (id) {
    return document.getElementById(id);
  };
  var C = window.NovelReaderCore;
  var statusEl = $('status'),
    textEl = $('text'),
    speechEl = $('speech'),
    playBtn = $('playBtn'),
    playIcon = $('playIcon'),
    modeEl = $('mode'),
    voiceEl = $('voice'),
    rateEl = $('rate');

  /* 本文を受け取ってよい送り元(ブックマークレットを押したページ) */
  var ALLOWED_ORIGINS = ['https://kakuyomu.jp'];
  /* 形態素解析: kuromoji.js の改良版(元の版は CDN の辞書のアドレスを壊す不具合がある)と、元の版の gzip 辞書 */
  var KUROMOJI_URL = 'https://cdn.jsdelivr.net/npm/@patdx/kuromoji@1.0.4/+esm';
  var DICT_URL = 'https://cdn.jsdelivr.net/npm/kuromoji@0.1.2/dict/';
  var DICT_FILES = 12;
  var SETTINGS_KEY = 'novel-reader-settings';
  var ICON_PLAY = 'M8 5v14l11-7z',
    ICON_PAUSE = 'M6 5h4v14H6zM14 5h4v14h-4z';

  var sentences = [],
    sentenceEls = [],
    current = 0,
    playing = false,
    tokenizer = null,
    voices = [],
    voiceCount = -1;

  /* 設定(読みの渡し方・声・速さ) */
  var settings = { mode: 'ruby', voice: '', rate: 1 };
  try {
    var saved = JSON.parse(localStorage.getItem(SETTINGS_KEY));
    if (saved && C.MODES.indexOf(saved.mode) >= 0) settings.mode = saved.mode;
    if (saved && typeof saved.voice === 'string') settings.voice = saved.voice;
    if (saved && saved.rate >= 0.5 && saved.rate <= 2) settings.rate = saved.rate;
  } catch (e) {
    log.warn('設定を読み込めませんでした(初期設定で始めます)', e);
  }
  function saveSettings() {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch (e) {
      log.warn('設定を保存できませんでした', e);
    }
  }
  modeEl.value = settings.mode;
  rateEl.value = settings.rate;
  $('rateValue').textContent = settings.rate.toFixed(1) + 'x';
  modeEl.addEventListener('change', function () {
    settings.mode = modeEl.value;
    saveSettings();
    showSpeech();
  });
  rateEl.addEventListener('input', function () {
    settings.rate = parseFloat(rateEl.value);
    $('rateValue').textContent = settings.rate.toFixed(1) + 'x';
  });
  rateEl.addEventListener('change', saveSettings);
  voiceEl.addEventListener('change', function () {
    settings.voice = voiceEl.value;
    saveSettings();
  });

  /* 声の一覧(日本語だけ) */
  function listVoices() {
    if (!('speechSynthesis' in window)) return;
    voices = speechSynthesis.getVoices().filter(function (v) {
      return /^ja/i.test(v.lang);
    });
    if (!voices.length) return;
    voiceEl.innerHTML = voices
      .map(function (v) {
        return (
          '<option value="' + ToolKit.esc(v.voiceURI) + '">' + ToolKit.esc(v.name) + '</option>'
        );
      })
      .join('');
    if (
      voices.some(function (v) {
        return v.voiceURI === settings.voice;
      })
    )
      voiceEl.value = settings.voice;
    if (voices.length !== voiceCount) log('日本語の声を確認しました(' + voices.length + '種類)');
    voiceCount = voices.length;
  }

  /* 本文を表示する。文ごとに span にし、押すとそこから読む */
  function load(paragraphs, title, how) {
    stop();
    sentences = [];
    var html = paragraphs
      .map(function (segments) {
        return (
          '<p>' +
          C.sentencesFromParagraph(segments)
            .map(function (sentence) {
              sentences.push(sentence);
              return (
                '<span class="sentence" data-index="' +
                (sentences.length - 1) +
                '">' +
                sentence
                  .map(function (s) {
                    return s.ruby
                      ? '<ruby>' +
                          ToolKit.esc(s.text) +
                          '<rt>' +
                          ToolKit.esc(s.ruby) +
                          '</rt></ruby>'
                      : ToolKit.esc(s.text);
                  })
                  .join('') +
                '</span>'
              );
            })
            .join('') +
          '</p>'
        );
      })
      .join('');
    textEl.innerHTML = html;
    sentenceEls = Array.prototype.slice.call(textEl.querySelectorAll('.sentence'));
    current = 0;
    $('sourceTitle').textContent = title || '貼り付けた文章';
    var chars = paragraphs.reduce(function (n, segments) {
      return n + C.plainText(segments).length;
    }, 0);
    statusEl.textContent = sentences.length + '文 / ' + chars.toLocaleString() + '字';
    ['playBtn', 'stopBtn', 'prevBtn', 'nextBtn'].forEach(function (id) {
      $(id).disabled = !sentences.length;
    });
    mark();
    log(
      '本文を受け取りました(' +
        how +
        ' / 段落 ' +
        paragraphs.length +
        ' / ' +
        sentences.length +
        '文 / ' +
        chars +
        '字 / ルビ ' +
        C.countRuby(paragraphs) +
        ')',
    );
  }

  /* 読み上げ */
  function speechOf(index) {
    var tokenize = tokenizer
      ? function (text) {
          return tokenizer.tokenize(text);
        }
      : null;
    return C.speechTextOf(sentences[index], settings.mode, tokenize);
  }
  function showSpeech() {
    speechEl.textContent = sentences.length ? '読み: ' + speechOf(current) : '';
  }
  function mark() {
    sentenceEls.forEach(function (el, i) {
      el.classList.toggle('now', i === current);
    });
    if (sentenceEls[current])
      sentenceEls[current].scrollIntoView({ block: 'center', behavior: 'smooth' });
    showSpeech();
  }
  function setPlaying(on) {
    playing = on;
    playIcon.setAttribute('d', on ? ICON_PAUSE : ICON_PLAY);
    playBtn.setAttribute('aria-label', on ? '一時停止' : '再生');
  }
  function speak() {
    if (!('speechSynthesis' in window)) {
      statusEl.textContent = 'この端末・ブラウザは読み上げに対応していません。';
      log.warn('この端末・ブラウザは読み上げに対応していません');
      setPlaying(false);
      return;
    }
    speechSynthesis.cancel();
    var index = current,
      u = new SpeechSynthesisUtterance(speechOf(index));
    u.lang = 'ja-JP';
    u.rate = settings.rate;
    var voice = voices.find(function (v) {
      return v.voiceURI === settings.voice;
    });
    if (voice) u.voice = voice;
    u.onend = function () {
      if (!playing || index !== current) return;
      if (current >= sentences.length - 1) {
        setPlaying(false);
        log('最後まで読み上げました(' + sentences.length + '文)');
        return;
      }
      current++;
      mark();
      speak();
    };
    u.onerror = function (e) {
      if (e.error === 'canceled' || e.error === 'interrupted') return;
      setPlaying(false);
      log.warn('読み上げでエラーが発生しました(' + (index + 1) + '文目)', e.error);
    };
    speechSynthesis.speak(u);
  }
  /* 一時停止は止めて位置を覚える(端末によって pause / resume が効かないため)。再開は今の文の頭から */
  function play() {
    setPlaying(true);
    mark();
    speak();
    log(
      '読み上げを開始しました(' +
        (current + 1) +
        '文目 / ' +
        modeEl.options[modeEl.selectedIndex].text +
        ' / 速さ ' +
        settings.rate.toFixed(1) +
        'x)',
    );
  }
  function pause() {
    setPlaying(false);
    if ('speechSynthesis' in window) speechSynthesis.cancel();
    log('読み上げを一時停止しました(' + (current + 1) + '文目)');
  }
  function stop() {
    var was = playing;
    setPlaying(false);
    if ('speechSynthesis' in window) speechSynthesis.cancel();
    if (was) log('読み上げを停止しました(' + (current + 1) + '文目)');
  }
  function move(step) {
    var next = Math.min(Math.max(current + step, 0), sentences.length - 1);
    if (next === current) return;
    current = next;
    mark();
    if (playing) speak();
  }
  playBtn.addEventListener('click', function () {
    ToolKit.vibrate();
    playing ? pause() : play();
  });
  $('stopBtn').addEventListener('click', function () {
    ToolKit.vibrate();
    stop();
    current = 0;
    mark();
  });
  $('prevBtn').addEventListener('click', function () {
    move(-1);
  });
  $('nextBtn').addEventListener('click', function () {
    move(1);
  });
  textEl.addEventListener('click', function (e) {
    var el = e.target.closest('.sentence');
    if (!el) return;
    current = Number(el.dataset.index);
    log(current + 1 + '文目を選びました');
    play();
  });
  window.addEventListener('pagehide', function () {
    if ('speechSynthesis' in window) speechSynthesis.cancel();
  });

  /* 貼り付け */
  function togglePanel(btn, panel) {
    panel.hidden = !panel.hidden;
    btn.setAttribute('aria-expanded', String(!panel.hidden));
  }
  $('pasteBtn').addEventListener('click', function () {
    togglePanel($('pasteBtn'), $('pastePanel'));
  });
  $('helpBtn').addEventListener('click', function () {
    togglePanel($('helpBtn'), $('helpPanel'));
  });
  $('pasteLoad').addEventListener('click', function () {
    var paragraphs = C.paragraphsFromText($('pasteText').value);
    if (!paragraphs.length) {
      statusEl.textContent = '文章を貼り付けてください。';
      log.warn('文章が無いため読み込みませんでした');
      return;
    }
    load(paragraphs, '', '貼り付け');
    $('pastePanel').hidden = true;
    $('pasteBtn').setAttribute('aria-expanded', 'false');
  });

  /* ブックマークレットからの受け取り: 開いた元へ「準備できた」を送り、本文を待つ */
  window.addEventListener('message', function (e) {
    if (ALLOWED_ORIGINS.indexOf(e.origin) < 0 || !e.data || e.data.type !== 'novel-reader-text')
      return;
    if (!C.isParagraphs(e.data.paragraphs) || !e.data.paragraphs.length) {
      log.warn('届いた本文の形が正しくないため読み込みませんでした');
      return;
    }
    load(e.data.paragraphs, String(e.data.title || ''), 'ブックマークレット');
  });
  if (window.opener)
    ALLOWED_ORIGINS.forEach(function (origin) {
      try {
        window.opener.postMessage({ type: 'novel-reader-ready' }, origin);
      } catch (e) {
        log.debug('開いた元のページへ合図を送れませんでした');
      }
    });

  /* ブックマークレットのリンク: 元のファイルを読み、このページのアドレスを入れて javascript: にする */
  var bookmarkletEl = $('bookmarklet');
  fetch('./novel-reader-bookmarklet.js')
    .then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.text();
    })
    .then(function (code) {
      code = code
        .replace(/^\/\*[\s\S]*?\*\/\s*/, '')
        .replace('__TOOL_URL__', location.origin + location.pathname);
      bookmarkletEl.href = 'javascript:' + encodeURIComponent(code);
    })
    .catch(function (e) {
      log.warn('ブックマークレットを用意できませんでした', e);
    });
  bookmarkletEl.addEventListener('click', function (e) {
    e.preventDefault();
    statusEl.textContent = 'このリンクはブックマークに登録して、カクヨムの話のページで使います。';
  });
  $('copyCode').addEventListener('click', function () {
    if (bookmarkletEl.href.indexOf('javascript:') !== 0) {
      statusEl.textContent = 'ブックマークレットを用意できていません。';
      return;
    }
    ToolKit.copyText(
      bookmarkletEl.href,
      'ブックマークレット',
      bookmarkletEl.href.length + '文字',
    ).then(function (ok) {
      statusEl.textContent = ok
        ? 'コピーしました。ブックマークのアドレスに貼り付けてください。'
        : 'コピーできませんでした。';
    });
  });

  /* 形態素解析の辞書: 12個の gzip ファイルを読み、展開して渡す(届いた物が展開済みならそのまま) */
  function gunzip(buffer) {
    var head = new Uint8Array(buffer, 0, 2);
    if (head[0] !== 0x1f || head[1] !== 0x8b || !window.DecompressionStream)
      return Promise.resolve(buffer);
    return new Response(
      new Blob([buffer]).stream().pipeThrough(new DecompressionStream('gzip')),
    ).arrayBuffer();
  }
  function loadDictionary() {
    var loaded = 0;
    $('dictStatus').textContent =
      '形態素解析の辞書を読み込み中です(約17MB)。読めるまでは「ルビだけかな」で読みます。';
    return log
      .step(
        '形態素解析の辞書の読み込み',
        function () {
          return import(KUROMOJI_URL).then(function (kuromoji) {
            var Builder =
              kuromoji.TokenizerBuilder || (kuromoji.default && kuromoji.default.TokenizerBuilder);
            return new Builder({
              loader: {
                loadArrayBuffer: function (name) {
                  return fetch(DICT_URL + name)
                    .then(function (r) {
                      if (!r.ok) throw new Error(name + ' HTTP ' + r.status);
                      return r.arrayBuffer();
                    })
                    .then(gunzip)
                    .then(function (buffer) {
                      loaded++;
                      $('dictStatus').textContent =
                        '形態素解析の辞書を読み込み中です(' + loaded + ' / ' + DICT_FILES + ')';
                      return buffer;
                    });
                },
              },
            }).build();
          });
        },
        function () {
          return loaded + 'ファイル';
        },
      )
      .then(function (r) {
        if (r.ok) {
          tokenizer = r.value;
          $('dictStatus').textContent = '形態素解析の辞書を読み込みました。';
          showSpeech();
        } else {
          $('dictStatus').textContent =
            '形態素解析の辞書を読み込めませんでした。「すべてかな」は「ルビだけかな」と同じになります。';
        }
      });
  }

  if ('speechSynthesis' in window) {
    listVoices();
    speechSynthesis.addEventListener('voiceschanged', listVoices);
  } else {
    statusEl.textContent = 'この端末・ブラウザは読み上げに対応していません。';
  }
  log.started('読みの渡し方 ' + settings.mode + ' / 速さ ' + settings.rate.toFixed(1) + 'x');
  loadDictionary();
})();
