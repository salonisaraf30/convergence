import { schema, table, t } from 'spacetimedb/server';
import { ScheduleAt } from 'spacetimedb';
import { generateThought } from './llm';

// ─── Step 1.1: Schema ─────────────────────────────────────────────────────────

// API config — private (no public: true) so the key is never sent to clients.
// Set after publishing: spacetime call convergence set_config '"<url>"' '"<key>"'
const config = table(
  { name: 'config' },
  {
    id: t.u64().primaryKey(), // singleton — always ID 0
    mergeGatewayUrl: t.string(),
    mergeGatewayKey: t.string(),
  }
);

const session = table(
  { name: 'session', public: true },
  {
    id: t.u64().primaryKey(),
    startedAt: t.timestamp(),
    prompt: t.string(),
    isActive: t.bool(),
  }
);

const thought = table(
  { name: 'thought', public: true },
  {
    id: t.u64().primaryKey().autoInc(),
    sessionId: t.u64().index('btree'),
    model: t.string(), // "claude" | "gpt" | "gemini"
    tick: t.u64(),
    parentThoughtId: t.option(t.u64()),
    text: t.string(),
    latchWord: t.string(),
    mood: t.string(),
    gesture: t.string(),
    createdAt: t.timestamp(),
  }
);

// Named convergence_event to avoid shadowing the module name
const convergenceEvent = table(
  { name: 'convergence_event', public: true },
  {
    id: t.u64().primaryKey().autoInc(),
    sessionId: t.u64(),
    tick: t.u64(),
    mood: t.string(),
    thoughtIds: t.string(), // comma-separated thought IDs
    createdAt: t.timestamp(),
  }
);

const viewer = table(
  { name: 'viewer', public: true },
  {
    identity: t.identity().primaryKey(),
    joinedAt: t.timestamp(),
    lastActive: t.timestamp(),
    colorSeed: t.u32(), // stable per-viewer color for the presence dot
  }
);

const globalMeta = table(
  { name: 'global_meta', public: true },
  {
    id: t.u64().primaryKey(), // singleton — always ID 0
    tickCount: t.u64(),
    currentSessionId: t.option(t.u64()),
  }
);

// ─── Step 1.5: Scheduled timer for Claude ────────────────────────────────────
// Thunk `(): any =>` breaks the circular dep between claudeTimer and tickClaude.
const claudeTimer = table(
  {
    name: 'claude_timer',
    scheduled: (): any => tickClaude,
  },
  {
    scheduledId: t.u64().primaryKey().autoInc(),
    scheduledAt: t.scheduleAt(),
  }
);

const gptTimer = table(
  {
    name: 'gpt_timer',
    scheduled: (): any => tickGpt,
  },
  {
    scheduledId: t.u64().primaryKey().autoInc(),
    scheduledAt: t.scheduleAt(),
  }
);

const geminiTimer = table(
  {
    name: 'gemini_timer',
    scheduled: (): any => tickGemini,
  },
  {
    scheduledId: t.u64().primaryKey().autoInc(),
    scheduledAt: t.scheduleAt(),
  }
);

const convergenceCheckTimer = table(
  {
    name: 'convergence_check_timer',
    scheduled: (): any => convergenceCheck,
  },
  {
    scheduledId: t.u64().primaryKey().autoInc(),
    scheduledAt: t.scheduleAt(),
  }
);

const spacetimedb = schema({
  config,
  session,
  thought,
  convergenceEvent,
  viewer,
  globalMeta,
  claudeTimer,
  gptTimer,
  geminiTimer,
  convergenceCheckTimer,
});
export default spacetimedb;

function ensureBootstrap(ctx: { db: any }) {
  if (!ctx.db.globalMeta.id.find(0n)) {
    ctx.db.globalMeta.insert({ id: 0n, tickCount: 0n, currentSessionId: undefined });
  }

  const claudeTimer = [...ctx.db.claudeTimer.iter()][0];
  if (claudeTimer) {
    ctx.db.claudeTimer.scheduledId.update({
      ...claudeTimer,
      scheduledAt: ScheduleAt.interval(3_500_000n),
    });
  } else {
    ctx.db.claudeTimer.insert({
      scheduledId: 0n,
      scheduledAt: ScheduleAt.interval(3_500_000n),
    });
  }

  const gptTimer = [...ctx.db.gptTimer.iter()][0];
  if (gptTimer) {
    ctx.db.gptTimer.scheduledId.update({
      ...gptTimer,
      scheduledAt: ScheduleAt.interval(3_500_000n),
    });
  } else {
    ctx.db.gptTimer.insert({
      scheduledId: 0n,
      scheduledAt: ScheduleAt.interval(3_500_000n),
    });
  }

  const geminiTimer = [...ctx.db.geminiTimer.iter()][0];
  if (geminiTimer) {
    ctx.db.geminiTimer.scheduledId.update({
      ...geminiTimer,
      scheduledAt: ScheduleAt.interval(3_500_000n),
    });
  } else {
    ctx.db.geminiTimer.insert({
      scheduledId: 0n,
      scheduledAt: ScheduleAt.interval(3_500_000n),
    });
  }

  const hasConvergenceCheckTimer = [...ctx.db.convergenceCheckTimer.iter()].length > 0;
  if (!hasConvergenceCheckTimer) {
    ctx.db.convergenceCheckTimer.insert({
      scheduledId: 0n,
      scheduledAt: ScheduleAt.interval(5_000_000n),
    });
  }
}

// ─── Step 1.2: Init ───────────────────────────────────────────────────────────

export const init = spacetimedb.init((ctx) => {
  ensureBootstrap(ctx);
});

// ─── Lifecycle: viewer presence ───────────────────────────────────────────────

export const onConnect = spacetimedb.clientConnected((ctx) => {
  const existing = ctx.db.viewer.identity.find(ctx.sender);
  if (existing) {
    ctx.db.viewer.identity.update({ ...existing, lastActive: ctx.timestamp });
  } else {
    const colorSeed = Number(ctx.timestamp.microsSinceUnixEpoch & 0xFFFFFFFFn);
    ctx.db.viewer.insert({
      identity: ctx.sender,
      joinedAt: ctx.timestamp,
      lastActive: ctx.timestamp,
      colorSeed,
    });
  }
});

export const onDisconnect = spacetimedb.clientDisconnected((ctx) => {
  const existing = ctx.db.viewer.identity.find(ctx.sender);
  if (existing) {
    ctx.db.viewer.identity.update({ ...existing, lastActive: ctx.timestamp });
  }
});

// ─── Step 1.3: Start Session ──────────────────────────────────────────────────

export const startSession = spacetimedb.reducer(
  { prompt: t.string() },
  (ctx, { prompt }) => {
    ensureBootstrap(ctx);

    const meta = ctx.db.globalMeta.id.find(0n);
    if (!meta) return;

    // Deactivate all currently active sessions
    for (const s of ctx.db.session.iter()) {
      if (s.isActive) {
        ctx.db.session.id.update({ ...s, isActive: false });
      }
    }

    // Use the reducer's deterministic timestamp as a unique session ID
    const sessionId = ctx.timestamp.microsSinceUnixEpoch;
    ctx.db.session.insert({
      id: sessionId,
      startedAt: ctx.timestamp,
      prompt,
      isActive: true,
    });

    ctx.db.globalMeta.id.update({ ...meta, currentSessionId: sessionId });
  }
);

// ─── Step 1.4: Config ─────────────────────────────────────────────────────────

export const setConfig = spacetimedb.reducer(
  { mergeGatewayUrl: t.string(), mergeGatewayKey: t.string() },
  (ctx, { mergeGatewayUrl, mergeGatewayKey }) => {
    const existing = ctx.db.config.id.find(0n);
    if (existing) {
      ctx.db.config.id.update({ ...existing, mergeGatewayUrl, mergeGatewayKey });
    } else {
      ctx.db.config.insert({ id: 0n, mergeGatewayUrl, mergeGatewayKey });
    }
  }
);

// ─── Step 1.5: Claude tick procedure ─────────────────────────────────────────

export const retuneTimers = spacetimedb.reducer((ctx) => {
  ensureBootstrap(ctx);
});

export const tickClaude = spacetimedb.procedure(
  { timer: claudeTimer.rowType },
  t.unit(),
  (ctx, _) => {
    // Read active session + config in one transaction
    const state = ctx.withTx((tx) => {
      const meta = tx.db.globalMeta.id.find(0n);
      if (!meta || meta.currentSessionId === undefined) return null;

      const sess = tx.db.session.id.find(meta.currentSessionId);
      if (!sess?.isActive) return null;

      const cfg = tx.db.config.id.find(0n);
      if (!cfg || !cfg.mergeGatewayUrl || !cfg.mergeGatewayKey) return null;

      // Last 4 Claude thoughts in this session, sorted oldest-first
      const recent = [...tx.db.thought.sessionId.filter(sess.id)]
        .filter(th => th.model === 'claude')
        .sort((a, b) => (a.tick < b.tick ? -1 : 1))
        .slice(-4);

      return { meta, sess, cfg, recent };
    });

    if (state) {
      const { meta, sess, cfg, recent } = state;

      // HTTP call outside withTx — this is where the LLM is called
      const payload = generateThought(
        ctx.http,
        'claude',
        cfg.mergeGatewayUrl,
        cfg.mergeGatewayKey,
        sess.prompt,
        recent,
      );

      // 13% chance to latch onto a random earlier thought (callback behaviour)
      const doCallback = recent.length >= 4 && ctx.random() < 0.13;

      // Write the new thought
      ctx.withTx((tx) => {
        const latestMeta = tx.db.globalMeta.id.find(0n);
        if (!latestMeta) return;

        const newTick = latestMeta.tickCount + 1n;
        tx.db.globalMeta.id.update({ ...latestMeta, tickCount: newTick });

        let parentThoughtId: bigint | undefined;
        if (doCallback) {
          const allClaude = [...tx.db.thought.sessionId.filter(sess.id)]
            .filter(th => th.model === 'claude');
          if (allClaude.length > 0) {
            const idx = Math.floor(ctx.random() * allClaude.length);
            parentThoughtId = allClaude[idx].id;
          }
        } else {
          parentThoughtId = recent.length > 0 ? recent[recent.length - 1].id : undefined;
        }

        tx.db.thought.insert({
          id: 0n, // autoInc — SpacetimeDB assigns the real ID
          sessionId: sess.id,
          model: 'claude',
          tick: newTick,
          parentThoughtId,
          text: payload.text,
          latchWord: payload.latchWord,
          mood: payload.mood,
          gesture: payload.gesture,
          createdAt: tx.timestamp,
        });
      });
    }

    return {};
  }
);

export const tickGpt = spacetimedb.procedure(
  { timer: gptTimer.rowType },
  t.unit(),
  (ctx, _) => {
    const state = ctx.withTx((tx) => {
      const meta = tx.db.globalMeta.id.find(0n);
      if (!meta || meta.currentSessionId === undefined) return null;

      const sess = tx.db.session.id.find(meta.currentSessionId);
      if (!sess?.isActive) return null;

      const cfg = tx.db.config.id.find(0n);
      if (!cfg || !cfg.mergeGatewayUrl || !cfg.mergeGatewayKey) return null;

      const recent = [...tx.db.thought.sessionId.filter(sess.id)]
        .filter(th => th.model === 'gpt')
        .sort((a, b) => (a.tick < b.tick ? -1 : 1))
        .slice(-4);

      return { sess, cfg, recent };
    });

    if (state) {
      const { sess, cfg, recent } = state;
      const payload = generateThought(
        ctx.http,
        'gpt',
        cfg.mergeGatewayUrl,
        cfg.mergeGatewayKey,
        sess.prompt,
        recent,
      );
      const doCallback = recent.length >= 4 && ctx.random() < 0.13;

      ctx.withTx((tx) => {
        const latestMeta = tx.db.globalMeta.id.find(0n);
        if (!latestMeta) return;

        const newTick = latestMeta.tickCount + 1n;
        tx.db.globalMeta.id.update({ ...latestMeta, tickCount: newTick });

        let parentThoughtId: bigint | undefined;
        if (doCallback) {
          const allGpt = [...tx.db.thought.sessionId.filter(sess.id)]
            .filter(th => th.model === 'gpt');
          if (allGpt.length > 0) {
            const idx = Math.floor(ctx.random() * allGpt.length);
            parentThoughtId = allGpt[idx].id;
          }
        } else {
          parentThoughtId = recent.length > 0 ? recent[recent.length - 1].id : undefined;
        }

        tx.db.thought.insert({
          id: 0n,
          sessionId: sess.id,
          model: 'gpt',
          tick: newTick,
          parentThoughtId,
          text: payload.text,
          latchWord: payload.latchWord,
          mood: payload.mood,
          gesture: payload.gesture,
          createdAt: tx.timestamp,
        });
      });
    }

    return {};
  }
);

export const tickGemini = spacetimedb.procedure(
  { timer: geminiTimer.rowType },
  t.unit(),
  (ctx, _) => {
    const state = ctx.withTx((tx) => {
      const meta = tx.db.globalMeta.id.find(0n);
      if (!meta || meta.currentSessionId === undefined) return null;

      const sess = tx.db.session.id.find(meta.currentSessionId);
      if (!sess?.isActive) return null;

      const cfg = tx.db.config.id.find(0n);
      if (!cfg || !cfg.mergeGatewayUrl || !cfg.mergeGatewayKey) return null;

      const recent = [...tx.db.thought.sessionId.filter(sess.id)]
        .filter(th => th.model === 'gemini')
        .sort((a, b) => (a.tick < b.tick ? -1 : 1))
        .slice(-4);

      return { sess, cfg, recent };
    });

    if (state) {
      const { sess, cfg, recent } = state;
      const payload = generateThought(
        ctx.http,
        'gemini',
        cfg.mergeGatewayUrl,
        cfg.mergeGatewayKey,
        sess.prompt,
        recent,
      );
      const doCallback = recent.length >= 4 && ctx.random() < 0.13;

      ctx.withTx((tx) => {
        const latestMeta = tx.db.globalMeta.id.find(0n);
        if (!latestMeta) return;

        const newTick = latestMeta.tickCount + 1n;
        tx.db.globalMeta.id.update({ ...latestMeta, tickCount: newTick });

        let parentThoughtId: bigint | undefined;
        if (doCallback) {
          const allGemini = [...tx.db.thought.sessionId.filter(sess.id)]
            .filter(th => th.model === 'gemini');
          if (allGemini.length > 0) {
            const idx = Math.floor(ctx.random() * allGemini.length);
            parentThoughtId = allGemini[idx].id;
          }
        } else {
          parentThoughtId = recent.length > 0 ? recent[recent.length - 1].id : undefined;
        }

        tx.db.thought.insert({
          id: 0n,
          sessionId: sess.id,
          model: 'gemini',
          tick: newTick,
          parentThoughtId,
          text: payload.text,
          latchWord: payload.latchWord,
          mood: payload.mood,
          gesture: payload.gesture,
          createdAt: tx.timestamp,
        });
      });
    }

    return {};
  }
);

export const convergenceCheck = spacetimedb.procedure(
  { timer: convergenceCheckTimer.rowType },
  t.unit(),
  (ctx, _) => {
    ctx.withTx((tx) => {
      const meta = tx.db.globalMeta.id.find(0n);
      if (!meta || meta.currentSessionId === undefined) return;

      const latestByModel: Record<string, any> = {};
      for (const thoughtRow of tx.db.thought.sessionId.filter(meta.currentSessionId)) {
        const current = latestByModel[thoughtRow.model];
        if (!current || current.tick < thoughtRow.tick) {
          latestByModel[thoughtRow.model] = thoughtRow;
        }
      }

      const claude = latestByModel.claude;
      const gpt = latestByModel.gpt;
      const gemini = latestByModel.gemini;
      if (!claude || !gpt || !gemini) return;

      const moodCounts: Record<string, number> = {};
      for (const mood of [claude.mood, gpt.mood, gemini.mood]) {
        moodCounts[mood] = (moodCounts[mood] ?? 0) + 1;
      }

      const convergedMood = Object.entries(moodCounts)
        .sort((a, b) => b[1] - a[1])[0];
      if (!convergedMood || convergedMood[1] < 2) return;

      const thoughtIds = `${claude.id},${gpt.id},${gemini.id}`;
      const recent = [...tx.db.convergenceEvent.iter()]
        .filter(event => event.sessionId === meta.currentSessionId)
        .sort((a, b) => (a.tick < b.tick ? 1 : -1))[0];

      if (recent?.thoughtIds === thoughtIds) return;
      if (recent && meta.tickCount - recent.tick < 12n) return;

      tx.db.convergenceEvent.insert({
        id: 0n,
        sessionId: meta.currentSessionId,
        tick: meta.tickCount,
        mood: convergedMood[0],
        thoughtIds,
        createdAt: tx.timestamp,
      });
    });

    return {};
  }
);
