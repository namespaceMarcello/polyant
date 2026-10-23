// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * A turn that starts before the previous turn's summary refresh lands plans the
 * same refresh. The compare-and-set write discards the second one, but only after
 * it paid for a second summary call. One refresh per conversation and marker runs.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockChat, mockUpdateSummary } = vi.hoisted(() => ({
  mockChat: vi.fn(),
  mockUpdateSummary: vi.fn(async (..._args: unknown[]) => true),
}));

vi.mock("./ai-gateway/index.js", () => ({ chat: mockChat }));
vi.mock("./conversations/index.js", () => ({
  conversationStore: {
    appendMessages: vi.fn(async () => undefined),
    getSystemMessageContents: vi.fn(async () => new Set<string>()),
    updateSummary: mockUpdateSummary,
  },
}));
vi.mock("./utils/title-generator.js", () => ({ generateConversationTitle: vi.fn(async () => undefined) }));
vi.mock("./memory/index.js", () => ({ extractMemories: vi.fn(async () => undefined) }));

import { afterResponse } from "./pipeline.js";
import { asInstanceSlug } from "./instances/identifiers.js";

let turn = 0;
function respond(conversationId: string, expected: number | null) {
  turn++;
  afterResponse({
    conversationId,
    instanceId: asInstanceSlug("shop"),
    userMessage: `u${turn}`,
    assistantResponse: `a${turn}`,
    needsSummaryUpdate: true,
    droppedMessages: [{ role: "user", content: "u5" }, { role: "assistant", content: "a5" }],
    summaryCover: { expected, through: (expected ?? 0) + 5 },
    memoryEnabled: false,
  });
}

/** A summary call that answers when the test says so. */
function pendingSummary() {
  let answer!: (text: string) => void;
  let fail!: (err: Error) => void;
  mockChat.mockImplementationOnce(
    () =>
      new Promise((resolve, reject) => {
        answer = (text) => resolve({ text });
        fail = reject;
      }),
  );
  return { answer: (text: string) => answer(text), fail: (err: Error) => fail(err) };
}

describe("afterResponse — one summary refresh per conversation and marker", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  });

  it("does not start a refresh that one already in flight, or just landed, will make", async () => {
    const first = pendingSummary();
    respond("c-inflight", 5);
    await vi.waitFor(() => expect(mockChat).toHaveBeenCalledTimes(1));
    respond("c-inflight", 5);
    // Another conversation, or another marker, is not held back.
    mockChat.mockResolvedValue({ text: "other" });
    respond("c-other", 5);
    respond("c-inflight", 10);
    await vi.waitFor(() => expect(mockChat).toHaveBeenCalledTimes(3));
    first.answer("summary");
    await vi.waitFor(() => expect(mockUpdateSummary).toHaveBeenCalledTimes(3));
    // A turn planned on the old marker before the write landed, finishing after it.
    respond("c-inflight", 5);
    await new Promise((r) => setTimeout(r, 20));
    expect(mockChat).toHaveBeenCalledTimes(3);
    expect(mockUpdateSummary).toHaveBeenCalledTimes(3);
  });

  it("leaves a refresh without a marker move unclaimed, as before", async () => {
    mockChat.mockResolvedValue({ text: "summary" });
    for (let i = 0; i < 2; i++) {
      afterResponse({
        conversationId: "c-nocover",
        instanceId: asInstanceSlug("shop"),
        userMessage: "u",
        assistantResponse: "a",
        needsSummaryUpdate: true,
        droppedMessages: [{ role: "user", content: "u5" }],
        memoryEnabled: false,
      });
    }
    await vi.waitFor(() => expect(mockUpdateSummary).toHaveBeenCalledTimes(2));
    expect(mockUpdateSummary).toHaveBeenCalledWith("c-nocover", "summary", undefined);
  });

  it("retries after a failed or empty summary call", async () => {
    const failed = pendingSummary();
    respond("c-retry", 5);
    await vi.waitFor(() => expect(mockChat).toHaveBeenCalledTimes(1));
    failed.fail(new Error("provider down"));
    await new Promise((r) => setTimeout(r, 20));
    const empty = pendingSummary();
    respond("c-retry", 5);
    await vi.waitFor(() => expect(mockChat).toHaveBeenCalledTimes(2));
    empty.answer("   ");
    await new Promise((r) => setTimeout(r, 20));
    mockChat.mockResolvedValue({ text: "summary" });
    respond("c-retry", 5);
    await vi.waitFor(() => expect(mockUpdateSummary).toHaveBeenCalledTimes(1));
    expect(mockChat).toHaveBeenCalledTimes(3);
  });
});
