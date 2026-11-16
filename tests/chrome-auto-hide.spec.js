const { test, expect } = require('@playwright/test');

// `stage-chrome: auto-hide` keeps the arrows and the corner row out of sight on
// a projected screen, and brings them up for anyone who moves the mouse.

const hidden = locator => locator.evaluate(el => {
  const s = getComputedStyle(el);
  return s.display === 'none' || s.visibility === 'hidden' || Number(s.opacity) < 0.05;
});

async function open(page, path) {
  await page.goto(path);
  await page.waitForFunction(() => window.Reveal && Reveal.isReady());
  return {
    arrows: page.locator('.reveal .controls'),
    corner: page.locator('.deck-stage > .deck-launchers')
  };
}

test('the controls start hidden and keys do not bring them up', async ({ page }) => {
  const { arrows, corner } = await open(page, '/docs/auto-hide.slides.html');
  expect(await hidden(arrows)).toBe(true);
  expect(await hidden(corner)).toBe(true);

  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(300);
  expect(await hidden(arrows)).toBe(true);
  expect(await hidden(corner)).toBe(true);
});

test('moving the mouse shows them, and they go again when it rests', async ({ page }) => {
  const { arrows, corner } = await open(page, '/docs/auto-hide.slides.html');
  const { width, height } = page.viewportSize();
  await page.mouse.move(width / 2, height / 2);
  await page.mouse.move(width / 2 + 40, height / 2 + 40);
  await expect.poll(() => hidden(arrows)).toBe(false);
  await expect.poll(() => hidden(corner)).toBe(false);

  await expect.poll(() => hidden(arrows), { timeout: 5000 }).toBe(true);
  await expect.poll(() => hidden(corner), { timeout: 5000 }).toBe(true);
});

test('they stay up while the mouse rests on them', async ({ page }) => {
  const { corner } = await open(page, '/docs/auto-hide.slides.html');
  const { width, height } = page.viewportSize();
  await page.mouse.move(width / 2, height / 2);
  await expect.poll(() => hidden(corner)).toBe(false);
  const box = await corner.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForTimeout(3500);
  expect(await hidden(corner)).toBe(false);
});

test('a deck that does not opt in keeps its controls on show', async ({ page }) => {
  const { arrows, corner } = await open(page, '/docs/bare.slides.html');
  expect(await hidden(arrows)).toBe(false);
  expect(await hidden(corner)).toBe(false);
});

test.describe('on a touch screen', () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 1024, height: 768 } });
  test.skip(({ browserName }) => browserName === 'firefox', 'Firefox has no mobile emulation');

  test('there is no mouse to wake them, so they stay on show', async ({ page }) => {
    const { arrows, corner } = await open(page, '/docs/auto-hide.slides.html');
    await page.waitForTimeout(3000);
    expect(await hidden(arrows)).toBe(false);
    expect(await hidden(corner)).toBe(false);
  });
});
