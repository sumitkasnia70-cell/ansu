// RunTrack server - serves the app and stores shareable run links.
// Zero dependencies, Node 18+.
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const C = require('./public/core.js');

const PORT = process.env.PORT || 3000;
const PUBLIC = path.join(__dirname, 'public');
const DATA_DIR = path.join(__dirname, 'data');
const SHARES_FILE = path.join(DATA_DIR, 'shares.json');
const MAX_SHARES = 2000;
const DAILY_SHARE_LIMIT = parseInt(process.env.DAILY_SHARE_LIMIT || '30', 10);
const MAX_BODY = 64 * 1024;

fs.mkdirSync(DATA_DIR, { recursive: true });

let shares = {};
try { shares = JSON.parse(fs.readFileSync(SHARES_FILE, 'utf8')); } catch (_) {}

function saveShares() {
  const ids = Object.keys(shares);
  if (ids.length > MAX_SHARES) {
    ids.sort((a, b) => shares[a].createdAt - shares[b].createdAt);
    for (const id of ids.slice(0, ids.length - MAX_SHARES)) delete shares[id];
  }
  const tmp = SHARES_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(shares));
  fs.renameSync(tmp, SHARES_FILE);
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function send(res, status, body, type = 'application/json', extra = {}) {
  res.writeHead(status, {
    'content-type': type,
    'cache-control': 'no-cache',
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'no-referrer',
    ...extra,
  });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) { reject(new Error('Request too large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

// ---- rate limit (per IP, per day, in memory) ----
const usage = new Map();
function allow(ip) {
  const day = new Date().toISOString().slice(0, 10);
  const u = usage.get(ip);
  if (!u || u.day !== day) { usage.set(ip, { day, count: 1 }); return true; }
  if (u.count >= DAILY_SHARE_LIMIT) return false;
  u.count++;
  return true;
}
const clientIp = (req) => (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress || 'unknown';

// ---- validation: never trust the client ----
function num(v, min, max) {
  const n = Number(v);
  return Number.isFinite(n) && n >= min && n <= max ? n : null;
}

function validate(b) {
  if (!b || typeof b !== 'object') return null;
  const distance = num(b.distance, 20, 1000000);
  const duration = num(b.duration, 5, 259200);
  if (distance === null || duration === null) return null;
  const run = {
    name: String(b.name || '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, 40),
    startedAt: num(b.startedAt, 946684800000, 4102444800000) || Date.now(),
    distance: Math.round(distance),
    duration: Math.round(duration),
    splits: [],
    route: null,
  };
  if (Array.isArray(b.splits)) {
    run.splits = b.splits.slice(0, 200).map((x) => num(x, 1, 36000)).filter((x) => x !== null).map(Math.round);
  }
  if (Array.isArray(b.route)) {
    const r = [];
    for (const p of b.route.slice(0, 500)) {
      if (!Array.isArray(p)) continue;
      const la = num(p[0], -90, 90), lo = num(p[1], -180, 180);
      if (la === null || lo === null) continue;
      r.push([Math.round(la * 1e5) / 1e5, Math.round(lo * 1e5) / 1e5]);
    }
    if (r.length >= 2) run.route = r;
  }
  return run;
}

// ---- public share page (server-rendered, no JavaScript) ----
function sharePage(run) {
  const km = (run.distance / 1000).toFixed(2);
  const time = C.fmtTime(run.duration);
  const pace = C.fmtPace(C.paceFrom(run.duration, run.distance));
  const speed = C.speedKmh(run.duration, run.distance).toFixed(1);
  const title = run.name || 'A run';
  const when = new Date(run.startedAt).toUTCString().slice(0, 16);
  const desc = `${km} km in ${time}, pace ${pace}/km`;

  let svg = '';
  if (run.route) {
    const pts = C.projectRoute(run.route, 300, 18);
    const poly = pts.map((p) => p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ');
    const a = pts[0], z = pts[pts.length - 1];
    svg = `<svg viewBox="0 0 300 300" class="route" role="img" aria-label="Route map"><polyline points="${poly}" fill="none" stroke="#4cc98c" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><circle cx="${a[0].toFixed(1)}" cy="${a[1].toFixed(1)}" r="6" fill="#f0f7f4"/><circle cx="${z[0].toFixed(1)}" cy="${z[1].toFixed(1)}" r="6" fill="#ff6b6b"/></svg>`;
  }

  const splits = run.splits.length
    ? `<h2>Splits</h2><table>${run.splits.map((s, i) => `<tr><td>Km ${i + 1}</td><td>${C.fmtPace(s)} /km</td></tr>`).join('')}</table>`
    : '';

  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)} - ${esc(desc)}</title>
<meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}">
<meta name="theme-color" content="#0f1b17">
<style>
body{margin:0;background:#0f1b17;color:#f0f7f4;font:16px/1.5 system-ui,-apple-system,Segoe UI,Roboto,sans-serif}
main{max-width:480px;margin:0 auto;padding:24px 16px 48px}
h1{margin:0;font-size:1.2rem}.when{color:#8fa59c;margin:2px 0 16px}
.big{font-size:4rem;font-weight:800;line-height:1}.big small{font-size:1.2rem;color:#8fa59c;font-weight:500}
.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin:18px 0}
.grid div{background:#17261f;border-radius:12px;padding:12px}.grid b{display:block;font-size:1.3rem}.grid span{color:#8fa59c;font-size:.8rem}
.route{width:100%;max-width:320px;background:#17261f;border-radius:12px;display:block;margin:8px 0}
h2{font-size:.85rem;text-transform:uppercase;letter-spacing:.05em;color:#8fa59c;margin:20px 0 6px}
table{width:100%;border-collapse:collapse}td{padding:6px 0;border-bottom:1px solid #263a31}td:last-child{text-align:right}
a{color:#4cc98c}
</style></head><body><main>
<h1>${esc(title)}</h1><p class="when">${esc(when)}</p>
<div class="big">${km}<small> km</small></div>
<div class="grid"><div><b>${time}</b><span>Time</span></div><div><b>${pace}</b><span>Pace /km</span></div><div><b>${speed}</b><span>km/h avg</span></div></div>
${svg}${splits}
<p style="margin-top:28px"><a href="/">Track your own run</a></p>
</main></body></html>`;
}

const CSP = "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'";

// ---- server ----
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    let p = decodeURIComponent(url.pathname);

    if (req.method === 'POST' && p === '/api/share') {
      if (!allow(clientIp(req))) return send(res, 429, { error: 'Daily share limit reached. Try again tomorrow.' });
      let body;
      try { body = JSON.parse(await readBody(req)); } catch (_) { return send(res, 400, { error: 'Invalid request.' }); }
      const run = validate(body);
      if (!run) return send(res, 400, { error: 'Run is too short or has invalid data.' });
      const id = crypto.randomBytes(6).toString('base64url');
      shares[id] = { ...run, createdAt: Date.now() };
      saveShares();
      return send(res, 200, { id });
    }

    if (req.method === 'GET' && p.startsWith('/r/')) {
      const id = p.slice(3);
      const run = /^[A-Za-z0-9_-]{6,16}$/.test(id) ? shares[id] : null;
      if (!run) return send(res, 404, '<!doctype html><meta charset="utf-8"><title>Not found</title><p style="font:16px system-ui;padding:24px">This run link was not found. <a href="/">Go to RunTrack</a></p>', 'text/html; charset=utf-8');
      return send(res, 200, sharePage(run), 'text/html; charset=utf-8', { 'content-security-policy': CSP });
    }

    if (req.method === 'GET' || req.method === 'HEAD') {
      if (p === '/') p = '/index.html';
      const file = path.join(PUBLIC, path.normalize(p));
      if (!file.startsWith(PUBLIC + path.sep)) return send(res, 403, { error: 'Forbidden' });
      if (fs.existsSync(file) && fs.statSync(file).isFile()) {
        return send(res, 200, fs.readFileSync(file), MIME[path.extname(file)] || 'application/octet-stream');
      }
    }
    send(res, 404, { error: 'Not found' });
  } catch (err) {
    console.error(err);
    send(res, 500, { error: 'Server error' });
  }
});

server.listen(PORT, '0.0.0.0', () => console.log(`RunTrack running on port ${PORT}`));
