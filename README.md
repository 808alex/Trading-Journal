# Trading Journal

A personal, local, single-user paper-trading journal for memecoin/crypto trades on Solana. Log a trade, close it out, reflect on what you were thinking, and let the app surface patterns in your own behavior over time — all of it stored on your own computer.

## Features

- **Trade log** — entry/exit (price or market cap), amount invested, % of portfolio risked, fees, thesis, emotional state, "did you follow your plan?", lessons learned, and a process grade (A–D) that's about discipline, not P&L.
- **Total P&L and calendar view** — SOL or your choice of fiat (USD/GBP/EUR/JPY), with the SOL price auto-fetched from DexScreener so you don't have to type in a rate by hand.
- **Daily journal** — a running log of trading days, separate from individual trades, with starring and full-text history.
- **Dashboard insights** — recurring-phrase detection across your own notes, and performance broken down by emotional state, % risked, and grade, so you can see what's actually correlated with good process (not just good luck).
- **Achievements** — milestones across trade volume, P&L, following your plan, grading, and journaling consistency, plus running streaks.
- **Coin lookup** — paste a Solana contract address and the coin name auto-fills from DexScreener.
- **Screenshots** — attach a chart screenshot to any trade, by file upload, drag-in, or pasting straight from the clipboard (e.g. Snipping Tool).
- **Backup & restore** — export everything to a single JSON file and import it back in, so an app update or a fresh install doesn't mean starting your journal over.

## Requirements

- [Node.js](https://nodejs.org) 22.5 or newer.

## Getting started

1. Download this repository — either `git clone https://github.com/808alex/Trading-Journal.git`, or use GitHub's green **Code → Download ZIP** button above and extract it, or grab a packaged zip from the [Releases](https://github.com/808alex/Trading-Journal/releases) page if one is published.
2. **Windows:** double-click `Open Journal App.bat`. It installs dependencies on first run and opens the app in your browser automatically.
   **Mac/Linux:** run `./start.sh` from a terminal in the project folder (first time only: `chmod +x start.sh`).
3. Prefer doing it by hand? `npm install` once, then `npm start`, then open [http://localhost:3000](http://localhost:3000).

The server keeps running in its own window — closing that window (or hitting Ctrl+C in the terminal) stops the app. Run the same start script again any time; your data is untouched between sessions.

### Using it day to day

There's nothing to "log in" to — just start the server and open the page. Everything you enter is saved immediately to a real database file on your own computer (`data/trades.db`), not to anything cloud-based or tied to this Claude session. It'll be exactly as you left it the next time you start the app, indefinitely, with no extra steps.

Want it one click away? Make a shortcut to `Open Journal App.bat` (Windows: right-click it → **Send to → Desktop (create shortcut)**), then right-click the shortcut → **Properties → Change Icon…** and point it at `journal-icon.ico` in this folder for a proper app icon instead of the generic batch-file one.

## Data & privacy

Everything — every trade, every journal entry — lives in one local SQLite file at `data/trades.db`. Nothing is sent to any account, cloud service, or analytics provider, and there's no login or password anywhere in the app.

The only outbound network calls this app makes are two free, no-key public lookups, triggered only when you use the relevant feature:
- **DexScreener** — looks up a coin's name from a contract address you enter, and fetches SOL's own current price.
- **open.er-api.com** — converts that SOL price into GBP/EUR/JPY.

Neither service receives anything about your trades, journal entries, or P&L — just a token address or a generic exchange-rate request.

## Backup & restore

Since your data only exists on this computer, it won't survive an app update, reinstall, or a move to a new machine on its own. Before doing any of those: open **Settings → Backup & Restore → Export My Data** to download a single JSON file with everything in it. After updating/reinstalling, use **Import Data** on the new copy to load it back in.

## Tech stack

Vanilla HTML/CSS/JS on the frontend (no build step, no framework), an Express backend, and SQLite (Node's built-in `node:sqlite`) for storage. Chosen deliberately for simplicity — the whole app is readable top to bottom without needing to know a frontend framework.

## License

MIT — see [LICENSE](LICENSE).
