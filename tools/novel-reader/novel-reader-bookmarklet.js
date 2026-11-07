/* ブックマークレットの元。小説読み上げの画面がこのファイルを読み、__TOOL_URL__ を自分のアドレスに置き換えて javascript: のリンクにする。
   カクヨムの話のページで押すと、表示中の本文とルビを取り出して読み上げのツールを新しいタブで開き、postMessage で渡す。通信はしない */
(function () {
  var TOOL_URL = '__TOOL_URL__';
  var TOOL_ORIGIN = new URL(TOOL_URL).origin;
  if (location.hostname !== 'kakuyomu.jp') {
    alert('カクヨムの話のページで押してください。');
    return;
  }
  /* 本文の要素: 名前の決まった物が無ければ、段落(p)が一番多く並ぶ要素 */
  function bodyElement() {
    var known = document.querySelector('.widget-episodeBody');
    if (known) return known;
    var best = null,
      most = 0;
    document.querySelectorAll('div, section, article').forEach(function (el) {
      var n = el.querySelectorAll(':scope > p').length;
      if (n > most) {
        most = n;
        best = el;
      }
    });
    return best;
  }
  /* 段落 → 区切りの配列。<ruby> は親文字(rt・rp を除いた文字)と rt の読みに分ける */
  function segmentsOf(p) {
    var segments = [];
    function add(text, ruby) {
      if (!text) return;
      if (ruby) segments.push({ text: text, ruby: ruby });
      else segments.push({ text: text });
    }
    p.childNodes.forEach(function walk(node) {
      if (node.nodeType === 3) return add(node.nodeValue);
      if (node.nodeType !== 1) return;
      if (node.tagName === 'RUBY') {
        var base = '',
          reading = '';
        node.childNodes.forEach(function (c) {
          if (c.nodeType === 1 && c.tagName === 'RT') reading += c.textContent;
          else if (!(c.nodeType === 1 && c.tagName === 'RP')) base += c.textContent;
        });
        return add(base, reading.trim());
      }
      if (node.tagName === 'BR') return;
      node.childNodes.forEach(walk);
    });
    return segments;
  }
  var body = bodyElement();
  if (!body) {
    alert('本文が見つかりませんでした。');
    return;
  }
  var paragraphs = [];
  body.querySelectorAll('p').forEach(function (p) {
    var segments = segmentsOf(p);
    if (
      segments
        .map(function (s) {
          return s.text;
        })
        .join('')
        .trim()
    )
      paragraphs.push(segments);
  });
  var heading = document.querySelector('h1');
  var data = {
    type: 'novel-reader-text',
    work: heading ? heading.textContent.trim() : '',
    title: document.title,
    paragraphs: paragraphs,
  };
  /* 渡せない時の予備: ルビ記法の文章をクリップボードへ */
  function copyInstead() {
    var text = paragraphs
      .map(function (segments) {
        return segments
          .map(function (s) {
            return s.ruby ? '|' + s.text + '《' + s.ruby + '》' : s.text;
          })
          .join('');
      })
      .join('\n');
    navigator.clipboard.writeText(text).then(
      function () {
        alert(
          '読み上げのツールに渡せなかったため、本文をコピーしました。ツールの「貼り付け」に貼ってください。',
        );
      },
      function () {
        alert('読み上げのツールに渡せませんでした。');
      },
    );
  }
  var tool = window.open(TOOL_URL, '_blank');
  if (!tool) return copyInstead();
  var sent = false;
  window.addEventListener('message', function onReady(e) {
    if (
      e.source !== tool ||
      e.origin !== TOOL_ORIGIN ||
      !e.data ||
      e.data.type !== 'novel-reader-ready'
    )
      return;
    window.removeEventListener('message', onReady);
    sent = true;
    tool.postMessage(data, TOOL_ORIGIN);
  });
  setTimeout(function () {
    if (!sent) copyInstead();
  }, 15000);
})();
