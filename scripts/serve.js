#!/usr/bin/env node
/**
 * Serves dist/ locally the way GitHub Pages does: directory URLs resolve to
 * index.html and unknown paths get 404.html (which also runs the legacy
 * redirects). Development aid only; nothing in the build depends on it.
 *
 * Usage: node scripts/serve.js [--port 4173] [--dir dist]
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './lib/history.js';

const argv = process.argv.slice(2);
const opt = (n, f) => (argv.includes(`--${n}`) ? argv[argv.indexOf(`--${n}`) + 1] : f);
const dir = path.resolve(opt('dir', path.join(ROOT, 'dist')));
const port = Number(opt('port', process.env.PORT || 4173));
const base = ('/' + (process.env.BASE_PATH || '/').replace(/^\/+|\/+$/g, '') + '/').replace(/\/+/g, '/');

const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };

http
  .createServer((req, res) => {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (!p.startsWith(base)) p = '/__missing__';
    let file = path.join(dir, p.slice(base.length));
    if (!file.startsWith(dir)) file = path.join(dir, '__missing__');
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) {
      if (!p.endsWith('/')) {
        res.writeHead(301, { location: p + '/' });
        return res.end();
      }
      file = path.join(file, 'index.html');
    }
    let status = 200;
    if (!fs.existsSync(file)) {
      status = 404;
      file = path.join(dir, '404.html');
    }
    res.writeHead(status, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  })
  .listen(port, () => console.log(`Serving ${path.relative(ROOT, dir)} at http://localhost:${port}${base}`));
