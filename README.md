# Convergence

Convergence is a real-time visual experiment where three LLM personas think in parallel inside a shared SpacetimeDB session. A viewer enters a prompt, the backend schedules recurring model ticks for Claude, GPT, and Gemini, and the frontend renders each generated thought as a living cloud around a glowing model blob.

The project combines a Next.js visual canvas with a SpacetimeDB TypeScript module. SpacetimeDB owns the realtime state, scheduled reducers, private LLM configuration, and browser subscriptions. Vercel can host the frontend while SpacetimeDB maincloud runs the live backend.

## Features

- Three model personas: Claude, GPT, and Gemini.
- Realtime SpacetimeDB subscriptions for sessions, thoughts, convergence events, and viewer presence.
- Scheduled backend model ticks that generate thoughts every few seconds.
- Mood-driven blob colors, full-screen aura fields, floating mood icons, and residue effects.
- Convergence detection when multiple models drift into related moods.
- Private server-side Merge Gateway key storage in SpacetimeDB, not in the browser.

## Tech Stack

- Next.js 15
- React 18
- TypeScript
- SpacetimeDB 2.4
- SpacetimeDB TypeScript server module
- Merge Gateway compatible `/responses` API
- Vercel for frontend deployment

## Repository Layout

```txt
.
|-- README.md
|-- PROJECT_BREAKDOWN.md
`-- converge/
    |-- app/                       # Next.js App Router frontend
    |   |-- components/            # Canvas, blobs, prompt input, thought clouds
    |   |-- hooks/                 # Realtime SpacetimeDB state hook
    |   |-- globals.css            # Visual system and animation styles
    |   |-- layout.tsx
    |   |-- page.tsx
    |   `-- providers.tsx          # SpacetimeDB React provider
    |-- spacetimedb/               # TypeScript SpacetimeDB module
    |   `-- src/
    |       |-- index.ts           # Tables, reducers, scheduled procedures
    |       |-- llm.ts             # Merge Gateway call and JSON parsing
    |       `-- prompts.ts         # Persona prompts
    |-- src/module_bindings/       # Generated TypeScript bindings
    |-- package.json
    |-- next.config.ts
    `-- spacetime.json
```

## Prerequisites

- Node.js 20 or newer
- npm
- SpacetimeDB CLI 2.4.x
- A SpacetimeDB maincloud account
- A Merge Gateway API key with budget available
- Optional: Vercel account for deployment

Check the CLI:

```bash
spacetime --version
```

## Local Setup

From the repository root:

```bash
cd converge
npm install
```

Create a local env file from the example:

```bash
copy .env.example .env.local
```

On macOS/Linux:

```bash
cp .env.example .env.local
```

Set these values in `converge/.env.local`:

```txt
NEXT_PUBLIC_SPACETIMEDB_DB_NAME=convergence
NEXT_PUBLIC_SPACETIMEDB_HOST=wss://maincloud.spacetimedb.com
SPACETIMEDB_DB_NAME=convergence
SPACETIMEDB_HOST=wss://maincloud.spacetimedb.com
```

Do not commit `.env.local`. It is ignored by git.

## Running Locally

Start the frontend:

```bash
npm run dev
```

Open:

```txt
http://127.0.0.1:3000
```

The app connects to the configured SpacetimeDB database and subscribes to public tables in realtime.

## SpacetimeDB Backend

The backend module lives in:

```txt
converge/spacetimedb/src/index.ts
```

It defines:

- `config`: private Merge Gateway URL/key.
- `session`: active prompt sessions.
- `thought`: generated model thoughts.
- `convergence_event`: moments where model moods align.
- `viewer`: presence dots.
- `global_meta`: active session pointer and global tick count.
- timer tables for Claude, GPT, Gemini, and convergence checks.

Publish the module to maincloud:

```bash
npm run spacetime:publish
```

Generate updated TypeScript bindings after schema changes:

```bash
npm run spacetime:generate
```

## Configure the LLM Gateway

The Merge Gateway key must be stored in SpacetimeDB with the private `set_config` reducer. This keeps the key out of the browser and out of Vercel.

```bash
spacetime call convergence set_config '"https://api-gateway.merge.dev/v1"' '"YOUR_MERGE_GATEWAY_KEY"' --server maincloud
```

Verify that config exists:

```bash
spacetime sql convergence --server maincloud "SELECT COUNT(*) AS config_count FROM config"
```

## Useful Database Commands

Start a session:

```bash
spacetime call convergence start_session '"what is memory?"' --server maincloud
```

View thoughts:

```bash
spacetime sql convergence --server maincloud "SELECT model, tick, text, mood FROM thought"
```

Read recent logs:

```bash
spacetime logs convergence --server maincloud -n 80
```

Clear runtime tables while preserving `config`:

```bash
spacetime sql convergence --server maincloud "DELETE FROM thought"
spacetime sql convergence --server maincloud "DELETE FROM convergence_event"
spacetime sql convergence --server maincloud "DELETE FROM session"
spacetime sql convergence --server maincloud "DELETE FROM viewer"
spacetime sql convergence --server maincloud "DELETE FROM global_meta"
spacetime call convergence retune_timers --server maincloud
```

## Vercel Deployment

Import the GitHub repository into Vercel.

Use these settings:

```txt
Root Directory: converge
Framework Preset: Next.js
Build Command: npm run build
Install Command: npm install
Output Directory: .next
```

Add these environment variables in Vercel:

```txt
NEXT_PUBLIC_SPACETIMEDB_DB_NAME=convergence
NEXT_PUBLIC_SPACETIMEDB_HOST=wss://maincloud.spacetimedb.com
```

Do not add the Merge Gateway key to Vercel. The key belongs in SpacetimeDB via `set_config`.

## Verification

Before pushing or deploying:

```bash
cd converge
npm exec tsc -- --noEmit
npm run build
```

Expected result:

- TypeScript passes.
- Next.js production build completes.
- The app connects to SpacetimeDB.
- A submitted prompt creates a session.
- Thought rows appear within a few timer ticks.

## Troubleshooting

If the blobs do not show thoughts:

1. Check that `config` exists:

   ```bash
   spacetime sql convergence --server maincloud "SELECT COUNT(*) AS config_count FROM config"
   ```

2. Check logs for LLM errors:

   ```bash
   spacetime logs convergence --server maincloud -n 80
   ```

3. If logs show `api_key_limit_exceeded`, raise the Merge Gateway key budget or set a new key with `set_config`.

4. If thought rows exist but the UI is empty, verify `NEXT_PUBLIC_SPACETIMEDB_DB_NAME` and `NEXT_PUBLIC_SPACETIMEDB_HOST`.

## Security Notes

- Never commit `.env.local`.
- Never put the Merge Gateway key in `NEXT_PUBLIC_*` variables.
- Rotate any key that was accidentally committed or shared publicly.
- Keep `.next/`, `node_modules/`, and generated local state out of git.
