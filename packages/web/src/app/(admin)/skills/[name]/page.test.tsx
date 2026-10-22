// SPDX-License-Identifier: AGPL-3.0-or-later

import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "@/test-utils";

const get = vi.fn();
const update = vi.fn();

vi.mock("next/navigation", () => ({
  useParams: () => ({ name: "web-research" }),
  useRouter: () => ({ push: vi.fn() }),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/api", () => ({
  getUserErrorMessage: (_e: unknown, fallback: string) => fallback,
  api: {
    skillLibrary: { get: (n: string) => get(n), update: (n: string, d: unknown) => update(n, d), versions: vi.fn(), getVersion: vi.fn(), delete: vi.fn() },
    tools: { catalog: async () => ({ tools: [] }) },
    exportImport: { exportSkill: vi.fn() },
  },
}));

import SkillDetailPage from "./page";

const skill = { name: "web-research", displayName: "Web research", description: "Looks things up", content: "# How", category: "general" };

beforeEach(() => {
  get.mockReset();
  update.mockReset();
  get.mockResolvedValue(skill);
});

describe("skill detail page", () => {
  it("shows the name for editing and the slug as fixed", async () => {
    renderWithProviders(<SkillDetailPage />);
    expect(await screen.findByLabelText("Nome")).toHaveValue("Web research");
    expect(screen.getByLabelText("Identificativo")).toHaveValue("web-research");
    expect(screen.getByLabelText("Identificativo")).toHaveAttribute("readonly");
  });

  it("saves a new name and description under the slug in the URL", async () => {
    const user = userEvent.setup();
    update.mockResolvedValue({ ...skill, displayName: "Ricerca web", description: "Cerca in rete" });
    renderWithProviders(<SkillDetailPage />);
    const name = await screen.findByLabelText("Nome");
    await user.clear(name);
    await user.type(name, "Ricerca web");
    const description = screen.getByLabelText("Descrizione");
    await user.clear(description);
    await user.type(description, "Cerca in rete");
    await user.click(screen.getByRole("button", { name: "Salva" }));

    await waitFor(() => expect(update).toHaveBeenCalled());
    expect(update).toHaveBeenCalledWith("web-research", expect.objectContaining({ displayName: "Ricerca web", description: "Cerca in rete" }));
    expect(await screen.findByRole("heading", { name: "Ricerca web" })).toBeInTheDocument();
  });

  it("does not let a blank name be saved", async () => {
    const user = userEvent.setup();
    renderWithProviders(<SkillDetailPage />);
    await user.clear(await screen.findByLabelText("Nome"));
    expect(screen.getByRole("button", { name: "Salva" })).toBeDisabled();
  });
});
