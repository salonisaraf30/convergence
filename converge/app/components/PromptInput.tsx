'use client';

import { useState } from 'react';
import { useSpacetimeDB } from 'spacetimedb/react';
import { useConvergenceState } from '../hooks/useConvergenceState';
import { DbConnection } from '../../src/module_bindings';

export function PromptInput() {
  const [value, setValue] = useState('');
  const { session, isConnected } = useConvergenceState();
  const { getConnection } = useSpacetimeDB();

  function handleSubmit() {
    const prompt = value.trim();
    if (!prompt) return;
    const conn = getConnection() as DbConnection | null;
    conn?.reducers.startSession({ prompt });
    setValue('');
  }

  return (
    <div className="app-prompt">
      {session?.prompt && (
        <p className="app-prompt__session">"{session.prompt}"</p>
      )}
      <div className="app-prompt__frame">
        <input
          aria-label="Prompt"
          className="app-prompt__input"
          value={value}
          onChange={e => setValue(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSubmit()}
          placeholder="throw a thought into the void…"
          disabled={!isConnected}
          suppressHydrationWarning
        />
        <button
          className="app-prompt__button"
          type="button"
          onClick={handleSubmit}
          disabled={!isConnected || !value.trim()}
        >
          Dream
        </button>
      </div>
    </div>
  );
}
