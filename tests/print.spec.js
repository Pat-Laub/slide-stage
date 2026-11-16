const { test, expect } = require('@playwright/test');

// Each printed page is the whole authored stage, laid out as the live deck is.

test('a slide background fills the stage on screen', async ({ page }) => {
  await page.goto('/docs/print.slides.html#/print-coloured');
  await page.waitForFunction(() => window.Reveal && Reveal.isReady());
  const [stage, background] = await page.evaluate(() => ['.deck-stage', '.slide-background.present'].map(q => {
    const r = document.querySelector(q).getBoundingClientRect();
    return [r.left, r.top, r.width, r.height].map(Math.round);
  }));
  expect(background).toEqual(stage);
});

test.describe('the print view', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/docs/print.slides.html?print-pdf');
    await page.waitForFunction(() => document.querySelector('.pdf-page .deck-print-chrome'));
  });

  test('prints each slide on a page the size of the stage', async ({ page }) => {
    const pages = await page.evaluate(() => [...document.querySelectorAll('.pdf-page')].map(p => [p.offsetWidth, p.offsetHeight]));
    expect(pages.length).toBe(3);
    for (const size of pages) expect(size).toEqual([3744, 2108]);
  });

  test('a slide background fills the printed page', async ({ page }) => {
    const sizes = await page.evaluate(() => {
      const bg = document.querySelector('.pdf-page:nth-child(2) .slide-background');
      return [bg.offsetLeft, bg.offsetTop, bg.offsetWidth, bg.offsetHeight];
    });
    expect(sizes).toEqual([0, 0, 3744, 2108]);
  });

  test('each page prints its own footer, or else the deck footer', async ({ page }) => {
    const footers = await page.evaluate(() => [...document.querySelectorAll('.pdf-page')]
      .map(p => [...p.querySelectorAll(':scope > .footer')].map(f => f.textContent.trim())));
    expect(footers.slice(1)).toEqual([["The deck’s footer"], ["This slide’s own footer."]]);
  });
});
