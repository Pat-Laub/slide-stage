const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const { BUILD_ROOT } = require('../scripts/buildpaths.js');

const DOCS = path.join(BUILD_ROOT, 'src', 'docs');

// A 1x1 JPEG. The panel is being measured, not the pictures: what matters is
// that each card is a real decodable image at the deck's own aspect ratio,
// which the stylesheet sets rather than the file.
const PIXEL = Buffer.from(
  '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0a' +
  'HBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAA' +
  'AAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==',
  'base64'
);

/** Stand a `<deck>.thumbs/` directory of `count` placeholder cards. */
function bake(deck, count) {
  const dir = path.join(DOCS, deck.replace(/\.html$/, '') + '.thumbs');
  fs.mkdirSync(dir, { recursive: true });
  for (let n = 1; n <= count; n++) {
    fs.writeFileSync(path.join(dir, String(n).padStart(3, '0') + '.jpg'), PIXEL);
  }
  fs.writeFileSync(path.join(dir, 'index.json'), JSON.stringify({ count, width: 520 }));
  return dir;
}

/** The deck's slides as the thumbnails are numbered: columns of leaf sections. */
function deckShape() {
  const slides = document.querySelector('.reveal .slides');
  const tops = [...slides.children].filter(child => child.tagName === 'SECTION');
  return tops.map(top => {
    const nested = [...top.children].filter(child => child.tagName === 'SECTION');
    return (nested.length ? nested : [top]).map(section => section.id);
  });
}

async function ready(page, deck) {
  await page.goto(deck);
  await page.waitForFunction(() => window.Reveal && Reveal.isReady());
  // install() fetches the manifest before it builds anything.
  await page.waitForSelector('.deck-thumbs', { state: 'attached' });
}

test.describe('thumbnail overview', () => {
  let shape;

  test.beforeAll(async ({ browser }) => {
    // The fixture has to match the deck, so count its slides first.
    const page = await browser.newPage();
    await page.goto('http://127.0.0.1:4175/docs/stacked.slides.html');
    await page.waitForFunction(() => window.Reveal && Reveal.isReady());
    shape = await page.evaluate(deckShape);
    await page.close();
    bake('stacked.slides.html', shape.flat().length);
    bake('resized.slides.html', 999);  // deliberately wrong, for the fallback
  });

  test('the grid button opens the baked panel, not reveal overview', async ({ page }) => {
    await ready(page, '/docs/stacked.slides.html');
    await page.click('.deck-launcher-overview');
    await expect(page.locator('.deck-thumbs')).toBeVisible();
    expect(await page.evaluate(() => Reveal.isOverview())).toBe(false);
  });

  test('every slide has a card, laid out as the deck s 2-D map', async ({ page }) => {
    await ready(page, '/docs/stacked.slides.html');
    await page.click('.deck-launcher-overview');

    const cards = await page.locator('.deck-thumbs .deck-thumb').evaluateAll(all =>
      all.map(card => ({
        column: Number(card.style.gridColumn),
        row: Number(card.style.gridRow),
        src: card.querySelector('img').getAttribute('src')
      })));

    const expected = [];
    shape.forEach((column, h) => column.forEach((_, v) => {
      expected.push({ column: h + 1, row: v + 1 });
    }));
    expect(cards.map(({ column, row }) => ({ column, row }))).toEqual(expected);

    // Numbered in document order, which is the order the build step prints in.
    cards.forEach((card, index) => {
      expect(card.src).toContain(String(index + 1).padStart(3, '0') + '.jpg');
    });
  });

  test('no slide is rendered into the grid', async ({ page }) => {
    await ready(page, '/docs/stacked.slides.html');
    await page.click('.deck-launcher-overview');
    // The crash this replaces was reveal transforming every section at once.
    expect(await page.evaluate(() =>
      document.querySelector('.reveal').classList.contains('overview'))).toBe(false);
  });

  test('tapping a card goes to that slide and closes the grid', async ({ page }) => {
    await ready(page, '/docs/stacked.slides.html');
    await page.click('.deck-launcher-overview');

    const target = shape[2][1];  // third stack, second slide down
    const index = shape.slice(0, 2).flat().length + 1;
    await page.locator('.deck-thumbs .deck-thumb').nth(index).click();

    await expect(page.locator('.deck-thumbs')).toBeHidden();
    expect(await page.evaluate(() => Reveal.getCurrentSlide().id)).toBe(target);
  });

  test('a deck with no thumbnails keeps reveal s own overview', async ({ page }) => {
    await page.goto('/docs/index.slides.html');
    await page.waitForFunction(() => window.Reveal && Reveal.isReady());
    await page.click('.deck-launcher-overview');
    await page.waitForFunction(() => Reveal.isOverview());
    expect(await page.locator('.deck-thumbs').count()).toBe(0);
  });

  test('thumbnails that do not match the deck are not shown', async ({ page }) => {
    // 999 pictures for a handful of slides: the directory is stale, so the
    // cards would point at the wrong slides. Fall back rather than mislead.
    await page.goto('/docs/resized.slides.html');
    await page.waitForFunction(() => window.Reveal && Reveal.isReady());
    await page.click('.deck-launcher-overview');
    await page.waitForFunction(() => Reveal.isOverview());
    expect(await page.locator('.deck-thumbs').count()).toBe(0);
  });
});
