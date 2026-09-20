const { spawn } = require('node:child_process');
const net = require('node:net');
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs');
const { once } = require('node:events');

function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

// Boots the real server (server/index.js) as a child process against a
// throwaway SQLite file, so tests exercise the same code path as `npm start`
// without ever touching data/trades.db.
async function startServer({ dbFile } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'trenching-test-'));
  const file = dbFile || path.join(dir, 'test.db');
  const port = await freePort();

  const child = spawn(process.execPath, [path.join(__dirname, '..', '..', 'server', 'index.js')], {
    env: { ...process.env, PORT: String(port), TRENCHING_DB_PATH: file },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let output = '';
  child.stdout.on('data', (d) => { output += d; });
  child.stderr.on('data', (d) => { output += d; });

  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`server did not start in time:\n${output}`)), 15000);
    child.stdout.on('data', () => {
      if (output.includes('running at')) {
        clearTimeout(timer);
        resolve();
      }
    });
    child.on('exit', (code) => {
      clearTimeout(timer);
      reject(new Error(`server exited early (code ${code}):\n${output}`));
    });
  });

  const baseUrl = `http://127.0.0.1:${port}`;

  async function request(method, url, body) {
    const res = await fetch(baseUrl + url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    return { status: res.status, data };
  }

  return {
    baseUrl,
    dbFile: file,
    get: (url) => request('GET', url),
    post: (url, body) => request('POST', url, body),
    put: (url, body) => request('PUT', url, body),
    del: (url) => request('DELETE', url),
    async stop() {
      if (child.exitCode === null && child.signalCode === null) {
        child.removeAllListeners('exit');
        const exited = once(child, 'exit');
        child.kill();
        await exited;
      }
      fs.rmSync(dir, { recursive: true, force: true });
    },
  };
}

module.exports = { startServer };
