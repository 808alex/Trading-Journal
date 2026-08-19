const express = require('express');
const path = require('node:path');
const tradesRouter = require('./routes/trades');
const journalRouter = require('./routes/journal');
const dashboardRouter = require('./routes/dashboard');
const dexscreenerRouter = require('./routes/dexscreener');
const achievementsRouter = require('./routes/achievements');

const app = express();
const PORT = process.env.PORT || 3000;

// Raised from the default 100kb -- trade screenshots come in as base64 data
// URLs in the JSON body, which run a few hundred KB even after client-side
// resizing.
app.use(express.json({ limit: '8mb' }));
app.use('/api/trades', tradesRouter);
app.use('/api/journal', journalRouter);
app.use('/api/dashboard', dashboardRouter);
app.use('/api/dexscreener', dexscreenerRouter);
app.use('/api/achievements', achievementsRouter);
app.use(express.static(path.join(__dirname, '..', 'public')));

app.listen(PORT, () => {
  console.log(`Trading journal running at http://localhost:${PORT}`);
});
