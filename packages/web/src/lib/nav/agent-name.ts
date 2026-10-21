// SPDX-License-Identifier: AGPL-3.0-or-later

"use client";

import { useSyncExternalStore } from "react";

/**
 * The display name of the agent whose page is open, by slug. The address carries
 * only the slug, so the page that loaded the agent publishes its name here and the
 * sidebar names the agent the way the page header does, and follows a rename.
 */
let names: ReadonlyMap<string, string> = new Map();
const listeners = new Set<() => void>();

export function setAgentName(agentSlug: string, name: string) {
  if (names.get(agentSlug) === name) return;
  names = new Map(names).set(agentSlug, name);
  listeners.forEach((listener) => listener());
}

/** The agent's name once its page has loaded, `null` before (the caller falls back to the slug). */
export function useAgentName(agentSlug: string | null | undefined): string | null {
  return useSyncExternalStore(
    (onChange) => {
      listeners.add(onChange);
      return () => listeners.delete(onChange);
    },
    () => (agentSlug ? (names.get(agentSlug) ?? null) : null),
    () => null,
  );
}
