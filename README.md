# slide-stage

The fixed 16:9 slide canvas that the lecture decks are authored on, plus the
reveal.js fixes that go with it.

A deck is authored at 3744 x 2106 and shrunk to fit whatever viewport it lands
on by a single uniform transform. Nothing else is scaled: Reveal runs embedded
inside an inset content frame and does no scaling of its own, which is what
keeps layout and annotation coordinates identical on a laptop, a projector and
an iPad. On a narrow portrait phone the outer stage rotates, while Reveal
continues to see the same unrotated logical frame.

CSS `zoom` is deliberately never used. It cancels out against the fit transform
on desktop, so every desktop test and screenshot looks right, but iOS scales the
layout boxes without scaling the type with them and the deck renders full size
with glyphs at a fraction of their authored size.

## Layout

```
stage/deck-stage-open.html    the stage element, the fit transform, F to fullscreen
stage/deck-stage-close.html   closes the two wrappers
stage/reveal-fixes.html       five independent reveal.js patches
stage/custom.scss             authoring geometry and the theme it currently ships with
example/                      the fixture deck the tests measure
tests/                        Playwright, cross-browser
```

## Testing

```sh
npm install
npx playwright install chromium firefox webkit
npm run render      # builds example/ into docs/
npm test            # chromium, firefox, webkit
```

`tests/layout.spec.js` and `tests/overview.spec.js` assert the authored
geometry reached the content. `tests/screenshots.spec.js` holds image baselines
at six viewport sizes and aspect ratios, including the portrait phone that
rotates the stage; geometry regressions do not fail assertions, so these are
what catch a deck that letterboxes wrongly or loses its rail.

Baselines are per-platform. Only the darwin ones are committed; see
`.github/workflows/ci.yml`.

## Status

Phase 0 of the extraction. The files under `stage/` are verbatim copies from
ACTL2131, and the tests here pass against them unchanged — that is the point, so
that the refactor into a Quarto format extension can be judged against a
regression net rather than against nothing. Nothing consumes this repo yet.
