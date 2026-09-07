const { test, expect } = require('@playwright/test');

const DECK = '/docs/index.slides.html';

async function ready(page) {
  await page.waitForFunction(() => window.Reveal && Reveal.isReady());
}

test('the fixed slide canvas keeps a 16:9 aspect ratio at common viewport sizes', async ({ browser }) => {
  for (const viewport of [{ width: 1280, height: 800 }, { width: 1440, height: 900 }, { width: 1024, height: 768 }]) {
    const context = await browser.newContext({ viewport });
    const page = await context.newPage();
    await page.goto(DECK);
    await ready(page);
    const box = await page.locator('[data-deck-stage]').boundingBox();
    expect(box).not.toBeNull();
    expect(box.width / box.height).toBeCloseTo(16 / 9, 2);
    expect(box.width).toBeLessThanOrEqual(viewport.width + 1);
    expect(box.height).toBeLessThanOrEqual(viewport.height + 1);
    await context.close();
  }
});

test('a deep-linked slide is shown before the title artwork can flash', async ({ page }) => {
  await page.goto(DECK + '#/authored-canvas');
  await ready(page);
  await expect(page.locator('[data-deck-stage]')).not.toHaveClass(/deck-stage-title/);
  await expect(page.locator('section.present#authored-canvas')).toBeVisible();
});

test('brushing the progress bar cannot jump to another slide', async ({ page }) => {
  await page.goto(DECK);
  await ready(page);
  await page.evaluate(() => Reveal.slide(2, 0));

  const progress = page.locator('.reveal .progress');
  await expect(progress).toHaveCSS('pointer-events', 'none');
  const box = await progress.boundingBox();
  expect(box).not.toBeNull();

  // Reveal's default progress control maps the click's horizontal position to
  // a slide. Pencil contact near either end must pass through harmlessly.
  await page.mouse.click(box.x + box.width * 0.9, box.y + box.height / 2);
  await page.waitForTimeout(100);
  expect(await page.evaluate(() => Reveal.getIndices().h)).toBe(2);
});

// The deck is authored at 3744 x 2106 and shrunk to fit, so on every screen the
// stage must still fill one dimension exactly -- a deck drawn at a fraction of
// the viewport is the symptom of the fit transform and the authored size having
// drifted apart.
for (const viewport of [
  { width: 1440, height: 900 },
  { width: 1194, height: 834 },   // iPad Pro 11, landscape
  { width: 3840, height: 2160 }
]) {
  test(`the deck fills the viewport at ${viewport.width}x${viewport.height}`, async ({ browser }) => {
    const context = await browser.newContext({ viewport });
    const page = await context.newPage();
    await page.goto(DECK);
    await ready(page);
    const box = await page.locator('[data-deck-stage]').boundingBox();
    expect(box.width / box.height).toBeCloseTo(16 / 9, 2);
    // One dimension is filled exactly; the other is the unavoidable letterbox.
    const filled = Math.max(box.width / viewport.width, box.height / viewport.height);
    expect(filled).toBeCloseTo(1, 2);
    await context.close();
  });
}

// The test above measures the stage element, whose size the stylesheet sets
// itself: it passes even on a page whose content never laid out (a missing
// theme stylesheet leaves the decks unstyled, which is exactly how they shipped
// once). These assertions look inside instead, at lengths that only come out
// right if the authored 3744 x 2106 coordinate system reached the content.
for (const viewport of [
  { width: 1440, height: 900 },
  { width: 1194, height: 834 }
]) {
  test(`slide content is laid out in authored units at ${viewport.width}x${viewport.height}`, async ({ browser }) => {
    const context = await browser.newContext({ viewport });
    const page = await context.newPage();
    await page.goto(DECK + '#/wide-prose');
    await ready(page);

    const layout = await page.evaluate(() => {
      const stage = document.querySelector('[data-deck-stage]');
      const reveal = document.querySelector('.reveal');
      const slide = document.querySelector('.reveal .slides section.present');
      // offsetWidth/Height are pre-transform, so they report the authored
      // canvas rather than whatever the fit transform scaled it to.
      const blocks = Array.from(slide.querySelectorAll('h1, h2, h3, p, ul, ol'))
        .filter(el => el.offsetWidth > 0 && el.textContent.trim());
      const widest = blocks.sort((a, b) => b.offsetWidth - a.offsetWidth)[0];
      return {
        stage: [stage.offsetWidth, stage.offsetHeight],
        content: [reveal.offsetWidth, reveal.offsetHeight],
        inset: [reveal.offsetLeft, reveal.offsetTop],
        rootFontSize: parseFloat(getComputedStyle(reveal).fontSize),
        widest: widest && {
          width: widest.offsetWidth,
          fontSize: parseFloat(getComputedStyle(widest).fontSize)
        }
      };
    });

    expect(layout.stage).toEqual([3744, 2106]);
    expect(layout.content).toEqual([3072, 1845]);
    expect(layout.inset).toEqual([336, 120]);
    // 28px x 3. Text scaled for the old canvas is the failure this catches.
    expect(layout.rootFontSize).toBeCloseTo(84, 0);
    expect(layout.widest).toBeTruthy();
    expect(layout.widest.fontSize).toBeGreaterThan(60);
    // Real prose spans the content frame rather than collapsing to a corner.
    expect(layout.widest.width).toBeGreaterThan(3072 * 0.4);
    await context.close();
  });
}

// The stage must never scale itself with CSS `zoom`. Combined with a
// compensating transform it cancels out perfectly on desktop -- so every test
// here and every desktop screenshot looks right -- while iOS scales the layout
// boxes without scaling the type with them, and the deck renders full-size with
// glyphs at a fraction of their authored size. Nothing observable from a
// desktop browser catches that, so assert the mechanism is absent.
test('the stage is never scaled with CSS zoom', async ({ browser }) => {
  for (const viewport of [{ width: 1440, height: 900 }, { width: 1194, height: 834 }]) {
    const context = await browser.newContext({ viewport });
    const page = await context.newPage();
    await page.goto(DECK);
    await ready(page);
    const zoom = await page.evaluate(() => {
      const stage = document.querySelector('[data-deck-stage]');
      return { computed: getComputedStyle(stage).zoom, inline: stage.style.zoom };
    });
    expect(zoom.computed, `${viewport.width}x${viewport.height}`).toBe('1');
    expect(zoom.inline, `${viewport.width}x${viewport.height}`).toBe('');
    await context.close();
  }
});

// The fit calculation itself, without touching the window: a portrait phone
// rotates the stage, everything wider does not.
test('the fit calculation rotates only for a narrow portrait viewport', async ({ page }) => {
  await page.goto(DECK);
  await ready(page);
  const fits = await page.evaluate(() => {
    const stage = document.querySelector('[data-deck-stage]');
    const at = (w, h) => stage.deckFitForViewport(w, h);
    return {
      laptop: at(1440, 900),
      ipadPortrait: at(834, 1194),
      phonePortrait: at(390, 844),
      phoneLandscape: at(844, 390)
    };
  });
  expect(fits.laptop.rotate).toBe(false);
  expect(fits.ipadPortrait.rotate).toBe(false);   // wide enough to letterbox
  expect(fits.phonePortrait.rotate).toBe(true);
  expect(fits.phoneLandscape.rotate).toBe(false);
  // The scale always shrinks the authored page, never magnifies it.
  for (const [name, fit] of Object.entries(fits)) {
    expect(fit.scale, name).toBeGreaterThan(0);
    expect(fit.scale, name).toBeLessThan(1);
  }
});

// Quarto's reveal-menu is a `position: fixed` control sized for a browser page,
// not for the authored canvas, so on the stage it lands in the wrong corner at a
// fraction of the size of the buttons beside it. The stage turns it off rather
// than keep compensating for it in SCSS.
test('the slide menu button is not part of the stage furniture', async ({ page }) => {
  await page.goto(DECK);
  await ready(page);
  await expect(page.locator('.slide-menu-button')).toHaveCount(0);
});

// The bug this rail was built to end: the F shortcut fullscreened the viewport
// shell while a separate button elsewhere fullscreened Reveal's inset viewport,
// a fixed-size element inside the stage's fit transform. Desktop browsers hid
// the difference by sizing the fullscreen element to the screen; iOS Safari
// laid it out at its authored 3744px on a black backdrop.
async function fullscreenTarget(page, act) {
  await page.evaluate(() => {
    window.__fullscreened = [];
    const record = function () { window.__fullscreened.push(this.className); };
    Element.prototype.requestFullscreen = record;
    Element.prototype.webkitRequestFullscreen = record;
  });
  await act();
  return page.evaluate(() => window.__fullscreened);
}

test('the full-screen button and the F shortcut expand the same element', async ({ page }) => {
  await page.goto(DECK);
  await ready(page);

  const byKey = await fullscreenTarget(page, () => page.keyboard.press('f'));
  expect(byKey).toEqual(['deck-viewport-shell']);

  const byButton = await fullscreenTarget(page, () =>
    page.locator('.deck-launchers .deck-launcher-fullscreen').click());
  expect(byButton).toEqual(byKey);
});
