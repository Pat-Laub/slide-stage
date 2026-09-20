const { test, expect } = require('@playwright/test');

// One slide unit in CSS pixels: the stage's fit transform times the extra scale
// Reveal puts on `.slides` in overview. Measuring a slide instead would assume
// how wide the overview frame is, which is exactly what these tests check.
function slideUnit() {
  const stage = document.querySelector('[data-deck-stage]').getBoundingClientRect();
  const slides = new DOMMatrix(getComputedStyle(document.querySelector('.reveal .slides')).transform);
  return (stage.width / 3744) * slides.a;
}

async function openOverview(page, viewport, deck = '/docs/index.slides.html') {
  await page.setViewportSize(viewport);
  await page.goto(deck);
  await page.waitForFunction(() => window.Reveal && Reveal.isReady());
  await page.evaluate(() => Reveal.toggleOverview(true));
  await page.waitForFunction(() => Reveal.isOverview() &&
    document.querySelector('[data-deck-stage]').classList.contains('deck-stage-overview'));
  // Let Reveal finish its overview layout and the eager-loader's first pass.
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await page.addScriptTag({ content: slideUnit.toString() });
}

test.describe('slide overview', () => {
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 1024, height: 768 }
  ]) {
    test(`previews are distinct 16:9 cards at ${viewport.width}x${viewport.height}`, async ({ page }) => {
      await openOverview(page, viewport);
      const cards = await page.locator('.reveal.overview .slides section:not(.stack)').evaluateAll(slides =>
        // Reveal leaves slides beyond its view distance display:none, so they
        // have no position to compare; they lay out when scrolled into view.
        slides.filter(slide => slide.getBoundingClientRect().width > 0).map(slide => {
          const section = slide.getBoundingClientRect();
          const card = getComputedStyle(slide, '::before');
          const scale = slideUnit();
          return {
            id: slide.id,
            aspect: parseFloat(card.width) / parseFloat(card.height),
            left: section.left + parseFloat(card.left) * scale,
            top: section.top + parseFloat(card.top) * scale,
            width: parseFloat(card.width) * scale,
            height: parseFloat(card.height) * scale
          };
        })
      );

      expect(cards.length).toBeGreaterThan(20);
      for (const card of cards) expect(card.aspect, card.id).toBeCloseTo(16 / 9, 2);

      // Cards in the same overview row/column may approach one another, but
      // their white sheets must never paint over a neighbouring preview.
      const visible = cards.filter(card => card.width > 0 && card.height > 0);
      for (let i = 0; i < visible.length; i++) {
        for (let j = i + 1; j < visible.length; j++) {
          const a = visible[i], b = visible[j];
          const overlapX = Math.min(a.left + a.width, b.left + b.width) - Math.max(a.left, b.left);
          const overlapY = Math.min(a.top + a.height, b.top + b.height) - Math.max(a.top, b.top);
          expect(overlapX > 1 && overlapY > 1, `${a.id} overlaps ${b.id}`).toBe(false);
        }
      }
    });
  }

  // Reveal lays the overview grid on a pitch of its own slide size plus 70,
  // and its slide size is the inset content frame, not the card a preview
  // actually draws: the card is the whole authored page, 16:9, so it eats the
  // horizontal gutter and leaves the vertical one alone. The gutter is the
  // reader's only cue that two previews are two slides, so it has to survive
  // on both axes. Measured on a deck with stacks, the only layout that puts
  // cards next to one another in both directions.
  test('cards keep an even gutter on both axes', async ({ page }) => {
    await openOverview(page, { width: 1440, height: 900 }, '/docs/stacked.slides.html');
    const cards = await page.locator('.reveal.overview .slides section:not(.stack)').evaluateAll(slides =>
      slides.filter(slide => slide.getBoundingClientRect().width > 0).map(slide => {
        const section = slide.getBoundingClientRect();
        const card = getComputedStyle(slide, '::before');
        const scale = slideUnit();
        return {
          id: slide.id,
          left: section.left + parseFloat(card.left) * scale,
          top: section.top + parseFloat(card.top) * scale,
          width: parseFloat(card.width) * scale,
          height: parseFloat(card.height) * scale
        };
      })
    );

    // Neighbours in a row share a top edge; neighbours in a column share a left.
    const gutters = (along, across, size) => {
      const gaps = [];
      for (const a of cards) for (const b of cards) {
        if (Math.abs(a[across] - b[across]) > 1) continue;
        const gap = b[along] - (a[along] + a[size]);
        if (gap > -1) gaps.push(gap);
      }
      return gaps.length ? Math.min(...gaps) : null;
    };
    const horizontal = gutters('left', 'top', 'width');
    const vertical = gutters('top', 'left', 'height');

    expect(horizontal, 'no two cards share a row').not.toBeNull();
    expect(vertical, 'no two cards share a column').not.toBeNull();
    // A gutter thinner than this reads as two slides touching, which is the
    // bug: at 1440 wide a card is ~230px, so this is a visible few pixels.
    const card = cards[0];
    expect(horizontal / card.width, 'the horizontal gutter has been eaten up').toBeGreaterThan(0.02);
    expect(vertical / card.height, 'the vertical gutter has been eaten up').toBeGreaterThan(0.02);
    // And the two have to be the same gutter, not merely both present.
    expect(horizontal, 'the gutters are uneven').toBeCloseTo(vertical, 0);
  });

  // An overlay an extension lays over a slide -- annotate's ink previews are the
  // case this exists for -- is drawn in the coordinates of the authored page,
  // not of the content frame the section actually is. Overview maps the page
  // onto the card, so the card's box is published for the overlay to sit on.
  // Read from the stage, in slide units, exactly as the ::before card is drawn.
  test('the overview card box is published for overlays to use', async ({ page }) => {
    await openOverview(page, { width: 1440, height: 900 });
    const box = await page.evaluate(() => {
      const stage = getComputedStyle(document.querySelector('[data-deck-stage]'));
      const slide = [...document.querySelectorAll('.reveal.overview .slides section:not(.stack)')]
        .find(s => s.getBoundingClientRect().width > 0);
      const card = getComputedStyle(slide, '::before');
      const read = name => parseFloat(stage.getPropertyValue(name));
      return {
        published: { left: read('--deck-overview-card-left'), top: read('--deck-overview-card-top'),
                     width: read('--deck-overview-card-width'), height: read('--deck-overview-card-height') },
        drawn: { left: parseFloat(card.left), top: parseFloat(card.top),
                 width: parseFloat(card.width), height: parseFloat(card.height) }
      };
    });

    for (const edge of ['left', 'top', 'width', 'height']) {
      expect(box.published[edge], `--deck-overview-card-${edge} is not published`).not.toBeNaN();
      expect(box.published[edge], `--deck-overview-card-${edge} does not match the card`)
        // A hundredth of a slide unit; the card's own computed value is rounded.
        .toBeCloseTo(box.drawn[edge], 1);
    }
  });

  // Every card is the authored page, 3138 x 1765 slide units, and a lecture
  // deck puts 80 of them on the screen at once. Ringing them with a box-shadow
  // costs a shadow buffer per card at that unscaled size, which is more than an
  // iPad has: Safari's web process was killed 1.5-3.5s after overview opened on
  // an 82-slide deck, reproducibly, and survived with nothing changed but these
  // shadows. An `outline` draws the same ring for nothing. Measured over USB on
  // an iPad Pro 12.9" (iPadOS 26.6.2); 60 cards survived, 82 did not.
  test('overview cards are ringed without a box-shadow', async ({ page }) => {
    await openOverview(page, { width: 1440, height: 900 });
    const rings = await page.locator('.reveal.overview .slides section:not(.stack)').evaluateAll(slides =>
      slides.slice(0, 3).map(slide => {
        const card = getComputedStyle(slide, '::before');
        return { id: slide.id, shadow: card.boxShadow, outline: card.outlineWidth, style: card.outlineStyle };
      })
    );

    expect(rings.length).toBeGreaterThan(0);
    for (const ring of rings) {
      expect(ring.shadow, `${ring.id} rings its card with a box-shadow`).toBe('none');
      expect(parseFloat(ring.outline), `${ring.id} has no ring at all`).toBeGreaterThan(0);
      expect(ring.style, ring.id).toBe('solid');
    }
  });

  test('yellow artwork stays correctly proportioned and inside every preview', async ({ page }) => {
    await openOverview(page, { width: 1440, height: 900 });
    const geometry = await page.locator('.reveal.overview .slides section:not(.stack)').evaluateAll(slides =>
      slides.map(slide => {
        const card = getComputedStyle(slide, '::before');
        const rail = getComputedStyle(slide, '::after');
        const numbers = value => (value.match(/-?\d+(?:\.\d+)?/g) || []).map(Number);
        const size = numbers(card.backgroundSize);
        const position = numbers(card.backgroundPosition);
        return {
          id: slide.id,
          card: { left: parseFloat(card.left), top: parseFloat(card.top), width: parseFloat(card.width), height: parseFloat(card.height) },
          rail: { left: parseFloat(rail.left), top: parseFloat(rail.top), width: parseFloat(rail.width), height: parseFloat(rail.height), colour: rail.backgroundColor },
          artwork: slide.id === 'title-slide' ? { x: position[0], y: position[1], width: size[0], height: size[1] } : null
        };
      })
    );

    for (const { id, card, rail, artwork } of geometry) {
      expect(rail.colour, id).toBe('rgb(254, 220, 0)');
      expect(rail.left, id).toBeGreaterThanOrEqual(card.left);
      expect(rail.top, id).toBeGreaterThanOrEqual(card.top);
      expect(rail.left + rail.width, id).toBeLessThanOrEqual(card.left + card.width + 0.01);
      expect(rail.top + rail.height, JSON.stringify({ id, card, rail })).toBeLessThanOrEqual(card.top + card.height + 0.01);
      if (artwork) {
        expect(artwork.width / artwork.height).toBeCloseTo(16 / 9, 2);
        expect(artwork.x).toBeGreaterThanOrEqual(0);
        expect(artwork.y).toBeGreaterThanOrEqual(0);
        expect(artwork.x + artwork.width).toBeLessThanOrEqual(card.width);
        expect(artwork.y + artwork.height).toBeLessThanOrEqual(card.height);
      }
    }
  });
});

// A preview that has reflowed, dropped an image or lost its maths is worse than
// no preview: it sends you to the wrong slide. Rather than compare pixels at two
// very different scales, compare where the content sits inside the box the
// reader actually sees -- the whole page when live, the card when in overview.
// Normalising against the content frame instead would compare the deck with
// itself: the frame is the same box in both views, so the card's own cropping
// (it is 16:9, the frame is taller) would never show up.
const MEASURE = `(slide, frame) => {
  const visible = element => {
    const style = getComputedStyle(element);
    return style.display !== 'none' && style.visibility !== 'hidden' && parseFloat(style.opacity) > 0.01;
  };
  return [...slide.querySelectorAll('h1, h2, h3, p, li, img, table, svg, .katex')]
    .filter(element => !element.closest('.fragment, .katex *') && visible(element))
    .map(element => {
      const box = element.getBoundingClientRect();
      return {
        key: element.tagName + ':' + (element.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 40),
        left: (box.left - frame.left) / frame.width,
        top: (box.top - frame.top) / frame.height,
        width: box.width / frame.width,
        height: box.height / frame.height
      };
    });
}`;

// The white card is drawn as the section's ::before, in unscaled slide units.
const CARD = `slide => {
  const section = slide.getBoundingClientRect();
  const card = getComputedStyle(slide, '::before');
  const scale = slideUnit();
  return {
    left: section.left + parseFloat(card.left) * scale,
    top: section.top + parseFloat(card.top) * scale,
    width: parseFloat(card.width) * scale,
    height: parseFloat(card.height) * scale
  };
}`;

test('every overview preview matches the full view of its slide', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/docs/index.slides.html');
  await page.waitForFunction(() => window.Reveal && Reveal.isReady());

  await page.evaluate(() => Reveal.toggleOverview(true));
  await page.waitForFunction(() => Reveal.isOverview() &&
    document.querySelector('[data-deck-stage]').classList.contains('deck-stage-overview'));
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await page.addScriptTag({ content: slideUnit.toString() });

  // A spread of slides rather than all of them: navigating the whole deck twice
  // costs minutes, and a preview that breaks breaks for a whole class of slide.
  const indices = await page.evaluate(() => Reveal.getSlides()
    .map((slide, index) => ({ id: slide.id, index, laidOut: slide.getBoundingClientRect().width > 0 }))
    // The title slide is deliberately not a faithful thumbnail: its card draws
    // the artwork itself, and the live page's title layout comes from a stage
    // class that overview removes. Slides past Reveal's view distance are still
    // display:none and have nothing to measure until they are scrolled to.
    .filter(slide => slide.id !== 'title-slide' && slide.laidOut)
    .filter((_, index, all) => index % Math.ceil(all.length / 8) === 0));

  const previews = {};
  for (const { id, index } of indices) {
    previews[id] = await page.evaluate(([i, measure, card]) => {
      const slide = Reveal.getSlides()[i];
      return eval('(' + measure + ')')(slide, eval('(' + card + ')')(slide));
    }, [index, MEASURE, CARD]);
  }

  await page.evaluate(() => Reveal.toggleOverview(false));
  await page.waitForFunction(() => !Reveal.isOverview());

  for (const { id, index } of indices) {
    await page.evaluate(i => {
      const { h, v } = Reveal.getIndices(Reveal.getSlides()[i]);
      Reveal.slide(h, v);
    }, index);
    await page.waitForFunction(i => Reveal.getSlides()[i].classList.contains('present'), index);
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const live = await page.evaluate(([i, fn]) => {
      const page = document.querySelector('[data-deck-stage]').getBoundingClientRect();
      return eval('(' + fn + ')')(Reveal.getSlides()[i], page);
    }, [index, MEASURE]);

    const preview = previews[id];
    expect(live.length, `nothing measurable on ${id}`).toBeGreaterThan(0);
    expect(preview.map(item => item.key), `preview of ${id} shows different content`).toEqual(live.map(item => item.key));
    preview.forEach((item, i) => {
      const full = live[i];
      const where = `${id} :: ${item.key} (card vs page, as a fraction of each)`;
      expect(item.left, where).toBeCloseTo(full.left, 2);
      expect(item.top, where).toBeCloseTo(full.top, 2);
      expect(item.width, where).toBeCloseTo(full.width, 2);
      expect(item.height, where).toBeCloseTo(full.height, 2);
    });
    // Nothing may spill out of the card, however faithful the proportions are.
    for (const item of preview) {
      expect(item.top, `${id} :: ${item.key} is cropped by the top of the card`).toBeGreaterThanOrEqual(-0.01);
      expect(item.top + item.height, `${id} :: ${item.key} is cropped by the bottom of the card`).toBeLessThanOrEqual(1.01);
    }
  }
});

// Slides Quarto marks `data-visibility="uncounted"` (the incremental "same
// slide again, one more bullet" pages) are absent from Reveal.getSlides(), so
// the eager loader used to skip them and they stayed display:none — grey holes
// in the middle of the overview grid where a preview should be.
test('overview shows every slide, including uncounted ones', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/docs/index.slides.html#/build-one');
  await page.waitForFunction(() => window.Reveal && Reveal.isReady());
  await page.evaluate(() => Reveal.toggleOverview(true));
  await page.waitForFunction(() => Reveal.isOverview());
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));

  const blank = await page.evaluate(() => [...document.querySelectorAll('.reveal .slides section')]
    .filter(section => !section.classList.contains('stack'))
    .filter(section => getComputedStyle(section).display === 'none')
    .map(section => section.id || (section.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 40)));

  expect(blank, `slides left unloaded in overview: ${blank.join(', ')}`).toEqual([]);
});

/* --------------------------- the touch overview -------------------------- */
// Eagerly loading every slide is what makes the overview a memory cliff on the
// iPad: opening it in the middle of a 50-slide lecture deck killed the
// WebContent process on the first try, every try. With the eager pass off,
// reveal's own lazy loading brings up 26 of those 50 and the overview survives
// being opened and closed all day.
//
// Drawing the ones it leaves out -- forced visible with only their headings,
// so none of the content is laid out -- was measured too, on the theory that
// an empty card is nearly free. It is not: that crashed on the first open,
// exactly as eager loading did. So the second test here is a guard against
// bringing that back, not an oversight.
//
// Chromium, firefox and webkit all report `any-pointer: coarse` under touch
// emulation, but none of them is iPadOS; `npm run test:ipad` is what puts this
// in front of the real thing.

const TOUCH = { hasTouch: true, isMobile: true, viewport: { width: 1440, height: 900 } };

async function touchOverview(browser, baseURL, deck = '/docs/index.slides.html') {
  const context = await browser.newContext({ ...TOUCH, baseURL });
  const page = await context.newPage();
  await page.goto(deck);
  await page.waitForFunction(() => window.Reveal && Reveal.isReady());
  await page.evaluate(() => Reveal.toggleOverview(true));
  await page.waitForFunction(() => Reveal.isOverview());
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  return { context, page };
}

// Reveal's own bookkeeping, read straight off the attribute it writes: the
// eager loader would have cleared every one of these.
const unloadedSections = page => page.evaluate(() =>
  [...document.querySelectorAll('.reveal .slides section:not(.stack)')]
    .filter(section => section.style.display === 'none').map(section => section.id));

test('a touch overview leaves the distant slides unloaded', async ({ browser, baseURL }) => {
  const { context, page } = await touchOverview(browser, baseURL);

  const unloaded = await unloadedSections(page);
  expect(unloaded.length, 'every slide was loaded, as on the desktop').toBeGreaterThan(0);

  await context.close();
});

// The cells cost what the cells cost, whether or not anything is in them.
test('a touch overview draws nothing reveal left unloaded', async ({ browser, baseURL }) => {
  const { context, page } = await touchOverview(browser, baseURL);

  const drawn = await page.evaluate(() =>
    [...document.querySelectorAll('.reveal .slides section:not(.stack)')]
      .filter(section => section.style.display === 'none')
      .filter(section => getComputedStyle(section).display !== 'none')
      .map(section => section.id));

  expect(drawn, `drawn although reveal unloaded them: ${drawn.join(', ')}`).toEqual([]);

  await context.close();
});
