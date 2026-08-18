const express = require('express');
const path = require('node:path');
const tradesRouter = require('./routes/trades');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use('/api/trades', tradesRouter);
app.use(express.static(path.join(__dirname, '..', 'public')));

app.listen(PORT, () => {
  console.log(`Trading journal running at http://localhost:${PORT}`);
});
