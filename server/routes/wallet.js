const express = require('express');
const db = require('../db');

const router = express.Router();

// GET /api/wallet — every transaction, oldest first, each with the running
// balance as of that transaction. Computing the running balance here (not
// on the client) keeps the ledger math in one place.
router.get('/', (req, res) => {
  const rows = db.prepare('SELECT * FROM wallet_transactions ORDER BY txn_date ASC, id ASC').all();

  let balance = 0;
  const withBalance = rows.map((row) => {
    balance += row.type === 'deposit' ? row.amount : -row.amount;
    return { ...row, balance_after: balance };
  });

  res.json(withBalance.reverse()); // newest first for display
});

router.post('/', (req, res) => {
  const { type, amount, txn_date, note } = req.body;

  if (!['deposit', 'withdrawal'].includes(type)) {
    return res.status(400).json({ error: "type must be 'deposit' or 'withdrawal'" });
  }
  if (amount == null || Number(amount) <= 0) {
    return res.status(400).json({ error: 'amount must be a positive number' });
  }
  if (!txn_date || !/^\d{4}-\d{2}-\d{2}$/.test(txn_date)) {
    return res.status(400).json({ error: 'txn_date is required, in YYYY-MM-DD format' });
  }

  const result = db
    .prepare('INSERT INTO wallet_transactions (type, amount, txn_date, note) VALUES (?, ?, ?, ?)')
    .run(type, Number(amount), txn_date, note || null);

  const row = db.prepare('SELECT * FROM wallet_transactions WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(row);
});

router.delete('/:id', (req, res) => {
  const result = db.prepare('DELETE FROM wallet_transactions WHERE id = ?').run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Transaction not found' });
  res.status(204).end();
});

module.exports = router;
