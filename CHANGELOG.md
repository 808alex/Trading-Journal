# Changelog

All notable changes to Trenching Journal are documented here.

## 1.2.0

New
- A Today home screen: log a trade or open today's journal in one click, see today's numbers so far, and close out anything still open.
- Focus for today: your recent "work on tomorrow" notes, plus plain-English callouts about your last few days (following your plan, trading on FOMO or anxiety, sleep, breaking your rules, forgetting to journal). It runs on your own machine.
- The Journal fills in a summary of each day by itself: trades, P&L, wins and losses, mood, plan, best and worst trade.
- An end-of-day check-in in the Journal: what to work on tomorrow, how you slept, and whether you stuck to your rules.
- Faster Log Trade: paste the contract address first, set your portfolio size once in Settings and "% of portfolio risked" fills itself in, and the exit section stays folded away until you need it.
- Automated tests, with checks that run on GitHub for every change.

Fixed
- The calendar, Total P&L and trade dates split days at UTC midnight instead of your own, so late-night trades landed on the wrong day. Trade times also showed UTC.
- A bad row in an import file could wipe your existing data halfway through. Imports are now all-or-nothing.
- The app needs Node 22.13 or newer, but the README said 22.5, which crashed on start. It now checks up front and tells you clearly.

## 1.1.0

- Backup & restore now covers everything, not just trades and journal entries — your profile (name, photo, theme, currency) and saved wallets are included in the JSON export/import too.
- Added CSV import (previously you could only export to CSV, not bring one back in).
- Fixed a bug where exporting your data could silently fail to download.
- Added a "Reset Everything" option in Settings, with a confirmation step, for a clean slate.
- Wallets: renamed the "label" field to "name".
- Removed the Recurring Patterns dashboard tab — it wasn't providing useful insight.
- Removed the old Create Account step in Settings; your display name now saves automatically as you type, the same way your profile photo already did.
- Coin lookup now also pulls in socials (Twitter/Telegram/website) and extra DEX stats (volume, price change, buys/sells) for the token you're looking up.
- Trades and journal entries now show an "(edited)" tag once you've changed them after saving.
- Various spacing and layout fixes in Settings.

## 1.0.0

Initial release. Core features: trade log with thesis/emotion/plan-adherence/grading, P&L and calendar view (SOL or fiat), daily journal, dashboard insights, in-app achievements, Solana coin lookup via DexScreener, screenshot attachments, wallet list, and JSON/CSV export.
