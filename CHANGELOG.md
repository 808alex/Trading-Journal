# Changelog

All notable changes to Trenching Journal are documented here.

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
