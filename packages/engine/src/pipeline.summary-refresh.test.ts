// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * A summary refresh planned on a marker is never held back by another one: the
 * compare-and-set write alone decides which lands. A process-local lock on the
 * refresh would block it after a write that matched no row, or forever behind a
 * call that never settles, and then the window keeps growing until it expires.
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

/** Run the post-response work of a turn that planned a refresh from marker `expected`. */
function respond(conversationId: string, expected: number | null) {
  afterResponse({
    conversationId,
    instanceId: asInstanceSlug("shop"),
    userMessage: "u",
    assistantResponse: "a",
    needsSummaryUpdate: true,
    droppedMessages: [{ role: "user", content: "u5" }, { role: "assistant", content: "a5" }],
    summaryCover: { expected, through: (expected ?? 0) + 5 },
    memoryEnabled: false,
  });
}

describe("afterResponse — summary refresh", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  });

  it("runs a refresh planned on a marker whose previous write matched no row", async () => {
    mockChat.mockResolvedValue({ text: "summary" });
    mockUpdateSummary.mockResolvedValueOnce(false);
    respond("c-miss", 5);
    await vi.waitFor(() => expect(mockUpdateSummary).toHaveBeenCalledTimes(1));
    respond("c-miss", 5);
    await vi.waitFor(() => expect(mockUpdateSummary).toHaveBeenCalledTimes(2));
    expect(mockChat).toHaveBeenCalledTimes(2);
    expect(mockUpdateSummary).toHaveBeenLastCalledWith("c-miss", "summary", { expected: 5, through: 10 });
  });

  it("runs a refresh while another on the same marker is still waiting for its summary call", async () => {
    mockChat.mockImplementationOnce(() => new Promise(() => {}));
    respond("c-hung", 5);
    await vi.waitFor(() => expect(mockChat).toHaveBeenCalledTimes(1));
    mockChat.mockResolvedValue({ text: "summary" });
    respond("c-hung", 5);
    await vi.waitFor(() => expect(mockUpdateSummary).toHaveBeenCalledTimes(1));
    expect(mockUpdateSummary).toHaveBeenCalledWith("c-hung", "summary", { expected: 5, through: 10 });
  });
});
