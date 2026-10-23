// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * `summary_through` places the history window's start (history-window.ts). It
 * must move only with the summary it describes, never twice from the same base,
 * and it must keep naming the same exchanges when room compaction renumbers them.
 */

import { resolveDatabaseAvailability } from "../database/test-db.js";
import { describe, it, expect, afterAll } from "vitest";
import { conversationStore } from "./store.js";
import { asInstanceSlug } from "../instances/identifiers.js";
import { allTenantsScope } from "../authz/scope-filter.js";

const DB_AVAILABLE = await resolveDatabaseAvailability();
const CID = `itest:summary-through:${Date.now()}`;
const LEGACY = `${CID}:legacy`;
const SLUG = asInstanceSlug("itest-summary-through");

/** Persist `n` user/assistant exchanges (`u0`/`a0` …) on conversation `cid`. */
async function exchanges(cid: string, n: number) {
  for (let i = 0; i < n; i++) {
    await conversationStore.appendMessages(cid, [
      { role: "user", content: `u${i}` },
      { role: "assistant", content: `a${i}` },
    ]);
  }
}

describe("conversation summary marker (integration)", () => {
  afterAll(async () => {
    if (!DB_AVAILABLE) return;
    for (const cid of [CID, LEGACY]) {
      await conversationStore.deleteConversation(cid, allTenantsScope("integration test cleanup")).catch(() => {});
    }
  });

  it.skipIf(!DB_AVAILABLE)("moves the marker with the summary once per base, and shifts it on room compaction", async () => {
    await conversationStore.ensureConversation(CID, SLUG);
    await exchanges(CID, 4);

    expect(await conversationStore.updateSummary(CID, "first", { expected: null, through: 2 })).toBe(true);
    // A second refresh planned on the same base lost the race: dropped, not folded twice.
    expect(await conversationStore.updateSummary(CID, "duplicate", { expected: null, through: 2 })).toBe(false);
    expect(await conversationStore.getSummaryState(CID)).toEqual({
      summary: "first",
      summaryThrough: 2,
      userMessageCount: 4,
    });

    // Compaction removes u0/a0 (one user row): the summary still ends after u1,
    // which is now exchange 1.
    await conversationStore.replaceOldestMessages(CID, 2, "room");
    expect(await conversationStore.getSummaryState(CID)).toMatchObject({ summaryThrough: 1, userMessageCount: 3 });
  });

  it.skipIf(!DB_AVAILABLE)("leaves a summary written before the marker without one through compaction", async () => {
    await conversationStore.ensureConversation(LEGACY, SLUG);
    await exchanges(LEGACY, 3);
    await conversationStore.updateSummary(LEGACY, "legacy");
    await conversationStore.replaceOldestMessages(LEGACY, 2, "room");
    expect(await conversationStore.getSummaryState(LEGACY)).toMatchObject({ summary: "legacy", summaryThrough: null });
  });
});
