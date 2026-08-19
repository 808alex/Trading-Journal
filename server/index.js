const express = require('express');
const path = require('node:path');
const tradesRouter = require('./routes/trades');
const journalRouter = require('./routes/journal');
const dashboardRouter = require('./routes/dashboard');
const dexscreenerRouter = require('./routes/dexscreener');
const achievementsRouter = require('./routes/achievements');
const solpriceRouter = require('./routes/solprice');
const backupRouter = require('./routes/backup');

const app = express();
const PORT = process.env.PORT || 3000;

// Raised from the default 100kb -- trade screenshots come in as base64 data
// URLs in the JSON body, and the higher-fidelity resize (1600px, quality
// 0.92) can run a few MB for a dense chart screenshot.
app.use(express.json({ limit: '15mb' }));
app.use('/api/trades', tradesRouter);
app.use('/api/journal', journalRouter);
app.use('/api/dashboard', dashboardRouter);
app.use('/api/dexscreener', dexscreenerRouter);
app.use('/api/achievements', achievementsRouter);
app.use('/api/solprice', solpriceRouter);
app.use('/api/backup', backupRouter);
app.use(express.static(path.join(__dirname, '..', 'public')));

app.listen(PORT, () => {
  console.log(`Trading journal running at http://localhost:${PORT}`);
});
