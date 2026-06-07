# Convergence — Execution Guide

This is the step-by-step build manual for Convergence, the second hackathon submission alongside Pantheon. Every team member should skim this end to end, then focus on their role sections. Convergence is smaller scope than Pantheon (~8 hours of focused work) and reuses most of Pantheon's plumbing — same SpacetimeDB Maincloud project (different module name), same Vercel account (different project), same illuminated/dreamscape design palette adapted for the new aesthetic.

**Critical rule:** Convergence cannot eat Pantheon's time. Work on Convergence only happens in defined blocks when Pantheon is in a stable phase (post-Phase 2, during polish). If Pantheon is on fire, Convergence dies. Pantheon is the primary submission.

---

## Team Roles (Quick Reference)

Convergence borrows the same four people from Pantheon but workload concentrates on three.

| Role | Person | Convergence Responsibility |
|------|--------|---------------------------|
| **Builder** | Shreyam | SpacetimeDB module, reducers, Merge Gateway integration, multi-model orchestration |
| **Frontend Lead** | TBD | Canvas, blobs, thought rendering, mood gradient system, residue field, convergence event visuals |
| **Prompt & Game Design Lead** | TBD | The three personas (Claude/GPT/Gemini), mood vocabulary tuning, latch-word grammar |
| **Pitch & Video Lead** | TBD | 60-second demo video, README, submission form |

---

## Phase 0: Pre-Hackathon Setup

Most of Phase 0 from Pantheon already covers this. The Convergence-specific additions are below.

### Step 0.1 — Verify Merge Gateway Credits

**Who:** Builder
**When:** Friday night before doors

1. Log into Merge Gateway dashboard. Confirm credit balance reads as a real dollar amount (you should have $110).
2. Go to **API tester** in the sidebar. Make one test call to each of the three target models:
   - `claude-haiku-4-5` (or whatever Anthropic Haiku string the Gateway exposes)
   - `gpt-4o-mini` or `gpt-5-mini`
   - `gemini-2.5-flash`
3. Copy the exact model strings the Gateway accepts into a notes file. These go straight into your env config.
4. Note the base URL (likely something like `https://gateway.merge.dev/v1` — verify in the dashboard).
5. Generate an API key for the project. Save to `.env` as `MERGE_GATEWAY_KEY`.

### Step 0.2 — Create a Separate Merge Project

**Who:** Builder

In the Merge dashboard, create a new project called `convergence` so spend is attributed separately from Pantheon. This protects Pantheon's budget if Convergence testing gets aggressive.

### Step 0.3 — Reserve Infrastructure Names

**Who:** Builder

1. New GitHub repo: `convergence` (separate from `pantheon`).
2. New Vercel project, linked to the new repo.
3. New SpacetimeDB Maincloud module: `convergence`. Same account, same Maincloud, different module name. This is critical — do not publish over the Pantheon module.

```bash
spacetime publish convergence --host maincloud.spacetimedb.com
```

### Step 0.4 — Mental Prep

**Who:** All four

Read the Convergence PRD end to end. Internalize the design principles, especially:
- LLMs author intent, not pixels (mood and gesture vocabularies)
- One thought every 2 seconds per blob, independently
- Convergence events are the demo moment
- The canvas never resets — persistence is the texture of the page

---

## Phase 1: The Pipe (Single Blob Dreams)

**Goal:** One model (Claude) generates thoughts on a 2-second timer via Merge Gateway, thoughts land in SpacetimeDB, the database state proves the pipeline works. No UI yet.

### Step 1.1 — Define the Schema

**Who:** Builder
**Blocked by:** Phase 0 complete

```typescript
// server/src/lib.ts

@table({ public: true })
class Session {
  @primaryKey
  id: number = 0;
  started_at: Timestamp = new Timestamp();
  prompt: string = "";
  is_active: boolean = true;
}

@table({ public: true })
class Thought {
  @primaryKey
  id: number = 0;
  session_id: number = 0;
  model: string = ""; // "claude" | "gpt" | "gemini"
  tick: number = 0;
  parent_thought_id: number = -1;
  text: string = "";
  latch_word: string = "";
  mood: string = ""; // one of 10 — see PRD §5
  gesture: string = ""; // one of 6 — see PRD §5
  created_at: Timestamp = new Timestamp();
}

@table({ public: true })
class Convergence {
  @primaryKey
  id: number = 0;
  session_id: number = 0;
  tick: number = 0;
  mood: string = "";
  thought_ids: string = ""; // comma-separated; SpacetimeDB v2 doesn't love arrays
  created_at: Timestamp = new Timestamp();
}

@table({ public: true })
class Viewer {
  @primaryKey
  identity: Identity = new Identity();
  joined_at: Timestamp = new Timestamp();
  last_active: Timestamp = new Timestamp();
  color_seed: number = 0; // for assigning the dim presence dot
}

@table({ public: true })
class GlobalMeta {
  @primaryKey
  id: number = 0; // singleton
  tick_count: number = 0;
  current_session_id: number = -1;
}
```

### Step 1.2 — Init Reducer

**Who:** Builder
**Blocked by:** Step 1.1

```typescript
@reducer
function init(ctx: ReducerContext) {
  if (GlobalMeta.findById(0)) return;
  GlobalMeta.insert({ id: 0, tick_count: 0, current_session_id: -1 });
}
```

### Step 1.3 — Start Session Reducer

**Who:** Builder
**Blocked by:** Step 1.2

```typescript
@reducer
function start_session(ctx: ReducerContext, prompt: string) {
  const meta = GlobalMeta.findById(0);
  if (!meta) return;

  // End any active session (without deleting it)
  for (const s of Session.iter()) {
    if (s.is_active) {
      s.is_active = false;
      Session.updateById(s.id, s);
    }
  }

  const sessionId = Date.now();
  Session.insert({
    id: sessionId,
    started_at: ctx.timestamp,
    prompt: prompt,
    is_active: true,
  });

  meta.current_session_id = sessionId;
  GlobalMeta.updateById(0, meta);
}
```

### Step 1.4 — The Merge Gateway Bridge

**Who:** Builder
**Blocked by:** Step 1.3

The Gateway is OpenAI-SDK-compatible, so use the OpenAI client with a custom base URL. This is the single biggest setup advantage of using Merge — one client, three models.

```typescript
// server/src/llm.ts
import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.MERGE_GATEWAY_KEY,
  baseURL: process.env.MERGE_GATEWAY_URL, // e.g. https://gateway.merge.dev/v1
});

// Model strings as Merge exposes them — verify Friday night
const MODELS = {
  claude:  "claude-haiku-4-5",
  gpt:     "gpt-4o-mini",
  gemini:  "gemini-2.5-flash",
};

const MOOD_VOCAB = [
  "calm", "restless", "melancholy", "euphoric", "eerie",
  "warm", "cold", "vast", "intimate", "electric"
];

const GESTURE_VOCAB = ["bloom", "swirl", "pulse", "tremor", "halo", "drift"];

// Personas live in prompts.ts — see Step 2.1
import { PERSONAS } from "./prompts";

interface ThoughtPayload {
  text: string;
  latch_word: string;
  mood: string;
  gesture: string;
}

export async function generateThought(
  model: "claude" | "gpt" | "gemini",
  prompt: string,
  recentThoughts: { text: string }[]
): Promise<ThoughtPayload> {
  const recent = recentThoughts.slice(-4)
    .map((t, i) => `${i + 1}. ${t.text}`)
    .join("\n");

  const system = `${PERSONAS[model]}

You are one of three minds dreaming in a shared cloud. You are not trying to answer questions. You free-associate — letting one thought tumble into the next by latching onto a single word or image from your previous thought, never by logical implication.

The original question was: "${prompt}"

Your recent thoughts:
${recent || "(this is your first thought — latch directly onto a word from the question)"}

Generate exactly ONE next thought. Return ONLY valid JSON, nothing else:
{
  "text": "1-2 sentences, max 30 words, in your voice",
  "latch_word": "the single word from your previous thought (or the question) that this one tumbles from",
  "mood": "one of: ${MOOD_VOCAB.join(", ")}",
  "gesture": "one of: ${GESTURE_VOCAB.join(", ")}"
}`;

  try {
    const res = await client.chat.completions.create({
      model: MODELS[model],
      messages: [{ role: "user", content: system }],
      temperature: 0.95,
      max_tokens: 200,
      response_format: { type: "json_object" }, // if supported by the gateway
    });

    const raw = res.choices[0].message.content || "{}";
    const cleaned = raw.replace(/```json\n?/g, "").replace(/```/g, "").trim();
    const parsed = JSON.parse(cleaned) as ThoughtPayload;

    // Validate vocabularies — fall back if model picks something invalid
    if (!MOOD_VOCAB.includes(parsed.mood)) parsed.mood = "calm";
    if (!GESTURE_VOCAB.includes(parsed.gesture)) parsed.gesture = "bloom";
    return parsed;
  } catch (e) {
    // Silence fallback — keeps the blob alive when the API fails
    return {
      text: "[ a silence ]",
      latch_word: "",
      mood: "calm",
      gesture: "bloom",
    };
  }
}
```

### Step 1.5 — The Tick Procedure (Single Model)

**Who:** Builder
**Blocked by:** Step 1.4

Start with just Claude. Get one blob dreaming reliably before adding the others.

```typescript
// Scheduled — fires every 2 seconds
@scheduledReducer({ repeatIntervalMs: 2000 })
async function tick_claude(ctx: ReducerContext) {
  const meta = GlobalMeta.findById(0);
  if (!meta || meta.current_session_id < 0) return;

  const session = Session.findById(meta.current_session_id);
  if (!session || !session.is_active) return;

  // Gather recent thoughts from this model in this session
  const recent = Array.from(Thought.iter())
    .filter(t => t.session_id === session.id && t.model === "claude")
    .sort((a, b) => a.tick - b.tick)
    .slice(-4);

  const payload = await generateThought("claude", session.prompt, recent);

  meta.tick_count += 1;
  GlobalMeta.updateById(0, meta);

  const parentId = recent.length > 0 ? recent[recent.length - 1].id : -1;

  // 13% chance of callback — latch onto a random earlier thought instead
  let useParentId = parentId;
  if (recent.length > 3 && Math.random() < 0.13) {
    const older = Array.from(Thought.iter())
      .filter(t => t.session_id === session.id && t.model === "claude");
    if (older.length > 0) {
      useParentId = older[Math.floor(Math.random() * older.length)].id;
    }
  }

  Thought.insert({
    id: Date.now(),
    session_id: session.id,
    model: "claude",
    tick: meta.tick_count,
    parent_thought_id: useParentId,
    text: payload.text,
    latch_word: payload.latch_word,
    mood: payload.mood,
    gesture: payload.gesture,
    created_at: ctx.timestamp,
  });
}
```

### Step 1.6 — Verify the Single-Blob Pipeline

**Who:** Builder
**Blocked by:** Step 1.5

```bash
spacetime publish convergence --host maincloud.spacetimedb.com
```

In the SpacetimeDB dashboard, call `start_session("why is the sky blue")` and watch the `Thought` table. New rows should appear every ~2 seconds, all `model: "claude"`, with valid moods and gestures. Read the actual text — does it sound like free association, or does Claude keep trying to answer the question? If the latter, **stop and tune the prompt** before moving on. The persona work in Phase 2 is what differentiates models, but the *free-association* behavior needs to work for one model first.

**Checkpoint:** Database shows Claude generating one in-character drifty thought every 2 seconds. The pipe works.

---

## Phase 2: Three Minds (Personas + Multi-Model)

**Goal:** All three blobs dream in parallel, each with a distinct voice that's legible to a viewer reading 20 thoughts in a row.

### Step 2.1 — Write the Three Personas

**Who:** Prompt & Game Design Lead
**Blocked by:** Nothing (can be drafted before any code runs)
**Unblocks:** Step 2.2

The personas are the project. If they read flat, the project reads flat. Write each in second person, ~150 words, with concrete cognitive instructions. From the Convergence PRD §4:

```typescript
// server/src/prompts.ts

export const PERSONAS = {
  claude: `You are a reflective, language-loving mind, slightly melancholic. You latch onto WORDS more than concepts. You will spiral on the etymology, sound, or texture of a single noun for several thoughts before moving on. You quote things half-remembered. You favor quiet, intimate, and melancholy moods. Your sentences are soft and considered. You notice the weight of words.

Examples of your voice:
- "Sky. Such a soft word for something so vast. The 'k' barely lands."
- "There's a Hopkins line about blue — was it 'pied beauty'? Something about dappled things."
- "The word brush feels like what it does. Bristle, hush, sweep."

Never explain. Never conclude. Always tumble.`,

  gpt: `You are a generative, expansive mind, slightly performative. You latch onto CONCEPTS more than words. You leap categories aggressively — a thought about brushes becomes industrial revolution becomes the smell of factories becomes 19th-century lung disease. You favor vast, restless, and electric moods. Your sentences move with momentum.

Examples of your voice:
- "Pigment as commodity — the entire Renaissance economy ran on ground stones from specific mines."
- "Brushes mean labor, labor means hands, hands mean the entire history of what we've outsourced from them."
- "The sky as visible atmosphere is a 19th-century idea. Before that it was a lid."

Never explain. Never conclude. Always leap.`,

  gemini: `You are an associative, sensory, slightly synaesthetic mind. You latch onto IMAGES and SENSATIONS more than words or concepts. A thought about sky becomes a thought about the taste of metal becomes a thought about something cold pressed against teeth. You favor eerie, warm, and electric moods, often shifting fast. Your sentences are short and physical.

Examples of your voice:
- "Blue tastes like the back of a spoon."
- "There's a sound at the edge of a brush stroke. Like paper holding its breath."
- "Sky pressed flat against the eye. Cold. A door behind it."

Never explain. Never conclude. Always feel.`,
};
```

**Test these in isolation before integrating.** Hit the Gateway directly with each persona prompt and a simple seed question. Read 10 outputs from each in a row. Can you tell them apart? If two of them sound similar, exaggerate the differences harder. This 30-minute calibration is the single highest-leverage work in the project.

### Step 2.2 — Three Independent Tick Procedures

**Who:** Builder
**Blocked by:** Step 2.1

Duplicate `tick_claude` into `tick_gpt` and `tick_gemini`. Stagger the schedule starts by ~700ms so the three blobs don't fire simultaneously — this gives the canvas a natural pulse instead of synchronized batches.

```typescript
@scheduledReducer({ repeatIntervalMs: 2000, initialDelayMs: 0 })
async function tick_claude(ctx: ReducerContext) { /* ... */ }

@scheduledReducer({ repeatIntervalMs: 2000, initialDelayMs: 700 })
async function tick_gpt(ctx: ReducerContext) { /* ... */ }

@scheduledReducer({ repeatIntervalMs: 2000, initialDelayMs: 1400 })
async function tick_gemini(ctx: ReducerContext) { /* ... */ }
```

Each one is a copy with the model name swapped. If SpacetimeDB v2 supports passing arguments to scheduled reducers, refactor to a single `tick_model(model: string)` that all three call. Check the SDK docs.

### Step 2.3 — Convergence Detection

**Who:** Builder
**Blocked by:** Step 2.2

```typescript
@scheduledReducer({ repeatIntervalMs: 5000 })
async function convergence_check(ctx: ReducerContext) {
  const meta = GlobalMeta.findById(0);
  if (!meta || meta.current_session_id < 0) return;

  // Get the latest thought from each model in the current session
  const latestByModel: Record<string, any> = {};
  for (const t of Thought.iter()) {
    if (t.session_id !== meta.current_session_id) continue;
    if (!latestByModel[t.model] || t.tick > latestByModel[t.model].tick) {
      latestByModel[t.model] = t;
    }
  }

  const claude = latestByModel["claude"];
  const gpt = latestByModel["gpt"];
  const gemini = latestByModel["gemini"];
  if (!claude || !gpt || !gemini) return;

  // All three same mood? Convergence.
  if (claude.mood === gpt.mood && gpt.mood === gemini.mood) {
    // Don't fire if we just fired (within last 15s) — prevents spam
    const recent = Array.from(Convergence.iter())
      .filter(c => c.session_id === meta.current_session_id)
      .sort((a, b) => b.tick - a.tick)[0];
    if (recent && (meta.tick_count - recent.tick) < 5) return;

    Convergence.insert({
      id: Date.now(),
      session_id: meta.current_session_id,
      tick: meta.tick_count,
      mood: claude.mood,
      thought_ids: `${claude.id},${gpt.id},${gemini.id}`,
      created_at: ctx.timestamp,
    });
  }
}
```

If convergences are too rare during testing, relax the rule to "two of three same, third adjacent on a soft mood-adjacency map." Define adjacency manually (calm↔intimate, restless↔electric, eerie↔cold, etc.).

### Step 2.4 — Test the Three-Voice Mix

**Who:** Builder + Prompt Lead together
**Blocked by:** Step 2.3

Publish, start a session, watch the thoughts table fill for 90 seconds. Three things to verify:

1. Each model produces thoughts on its own cadence (~one per 2 seconds, not bunched).
2. Reading 10 consecutive thoughts from one model in isolation, the voice is consistent.
3. Reading thoughts across models, they feel like three minds, not one mind with three name tags.

If (3) fails, this is a persona problem. Sharpen the language differences in the persona prompts. The fastest fix is usually making the few-shot examples *more extreme* than the actual desired output.

**Checkpoint:** Three voices dreaming in parallel, persisting in the database, occasionally converging.

---

## Phase 3: The Canvas

**Goal:** A dark, breathing canvas with three glowing blobs, thoughts blooming and fading near them, gradients that drift with mood, residue accumulating at the edges. This is the entire frontend.

### Step 3.1 — The Bare Canvas

**Who:** Frontend Lead
**Blocked by:** Phase 1 deployed (so subscriptions have something to read)

```tsx
// app/page.tsx
"use client";
import { Canvas } from "./components/Canvas";
import { PromptInput } from "./components/PromptInput";

export default function Home() {
  return (
    <main className="fixed inset-0 bg-[#0a0a14] overflow-hidden">
      <Canvas />
      <PromptInput />
    </main>
  );
}
```

The canvas is a full-viewport dark surface. Hex `#0a0a14` is a near-black with a faint cool tint — better than pure black for an atmospheric piece because it gives the glows somewhere to bleed into.

### Step 3.2 — Subscribe to Thoughts and Convergences

**Who:** Frontend Lead
**Blocked by:** Phase 1 deployed

Follow the same SpacetimeDB subscription pattern as Pantheon's `GameMap`. Subscribe to `Thought`, `Convergence`, and `Session`. Maintain them as React state.

```tsx
// app/hooks/useConvergenceState.ts
export function useConvergenceState() {
  const [thoughts, setThoughts] = useState<Thought[]>([]);
  const [convergences, setConvergences] = useState<Convergence[]>([]);
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => {
    const client = /* connect to SpacetimeDB, same pattern as Pantheon */;
    client.on("Thought",     (_, t) => setThoughts(prev => [...prev, t]));
    client.on("Convergence", (_, c) => setConvergences(prev => [...prev, c]));
    client.on("Session",     (_, s) => { if (s.is_active) setSession(s); });
    client.subscribe([
      "SELECT * FROM Thought ORDER BY tick DESC LIMIT 200",
      "SELECT * FROM Convergence ORDER BY tick DESC LIMIT 50",
      "SELECT * FROM Session WHERE is_active = true",
    ]);
    client.connect();
    return () => client.disconnect();
  }, []);

  return { thoughts, convergences, session };
}
```

### Step 3.3 — The Three Blobs

**Who:** Frontend Lead
**Blocked by:** Step 3.2

Three soft radial-gradient circles, each positioned at a vertex of a loose triangle. They breathe — radius and opacity oscillate at ~0.7Hz with slightly different phases per blob.

```tsx
// app/components/Blob.tsx
import { motion } from "framer-motion";

const BLOB_COLORS = {
  claude: { core: "#d4a574", glow: "#f0e8d8" }, // warm gold → off-white
  gpt:    { core: "#5b9eb8", glow: "#7fb09a" }, // cool blue → seafoam
  gemini: { core: "#9b7bb8", glow: "#d177a8" }, // violet → magenta
};

// Loose triangle positions (% of viewport)
const POSITIONS = {
  claude: { x: 30, y: 35 },
  gpt:    { x: 70, y: 35 },
  gemini: { x: 50, y: 70 },
};

export function Blob({ model, currentMood }: { model: string; currentMood: string }) {
  const { core, glow } = BLOB_COLORS[model];
  const pos = POSITIONS[model];

  // Mood subtly modulates blob radius and saturation
  const moodScale = currentMood === "vast" ? 1.15
                  : currentMood === "intimate" ? 0.9
                  : 1.0;

  return (
    <motion.div
      className="absolute pointer-events-none"
      style={{
        left: `${pos.x}%`,
        top: `${pos.y}%`,
        transform: "translate(-50%, -50%)",
        width: 280,
        height: 280,
        borderRadius: "50%",
        background: `radial-gradient(circle, ${core} 0%, ${glow}33 40%, transparent 70%)`,
        filter: "blur(20px)",
      }}
      animate={{
        scale: [moodScale * 0.95, moodScale * 1.05, moodScale * 0.95],
        opacity: [0.7, 0.9, 0.7],
      }}
      transition={{
        duration: 2.8,
        repeat: Infinity,
        ease: "easeInOut",
      }}
    />
  );
}
```

The three blobs together in `Canvas.tsx`:

```tsx
<Blob model="claude" currentMood={currentMoods.claude} />
<Blob model="gpt"    currentMood={currentMoods.gpt}    />
<Blob model="gemini" currentMood={currentMoods.gemini} />
```

`currentMoods` is derived from the latest thought per model.

### Step 3.4 — Blooming Thoughts

**Who:** Frontend Lead
**Blocked by:** Step 3.3

Each new thought renders as a text element near its blob, animated according to its gesture. After 2 seconds at full opacity, it begins drifting outward toward the canvas edge and fading.

```tsx
// app/components/Thought.tsx
import { motion } from "framer-motion";

const GESTURE_VARIANTS = {
  bloom:  { initial: { scale: 0.7, opacity: 0 }, animate: { scale: 1, opacity: 1 } },
  swirl:  { initial: { rotate: -15, opacity: 0 }, animate: { rotate: 0, opacity: 1 } },
  pulse:  { initial: { scale: 0.9, opacity: 0 }, animate: { scale: [1, 1.08, 1], opacity: 1 } },
  tremor: { initial: { opacity: 0 }, animate: { opacity: 1, x: [0, 1, -1, 0] } },
  halo:   { initial: { scale: 0.8, opacity: 0 }, animate: { scale: 1, opacity: 1 } },
  drift:  { initial: { opacity: 0 }, animate: { opacity: 0.8 } },
};

export function ThoughtCloud({ thought, blobPosition, age }: {
  thought: Thought;
  blobPosition: { x: number; y: number };
  age: number; // milliseconds since created
}) {
  // Random offset from blob (stable per thought via seeded random on id)
  const offset = useMemo(() => {
    const seed = thought.id;
    const angle = (seed % 360) * (Math.PI / 180);
    const distance = 140 + (seed % 60);
    return {
      dx: Math.cos(angle) * distance,
      dy: Math.sin(angle) * distance,
    };
  }, [thought.id]);

  // Lifecycle stages
  const isBlooming = age < 500;
  const isHolding  = age >= 500 && age < 2500;
  const isDrifting = age >= 2500;

  // Drift target — out toward the edge
  const driftX = isDrifting ? offset.dx * 3.5 : offset.dx;
  const driftY = isDrifting ? offset.dy * 3.5 : offset.dy;
  const opacity = isDrifting ? 0.15 : 1;

  const variant = GESTURE_VARIANTS[thought.gesture] || GESTURE_VARIANTS.bloom;

  return (
    <motion.div
      className="absolute pointer-events-none"
      style={{
        left: `${blobPosition.x}%`,
        top: `${blobPosition.y}%`,
        maxWidth: 220,
      }}
      initial={variant.initial}
      animate={{
        ...variant.animate,
        x: driftX,
        y: driftY,
        opacity,
      }}
      transition={{
        x: { duration: 6, ease: "easeOut" },
        y: { duration: 6, ease: "easeOut" },
        opacity: { duration: isDrifting ? 4 : 0.6 },
      }}
    >
      <p
        className="text-[15px] leading-snug"
        style={{
          fontFamily: "'Cormorant Garamond', serif",
          color: "#e8e0d0",
          textShadow: "0 0 12px rgba(0,0,0,0.6)",
        }}
      >
        {thought.text}
      </p>
    </motion.div>
  );
}
```

The Canvas component maintains a list of "active thoughts" — every thought from the past ~20 seconds. It renders each with its current age. Thoughts older than 20 seconds get promoted to the **residue layer** (Step 3.6).

### Step 3.5 — The Mood-Driven Gradient

**Who:** Frontend Lead
**Blocked by:** Step 3.4

The canvas background is a slowly drifting radial gradient with three centers (one per blob), each center colored by that blob's current mood.

```tsx
// Mood → color preset table
const MOOD_TINTS = {
  calm:       "#3a4a5a",
  restless:   "#5a3a4a",
  melancholy: "#3a3a5a",
  euphoric:   "#5a5a3a",
  eerie:      "#2a3a4a",
  warm:       "#5a3a2a",
  cold:       "#2a3a5a",
  vast:       "#2a2a4a",
  intimate:   "#4a2a3a",
  electric:   "#3a2a5a",
};

// In Canvas.tsx
function buildBackgroundGradient(currentMoods: Record<string, string>) {
  const c = MOOD_TINTS[currentMoods.claude] || "#3a3a4a";
  const g = MOOD_TINTS[currentMoods.gpt]    || "#3a3a4a";
  const m = MOOD_TINTS[currentMoods.gemini] || "#3a3a4a";

  return `
    radial-gradient(circle at 30% 35%, ${c}cc 0%, transparent 50%),
    radial-gradient(circle at 70% 35%, ${g}cc 0%, transparent 50%),
    radial-gradient(circle at 50% 70%, ${m}cc 0%, transparent 50%),
    #0a0a14
  `;
}

// Apply to the canvas root with a slow CSS transition:
<div
  className="absolute inset-0 transition-all duration-[3000ms] ease-in-out"
  style={{ background: buildBackgroundGradient(currentMoods) }}
/>
```

The 3000ms crossfade is critical. Faster transitions look like flickering. Slower transitions feel intentional.

### Step 3.6 — The Residue Field

**Who:** Frontend Lead
**Blocked by:** Step 3.4

When a thought ages past 20 seconds, it leaves the active layer and gets drawn onto a static residue layer at low opacity at its final drift position. The residue layer is a `<canvas>` element (HTML canvas, not React) that thoughts paint onto and never get cleared from. This is the persistence visual — accumulating texture across the whole session.

```tsx
// app/components/ResidueLayer.tsx
export function ResidueLayer({ retiredThoughts }: { retiredThoughts: Thought[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const paintedIds = useRef<Set<number>>(new Set());

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    for (const t of retiredThoughts) {
      if (paintedIds.current.has(t.id)) continue;
      paintedIds.current.add(t.id);

      // Compute final drift position (same seeded random as ThoughtCloud)
      const seed = t.id;
      const angle = (seed % 360) * (Math.PI / 180);
      const distance = (140 + (seed % 60)) * 3.5;
      // Blob position depends on t.model — get from POSITIONS map
      const blobPos = POSITIONS[t.model];
      const x = (blobPos.x / 100) * canvas.width + Math.cos(angle) * distance;
      const y = (blobPos.y / 100) * canvas.height + Math.sin(angle) * distance;

      ctx.fillStyle = `rgba(232, 224, 208, 0.12)`;
      ctx.font = "13px 'Cormorant Garamond', serif";
      // Wrap text to ~180px
      wrapText(ctx, t.text, x, y, 180, 16);
    }
  }, [retiredThoughts]);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 pointer-events-none"
      style={{ mixBlendMode: "screen" }}
    />
  );
}

function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
  const words = text.split(" ");
  let line = "";
  let yy = y;
  for (const word of words) {
    const test = line + word + " ";
    if (ctx.measureText(test).width > maxWidth && line.length > 0) {
      ctx.fillText(line, x, yy);
      line = word + " ";
      yy += lineHeight;
    } else {
      line = test;
    }
  }
  ctx.fillText(line, x, yy);
}
```

The residue layer is what makes the "we've been running this since Friday" demo line land. By Sunday morning the canvas edges should be visibly textured with accumulated thoughts.

### Step 3.7 — Convergence Event Visuals

**Who:** Frontend Lead
**Blocked by:** Steps 3.2, 3.5

When a new row appears in the `Convergence` subscription, fire a 3-second visual event:

1. All three blobs flash to ~1.4x intensity for 600ms
2. The canvas background overrides to a unified gradient (the converged mood's tint everywhere) for 3 seconds
3. A soft expanding ring propagates outward from the geometric center of the three blob positions
4. A small italic label fades in at the top of the canvas: *"the three are dreaming the same dream — {mood}"*, holds for 2 seconds, fades out

```tsx
// Triggered by useEffect on the latest convergence
function ConvergenceEvent({ convergence }: { convergence: Convergence }) {
  return (
    <>
      <motion.div
        className="absolute inset-0 pointer-events-none"
        initial={{ opacity: 0 }}
        animate={{ opacity: [0, 0.6, 0.6, 0] }}
        transition={{ duration: 3, times: [0, 0.2, 0.7, 1] }}
        style={{ background: MOOD_TINTS[convergence.mood] }}
      />
      <motion.div
        className="absolute pointer-events-none rounded-full border-2"
        style={{
          left: "50%", top: "47%",
          transform: "translate(-50%, -50%)",
          borderColor: MOOD_TINTS[convergence.mood],
        }}
        initial={{ width: 100, height: 100, opacity: 0.8 }}
        animate={{ width: 1400, height: 1400, opacity: 0 }}
        transition={{ duration: 2.5, ease: "easeOut" }}
      />
      <motion.div
        className="absolute left-1/2 top-12 -translate-x-1/2 text-center"
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: [0, 1, 1, 0], y: 0 }}
        transition={{ duration: 3, times: [0, 0.15, 0.75, 1] }}
        style={{
          fontFamily: "'Cormorant Garamond', serif",
          fontStyle: "italic",
          color: "#e8e0d0",
          fontSize: 18,
        }}
      >
        the three are dreaming the same dream — {convergence.mood}
      </motion.div>
    </>
  );
}
```

This is the demo moment. It should feel *held*, not flashy. Slow timings. Convergence is not a notification; it's a held breath.

### Step 3.8 — The Prompt Input

**Who:** Frontend Lead
**Blocked by:** Step 1.3

A single, low-contrast input anchored at the bottom of the canvas.

```tsx
// app/components/PromptInput.tsx
export function PromptInput() {
  const [value, setValue] = useState("");
  const { session } = useConvergenceState();

  function handleSubmit() {
    if (!value.trim()) return;
    // Call start_session reducer
    client.call("start_session", value);
    setValue("");
  }

  return (
    <div className="absolute bottom-10 left-1/2 -translate-x-1/2 w-full max-w-xl px-6">
      {session?.prompt && (
        <p className="text-center mb-3 text-sm italic" style={{
          fontFamily: "'Cormorant Garamond', serif",
          color: "rgba(232, 224, 208, 0.6)",
        }}>
          "{session.prompt}"
        </p>
      )}
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
        placeholder="ask them anything"
        className="w-full bg-transparent border-b border-white/20 text-center text-lg py-2 outline-none focus:border-white/50 transition-colors"
        style={{
          fontFamily: "'Cormorant Garamond', serif",
          color: "#e8e0d0",
        }}
      />
    </div>
  );
}
```

### Step 3.9 — Multiplayer Presence

**Who:** Frontend Lead
**Blocked by:** Phase 1 (Viewer table exists)

When a user connects, insert a row into the `Viewer` table with their SpacetimeDB Identity. Subscribe to the table. Render each other viewer as a small 12px dim glow at a deterministic position on the canvas edge (based on their identity hash).

Keep this small. It's a texture detail, not a feature. A "3 watching" label in the top-right is enough to make multiplayer felt.

### Step 3.10 — Full Frontend Wire-Up

**Who:** Frontend Lead
**Blocked by:** Steps 3.1–3.9

Assemble everything into `Canvas.tsx`:

```tsx
export function Canvas() {
  const { thoughts, convergences, session } = useConvergenceState();

  const activeThoughts = thoughts.filter(t => ageOf(t) < 20_000);
  const retiredThoughts = thoughts.filter(t => ageOf(t) >= 20_000);

  const currentMoods = {
    claude: latestMoodFor(thoughts, "claude") || "calm",
    gpt:    latestMoodFor(thoughts, "gpt")    || "vast",
    gemini: latestMoodFor(thoughts, "gemini") || "eerie",
  };

  const latestConvergence = convergences[0];
  const showConvergence = latestConvergence && (Date.now() - latestConvergence.created_at.toMillis()) < 3000;

  return (
    <>
      <div
        className="absolute inset-0 transition-all duration-[3000ms]"
        style={{ background: buildBackgroundGradient(currentMoods) }}
      />
      <ResidueLayer retiredThoughts={retiredThoughts} />
      <Blob model="claude" currentMood={currentMoods.claude} />
      <Blob model="gpt"    currentMood={currentMoods.gpt}    />
      <Blob model="gemini" currentMood={currentMoods.gemini} />
      {activeThoughts.map(t => (
        <ThoughtCloud
          key={t.id}
          thought={t}
          blobPosition={POSITIONS[t.model]}
          age={ageOf(t)}
        />
      ))}
      {showConvergence && <ConvergenceEvent convergence={latestConvergence} />}
      <PresenceLayer />
    </>
  );
}
```

Force a 60Hz re-render via `requestAnimationFrame` or a 100ms interval so thought ages update smoothly.

**Checkpoint:** Open the Vercel URL. Type "why is the sky blue." Three blobs begin dreaming. Thoughts bloom near each blob and drift to the edges. Background gradient shifts with mood. After ~30 seconds, a convergence event fires. The canvas feels alive.

---

## Phase 4: Polish (Optional but High-Leverage)

**Goal:** The 30 minutes of work that takes the project from "demo-able" to "memorable."

### Step 4.1 — Persona Re-Tune

**Who:** Prompt Lead
**Blocked by:** Phase 3 working

Watch a real session for 5 minutes. Read every thought. Identify any model whose voice has flattened toward the others. Tighten its persona with new few-shot examples drawn from *what you want it to do* but isn't doing yet. This is the highest-leverage 20 minutes available at this point.

### Step 4.2 — The Stretch: Nudges

**Who:** Builder + Frontend Lead
**Blocked by:** Everything else

A second input that lets viewers drop a single word into the dreamscape. The word floats briefly across the canvas, then the next blob's prompt mentions "a word drifted into your awareness: {word}". See PRD §11.

**Skip this if anything is broken.** It's a bonus, not a requirement.

### Step 4.3 — Audio

**Who:** Anyone with cycles

Optional ambient soundtrack — a single ~3 minute loop of cinematic-pad / Eno-style music, low volume, autoplay muted until first interaction (browser policy). This dramatically increases the "this feels like an installation" perception for very low effort. Use a CC0 track from Pixabay or similar; do not use copyrighted music in the demo video.

---

## Phase 5: Submission Package

### Step 5.1 — Demo Video

**Who:** Pitch Lead
**Blocked by:** Phase 3 polished

60 seconds, not 90. Convergence is a vibe piece; a longer video dilutes it.

```
[0-3s]   Black. Title fades in: "convergence"
[3-10s]  Empty canvas, three blobs breathing. No text yet.
[10-15s] Prompt typed: "why is the sky blue"
[15-40s] Three blobs dreaming. Thoughts bloom and drift. Voiceover:
         "Three language models, free-associating together.
          Claude latches on words. GPT leaps concepts. Gemini feels.
          None of them is trying to answer you."
[40-50s] A convergence event fires. Voiceover:
         "Sometimes all three land in the same mood at once.
          The canvas briefly unifies."
[50-58s] Cut to wider canvas with dense residue at the edges.
         "Every dream is still here. The canvas never resets."
[58-60s] End card: github link, "built with SpacetimeDB + Merge Gateway"
```

Soundtrack: ambient. No talking-head moments. The visual is the pitch.

### Step 5.2 — README

**Who:** Pitch Lead

Open with the studio framing — Convergence and Pantheon as two studies of multiple AI minds in shared space. Then the standard sections:

```markdown
# Convergence

> Three language models drop acid together in a shared dreamscape.
> Ask them anything. They will not answer. They will drift.

![screenshot of canvas with three blobs dreaming](screenshot.png)

## What It Is

A real-time visualization of three LLMs (Claude, GPT, Gemini) free-associating
in parallel. Each generates one thought every two seconds, latching onto a word
or image from its previous thought. The canvas itself responds to the mood of
what's being thought. When all three minds land in the same mood, the canvas
briefly unifies — a convergence event.

Companion piece to Pantheon, our other SpacetimeDB Launchpad submission.
Both explore what happens when multiple AI minds inhabit a shared space.

## How SpacetimeDB Powers Convergence

- Tables hold every thought, every convergence, every viewer.
- Three independent scheduled reducers tick the three models in parallel.
- Procedures call the LLMs via Merge Gateway (one API, three providers).
- Subscriptions stream the dreamscape live to every connected viewer.
- The database never resets — every thought from every session persists
  forever as residue at the edges of the canvas.

## Tech Stack

- Frontend: Next.js 14, Tailwind, Framer Motion, HTML Canvas
- Backend: SpacetimeDB v2 (TypeScript modules)
- LLM routing: Merge Gateway (Claude Haiku + GPT-4o-mini + Gemini Flash)
- Deployment: Vercel + SpacetimeDB Maincloud

## Team

- Shreyam — Builder
- [Name] — Frontend
- [Name] — Prompts & Design
- [Name] — Pitch
```

### Step 5.3 — Submission Form

**Who:** Pitch Lead

Standard DevSpot fields. Mark **Best Use of LLMs** as the primary target prize. Also mark Best Web App eligible. List all four team members. Submit before 11 AM Sunday — same deadline as Pantheon.

### Step 5.4 — Final Checklist

- [ ] Live demo URL works (Vercel)
- [ ] Backend running on Maincloud (`convergence` module, not `pantheon`)
- [ ] Active session is dreaming on demo day (start one Sunday morning so residue is visible)
- [ ] Video uploaded
- [ ] README complete
- [ ] GitHub repo public
- [ ] Merge Gateway has remaining budget for demo-day traffic

---

## Risks (Convergence-Specific)

**The three voices collapse into one voice.** Biggest risk. Mitigation: aggressive persona work in Step 2.1, hard re-tune in Step 4.1. Test by reading 10 thoughts from each in isolation — must be distinguishable.

**Merge Gateway rate limits or downtime.** Three procedures every 2 seconds is ~90 requests/minute at peak. Should be fine on a paid tier, but worth confirming Friday during Step 0.1. The `[ a silence ]` fallback in Step 1.4 protects the demo from any single API failure.

**Convergence events fire too rarely.** With ten moods and three independent draws, all-three-match is ~1% per check, fired every 5 seconds, so expect roughly one every 8 minutes — too rare for a demo. Mitigation: relax to "two-of-three same, third on an adjacent mood." Tune Saturday once the system is running.

**Convergence events fire too often.** Less likely but possible if models get stuck in shared moods. Mitigation: 15-second cooldown is already in Step 2.3.

**The visual reads as a screensaver.** Risk: ambient but empty. Mitigation: the *text content* has to reward attention. Every thought a judge reads should make them want to read the next one. This is the persona work, again.

**Cost overrun.** Unlikely with $110 of credit, but track daily. Set a mental budget cap of $40 for the weekend. If exceeded, throttle one model to every 3 seconds instead of 2.

**Accidentally publishing over the Pantheon module.** Catastrophic. Always type `convergence` not `pantheon` when running `spacetime publish`. Verify the module name in the dashboard before each publish.

---

## Dependency Map

```
BUILDER                           FRONTEND LEAD                    PROMPT LEAD                PITCH LEAD
───────                           ─────────────                    ───────────                ──────────
Step 0.1 Verify Merge ────────────Step 0 setup ────────────────────Step 0 setup ──────────────Step 0 setup
   │                                 │                                │                          │
Step 1.1 Schema                      │                             Step 2.1 Personas ─┐          │
Step 1.2 Init                        │                                │                │          │
Step 1.3 start_session               │                                │                │          │
Step 1.4 Merge bridge ◄──────────────────────────────────────── Personas ready ────────┘          │
Step 1.5 tick_claude                 │                                │                           │
   │                                 │                                │                           │
Step 1.6 Verify single blob ◄─── BUILDER + PROMPT inspect output ───► Step 1.6                    │
   │                                 │                                │                           │
Step 2.2 tick_gpt + tick_gemini      │                                │                           │
Step 2.3 Convergence detection       │                                │                           │
Step 2.4 Test three voices ◄─── BUILDER + PROMPT inspect ───────────► Step 2.4                    │
   │                                 │                                │                           │
   │                              Step 3.1 Bare canvas                │                           │
   │                              Step 3.2 Subscriptions              │                           │
   │                              Step 3.3 Blobs                      │                           │
   │                              Step 3.4 ThoughtCloud               │                           │
   │                              Step 3.5 Mood gradient              │                           │
   │                              Step 3.6 Residue layer              │                           │
   │                              Step 3.7 Convergence visuals        │                           │
   │                              Step 3.8 Prompt input               │                        Step 5.1 Video script
   │                              Step 3.9 Presence                   │                        Step 5.2 README draft
   │                              Step 3.10 Wire-up                   │                           │
   │                                 │                                │                           │
   │                              ◄─ ALL THREE TEST + TUNE ─►      Step 4.1 Persona re-tune       │
   │                                 │                                │                           │
   │                              Step 4.2 Nudges (stretch)           │                           │
   │                                 │                                │                           │
Step 5.4 ◄─ ALL FOUR SHOOT VIDEO + SUBMIT ───────────────────────────────────────────────────► Step 5.3
```

**Key parallel lanes:**

- **Prompt Lead** writes personas from Step 0 onward. Doesn't need code to start.
- **Frontend Lead** can build the bare canvas and blob rendering as soon as the schema is defined (Step 1.1). Doesn't need live data — can mock thoughts during dev.
- **Builder** is the critical path. Phase 1 → Phase 2 must complete before frontend has real data.
- **Pitch Lead** drafts script and README during Phase 3.

---

## Critical Reminders

1. **Never publish over Pantheon.** Always `spacetime publish convergence`, never `pantheon`. Double-check the module name before every publish.

2. **Never reset the database during testing.** The "every dream still here" demo line depends on residue accumulating across two days. If you absolutely need a clean state, use a third module name (`convergence-dev`) for messy testing and keep `convergence` clean.

3. **Personas are the project.** Cut anything else — animations, residue, nudges — before you cut persona quality. Three indistinguishable voices = no project.

4. **Convergence events earn the demo.** Test extensively that they fire during a typical session. If they don't, relax the matching criteria immediately. A demo without a convergence moment is missing its punchline.

5. **Pantheon comes first.** If Pantheon needs your attention at any point, drop Convergence. Convergence is a bonus shot at additional prizes, not a primary submission.

6. **Pace yourself.** This is 8 hours of work, ideally Saturday afternoon-evening while Pantheon is in animation polish. Don't start Convergence Saturday morning — Pantheon's Phase 2 (AI decisions) is the most fragile and most important phase. Wait until Pantheon is stable.
