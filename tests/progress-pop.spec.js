const { test, expect } = require('@playwright/test');

test.skip(({ browserName }) => browserName !== 'chromium', 'one engine is enough');

// Count animation frames requested after the deck has settled.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.__frames = 0;
    const raf = window.requestAnimationFrame;
    window.requestAnimationFrame = cb => { window.__frames++; return raf.call(window, cb); };
  });
});

async function framesWhileIdle(page) {
  await page.waitForTimeout(1500);
  const before = await page.evaluate(() => window.__frames);
  await page.waitForTimeout(1000);
  return (await page.evaluate(() => window.__frames)) - before;
}

test('an idle deck requests no animation frames', async ({ page }) => {
  await page.goto('/docs/index.slides.html');
  await page.waitForFunction(() => window.Reveal && Reveal.isReady());
  expect(await framesWhileIdle(page)).toBe(0);
});

test('the print view has no pop and requests no animation frames', async ({ page }) => {
  await page.goto('/docs/index.slides.html?print-pdf');
  await page.waitForFunction(() => document.querySelector('.pdf-page'));
  expect(await framesWhileIdle(page)).toBe(0);
  await expect(page.locator('.progress-pop')).toHaveCount(0);
});

test('the slide number still pops on a slide change', async ({ page }) => {
  await page.goto('/docs/index.slides.html');
  await page.waitForFunction(() => window.Reveal && Reveal.isReady());
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('.reveal .progress.popping .progress-pop')).toHaveText('2');
});
