# slide-stage

A Quarto revealjs **format extension** for the fixed 16:9 slide canvas the
lecture decks are authored on, plus the reveal.js fixes that go with it.

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

## Using it

```yaml
format: slide-stage-revealjs
```

The extension is **theme-neutral**: it draws the page furniture but owns none of
its colour. Two hooks decide the branding, and with their defaults the deck
renders as a plain white page.

```scss
$stage-artwork-image: none !default;      // title-slide artwork
$stage-rail-background: transparent !default;
```

A theme layer sets them, and Quarto **appends** a consumer's `theme:` to the
extension's own, so you never name the extension's internal path:

```yaml
format:
  slide-stage-revealjs:
    theme:
      - unsw-theme.scss     # becomes [serif, slide-stage.scss, unsw-theme.scss]
```

The geometry is likewise `!default` throughout — `$deck-width`, `$deck-height`,
`$content-left/top/right/bottom`, `$rail-width`, `$artwork-inset`. The stylesheet
is the single source of truth: it publishes `--deck-width` / `--deck-height` on
the stage element and `deck-stage-open.html` reads them back, so the CSS box and
the fit transform cannot drift apart. `resized.qmd` is a fixture at 1920 x 1080
that holds them together.

## Layout

```
_extensions/Pat-Laub/slide-stage/
    _extension.yml          the revealjs format and its baseline config
    deck-stage-open.html    the stage element, the fit transform, F to fullscreen
    deck-stage-close.html   closes the two wrappers
    reveal-fixes.html       five independent reveal.js patches
    slide-stage.scss        authoring geometry and structure, no branding
unsw-theme.scss             the UNSW look, layered on top by index.qmd
index.qmd                   the themed fixture the geometry tests measure
bare.qmd                    the same stage with no theme layer at all
resized.qmd                 the same stage at a different authored size
tests/                      Playwright, cross-browser
```

## Testing

```sh
npm install
npx playwright install chromium firefox webkit
npm run render      # builds index.qmd and bare.qmd into docs/
npm test            # chromium, firefox, webkit
```

`tests/layout.spec.js` and `tests/overview.spec.js` assert the authored geometry
reached the content. `tests/bare-stage.spec.js` is the theme-neutrality
contract: the unthemed deck must lay out identically and carry no branding.
`tests/screenshots.spec.js` holds image baselines at six viewport sizes and
aspect ratios, including the portrait phone that rotates the stage — geometry
regressions do not fail assertions, so these are what catch a deck that
letterboxes wrongly or loses its rail.

Baselines are per-platform and only the darwin ones are committed, so the image
comparisons run on macOS in CI and the assertions run everywhere. See
`.github/workflows/ci.yml`.

## Note on extension resolution

Quarto looks for `_extensions/` from the project root down, and does **not**
walk above it. A sibling directory with its own `_quarto.yml` becomes its own
project and will not find an `_extensions/` in the parent — which is why every
consumer needs the extension inside its own tree, and why `bare.qmd` is part of
this project rather than a subproject.
