const { test, expect } = require('@playwright/test');

const zoomed = page => page.evaluate(() => document.documentElement.classList.contains('zoomed'));

async function open(page) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/docs/index.slides.html');
  await page.waitForFunction(() => window.Reveal && Reveal.isReady());
  await page.mouse.move(400, 300);
}

test.describe('Z zooms at the pointer', () => {
  test('Z zooms in and Z again zooms out', async ({ page }) => {
    await open(page);
    await page.keyboard.press('z');
    await expect.poll(() => zoomed(page)).toBe(true);
    await page.keyboard.press('z');
    await expect.poll(() => zoomed(page)).toBe(false);
  });

  test('changing slide zooms back out', async ({ page }) => {
    await open(page);
    await page.keyboard.press('z');
    await expect.poll(() => zoomed(page)).toBe(true);
    await page.evaluate(() => Reveal.next());
    await expect.poll(() => zoomed(page)).toBe(false);
  });

  test('Z still zooms in after the page was un-zoomed behind the plugin', async ({ page }) => {
    await open(page);
    await page.keyboard.press('z');
    await expect.poll(() => zoomed(page)).toBe(true);
    await page.evaluate(() => {
      document.body.style.transform = '';
      document.documentElement.classList.remove('zoomed');
    });
    await page.keyboard.press('z');
    await expect.poll(() => zoomed(page)).toBe(true);
  });
});
