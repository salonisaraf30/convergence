'use client';

import { useEffect, useState } from 'react';
import { useSpacetimeDB, useTable } from 'spacetimedb/react';
import { tables } from '../../src/module_bindings';
import type {
  ConvergenceEvent,
  Session,
  Thought,
  Viewer,
} from '../../src/module_bindings/types';

export function useConvergenceState() {
  const { isActive } = useSpacetimeDB();

  const [thoughtRows,     thoughtsLoading]     = useTable(tables.thought);
  const [convergenceRows, convergenceLoading]  = useTable(tables.convergenceEvent);
  const [activeSessions,  sessionLoading]      = useTable(
    tables.session.where(row => row.isActive.eq(true))
  );
  const [viewerRows,      viewerLoading]       = useTable(tables.viewer);

  const [thoughts,     setThoughts]     = useState<Thought[]>([]);
  const [convergences, setConvergences] = useState<ConvergenceEvent[]>([]);
  const [session,      setSession]      = useState<Session | null>(null);
  const [viewers,      setViewers]      = useState<Viewer[]>([]);

  useEffect(() => { setThoughts(thoughtRows     as Thought[]); },       [thoughtRows]);
  useEffect(() => { setConvergences(convergenceRows as ConvergenceEvent[]); }, [convergenceRows]);
  useEffect(() => { setSession((activeSessions[0] as Session | undefined) ?? null); }, [activeSessions]);
  useEffect(() => { setViewers(viewerRows       as Viewer[]); },        [viewerRows]);

  return {
    thoughts,
    convergences,
    session,
    viewers,
    isConnected: isActive,
    isReady: !thoughtsLoading && !convergenceLoading && !sessionLoading && !viewerLoading,
  };
}
