// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * The history the model sees must stay append-only between window advances, or
 * the prompt cache re-writes it on every call and never reads it. A window that
 * keeps "the last 10 messages" changes its first message on every turn. And no
 * exchange may leave the window before the stored summary covers it.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockGetRecentMessages, mockEnsure, mockSummaryState } = vi.hoisted(() => ({
  mockGetRecentMessages: vi.fn(),
  mockEnsure: vi.fn(),
  mockSummaryState: vi.fn(),
}));

vi.mock("./conversations/index.js", () => ({
  conversationStore: {
    ensureConversation: mockEnsure,
    getRecentMessages: mockGetRecentMessages,
    getRecentMessageRows: vi.fn(),
    getContextPrompt: vi.fn(async () => null),
    getSummary: vi.fn(async () => "summary"),
    getSummaryState: mockSummaryState,
  },
}));
vi.mock("./conversations/state.buffer.js", () => ({
  ConversationStateBuffer: class {
    static load = vi.fn(async () => new this());
    seedChannel() {}
  },
}));
vi.mock("./instances/config-resolver.js", () => ({
  resolveInstanceConfig: vi.fn(async () => ({ toolResultsInHistoryEnabled: false, langsmith: { enabled: false } })),
}));
vi.mock("./activity-stream/emit-helpers.js", () => ({ resolveInstanceMeta: vi.fn(async () => undefined) }));
vi.mock("./activity-stream/emitters/emit-inbound.js", () => ({ emitInbound: vi.fn() }));
vi.mock("./activity-stream/emitters/emit-conversation.js", () => ({ emitConversation: vi.fn() }));

import { preparePipeline } from "./pipeline.js";
import { asInstanceSlug } from "./instances/identifiers.js";

const msg = {
  instanceId: asInstanceSlug("shop"),
  channelType: "web",
  channelId: "c1",
  userName: "u",
  text: "next",
  metadata: {},
} as never;

interface Persisted {
  /** Exchanges the stored summary covers; defaults to the block start (every refresh landed). */
  through?: number | null;
  /** The count read with the summary, after the rows; defaults to `exchanges`. */
  countAfter?: number;
  content?: Record<string, string>;
}

/** A conversation of `exchanges` persisted user/assistant pairs. */
function persist(exchanges: number, opts: Persisted = {}) {
  const rows: { role: string; content: string }[] = [];
  for (let i = 0; i < exchanges; i++) {
    rows.push({ role: "user", content: opts.content?.[`u${i}`] ?? `u${i}` });
    rows.push({ role: "assistant", content: opts.content?.[`a${i}`] ?? `a${i}` });
  }
  const blockStart = 5 * Math.floor(Math.max(0, exchanges - 5) / 5);
  const through = opts.through === undefined ? blockStart : opts.through;
  mockEnsure.mockResolvedValue({ created: false, userMessageCount: exchanges });
  mockGetRecentMessages.mockImplementation(async (_id: string, limit: number) => rows.slice(-limit));
  mockSummaryState.mockResolvedValue({
    summary: through ? "summary" : null,
    summaryThrough: through,
    userMessageCount: opts.countAfter ?? exchanges,
  });
}

const texts = (m: { content: unknown }[] | undefined) => m?.map((x) => String(x.content));

describe("preparePipeline — block history window", () => {
  beforeEach(() => vi.clearAllMocks());

  it("keeps the same first history message for five turns, then advances by five exchanges", async () => {
    const firsts: string[] = [];
    for (let exchanges = 10; exchanges < 20; exchanges++) {
      persist(exchanges);
      const ctx = await preparePipeline(msg);
      firsts.push(String(ctx.history?.[0]?.content));
      expect(ctx.hasOverflow).toBe(true);
      expect(ctx.conversationSummary).toBe("summary");
    }
    expect(firsts).toEqual(["u5", "u5", "u5", "u5", "u5", "u10", "u10", "u10", "u10", "u10"]);
  });

  it("folds the dropped exchanges into the summary only on the turn before an advance", async () => {
    const dropped: (string[] | undefined)[] = [];
    const covers: unknown[] = [];
    for (let exchanges = 10; exchanges < 15; exchanges++) {
      persist(exchanges);
      const ctx = await preparePipeline(msg);
      dropped.push(texts(ctx.droppedMessages));
      covers.push(ctx.summaryCover);
    }
    expect(dropped).toEqual([
      undefined,
      undefined,
      undefined,
      undefined,
      ["u5", "a5", "u6", "a6", "u7", "a7", "u8", "a8", "u9", "a9"],
    ]);
    expect(covers).toEqual([undefined, undefined, undefined, undefined, { expected: 5, through: 10 }]);
  });

  it("keeps a block the summary does not cover in the window and folds it again (failed or late refresh)", async () => {
    // The refresh on turn 14 failed, or had not landed yet: the marker is still 5.
    persist(15, { through: 5 });
    const ctx = await preparePipeline(msg);
    expect(ctx.history?.[0]?.content).toBe("u5");
    expect(texts(ctx.droppedMessages)).toEqual(["u5", "a5", "u6", "a6", "u7", "a7", "u8", "a8", "u9", "a9"]);
    expect(ctx.summaryCover).toEqual({ expected: 5, through: 10 });
  });

  it("does not move the marker when the count moved while the rows were read", async () => {
    persist(14, { countAfter: 15 });
    const ctx = await preparePipeline(msg);
    expect(ctx.droppedMessages).toBeUndefined();
    expect(ctx.summaryCover).toBeUndefined();
  });

  it("passes a short conversation whole, without a summary", async () => {
    persist(9);
    const ctx = await preparePipeline(msg);
    expect(ctx.hasOverflow).toBe(false);
    expect(ctx.history).toHaveLength(18);
    expect(ctx.conversationSummary).toBeUndefined();
  });

  it("moves the start past long pasted messages once, folding down to half the budget", async () => {
    const big = "x".repeat(6_000);
    const content = Object.fromEntries(Array.from({ length: 12 }, (_, i) => [`u${i}`, big]));
    // 8 exchanges of 6k: over the 40k budget, the window drops u0 and u1 now and
    // the summary takes u0..u4, so the remaining 18k leave room to grow.
    persist(8, { through: null, content });
    const first = await preparePipeline(msg);
    expect(first.history?.[0]?.content).toBe(big);
    expect(first.history).toHaveLength(12);
    expect(first.droppedMessages).toHaveLength(10);
    expect(first.summaryCover).toEqual({ expected: null, through: 5 });
    // Once that refresh landed, the next turns start at u5 and only append.
    const starts: number[] = [];
    for (const exchanges of [9, 10, 11]) {
      persist(exchanges, { through: 5, content });
      const ctx = await preparePipeline(msg);
      starts.push(ctx.history?.length ?? 0);
      expect(ctx.droppedMessages).toBeUndefined();
    }
    expect(starts).toEqual([8, 10, 12]);
  });
});
