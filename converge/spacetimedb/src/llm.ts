import { PERSONAS } from './prompts';

// Structural type for ctx.http — avoids importing the unexported HttpClient type.
type Http = {
  fetch(
    url: string,
    init?: { method?: string; headers?: Record<string, string>; body?: string }
  ): { ok: boolean; status: number; json(): unknown; text(): string };
};

// Model strings as Merge Gateway exposes them.
const MODELS: Record<'claude' | 'gpt' | 'gemini', string> = {
  claude: 'anthropic/claude-haiku-4-5',
  gpt: 'openai/gpt-4o-mini',
  gemini: 'google/gemini-2.5-flash',
};

const MOOD_VOCAB = [
  'calm', 'restless', 'melancholy', 'euphoric', 'eerie',
  'warm', 'cold', 'vast', 'intimate', 'electric',
] as const;

const GESTURE_VOCAB = ['bloom', 'swirl', 'pulse', 'tremor', 'halo', 'drift'] as const;

export type Mood = typeof MOOD_VOCAB[number];
export type Gesture = typeof GESTURE_VOCAB[number];

export interface ThoughtPayload {
  text: string;
  latchWord: string;
  mood: Mood;
  gesture: Gesture;
}

const SILENCE_FALLBACK: ThoughtPayload = {
  text: '[ a silence ]',
  latchWord: '',
  mood: 'calm',
  gesture: 'bloom',
};

/**
 * Calls Merge Gateway synchronously via ctx.http.
 * Returns a fallback payload on any error so the blob stays alive.
 */
export function generateThought(
  http: Http,
  model: 'claude' | 'gpt' | 'gemini',
  gatewayUrl: string,
  gatewayKey: string,
  sessionPrompt: string,
  recentThoughts: { text: string }[]
): ThoughtPayload {
  try {
    const recent = recentThoughts
      .slice(-4)
      .map((t, i) => `${i + 1}. ${t.text}`)
      .join('\n');

    const systemContent = `${PERSONAS[model]}

You are one of three minds dreaming in a shared cloud. You are not trying to answer questions. You free-associate — letting one thought tumble into the next by latching onto a single word or image from your previous thought, never by logical implication.

The original question was: "${sessionPrompt}"

Your recent thoughts:
${recent || '(this is your first thought — latch directly onto a word from the question)'}

Generate exactly ONE next thought. Return ONLY valid JSON, nothing else:
{
  "text": "ONE complete thought. STRICTLY fewer than 10 words. Must end naturally.",
  "latch_word": "the single word from your previous thought (or the question) that this one tumbles from",
  "mood": "one of: ${MOOD_VOCAB.join(', ')}",
  "gesture": "one of: ${GESTURE_VOCAB.join(', ')}"
}`;

    const requestBody = JSON.stringify({
      model: MODELS[model],
      input: [{ type: 'message', role: 'user', content: systemContent }],
      temperature: 0.95,
      max_output_tokens: 200,
    });

    const response = http.fetch(`${gatewayUrl}/responses`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${gatewayKey}`,
        'Content-Type': 'application/json',
      },
      body: requestBody,
    });

    if (!response.ok) {
      console.error(`LLM request failed: ${response.status} ${response.text()}`);
      return SILENCE_FALLBACK;
    }

    const envelope = response.json() as {
      output: Array<{
        content: Array<{ type: string; text?: string }>;
      }>;
    };
    const raw =
      envelope?.output
        ?.flatMap(item => item.content ?? [])
        ?.find(content => content.type === 'text')
        ?.text ?? '{}';

    // Strip markdown code fences Claude sometimes wraps JSON in
    const cleaned = raw.replace(/```json\n?/g, '').replace(/```/g, '').trim();

    const parsed = JSON.parse(cleaned) as {
      text: string;
      latch_word: string;
      mood: string;
      gesture: string;
    };

    // Validate against allowed vocabularies — fall back to defaults if invalid
    const mood = (MOOD_VOCAB as readonly string[]).includes(parsed.mood)
      ? (parsed.mood as Mood)
      : 'calm';
    const gesture = (GESTURE_VOCAB as readonly string[]).includes(parsed.gesture)
      ? (parsed.gesture as Gesture)
      : 'bloom';

    return {
      text: parsed.text ?? '[ ... ]',
      latchWord: parsed.latch_word ?? '',
      mood,
      gesture,
    };
  } catch (e) {
    console.error(`generateThought error (${model}):`, e);
    return SILENCE_FALLBACK;
  }
}
