# Convergence App

This folder contains the deployable Next.js app and the SpacetimeDB module for Convergence.

For the full project overview, setup steps, deployment instructions, and architecture notes, see:

```txt
../README.md
../PROJECT_BREAKDOWN.md
```

## Quick Start

```bash
npm install
copy .env.example .env.local
npm run dev
```

Open:

```txt
http://127.0.0.1:3000
```

## Main Commands

```bash
npm run dev
npm run build
npm exec tsc -- --noEmit
npm run spacetime:generate
npm run spacetime:publish
```

## Environment

The browser only needs public SpacetimeDB connection values:

```txt
NEXT_PUBLIC_SPACETIMEDB_DB_NAME=convergence
NEXT_PUBLIC_SPACETIMEDB_HOST=wss://maincloud.spacetimedb.com
```

The Merge Gateway key is stored privately in SpacetimeDB:

```bash
spacetime call convergence set_config '"https://api-gateway.merge.dev/v1"' '"YOUR_MERGE_GATEWAY_KEY"' --server maincloud
```

Do not commit `.env.local`.

