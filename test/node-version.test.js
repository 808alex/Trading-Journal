const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');

// --no-experimental-sqlite makes require('node:sqlite') fail the way it does
// on Node < 22.13, without needing an old Node installed.
test('a Node without node:sqlite exits with a clear message, not a stack trace', () => {
  const result = spawnSync(
    process.execPath,
    ['--no-experimental-sqlite', path.join(__dirname, '..', 'server', 'db.js')],
    { encoding: 'utf8', env: { ...process.env, TRENCHING_DB_PATH: ':memory:' } }
  );

  assert.equal(result.status, 1);
  assert.match(result.stderr, /needs Node\.js 22\.13 or newer/);
  assert.match(result.stderr, /https:\/\/nodejs\.org/);
  assert.doesNotMatch(result.stderr, /ERR_UNKNOWN_BUILTIN_MODULE/);
});
