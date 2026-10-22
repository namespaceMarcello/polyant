// SPDX-License-Identifier: AGPL-3.0-or-later

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api, type MonitorItem, type MonitorOutcome, type MonitorTypeInfo } from "@/lib/api";
import { foldFresh } from "@/lib/monitor/live";

/** What the user chose to see. Empty strings mean "no narrowing". */
export interface MonitorFilters {
  /** The chip: a group of types, or "" for everything. */
  group: string;
  /** One type, when a link asked for exactly one (the group chip stays as it was). */
  type: string;
  agent: string;
  outcome: MonitorOutcome | "";
  q: string;
}

export const NO_FILTERS: MonitorFilters = { group: "", type: "", agent: "", outcome: "", q: "" };

const PAGE_SIZE = 50;

interface Feed {
  key: string;
  items: MonitorItem[];
  nextCursor: string | null;
  types: MonitorTypeInfo[];
  error: unknown;
  settled: boolean;
}

function query(filters: MonitorFilters, cursor?: string) {
  return {
    group: filters.group || undefined,
    types: filters.type ? [filters.type] : undefined,
    agent: filters.agent || undefined,
    outcome: filters.outcome || undefined,
    q: filters.q || undefined,
    cursor,
    limit: PAGE_SIZE,
  };
}

/**
 * The stored rows for a set of filters: the first page, further pages on demand, and a
 * way to fold a fresh first page in without losing the pages already loaded.
 *
 * An answer that arrives for filters the user has since changed is ignored.
 */
export function useMonitorFeed(filters: MonitorFilters) {
  const key = JSON.stringify(filters);
  const [feed, setFeed] = useState<Feed>({ key, items: [], nextCursor: null, types: [], error: undefined, settled: false });
  const [loadingMore, setLoadingMore] = useState(false);
  const currentKey = useRef(key);
  const filtersRef = useRef(filters);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    currentKey.current = key;
    filtersRef.current = filters;
  });

  useEffect(() => {
    let stale = false;
    api.monitor
      .list(query(filtersRef.current))
      .then((page) => {
        if (stale) return;
        setFeed({ key, items: page.items, nextCursor: page.nextCursor, types: page.types, error: undefined, settled: true });
      })
      .catch((error: unknown) => {
        if (stale) return;
        setFeed((prev) => ({ ...prev, key, items: [], nextCursor: null, error, settled: true }));
      });
    return () => {
      stale = true;
    };
  }, [key, attempt]);

  const loadMore = useCallback(async () => {
    const at = currentKey.current;
    const cursor = feed.nextCursor;
    if (!cursor) return;
    setLoadingMore(true);
    try {
      const page = await api.monitor.list(query(filtersRef.current, cursor));
      if (currentKey.current !== at) return;
      setFeed((prev) => (prev.key === at ? { ...prev, items: foldFresh(prev.items, page.items), nextCursor: page.nextCursor, types: page.types } : prev));
    } catch (error) {
      setFeed((prev) => ({ ...prev, error }));
    } finally {
      setLoadingMore(false);
    }
  }, [feed.nextCursor]);

  /** Read the first page again and fold it in; the pages already loaded stay. */
  const refreshHead = useCallback(async () => {
    const at = currentKey.current;
    try {
      const page = await api.monitor.list(query(filtersRef.current));
      if (currentKey.current !== at) return;
      setFeed((prev) => (prev.key === at ? { ...prev, items: foldFresh(prev.items, page.items), types: page.types } : prev));
    } catch {
      // A failed background refresh leaves the list as it was.
    }
  }, []);

  const reload = useCallback(() => {
    setFeed((prev) => ({ ...prev, settled: false, error: undefined }));
    setAttempt((n) => n + 1);
  }, []);

  const current = feed.key === key;
  return {
    items: current ? feed.items : [],
    types: feed.types,
    nextCursor: current ? feed.nextCursor : null,
    error: current ? feed.error : undefined,
    loading: !current || !feed.settled,
    loadingMore,
    loadMore,
    refreshHead,
    reload,
  };
}
