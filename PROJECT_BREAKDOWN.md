# Project Breakdown

This document explains how Convergence is structured, how data moves through the system, and where to make common changes.

## High-Level Idea

Convergence is a shared realtime thought canvas. The user submits one prompt. SpacetimeDB stores that prompt as the active session and scheduled backend procedures repeatedly ask three model personas for short associative thoughts. The browser subscribes to SpacetimeDB tables and renders those rows as animated visual elements around each model blob.

The browser does not call LLMs directly. The LLM gateway key is stored in a private SpacetimeDB table and used only by server-side procedures.

## Runtime Flow

```txt
User enters prompt
        |
        v
PromptInput calls start_session reducer
        |
        v
SpacetimeDB creates a session and updates global_meta.current_session_id
        |
        v
Scheduled timers fire every few seconds
        |
        v
tick_claude / tick_gpt / tick_gemini call Merge Gateway
        |
        v
Each successful tick inserts a thought row
        |
        v
Frontend useTable subscriptions receive live updates
        |
        v
Canvas renders blobs, thought bubbles, mood icons, aura colors, and convergence events
```

## Frontend

Location:

```txt
converge/app
```

### `app/page.tsx`

The main page shell. It renders:

- `Canvas`
- `PromptInput`
- `FullscreenButton`

### `app/providers.tsx`

Creates the SpacetimeDB React provider and connection builder. It reads:

- `NEXT_PUBLIC_SPACETIMEDB_HOST`
- `NEXT_PUBLIC_SPACETIMEDB_DB_NAME`

It also stores the auth token in `localStorage` so repeat visits keep the same SpacetimeDB identity.

### `app/hooks/useConvergenceState.ts`

Central frontend data hook. It subscribes to:

- `thought`
- `convergence_event`
- active `session`
- `viewer`

It returns normalized React state used by the canvas.

### `app/components/Canvas.tsx`

The primary visual coordinator.

Responsibilities:

- Reads current moods from latest thoughts.
- Builds the background mood gradient.
- Renders aura blobs for each model.
- Renders model blobs.
- Computes active and retiring thought bubbles.
- Renders floating mood icons.
- Shows convergence overlays.
- Handles client-only time state for animations.

Important constants:

- `MODELS`: model order.
- `MOOD_TINTS`: soft background gradient colors.
- `MOOD_AURA`: large aura field colors.
- `BLOB_POS`: screen positions for Claude, GPT, Gemini.
- `ACTIVE_MS`: how long thoughts remain near blobs.
- `RETIRED_MS`: when thoughts become residue.

### `app/components/Blob.tsx`

Renders the three visual model bodies. Each model has a color system and halo.

### `app/components/ThoughtCloud.tsx`

Renders a thought bubble around the matching blob. It uses:

- model position
- fixed model-specific bubble offset
- mood tint
- retiring/fade-out state

### `app/components/PromptInput.tsx`

Accepts a user prompt and calls:

```txt
start_session
```

The reducer call creates the active session in SpacetimeDB.

### `app/components/ConvergenceEventOverlay.tsx`

Shows a short visual event when SpacetimeDB detects a convergence between model moods.

### `app/globals.css`

Contains most of the visual language:

- canvas background
- cloud layer
- wide aura fields
- blob animation
- thought bubble animation
- prompt input
- fullscreen button
- responsive layout

## Backend

Location:

```txt
converge/spacetimedb/src
```

### `spacetimedb/src/index.ts`

Defines all SpacetimeDB tables, reducers, lifecycle hooks, and scheduled procedures.

## Tables

### `config`

Private table. Stores:

- Merge Gateway URL
- Merge Gateway key

This table is not public, so clients cannot subscribe to it.

### `session`

Public table. Stores user prompt sessions.

Important fields:

- `id`
- `startedAt`
- `prompt`
- `isActive`

### `thought`

Public table. Stores every generated model thought.

Important fields:

- `sessionId`
- `model`
- `tick`
- `parentThoughtId`
- `text`
- `latchWord`
- `mood`
- `gesture`
- `createdAt`

### `convergence_event`

Public table. Stores detected moments when model moods align.

### `viewer`

Public presence table. Stores connected user identities and color seeds.

### `global_meta`

Public singleton table. Stores:

- global tick count
- current active session id

### Timer Tables

Private scheduled tables:

- `claude_timer`
- `gpt_timer`
- `gemini_timer`
- `convergence_check_timer`

Each timer drives a scheduled procedure.

## Reducers

### `start_session`

Called by the frontend when the user submits a prompt.

It:

- ensures bootstrap rows exist
- deactivates older sessions
- inserts a new active session
- updates `global_meta.current_session_id`

### `set_config`

Stores the private Merge Gateway config.

Use it like this:

```bash
spacetime call convergence set_config '"https://api-gateway.merge.dev/v1"' '"YOUR_KEY"' --server maincloud
```

### `retune_timers`

Recreates or updates timer/bootstrap rows. Useful after clearing runtime tables.

## Scheduled Procedures

### `tick_claude`

Runs on the Claude timer. It:

- reads the active session
- reads the private config
- gathers recent Claude thoughts
- calls Merge Gateway
- inserts a Claude thought

### `tick_gpt`

Same pipeline for GPT.

### `tick_gemini`

Same pipeline for Gemini.

### `convergence_check`

Looks at the latest thought from each model. If at least two models share the same mood and the event is not a duplicate or too recent, it inserts a `convergence_event`.

## LLM Gateway

Location:

```txt
converge/spacetimedb/src/llm.ts
```

The backend calls:

```txt
POST {gatewayUrl}/responses
```

Current model routing:

- Claude: `anthropic/claude-haiku-4-5`
- GPT: `openai/gpt-4o-mini`
- Gemini: `google/gemini-2.5-flash`

The model response is expected to be valid JSON:

```json
{
  "text": "short thought",
  "latch_word": "word",
  "mood": "calm",
  "gesture": "bloom"
}
```

If the API request fails or JSON parsing fails, the backend inserts a fallback thought:

```txt
[ a silence ]
```

## Generated Bindings

Location:

```txt
converge/src/module_bindings
```

These files are generated from the SpacetimeDB module schema. The frontend imports generated table and reducer bindings from here.

Regenerate after backend schema changes:

```bash
cd converge
npm run spacetime:generate
```

## Deployment Model

### SpacetimeDB

SpacetimeDB hosts:

- data
- reducers
- scheduled model procedures
- private config
- realtime subscriptions

Publish with:

```bash
cd converge
npm run spacetime:publish
```

### Vercel

Vercel hosts only the Next.js frontend.

Vercel needs:

```txt
NEXT_PUBLIC_SPACETIMEDB_DB_NAME=convergence
NEXT_PUBLIC_SPACETIMEDB_HOST=wss://maincloud.spacetimedb.com
```

Vercel does not need the Merge Gateway key.

## Common Changes

### Change blob positions

Update `BLOB_POS` in:

```txt
app/components/Canvas.tsx
```

Also check matching position maps in:

```txt
app/components/ThoughtCloud.tsx
```

### Change aura size or mood visuals

Update:

```txt
app/globals.css
app/components/Canvas.tsx
```

### Change thought timing

Update timer intervals in `ensureBootstrap`:

```txt
spacetimedb/src/index.ts
```

The current model timer interval is `3_500_000` microseconds.

### Change model prompts

Update:

```txt
spacetimedb/src/prompts.ts
```

### Change model names or providers

Update:

```txt
spacetimedb/src/llm.ts
```

## Operational Checklist

Before demoing:

1. Confirm the frontend builds.
2. Confirm the SpacetimeDB config row exists.
3. Start a test session.
4. Confirm `thought` rows contain real text, not `[ a silence ]`.
5. Clear test rows.
6. Open the app and submit the real prompt.

Useful commands:

```bash
spacetime sql convergence --server maincloud "SELECT COUNT(*) AS config_count FROM config"
spacetime call convergence start_session '"test prompt"' --server maincloud
spacetime sql convergence --server maincloud "SELECT model, tick, text, mood FROM thought"
spacetime logs convergence --server maincloud -n 80
```

