const { test, expect } = require('@playwright/test');

// Start just outside the heading: transparent previous slides used to become
// the selection anchor, adding their text to what looked like a title selection.
test('dragging beside a slide heading selects only that heading', async ({ page }) => {
  await page.goto('/docs/index.slides.html#/wide-prose');
  await page.waitForFunction(() => window.Reveal && Reveal.isReady());
  const heading = page.locator('#wide-prose h2');
  const box = await heading.boundingBox();
  await page.mouse.move(box.x - 4, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width, box.y + box.height / 2, { steps: 20 });
  await page.mouse.up();
  expect((await page.evaluate(() => getSelection().toString())).trim())
    .toBe((await heading.innerText()).trim());
});
