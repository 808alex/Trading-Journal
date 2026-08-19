const express = require('express');
const path = require('node:path');
const tradesRouter = require('./routes/trades');
const journalRouter = require('./routes/journal');
const dashboardRouter = require('./routes/dashboard');
const dexscreenerRouter = require('./routes/dexscreener');
const walletRouter = require('./routes/wallet');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use('/api/trades', tradesRouter);
app.use('/api/journal', journalRouter);
app.use('/api/dashboard', dashboardRouter);
app.use('/api/dexscreener', dexscreenerRouter);
app.use('/api/wallet', walletRouter);
app.use(express.static(path.join(__dirname, '..', 'public')));

app.listen(PORT, () => {
  console.log(`Trading journal running at http://localhost:${PORT}`);
});
