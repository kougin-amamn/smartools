/* 多言語化の試験(docs/design/i18n.md 段 2)。英語の端末で一覧・ヘッダ・ツールの見出しが英語になり、
   言語のボタンで日本語に切り替えると読み込み直しても残る。日本語の端末では今までどおり。使い方: node tests/scenarios/i18n.js */
const { launch, report, splitErrors } = require('../lib/harness');
const en = require('../../lang/en.json');
const FIRST_TOOL = require('../../index-data.json')[0];

(async () => {
  const site = await launch();
  const problems = [];
  const expect = (ok, text) => ok || problems.push(text);
  try {
    /* 英語の端末: 一覧 */
    const { page, logs, context } = await site.open('index.html', { locale: 'en-US' });
    await page.waitForSelector('#sorts:not([hidden])', { timeout: 3000 });
    expect((await page.getAttribute('html', 'lang')) === 'en', 'html の lang が en でない');
    expect((await page.textContent('.lead')) === en.site.tagline, '説明の文が英語でない');
    expect(
      (await page.textContent('[data-sort="recent"]')).trim() === 'Recent',
      '並びのボタンが英語でない',
    );
    const head = await page.textContent('#list .cat-head');
    expect(/^Essentials\d+ tools$/.test(head), `分類の見出しが英語でない(${head})`);
    const card = await page.textContent('#list .card .title');
    expect(card === en.tools[FIRST_TOOL.slug].title, `ツール名が英語でない(${card})`);
    expect(!(await page.locator('#list .card .en').count()), '英語の時に英名の添え字が残っている');
    expect(
      /^Debug$/.test(await page.getAttribute('#dbgBtn', 'aria-label')),
      'デバッグのボタンの名前が英語でない',
    );
    expect(
      /^Theme: (Light|Dark) \(tap for (Light|Dark)\)$/.test(
        await page.getAttribute('#themeBtn', 'aria-label'),
      ),
      'テーマのボタンの名前が英語でない',
    );
    expect(
      (await page.getAttribute('#languageBtn', 'aria-label')) ===
        'Language: English (tap for 日本語)',
      '言語のボタンの名前が違う',
    );
    expect(/^smartools \| Free/.test(await page.title()), '題名が英語でない');
    expect(
      (await page.getAttribute('#list .card', 'data-log')) === FIRST_TOOL.title,
      'ログの名前(data-log)が日本語のままでない',
    );

    /* 英語の端末: ツールのページ(一覧から開いたので戻るボタンもある) */
    await page.goto(site.base + '/tools/calculator/calculator.html');
    await page.waitForFunction(() => window.I18n && I18n.isReady());
    expect(
      (await page.textContent('.site-bar h1')).trim().startsWith('Calculator'),
      '電卓の見出しが英語でない',
    );
    expect(await page.locator('.site-bar h1 .en').isHidden(), '英語の時に英名の添え字が残っている');
    expect(/^Calculator \| /.test(await page.title()), '電卓の題名が英語でない');
    expect(
      (await page.getAttribute('#backBtn', 'aria-label')) === 'Back to All tools',
      '戻るボタンの名前が英語でない',
    );

    expect(!(await page.locator('#languageBtn').count()), 'ツールのページに言語のボタンがある');

    /* 一覧の言語のボタンで日本語に。ツールのページにも効き、読み込み直した後も残る */
    await page.goto(site.base + '/index.html');
    await page.waitForFunction(() => window.I18n && I18n.isReady());
    await Promise.all([page.waitForEvent('load'), page.click('#languageBtn')]);
    await page.waitForSelector('#sorts:not([hidden])', { timeout: 3000 });
    expect(
      (await page.textContent('[data-sort="recent"]')).trim() === '最近',
      '切り替えた後に一覧が日本語にならない',
    );
    await page.goto(site.base + '/tools/calculator/calculator.html');
    await page.waitForFunction(() => window.I18n && I18n.isReady());
    expect(
      (await page.textContent('.site-bar h1')).trim().startsWith('電卓'),
      '切り替えた後に日本語の見出しにならない',
    );
    await page.reload();
    await page.waitForFunction(() => window.I18n && I18n.isReady());
    expect((await page.getAttribute('html', 'lang')) === 'ja', '読み込み直すと英語に戻る');
    expect(
      (await page.getAttribute('#backBtn', 'aria-label')) === 'ツール一覧へ戻る',
      '戻るボタンの名前が日本語でない',
    );

    const { real } = splitErrors(logs);
    if (real.length) problems.push('エラー(英語): ' + real.join(' / '));
    await context.close();

    /* 段 3: 英語の端末で、訳したツールの画面に日本語が残っていない(日本でしか使わない物を除く) */
    const KEEP_JAPANESE =
      /13時05分09秒|壱弐参|子丑寅|赤口|先勝|友引|先負|仏滅|大安|令和\d+年|一粒万倍日|天赦日|[甲乙丙丁戊己庚辛壬癸][子丑寅卯辰巳午未申酉戌亥]|\S*の日|\S*休日|元日|天皇誕生日|[立小大][春夏秋冬雪暑寒満]|[春秋]分|[夏冬]至|清明|穀雨|芒種|処暑|白露|寒露|霜降|雨水|啓蟄/g;
    for (const slug of Object.keys(en.tools).filter((s) => en.tools[s].text)) {
      const tool = await site.open(`tools/${slug}/${slug}.html`, { locale: 'en-US' });
      await tool.page.waitForFunction(() => window.I18n && I18n.isReady());
      await tool.page.waitForTimeout(300);
      const left = await tool.page.evaluate(() => {
        const skip = 'script,style,textarea,#eruda,.color-menu,.info-menu';
        const out = [],
          walker = document.createTreeWalker(
            document.body,
            NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT,
          );
        while (walker.nextNode()) {
          const n = walker.currentNode;
          if (n.nodeType === 3) {
            if (!n.parentElement.closest(skip)) out.push(n.nodeValue);
          } else if (!n.closest(skip))
            ['aria-label', 'title', 'placeholder'].forEach(
              (a) => n.getAttribute(a) && out.push(n.getAttribute(a)),
            );
        }
        return out;
      });
      const japanese = left
        .map((t) => t.replace(KEEP_JAPANESE, '').trim())
        .filter((t) => /[ぁ-んァ-ヶ一-龥]/.test(t));
      if (japanese.length)
        problems.push(`${slug} に日本語が残っている(${japanese.slice(0, 3).join(' / ')})`);
      await tool.context.close();
    }

    /* 日本語の端末: 今までどおり */
    const ja = await site.open('index.html');
    await ja.page.waitForSelector('#sorts:not([hidden])', { timeout: 3000 });
    expect(
      (await ja.page.textContent('[data-sort="recent"]')).trim() === '最近',
      '日本語の端末で並びのボタンが変わった',
    );
    expect(
      /件$/.test(await ja.page.textContent('#list .cat-head')),
      '日本語の端末で分類の件数が変わった',
    );
    expect(
      (await ja.page.getAttribute('#languageBtn', 'aria-label')) ===
        '表示の言語: 日本語(押すとEnglish)',
      '日本語の端末で言語のボタンの名前が違う',
    );
    if (splitErrors(ja.logs).real.length)
      problems.push('エラー(日本語): ' + splitErrors(ja.logs).real.join(' / '));
    await ja.context.close();
  } finally {
    await site.close();
  }
  process.exit(report('多言語化(段 2・段 3)', problems) ? 0 : 1);
})();
