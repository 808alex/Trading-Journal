const express = require('express');
const db = require('../db');

const router = express.Router();

// Purely a reference list -- a labeled set of addresses you trade from, so
// you (or anyone using this with multiple wallets) can keep track of which
// is which. Not linked to trades or balances in any way; that's a bigger,
// separate idea (auto-importing trade history from a wallet) that needs its
// own data-source decision before it's worth building.
router.get('/', (req, res) => {
  const rows = db.prepare('SELECT * FROM wallets ORDER BY created_at ASC, id ASC').all();
  res.json(rows);
});

router.post('/', (req, res) => {
  const { label, address } = req.body;

  if (!label || !label.trim()) {
    return res.status(400).json({ error: 'A label is required (e.g. "Main", "Burner 2").' });
  }
  if (!address || !address.trim()) {
    return res.status(400).json({ error: 'A wallet address is required.' });
  }

  const result = db
    .prepare('INSERT INTO wallets (label, address) VALUES (?, ?)')
    .run(label.trim(), address.trim());

  const row = db.prepare('SELECT * FROM wallets WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(row);
});

router.delete('/:id', (req, res) => {
  const result = db.prepare('DELETE FROM wallets WHERE id = ?').run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Wallet not found' });
  res.status(204).end();
});

module.exports = router;
