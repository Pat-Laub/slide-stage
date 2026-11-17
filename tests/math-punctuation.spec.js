const { test, expect } = require('@playwright/test');

const BARE = '/docs/bare.slides.html';

// WebKit allows a line break between an inline formula and the punctuation
// after it, Chromium does not, so a formula that ends flush with the measure
// left its full stop alone on the next line on the iPad only.
test('punctuation after inline maths stays on the formula\'s line', async ({ page }) => {
  await page.goto(BARE + '#/bare-math-punct');
  await page.waitForFunction(() => window.Reveal && Reveal.isReady());

  const lines = await page.evaluate(() => {
    const para = document.querySelector('section#bare-math-punct p');
    const results = [];
    for (const math of para.querySelectorAll('.math.inline')) {
      const punct = math.nextSibling ?? math.parentElement.nextSibling;
      // Make the formula end exactly at the right edge of the paragraph.
      para.style.width = '';
      const box = para.getBoundingClientRect();
      const scale = box.width / para.offsetWidth;
      para.style.width = `${(math.getBoundingClientRect().right - box.left) / scale + 0.5}px`;
      const range = document.createRange();
      const text = punct.nodeType === Node.TEXT_NODE ? punct : punct.firstChild;
      range.setStart(text, 0);
      range.setEnd(text, 1);
      results.push({
        punct: text.textContent[0],
        mathBottom: math.getBoundingClientRect().bottom,
        punctBottom: range.getBoundingClientRect().bottom
      });
    }
    return results;
  });

  expect(lines.map(l => l.punct)).toEqual([',', '.']);
  for (const l of lines) expect(l.punctBottom).toBeLessThan(l.mathBottom + 5);
});

// Likewise between an opening bracket and the formula after it, in every
// browser: "(" was left alone at the end of a line.
for (const [id, mark] of [['bare-math-open', '('], ['bare-math-quote', '\u201C']]) {
test(`an opening ${mark} stays on the line of the inline maths after it`, async ({ page }) => {
  await page.goto(BARE + '#/' + id);
  await page.waitForFunction(() => window.Reveal && Reveal.isReady());

  const lines = await page.evaluate(([id, mark]) => {
    const para = document.querySelector(`section#${id} p`);
    const math = para.querySelector('.math.inline');
    const walker = document.createTreeWalker(para, NodeFilter.SHOW_TEXT);
    let open = null;
    while (walker.nextNode()) {
      const node = walker.currentNode;
      if (math.contains(node)) break;
      if (node.textContent.includes(mark)) open = node;
    }
    const at = open.textContent.lastIndexOf(mark);
    const range = document.createRange();
    range.setStart(open, at);
    range.setEnd(open, at + 1);
    // Make the bracket end exactly at the right edge of the paragraph.
    const box = para.getBoundingClientRect();
    const scale = box.width / para.offsetWidth;
    para.style.width = `${(range.getBoundingClientRect().right - box.left) / scale + 0.5}px`;
    return {
      openBottom: range.getBoundingClientRect().bottom,
      mathBottom: math.getBoundingClientRect().bottom
    };
  }, [id, mark]);

  expect(lines.mathBottom).toBeLessThan(lines.openBottom + 5);
});
}
