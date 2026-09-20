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
    deck-thumbs.html        the overview grid, from baked slide images
    slide-stage.scss        authoring geometry and structure, no branding
unsw-theme.scss             the UNSW look, layered on top by index.qmd
index.qmd                   the themed fixture the geometry tests measure
bare.qmd                    the same stage with no theme layer at all
resized.qmd                 the same stage at a different authored size
tests/                      Playwright, cross-browser
```

## The overview grid

Reveal's own overview lays the deck out as a scaled 2-D map of live sections.
Each cell is therefore the whole authored canvas, and a fifty-slide deck is
fifty of them at once: on an iPad Pro that kills Safari's web process a few
seconds after the grid opens, every time, before you have scrolled anywhere.

So the stage can show pictures instead. If a directory sits beside the deck
named after it with the final `.html` replaced by `.thumbs`, the grid button
and the Esc and O keys open a plain scroller of those images rather than
reveal's overview. No section is transformed, unloaded or touched, and
`loading="lazy"` leaves the browser decoding only the cards on screen.

    module-1-1.slides.html
    module-1-1.slides.thumbs/
        index.json          {"count": 50, "width": 520}
        001.jpg             one per slide, in document order
        002.jpg
        ...

`count` must equal the number of leaf `<section>` elements in the deck. The
images are addressed by position, so a directory that disagrees with the deck
is stale and would point every card at the wrong slide; the mismatch is
reported to the console and the live overview is used instead.

This is opt-in and the extension bakes nothing. Without the directory it
installs no panel and the overview behaves exactly as it did before, which is
what every fixture deck here does apart from the ones the thumbnail tests
stand a directory for. Consumers generate the images however suits them --
ACTL2131 runs `pdftoppm` over the print-pdf capture it already makes, which
gives one page per slide with the fragments revealed.

## Testing

This repository lives in Dropbox, which parks a Quarto render's half-written
files beside themselves as conflicted copies and leaves the stale ones in
place — a test run then reads a deck that is a version behind, silently. So
only the source and `.git` are here: the render, `node_modules` and the
Playwright output live in a working copy outside the synced folder, at
`~/slide-stage/src`, which `qr` rsyncs this tree to. `.mirrorignore` says what
the sync leaves alone there, and dropping a line from it deletes what it named
on the next sync.

```sh
npm run render      # = qr: sync, then render into ~/slide-stage/src/docs
cd ~/slide-stage/src
npm install         # first time, in the working copy
npx playwright install chromium firefox webkit
npm test            # chromium, firefox, webkit
```

`playwright.config.js` reads `scripts/buildpaths.js`, which derives the output
directory from the working copy's parent and refuses to run in a tree that is
not `src`, so a test run started here in Dropbox stops rather than testing a
stale render. Editing a test changes nothing there until the tree is synced
again: `qr --sync` does that without rendering. CI checks the tree out as
itself and sets `BUILD_ROOT` to say so.

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
