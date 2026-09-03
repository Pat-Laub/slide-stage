const { test, expect } = require('@playwright/test');

// The stage draws the page furniture but owns none of its colour. A deck that
// loads the format extension and no theme layer must still lay out in authored
// units, and must come out unbranded -- that is the contract a non-UNSW
// consumer (scribble) relies on.

const BARE = '/docs/bare.slides.html';
const THEMED = '/docs/index.slides.html';

async function geometry(page) {
  await page.waitForFunction(() => window.Reveal && Reveal.isReady());
  return page.evaluate(() => {
    const stage = document.querySelector('[data-deck-stage]');
    const reveal = document.querySelector('.reveal');
    const paint = element => {
      const style = getComputedStyle(element);
      return { background: style.backgroundColor, image: style.backgroundImage };
    };
    return {
      stage: [stage.offsetWidth, stage.offsetHeight],
      content: [reveal.offsetWidth, reveal.offsetHeight],
      inset: [reveal.offsetLeft, reveal.offsetTop],
      rootFontSize: parseFloat(getComputedStyle(reveal).fontSize),
      rail: paint(document.querySelector('[data-deck-stage]')) &&
        (() => {
          const style = getComputedStyle(stage, '::after');
          return { background: style.backgroundColor, width: style.width };
        })(),
      artwork: (() => {
        const style = getComputedStyle(stage, '::before');
        return { image: style.backgroundImage };
      })()
    };
  });
}

test('the bare stage lays out in the same authored units as a themed deck', async ({ page }) => {
  await page.goto(BARE);
  const bare = await geometry(page);
  await page.goto(THEMED);
  const themed = await geometry(page);

  expect(bare.stage).toEqual([3744, 2106]);
  expect(bare.stage).toEqual(themed.stage);
  expect(bare.content).toEqual(themed.content);
  expect(bare.inset).toEqual(themed.inset);
  expect(bare.rootFontSize).toBeCloseTo(themed.rootFontSize, 0);
  // The rail is page furniture, so it occupies its width either way; only its
  // colour is the theme's business.
  expect(bare.rail.width).toBe(themed.rail.width);
});

test('the bare stage carries no branding', async ({ page }) => {
  await page.goto(BARE);
  const bare = await geometry(page);
  // `transparent` computes to rgba(0, 0, 0, 0).
  expect(bare.rail.background).toBe('rgba(0, 0, 0, 0)');
  expect(bare.artwork.image).toBe('none');
});

test('the themed deck does carry the branding', async ({ page }) => {
  await page.goto(THEMED);
  const themed = await geometry(page);
  expect(themed.rail.background).toBe('rgb(254, 220, 0)');
  expect(themed.artwork.image).toContain('svg');
});

// The stylesheet is the single source of truth for the authored page: it
// publishes --deck-width / --deck-height on the stage and deck-stage-open.html
// reads them back. Before that they were independent constants, so overriding
// the SCSS moved the CSS box while the fit transform kept scaling the old
// rectangle -- a deck that letterboxes wrongly with every assertion still green.
test('overriding the authored size moves the box and the transform together', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  await page.goto('/docs/resized.slides.html');
  await page.waitForFunction(() => window.Reveal && Reveal.isReady());

  const measured = await page.evaluate(() => {
    const stage = document.querySelector('[data-deck-stage]');
    const style = getComputedStyle(stage);
    return {
      authored: [stage.offsetWidth, stage.offsetHeight],
      custom: [
        parseFloat(style.getPropertyValue('--deck-width')),
        parseFloat(style.getPropertyValue('--deck-height'))
      ],
      // What the fit calculation believes the page is: at a scale of 1 the
      // rectangle it fits is exactly the authored page.
      fitAt: stage.deckFitForViewport(1920, 1080)
    };
  });

  expect(measured.authored).toEqual([1920, 1080]);
  expect(measured.custom).toEqual([1920, 1080]);
  // A viewport exactly the authored size must come out at scale 1: that only
  // holds if the transform is fitting the same rectangle the CSS box drew.
  expect(measured.fitAt.scale).toBeCloseTo(1, 3);
  expect(measured.fitAt.rotate).toBe(false);

  // And it still fills the viewport it is actually given.
  const box = await page.locator('[data-deck-stage]').boundingBox();
  expect(box.width / box.height).toBeCloseTo(16 / 9, 2);
  expect(Math.max(box.width / 1440, box.height / 900)).toBeCloseTo(1, 2);
  await context.close();
});
