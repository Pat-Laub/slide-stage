const { test, expect } = require('@playwright/test');

const DECK = '/docs/index.slides.html';

// Geometry regressions do not fail assertions -- a deck that letterboxes
// wrongly, loses its rail, or scales its type against its boxes still reports
// the right numbers from offsetWidth. These are the baselines that catch the
// migration of a project onto this stage going subtly wrong.

const VIEWPORTS = [
  { name: 'laptop-1440x900', width: 1440, height: 900 },
  { name: 'ipad-landscape-1194x834', width: 1194, height: 834 },
  { name: 'ipad-portrait-834x1194', width: 834, height: 1194 },
  { name: 'phone-portrait-390x844', width: 390, height: 844 },
  { name: 'four-three-1024x768', width: 1024, height: 768 },
  { name: 'uhd-3840x2160', width: 3840, height: 2160 }
];

// One slide of each kind the stage has to lay out differently.
const SLIDES = [
  { name: 'title', hash: '' },
  { name: 'prose', hash: '#/wide-prose' },
  { name: 'maths', hash: '#/accents' },
  { name: 'table', hash: '#/moments-table' }
];

async function settle(page) {
  await page.waitForFunction(() => window.Reveal && Reveal.isReady());
  // The fit transform runs on ready; let it and the fade transition finish.
  await page.evaluate(() => new Promise(resolve =>
    requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await page.waitForTimeout(400);
}

for (const viewport of VIEWPORTS) {
  test(`the stage fits ${viewport.name}`, async ({ browser }) => {
    const context = await browser.newContext({
      viewport: { width: viewport.width, height: viewport.height }
    });
    const page = await context.newPage();
    await page.goto(DECK);
    await settle(page);
    await expect(page).toHaveScreenshot(`fit-${viewport.name}.png`);
    await context.close();
  });
}

for (const slide of SLIDES) {
  test(`the ${slide.name} slide renders`, async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    await page.goto(DECK + slide.hash);
    await settle(page);
    await expect(page).toHaveScreenshot(`slide-${slide.name}.png`);
    await context.close();
  });
}

test('the overview grid renders', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  await page.goto(DECK);
  await settle(page);
  await page.evaluate(() => Reveal.toggleOverview(true));
  await page.waitForFunction(() => Reveal.isOverview() &&
    document.querySelector('[data-deck-stage]').classList.contains('deck-stage-overview'));
  await page.evaluate(() => new Promise(resolve =>
    requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await page.waitForTimeout(600);
  await expect(page).toHaveScreenshot('overview-grid.png');
  await context.close();
});
