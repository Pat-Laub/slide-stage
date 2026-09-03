// Injected into a deck by static-server.js when it is loaded with ?probe=<nonce>.
// Reports the numbers that only a real iOS browser can tell us -- see
// scripts/ipad_test.py, which asserts on them.
window.addEventListener('load', function () {
  setTimeout(function () {
    var stage = document.querySelector('[data-deck-stage]');
    var reveal = document.querySelector('.reveal');
    var slide = document.querySelector('.reveal .slides section.present');
    var blocks = slide ? Array.from(slide.querySelectorAll('h1, h2, h3, p, ul, ol'))
      .filter(function (el) { return el.offsetWidth > 0 && el.textContent.trim(); })
      .sort(function (a, b) { return b.offsetWidth - a.offsetWidth; }) : [];
    var widest = blocks[0];
    var rect = stage.getBoundingClientRect();
    var payload = {
      userAgent: navigator.userAgent,
      viewport: [window.innerWidth, window.innerHeight],
      stageOffset: [stage.offsetWidth, stage.offsetHeight],
      stageRect: [Math.round(rect.width), Math.round(rect.height)],
      stageZoom: getComputedStyle(stage).zoom,
      contentOffset: reveal ? [reveal.offsetWidth, reveal.offsetHeight] : null,
      rootFontSize: reveal ? parseFloat(getComputedStyle(reveal).fontSize) : null,
      widest: widest ? {
        tag: widest.tagName,
        fontSize: parseFloat(getComputedStyle(widest).fontSize),
        offsetWidth: widest.offsetWidth,
        rectWidth: Math.round(widest.getBoundingClientRect().width)
      } : null
    };
    fetch('/__probe?nonce=' + encodeURIComponent(window.__probeNonce), {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  }, 3000);
});
