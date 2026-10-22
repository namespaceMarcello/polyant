// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Tests for the Knowledge section's two capability switches and their embedder
 * warnings.
 *
 * Retrieval MOVED here from the model settings, and the "your embedder has no
 * credentials" warning did not come with it — nor did the two tests that pinned
 * it. The consequence was silent: an admin turns retrieval on, gets a green
 * toast, uploads documents, and every one lands in `status: error` with nothing
 * on screen explaining why.
 *
 * The switch rides the page's Save rather than persisting on the flick, like every
 * other form in the agent — it used to be the one exception, on the grounds that it
 * was "just one boolean".
 */

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { KnowledgeTab } from "./knowledge-tab";
import { PageActionsProvider, usePageActions } from "./page-actions-context";
import type { Instance } from "@/lib/api";

function SaveButton() {
  const { saveAction } = usePageActions();
  if (!saveAction?.isDirty) return null;
  return <button onClick={() => saveAction.onSave()}>common.save</button>;
}

/** Every render needs the provider: the switches register the page's save action. */
function renderWithProvider(ui: ReactElement) {
  return render(
    <PageActionsProvider>
      {ui}
      <SaveButton />
    </PageActionsProvider>,
  );
}

const { mockSetEnabled, mockGet, mockList, mockUpdate, mockToastSuccess, mockToastError } = vi.hoisted(() => ({
  mockSetEnabled: vi.fn(),
  mockGet: vi.fn(),
  mockList: vi.fn(),
  mockUpdate: vi.fn(),
  mockToastSuccess: vi.fn(),
  mockToastError: vi.fn(),
}));

vi.mock("@/lib/i18n/context", () => ({
  useI18n: vi.fn(() => ({
    // Params are appended rather than dropped: the banners below carry the name
    // of the embedder whose key is missing, and a mock that swallowed it would
    // pass whatever provider the component named.
    t: (key: string, params?: Record<string, string | number>) =>
      params ? `${key} ${Object.values(params).join(" ")}` : key,
    locale: "en",
    setLocale: vi.fn(),
  })),
  I18nProvider: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock("sonner", () => ({
  toast: {
    success: (...args: unknown[]) => mockToastSuccess(...args),
    error: (...args: unknown[]) => mockToastError(...args),
  },
}));

vi.mock("@/lib/api", () => ({
  api: {
    knowledge: { list: (...args: unknown[]) => mockList(...args), get: (...args: unknown[]) => mockGet(...args), setEnabled: (...args: unknown[]) => mockSetEnabled(...args) },
    instances: { update: (...args: unknown[]) => mockUpdate(...args) },
  },
  getUserErrorMessage: vi.fn((_e: unknown, d: string) => d),
}));

function makeInstance(overrides: Partial<Instance> = {}): Instance {
  return {
    id: "inst-1",
    slug: "a1",
    name: "A1",
    status: "active",
    provider: "openai",
    model: "gpt-4o",
    knowledgeEnabled: true,
    embeddingProvider: "openai",
    createdAt: null,
    updatedAt: null,
    ...overrides,
  } as unknown as Instance;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockList.mockResolvedValue({ documents: [] });
  mockUpdate.mockImplementation(async (_slug: string, patch: Record<string, unknown>) => ({
    instance: makeInstance(patch as Partial<Instance>),
  }));
});

describe("KnowledgeTab — the embedder-credentials warning", () => {
  it("warns when retrieval is on and the embedder has no credentials", async () => {
    renderWithProvider(
      <KnowledgeTab
        slug="a1"
        instance={makeInstance({ embedder: { needsCredentials: true } })}
        onUpdate={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("settings.tab.knowledgeEmbedderWarning OpenAI")).toBeInTheDocument();
    });
  });

  // Same regression as the memory card's banner: it said OpenAI for every
  // embedder that was not Bedrock, so the instruction did not fix anything for an
  // agent on a registered embedder.
  it("names a REGISTERED embedder, not OpenAI", async () => {
    renderWithProvider(
      <KnowledgeTab
        slug="a1"
        instance={makeInstance({
          embeddingProvider: "some-registered-embedder",
          embedder: { needsCredentials: true },
        })}
        onUpdate={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(
        screen.getByText("settings.tab.knowledgeEmbedderWarning some-registered-embedder"),
      ).toBeInTheDocument();
    });
  });

  it("names AWS credentials for a bedrock embedder", async () => {
    renderWithProvider(
      <KnowledgeTab
        slug="a1"
        instance={makeInstance({
          embeddingProvider: "bedrock",
          embedder: { needsCredentials: true },
        })}
        onUpdate={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("settings.tab.knowledgeAwsWarning")).toBeInTheDocument();
    });
  });

  it("stays quiet when the embedder is configured", async () => {
    renderWithProvider(
      <KnowledgeTab
        slug="a1"
        instance={makeInstance({ embedder: { needsCredentials: false } })}
        onUpdate={vi.fn()}
      />,
    );

    await waitFor(() => expect(mockList).toHaveBeenCalled());
    expect(screen.queryByText(/settings\.tab\.knowledgeEmbedderWarning/)).not.toBeInTheDocument();
  });

  it("stays quiet while retrieval is off, since nothing will be embedded", async () => {
    renderWithProvider(
      <KnowledgeTab
        slug="a1"
        instance={makeInstance({
          knowledgeEnabled: false,
          embedder: { needsCredentials: true },
        })}
        onUpdate={vi.fn()}
      />,
    );

    await waitFor(() => expect(mockList).toHaveBeenCalled());
    expect(screen.queryByText(/settings\.tab\.knowledgeEmbedderWarning/)).not.toBeInTheDocument();
  });

  // The engine's answer, not a client-side recomputation: `memory` reports
  // all-false whenever memory is off, so it cannot speak for a knowledge-only
  // agent — which is exactly how this warning got lost.
  it("does not fall back to the memory status", async () => {
    renderWithProvider(
      <KnowledgeTab
        slug="a1"
        instance={makeInstance({
          memory: { needsOpenAIKey: false, canEnable: false },
          embedder: { needsCredentials: true },
        })}
        onUpdate={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("settings.tab.knowledgeEmbedderWarning OpenAI")).toBeInTheDocument();
    });
  });
});

describe("KnowledgeTab — the retrieval switch", () => {
  const retrieval = () => screen.getByLabelText("knowledge.tab.enableTitle");

  it("writes only on save, never on mount", async () => {
    renderWithProvider(<KnowledgeTab slug="a1" instance={makeInstance()} onUpdate={vi.fn()} />);
    await waitFor(() => expect(mockList).toHaveBeenCalled());

    expect(mockUpdate).not.toHaveBeenCalled();
    // Nothing is dirty, so there is no Save to press either.
    expect(screen.queryByText("common.save")).not.toBeInTheDocument();
  });

  /**
   * A flick alone must NOT persist. This is the rule the whole section follows
   * now, and the one this switch used to break.
   */
  it("does not persist on the flick", async () => {
    renderWithProvider(
      <KnowledgeTab
        slug="a1"
        instance={makeInstance({ knowledgeEnabled: false })}
        onUpdate={vi.fn()}
      />,
    );
    await waitFor(() => expect(mockList).toHaveBeenCalled());

    await userEvent.click(retrieval());

    expect(mockUpdate).not.toHaveBeenCalled();
    expect(screen.getByText("common.save")).toBeInTheDocument();
  });

  it("persists the flag on save and reports success", async () => {
    const onUpdate = vi.fn();
    renderWithProvider(
      <KnowledgeTab
        slug="a1"
        instance={makeInstance({ knowledgeEnabled: false })}
        onUpdate={onUpdate}
      />,
    );
    await waitFor(() => expect(mockList).toHaveBeenCalled());

    await userEvent.click(retrieval());
    await userEvent.click(screen.getByText("common.save"));

    await waitFor(() => {
      expect(mockUpdate).toHaveBeenCalledWith("a1", { knowledgeEnabled: true });
    });
    expect(onUpdate).toHaveBeenCalled();
    expect(mockToastSuccess).toHaveBeenCalled();
  });

  /**
   * Memory is NOT here any more — it went to Parametri, with the per-turn
   * parameters. Asserted as absent so a revert that drags it back is loud.
   */
  it("does not carry the memory switch", async () => {
    renderWithProvider(<KnowledgeTab slug="a1" instance={makeInstance()} onUpdate={vi.fn()} />);
    await waitFor(() => expect(mockList).toHaveBeenCalled());

    expect(screen.queryByLabelText("settings.tab.memory")).not.toBeInTheDocument();
  });

  it("surfaces a failure instead of pretending it saved", async () => {
    mockUpdate.mockRejectedValue(new Error("nope"));
    renderWithProvider(
      <KnowledgeTab
        slug="a1"
        instance={makeInstance({ knowledgeEnabled: false })}
        onUpdate={vi.fn()}
      />,
    );
    await waitFor(() => expect(mockList).toHaveBeenCalled());

    await userEvent.click(retrieval());
    await userEvent.click(screen.getByText("common.save"));

    await waitFor(() => expect(mockToastError).toHaveBeenCalled());
    expect(mockToastSuccess).not.toHaveBeenCalled();
  });
});

describe("KnowledgeTab — document sizes", () => {
  it("prints a unit for a document of 1 GB or more", async () => {
    mockList.mockResolvedValue({
      documents: [
        { id: "d1", filename: "big.pdf", sizeBytes: 3 * 1024 ** 3, status: "ready", chunkCount: 4, createdAt: "2026-01-01T00:00:00Z" },
      ],
    });
    renderWithProvider(<KnowledgeTab slug="a1" instance={makeInstance()} onUpdate={vi.fn()} />);

    await waitFor(() => expect(screen.getByText(/3 GB/)).toBeInTheDocument());
    expect(screen.queryByText(/undefined/)).not.toBeInTheDocument();
  });
});

describe("KnowledgeTab — opening a document", () => {
  const docs = [
    { id: "d1", filename: "guide.md", sizeBytes: 10, status: "ready", enabled: true, chunkCount: 2, createdAt: "2026-01-01T00:00:00Z" },
    { id: "d2", filename: "later.md", sizeBytes: 10, status: "processing", enabled: true, chunkCount: 0, createdAt: "2026-01-01T00:00:00Z" },
  ];
  beforeEach(() => {
    mockList.mockResolvedValue({ documents: docs });
    mockGet.mockResolvedValue({ document: { rawContent: "# Guide body" } });
  });

  it("opens the drawer when the row is clicked, with no eye button in the list", async () => {
    renderWithProvider(<KnowledgeTab slug="a1" instance={makeInstance()} onUpdate={vi.fn()} />);
    const row = await screen.findByRole("button", { name: /guide\.md/ });
    await userEvent.click(row);
    expect(await screen.findByText("# Guide body")).toBeInTheDocument();
    expect(mockGet).toHaveBeenCalledWith("a1", "d1");
  });

  it("opens from the keyboard with Enter", async () => {
    renderWithProvider(<KnowledgeTab slug="a1" instance={makeInstance()} onUpdate={vi.fn()} />);
    const row = await screen.findByRole("button", { name: /guide\.md/ });
    row.focus();
    await userEvent.keyboard("{Enter}");
    expect(await screen.findByText("# Guide body")).toBeInTheDocument();
  });

  it("does not open a document that is still processing", async () => {
    renderWithProvider(<KnowledgeTab slug="a1" instance={makeInstance()} onUpdate={vi.fn()} />);
    await screen.findByText("later.md");
    expect(screen.queryByRole("button", { name: /later\.md/ })).not.toBeInTheDocument();
  });

  it("asks to delete from the row without opening the document", async () => {
    renderWithProvider(<KnowledgeTab slug="a1" instance={makeInstance()} onUpdate={vi.fn()} />);
    await screen.findByText("guide.md");
    await userEvent.click(screen.getAllByRole("button", { name: "common.delete" })[0]!);
    expect(mockGet).not.toHaveBeenCalled();
    expect(await screen.findByText(/knowledge\.tab\.deleteDescription/)).toBeInTheDocument();
  });
});

describe("KnowledgeTab — the switch on a document", () => {
  const docs = [{ id: "d1", filename: "guide.md", sizeBytes: 10, status: "ready", enabled: true, chunkCount: 2, createdAt: "2026-01-01T00:00:00Z" }];
  beforeEach(() => {
    mockList.mockResolvedValue({ documents: docs });
    mockGet.mockResolvedValue({ document: { rawContent: "# Guide body" } });
    mockSetEnabled.mockResolvedValue({ id: "d1", enabled: false });
  });
  const docSwitch = () => screen.findByRole("switch", { name: /knowledge\.tab\.docEnabled guide\.md/ });

  it("shows each document's state on its row", async () => {
    renderWithProvider(<KnowledgeTab slug="a1" instance={makeInstance()} onUpdate={vi.fn()} />);
    expect(await docSwitch()).toBeChecked();
  });

  it("flicking it does not open the document", async () => {
    renderWithProvider(<KnowledgeTab slug="a1" instance={makeInstance()} onUpdate={vi.fn()} />);
    await userEvent.click(await docSwitch());
    expect(mockGet).not.toHaveBeenCalled();
    expect(screen.queryByText("# Guide body")).not.toBeInTheDocument();
  });

  it("is saved with the page's Save, not on the flick", async () => {
    renderWithProvider(<KnowledgeTab slug="a1" instance={makeInstance()} onUpdate={vi.fn()} />);
    await userEvent.click(await docSwitch());
    expect(mockSetEnabled).not.toHaveBeenCalled();
    await userEvent.click(screen.getByText("common.save"));
    await waitFor(() => expect(mockSetEnabled).toHaveBeenCalledWith("a1", "d1", false));
  });

  it("flicking it back before saving leaves nothing to save", async () => {
    renderWithProvider(<KnowledgeTab slug="a1" instance={makeInstance()} onUpdate={vi.fn()} />);
    const sw = await docSwitch();
    await userEvent.click(sw);
    await userEvent.click(sw);
    expect(screen.queryByText("common.save")).not.toBeInTheDocument();
  });
});
