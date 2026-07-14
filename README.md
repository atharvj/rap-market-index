# Rap Market Index

Rap Market Index is a fantasy rapper stock market where users trade artist shares with virtual cash.

Live app: https://rap-market-index.vercel.app/

## Overview

The product is built around a paper-money market for hip-hop fans: users can create an account, build a portfolio, track artist prices, and compete on portfolio performance without real-money trading.

The market engine is designed to react to broad artist momentum, including audience growth, release activity, media movement, and market activity. Price history is stored from real market runs instead of generated as fake backfill.

## Status

Rap Market Index is in active development. Current work is focused on the backend market engine, account persistence, trading integrity, and reliable historical charts.

## Stack

- Next.js 15
- React 19
- Supabase Auth and Postgres
- Tailwind CSS
- Server-side market update jobs

## Developer Notes

Implementation notes live in [`docs/`](docs/) for migration order, backend setup, and market-engine operations.

Production security, deployment hardening, incident response, and capacity checks
are documented in [`docs/security-and-scaling.md`](docs/security-and-scaling.md).
Security issues should be reported privately as described in
[`SECURITY.md`](SECURITY.md).
