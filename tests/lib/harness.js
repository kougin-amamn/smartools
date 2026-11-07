/* 試験の共通部品。サイトの根を http で配信し、Playwright でページを開いてログを集める。
   出力は短く(問題がある時だけ詳しく)して、読む量を減らす */
const path = require('path');
const fs = require('fs');
const http = require('http');
const { spawn } = require('child_process');
let playwright;
try {
  playwright = require('playwright');
} catch (e) {
  playwright = require('/opt/node-tools/node_modules/playwright');
}

const ROOT = path.resolve(__dirname, '../..');
const STUBS = path.join(__dirname, '../stubs');

/* 空いていそうな番号で python の簡易サーバーを立て、応答するまで待つ */
function serve() {
  const port = 8700 + Math.floor(Math.random() * 200);
  const proc = spawn('python3', ['-m', 'http.server', String(port), '--bind', '127.0.0.1'], {
    cwd: ROOT,
    stdio: 'ignore',
  });
  const base = 'http://127.0.0.1:' + port;
  return new Promise((ok, ng) => {
    let tries = 0;
    (function ping() {
      http
        .get(base + '/index.html', (r) => {
          r.resume();
          ok({ base, close: () => proc.kill() });
        })
        .on('error', () => {
          if (++tries > 50) {
            proc.kill();
            ng(new Error('サーバーが起動しませんでした'));
          } else setTimeout(ping, 100);
        });
    })();
  });
}

/* 差し替えの中身。名前は tests/stubs のファイル名か、絶対パス(リポジトリに置かない大きなライブラリ) */
function stub(name) {
  return fs.readFileSync(path.isAbsolute(name) ? name : path.join(STUBS, name), 'utf8');
}

/* 時刻を取り除いたログの行。資源の読み込み失敗(CDN を止めているため)は除く */
function clean(type, text) {
  return type + ' ' + text.replace(/^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d\.\d{3} /, '');
}
const NOISE = /Failed to load resource|net::ERR_/;

/* ページのログを配列に集める(同じ文脈で開いた2枚目のタブにも使う) */
function collect(page) {
  const logs = [];
  page.on('console', (m) => {
    if (!NOISE.test(m.text())) logs.push(clean(m.type(), m.text()));
  });
  page.on('pageerror', (e) => logs.push('PAGEERROR ' + e.message));
  return logs;
}

/* 開発環境では CDN を止めているため、ライブラリが読めないエラーは不合格にせず、注意として分けて出す */
const CDN_ERROR = /読み込めませんでした|の読み込みでエラーが発生しました/;
function splitErrors(logs) {
  const errors = logs.filter((l) => /^PAGEERROR|^error /.test(l));
  return {
    real: errors.filter((l) => !CDN_ERROR.test(l)),
    cdn: errors.filter((l) => CDN_ERROR.test(l)),
  };
}

/* launch() → { open(urlPath, opts), close() }
   opts.stubs: { 'URL の一部': 'stubs のファイル名' }(一致した読み込みを差し替える。ほかの CDN は止める)
   opts.hour: 時刻を固定する時(テーマの確認)  opts.insecure: https でないことにする
   opts.width: 画面の幅(初期 390)。launch(args) の args は Chromium の起動オプション */
async function launch(args) {
  const server = await serve();
  const browser = await playwright.chromium.launch({ args: args || [] });
  async function open(urlPath, opts) {
    opts = opts || {};
    const context = await browser.newContext({
      viewport: { width: opts.width || 390, height: 844 },
      permissions: opts.permissions || [],
    });
    const stubs = opts.stubs || {};
    await context.route(
      /cdn\.jsdelivr\.net|cdnjs\.cloudflare\.com|unpkg\.com|storage\.googleapis\.com/,
      (r) => {
        const key = Object.keys(stubs).find((k) => r.request().url().includes(k));
        /* ES モジュールの import は CORS で読むため、許可の見出しを付ける */
        if (key)
          r.fulfill({
            contentType: 'text/javascript',
            headers: { 'Access-Control-Allow-Origin': '*' },
            body: stub(stubs[key]),
          });
        else r.abort();
      },
    );
    if (opts.block) await context.route(opts.block, (r) => r.abort());
    if (opts.insecure)
      await context.addInitScript(() =>
        Object.defineProperty(window, 'isSecureContext', { get: () => false }),
      );
    const page = await context.newPage();
    const logs = collect(page);
    if (opts.hour != null) await page.clock.setFixedTime(new Date(2026, 0, 1, opts.hour, 0));
    await page.goto(server.base + '/' + urlPath.replace(/^\//, ''));
    await page.waitForTimeout(opts.wait || 300);
    return { page, logs, context };
  }
  return {
    base: server.base,
    open,
    close: async () => {
      await browser.close();
      server.close();
    },
  };
}

/* 結果の表示: 合格は1行、不合格は理由を添える */
function report(name, problems) {
  if (!problems.length) console.log('OK ' + name);
  else console.log('NG ' + name + '\n  - ' + problems.join('\n  - '));
  return problems.length === 0;
}

module.exports = { launch, report, collect, splitErrors, ROOT };
