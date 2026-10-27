const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const DOCS = path.join(__dirname, '..', 'docs');

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

  for (const corner of ['stack-1', 'stack-6-slide-8']) {
    test(`the current card opens centred, even at the grid's edge (#${corner})`, async ({ page }) => {
      await ready(page, '/docs/stacked.slides.html#/' + corner);
      await page.click('.deck-launcher-overview');
      const off = await page.evaluate(() => {
        const panel = document.querySelector('.deck-thumbs').getBoundingClientRect();
        const card = document.querySelector('.deck-thumb.is-current').getBoundingClientRect();
        return [card.left + card.width / 2 - (panel.left + panel.width / 2),
                card.top + card.height / 2 - (panel.top + panel.height / 2)];
      });
      expect(Math.abs(off[0]), 'horizontally off centre').toBeLessThan(2);
      expect(Math.abs(off[1]), 'vertically off centre').toBeLessThan(2);
    });
  }

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

  test('the grid follows the keys, keeping the current card centred', async ({ page }) => {
    await ready(page, '/docs/stacked.slides.html');
    await page.evaluate(() => Reveal.slide(2, 1));
    await page.keyboard.press('o');
    for (const key of ['l', 'l', 'j', 'j', 'h', 'k']) {
      await page.keyboard.press(key);
      await expect.poll(() => page.evaluate(() => {
        const panel = document.querySelector('.deck-thumbs').getBoundingClientRect();
        const card = document.querySelector('.deck-thumb.is-current').getBoundingClientRect();
        return Math.max(Math.abs(card.left + card.width / 2 - (panel.left + panel.width / 2)),
                        Math.abs(card.top + card.height / 2 - (panel.top + panel.height / 2)));
      }), key).toBeLessThan(2);
    }
  });

  test('arrow and vim keys walk the grid as reveal s overview does', async ({ page }) => {
    await ready(page, '/docs/stacked.slides.html');
    await page.evaluate(() => Reveal.slide(2, 1));
    await page.keyboard.press('o');
    await expect(page.locator('.deck-thumbs')).toBeVisible();

    // A slide at a time across the 2-D map, keeping the row: the deck is in
    // linear mode, which outside the grid makes these keys next/prev.
    for (const [key, h, v] of [
      ['ArrowDown', 2, 2], ['j', 2, 3], ['ArrowRight', 3, 3], ['l', 4, 3],
      ['ArrowUp', 4, 2], ['k', 4, 1], ['ArrowLeft', 3, 1], ['h', 2, 1]
    ]) {
      await page.keyboard.press(key);
      const index = shape.slice(0, h).flat().length + v;
      await expect(page.locator('.deck-thumbs .deck-thumb').nth(index), key).toHaveClass(/is-current/);
      await expect(page.locator('.deck-thumbs .deck-thumb.is-current'), key).toHaveCount(1);
      expect(await page.evaluate(() => Reveal.getCurrentSlide().id), key).toBe(shape[h][v]);
    }

    await page.keyboard.press('Escape');
    await expect(page.locator('.deck-thumbs')).toBeHidden();
    expect(await page.evaluate(() => Reveal.getCurrentSlide().id)).toBe(shape[2][1]);
  });

  test('a deck with no thumbnails keeps reveal s own overview', async ({ page }) => {
    await page.goto('/docs/index.slides.html');
    await page.waitForFunction(() => window.Reveal && Reveal.isReady());
    await page.click('.deck-launcher-overview');
    await page.waitForFunction(() => Reveal.isOverview());
    expect(await page.locator('.deck-thumbs').count()).toBe(0);
  });

  test('the manifest is revalidated, never read from a stale cache', async ({ page }) => {
    // A home-screen web app kept an old index.json under force-cache; after a
    // redeploy its count disagreed and the iPad fell to reveal's overview.
    await page.addInitScript(() => {
      const fetch = window.fetch;
      window.fetch = (url, init) => {
        if (String(url).endsWith('index.json')) window.manifestCache = init && init.cache;
        return fetch(url, init);
      };
    });
    await ready(page, '/docs/stacked.slides.html');
    expect(await page.evaluate(() => window.manifestCache)).toBe('no-cache');
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
