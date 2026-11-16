const { test, expect } = require('@playwright/test');

// Cmd/Ctrl+P on the live deck prints the full-stage print view, not the
// screen: it loads in a hidden frame and asks to print once its pages are laid out.

test('Cmd/Ctrl+P prints the print view from a hidden frame', async ({ page }) => {
  await page.addInitScript(() => {
    window.printed = [];
    window.print = () => window.top.printed.push(location.search + ' ' + document.querySelectorAll('.pdf-page .deck-print-chrome').length);
  });
  await page.goto('/docs/print.slides.html');
  await page.waitForFunction(() => window.Reveal && Reveal.isReady());
  await page.keyboard.press('ControlOrMeta+p');
  await expect.poll(() => page.evaluate(() => window.printed)).toEqual(['?print-pdf&pdfMaxPagesPerSlide=1&save-pdf 3']);
  await expect(page.locator('iframe.deck-print-frame')).toHaveCount(0);
  expect(await page.evaluate(() => Reveal.getIndices().h)).toBe(0);
});

test('the print view opened for saving asks to print once its pages are ready', async ({ page }) => {
  await page.addInitScript(() => {
    window.printed = [];
    window.print = () => window.printed.push(document.querySelectorAll('.pdf-page .deck-print-chrome').length);
  });
  await page.goto('/docs/print.slides.html?print-pdf&pdfMaxPagesPerSlide=1&save-pdf');
  await expect.poll(() => page.evaluate(() => window.printed)).toEqual([3]);
});

test('the plain print view does not ask to print', async ({ page }) => {
  await page.addInitScript(() => { window.printed = 0; window.print = () => window.printed++; });
  await page.goto('/docs/print.slides.html?print-pdf');
  await page.waitForFunction(() => document.querySelector('.pdf-page .deck-print-chrome'));
  await page.waitForTimeout(1000);
  expect(await page.evaluate(() => window.printed)).toBe(0);
});
