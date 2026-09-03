const http = require('http');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '../..');
// Mobile Safari cannot be driven by Playwright, so scripts/ipad_test.py loads a
// deck in the iOS Simulator with ?probe=<nonce> and the injected script below
// posts its measurements back here for the script to collect and assert on.
const results = new Map();
const PROBE_JS = fs.readFileSync(path.join(__dirname, 'probe.js'), 'utf8');
const types = { '.css': 'text/css', '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml' };

http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const pathname = decodeURIComponent(url.pathname);

  if (pathname === '/__probe') {
    const nonce = url.searchParams.get('nonce') || '';
    if (req.method === 'POST') {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', () => {
        results.set(nonce, body);
        res.writeHead(204).end();
      });
      return;
    }
    const stored = results.get(nonce);
    res.writeHead(stored ? 200 : 404, { 'Content-Type': 'application/json' });
    res.end(stored || '{}');
    return;
  }

  const file = path.resolve(root, '.' + pathname);
  if (file !== root && !file.startsWith(root + path.sep)) {
    res.writeHead(403).end('Forbidden');
    return;
  }
  fs.stat(file, (error, stat) => {
    const target = !error && stat.isDirectory() ? path.join(file, 'index.html') : file;
    fs.readFile(target, (readError, body) => {
      if (readError) return res.writeHead(404).end('Not found');
      const probe = url.searchParams.get('probe');
      if (probe && path.extname(target) === '.html') {
        const script = '<script>window.__probeNonce=' + JSON.stringify(probe) + ';' + PROBE_JS + '</script>';
        body = Buffer.from(String(body).replace('</body>', script + '</body>'));
      }
      res.writeHead(200, { 'Content-Type': types[path.extname(target)] || 'application/octet-stream' });
      res.end(body);
    });
  });
}).listen(4173, '127.0.0.1');
