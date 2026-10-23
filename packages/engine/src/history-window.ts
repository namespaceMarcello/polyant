// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Where the model's view of a conversation starts.
 *
 * The prompt cache (`ai-gateway/providers/prompt-caching.ts`) serves the history
 * only while it is append-only. A window that keeps the last N messages changes
 * its first message on every turn, so the provider re-writes the whole history
 * to the cache on every call and never reads it back. Here the start advances in
 * blocks of {@link HISTORY_BLOCK_EXCHANGES} exchanges: between two advances the
 * history only grows, and its cached prefix is read instead of re-written.
 *
 * The window starts where the stored summary ends (`conversations.summary_through`,
 * in user-message ordinals: an exchange begins with a user row). The summary is
 * refreshed on the turn before the next block advance, with exactly the exchanges
 * the next window leaves out, and the marker moves only when that write succeeds.
 * A failed or late refresh therefore keeps those exchanges verbatim in the window,
 * and the next turn retries it: no exchange leaves the window before the summary
 * covers it, except past the char budget or the rows read.
 */

/** Exchanges the window always keeps once the conversation is long enough. */
export const HISTORY_MIN_EXCHANGES = 5;
/** Exchanges the start advances by at once. The window holds MIN..MIN+BLOCK-1 exchanges. */
export const HISTORY_BLOCK_EXCHANGES = 5;
/** Rows read per turn: a full window plus room for system and assistant-only rows. */
export const HISTORY_READ_LIMIT = 40;
/**
 * Characters of in-window history (about 10k tokens). Past it the start moves
 * to a later exchange, so long pasted messages cannot blow up every call while
 * they stay in the window. The last exchange is always kept.
 */
export const HISTORY_CHAR_BUDGET = 40_000;

/**
 * First exchange (0-based user ordinal) the block layout starts at when `exchanges` user rows are persisted.
 * With `block` 1 the start follows every exchange: the window keeps the last {@link HISTORY_MIN_EXCHANGES}.
 */
export function windowStartExchange(exchanges: number, block: number = HISTORY_BLOCK_EXCHANGES): number {
  const over = Math.max(0, exchanges - HISTORY_MIN_EXCHANGES);
  return block * Math.floor(over / block);
}

/**
 * Exchanges the window start advances by for an agent. Blocks only pay off where
 * the provider caches the prompt prefix: without a cache every message of a longer
 * window is billed again on every call, so the start follows every exchange and the
 * window stays as short as a fixed one.
 */
export function historyBlockExchanges(promptCacheActive: boolean): number {
  return promptCacheActive ? HISTORY_BLOCK_EXCHANGES : 1;
}

export interface HistoryWindowState {
  /** Exchanges the start advances by (see {@link historyBlockExchanges}); defaults to {@link HISTORY_BLOCK_EXCHANGES}. */
  blockExchanges?: number;
  /** User rows persisted in the whole conversation, from the snapshot `rows` were read in; undefined when unknown. */
  userMessageCount?: number;
  /** Exchanges the stored summary covers (`conversations.summary_through`); null when it was never recorded. */
  summaryThrough?: number | null;
  /** True when a summary text is stored. A summary without a marker predates it and is trusted up to the block start. */
  hasSummary?: boolean;
}

export interface HistoryWindowPlan {
  /** Index of the first row the model sees. */
  start: number;
  /** True when rows before `start` exist, so the stored summary stands in for them. */
  hasOverflow: boolean;
  /**
   * Rows `[from, to)` to fold into the summary after this turn, and the marker to
   * write with it: `expected` is the stored value the write must still find, so a
   * late or duplicate refresh cannot fold the same exchanges twice.
   */
  summarize: { from: number; to: number; expected: number | null; through: number } | undefined;
  /**
   * Exchanges between the stored marker and the oldest row read (after many
   * failed refreshes): the planned refresh marks them covered without reading them.
   */
  unreadExchanges: number;
}

/**
 * Plan the window over `rows` (the most recent persisted rows, oldest first).
 * Without a count, the rows are taken as the whole conversation.
 */
export function planHistoryWindow(
  rows: readonly { role: string; content: string }[],
  state: HistoryWindowState = {},
): HistoryWindowPlan {
  const userIdx: number[] = [];
  rows.forEach((r, i) => {
    if (r.role === "user") userIdx.push(i);
  });
  const exchanges = Math.max(state.userMessageCount ?? userIdx.length, userIdx.length);
  const firstOrdinal = exchanges - userIdx.length;
  /** Row of exchange `ordinal`; the oldest user row read when the read does not reach back to it. */
  const rowOf = (ordinal: number): number => {
    if (ordinal <= 0) return 0;
    const k = ordinal - firstOrdinal;
    if (k < 0) return userIdx[0] ?? 0;
    return k < userIdx.length ? userIdx[k] : rows.length;
  };
  const ordinalOf = (row: number): number => {
    const k = userIdx.findIndex((u) => u >= row);
    return k < 0 ? exchanges : firstOrdinal + k;
  };

  const block = state.blockExchanges ?? HISTORY_BLOCK_EXCHANGES;
  const blockStart = windowStartExchange(exchanges, block);
  /**
   * What a summary written before the marker covers. The old window (pipeline.ts
   * up to 8b6f76f9) read 16 rows and, past 15, kept the last 10 and folded the
   * rest. Its last turn persisted the last user row read (with the system rows
   * just before it), so the summary covers the exchanges wholly before the 10
   * rows ahead of those; the block start caps it on the turns that follow, until
   * a refresh writes the marker.
   */
  const legacyCovered = (): number => {
    if (userIdx.length === 0) return 0;
    let end = userIdx[userIdx.length - 1];
    while (end > 0 && rows[end - 1].role === "system") end--;
    return Math.min(blockStart, end > 10 ? ordinalOf(end - 10) : firstOrdinal);
  };
  const stored = state.summaryThrough ?? null;
  // A marker past the count (rows deleted since) or a summary written before the
  // marker existed: trust it only as far as the old window folded.
  const covered = stored !== null && stored <= exchanges ? stored : state.hasSummary ? legacyCovered() : 0;
  const coveredRow = rowOf(covered);

  // Size cap: move to later exchanges while the window is over budget. The
  // refresh below folds what this drops, down to half the budget, so the start
  // moves once per half budget of new text instead of on every turn.
  const lastUser = userIdx.length > 0 ? userIdx[userIdx.length - 1] : 0;
  const cut = (limit: number): number => {
    let start = coveredRow;
    let chars = 0;
    for (let i = start; i < rows.length; i++) chars += rows[i].content.length;
    for (const u of userIdx) {
      if (chars <= limit || u > lastUser) break;
      if (u <= start) continue;
      for (let i = start; i < u; i++) chars -= rows[i].content.length;
      start = u;
    }
    return start;
  };
  const start = cut(HISTORY_CHAR_BUDGET);

  // Fold into the summary what the next turn's window must leave out: the next
  // block advance, and the text over budget.
  let through = windowStartExchange(exchanges + 1, block);
  if (start > coveredRow) through = Math.max(through, ordinalOf(cut(HISTORY_CHAR_BUDGET / 2)));
  const to = rowOf(through);
  const summarize =
    through > covered && to > coveredRow
      ? { from: coveredRow, to, expected: stored, through }
      : undefined;

  return {
    start,
    hasOverflow: covered > 0 || start > 0,
    summarize,
    unreadExchanges: summarize ? Math.max(0, firstOrdinal - covered) : 0,
  };
}
