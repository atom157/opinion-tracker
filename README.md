# Opinion Portfolio Tracker

A lightweight dashboard to track an Opinion Protocol wallet (BNB Chain) using the Opinion Open API.

## Deploy (Vercel)

1. Import this repo on Vercel
2. Add an environment variable:

- `OPINION_API_KEY` — your Opinion Open API key

3. Deploy

## Local (optional)

This is a static site + serverless functions, designed for Vercel. You can still open `index.html` locally, but `/api/*` endpoints won't work without a serverless runtime.

## API routes

- `/api/positions?address=0x...`
- `/api/trades?address=0x...`
- `/api/market?marketId=123`
