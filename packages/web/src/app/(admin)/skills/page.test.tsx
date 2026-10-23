// SPDX-License-Identifier: AGPL-3.0-or-later

import { screen, waitFor, within } from "@testing-library/react";
import { renderWithProviders, userEvent } from "@/test-utils";

const { list, get, update, remove, versions, replace, searchParams } = vi.hoisted(() => ({
  list: vi.fn(),
  get: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
  versions: vi.fn(),
  replace: vi.fn(),
  searchParams: { current: new URLSearchParams() },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace }),
  useSearchParams: () => searchParams.current,
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/api", () => ({
  getUserErrorMessage: (_e: unknown, fallback: string) => fallback,
  api: {
    skillLibrary: { list, get, update, delete: remove, versions, getVersion: vi.fn() },
    tools: { catalog: async () => ({ tools: [] }) },
    exportImport: { exportSkill: vi.fn(), importSkills: vi.fn() },
  },
}));

import SkillsPage from "./page";

const summaries = [
  { name: "web-research", displayName: "Ricerca web", description: "Cerca in rete", category: "general" },
  { name: "mail-writer", displayName: "Scrittore di mail", description: "Scrive email formali", category: "office" },
];
const detail = { name: "web-research", displayName: "Ricerca web", description: "Cerca in rete", content: "# Come", category: "general" };

beforeEach(() => {
  vi.clearAllMocks();
  searchParams.current = new URLSearchParams();
  list.mockResolvedValue({ skills: summaries });
  get.mockResolvedValue(detail);
  versions.mockResolvedValue({ versions: [] });
});

const rowOf = (text: string) => screen.getByText(text).closest("tr") as HTMLElement;

describe("skills catalog", () => {
  it("lists skills by display name with the description under it, in the one list table", async () => {
    renderWithProviders(<SkillsPage />);
    const row = rowOf(await screen.findByText("Ricerca web").then((el) => el.textContent as string));
    expect(within(row).getByText("Cerca in rete")).toBeInTheDocument();
    expect(within(row).getByText("general")).toBeInTheDocument();
    // The slug is not the name of a row whose display name exists.
    expect(screen.queryByText("web-research")).not.toBeInTheDocument();
  });

  it("filters rows on the description as typed", async () => {
    const user = userEvent.setup();
    renderWithProviders(<SkillsPage />);
    await screen.findByText("Ricerca web");
    await user.type(screen.getByRole("searchbox", { name: "Cerca" }), "formali");
    expect(screen.getByText("Scrittore di mail")).toBeInTheDocument();
    expect(screen.queryByText("Ricerca web")).not.toBeInTheDocument();
  });

  it("opens the skill in a drawer when its row is clicked, with content and versions tabs", async () => {
    const user = userEvent.setup();
    renderWithProviders(<SkillsPage />);
    await user.click(await screen.findByText("Cerca in rete"));
    const drawer = await screen.findByRole("dialog");
    expect(get).toHaveBeenCalledWith("web-research");
    expect(await within(drawer).findByLabelText("Nome")).toHaveValue("Ricerca web");
    expect(within(drawer).getByRole("tab", { name: "Contenuto" })).toBeInTheDocument();
    expect(within(drawer).getByRole("tab", { name: "Versioni" })).toBeInTheDocument();
  });

  // The Settings tab showed a read-only category, a hard-coded "active" and an
  // archive that was the list's delete; it is gone, and delete lives in the footer.
  it("has no Settings tab in the drawer", async () => {
    const user = userEvent.setup();
    renderWithProviders(<SkillsPage />);
    await user.click(await screen.findByText("Cerca in rete"));
    const drawer = await screen.findByRole("dialog");
    await within(drawer).findByLabelText("Nome");
    expect(within(drawer).queryByRole("tab", { name: "Impostazioni" })).not.toBeInTheDocument();
    expect(within(drawer).queryByText("Zona Pericolosa")).not.toBeInTheDocument();
  });

  it("has no edit or delete button on the rows themselves", async () => {
    renderWithProviders(<SkillsPage />);
    const row = rowOf(await screen.findByText("Cerca in rete").then((el) => el.textContent as string));
    // The row's only button is its name, which opens the drawer.
    expect(within(row).getAllByRole("button")).toHaveLength(1);
    expect(screen.queryByRole("button", { name: "Elimina" })).not.toBeInTheDocument();
  });

  it("deletes only from the drawer, after the confirmation", async () => {
    const user = userEvent.setup();
    remove.mockResolvedValue(undefined);
    renderWithProviders(<SkillsPage />);
    await user.click(await screen.findByText("Cerca in rete"));
    const drawer = await screen.findByRole("dialog");
    await within(drawer).findByLabelText("Nome");

    await user.click(within(drawer).getByRole("button", { name: "Elimina" }));
    expect(remove).not.toHaveBeenCalled();
    const confirm = await screen.findByRole("alertdialog");
    await user.click(within(confirm).getByRole("button", { name: "Elimina" }));

    await waitFor(() => expect(remove).toHaveBeenCalledWith("web-research"));
    await waitFor(() => expect(list).toHaveBeenCalledTimes(2));
  });

  it("does not delete when the confirmation is cancelled", async () => {
    const user = userEvent.setup();
    renderWithProviders(<SkillsPage />);
    await user.click(await screen.findByText("Cerca in rete"));
    const drawer = await screen.findByRole("dialog");
    await within(drawer).findByLabelText("Nome");
    await user.click(within(drawer).getByRole("button", { name: "Elimina" }));
    await user.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Annulla" }));
    expect(remove).not.toHaveBeenCalled();
  });

  it("opens the skill named in ?skill= straight away, as an old /skills/<slug> link does", async () => {
    searchParams.current = new URLSearchParams("skill=web-research");
    renderWithProviders(<SkillsPage />);
    const drawer = await screen.findByRole("dialog");
    expect(await within(drawer).findByLabelText("Nome")).toHaveValue("Ricerca web");
  });

  it("saves under the slug and reads the list again", async () => {
    const user = userEvent.setup();
    update.mockResolvedValue({ ...detail, displayName: "Ricerca in rete" });
    renderWithProviders(<SkillsPage />);
    await user.click(await screen.findByText("Cerca in rete"));
    const drawer = await screen.findByRole("dialog");
    const name = await within(drawer).findByLabelText("Nome");
    await user.clear(name);
    await user.type(name, "Ricerca in rete");
    await user.click(within(drawer).getByRole("button", { name: "Salva" }));
    await waitFor(() =>
      expect(update).toHaveBeenCalledWith("web-research", expect.objectContaining({ displayName: "Ricerca in rete" })),
    );
    await waitFor(() => expect(list).toHaveBeenCalledTimes(2));
  });

  it("does not let a blank name be saved", async () => {
    const user = userEvent.setup();
    renderWithProviders(<SkillsPage />);
    await user.click(await screen.findByText("Cerca in rete"));
    const drawer = await screen.findByRole("dialog");
    await user.clear(await within(drawer).findByLabelText("Nome"));
    expect(within(drawer).getByRole("button", { name: "Salva" })).toBeDisabled();
  });

  it("shows the empty state with its action when the library has no skill", async () => {
    list.mockResolvedValue({ skills: [] });
    renderWithProviders(<SkillsPage />);
    expect(await screen.findByText("Nessuna skill presente.")).toBeInTheDocument();
    expect(screen.queryByRole("searchbox")).not.toBeInTheDocument();
  });

  it("states a failed load and offers a retry", async () => {
    list.mockRejectedValueOnce(new Error("down")).mockResolvedValue({ skills: summaries });
    const user = userEvent.setup();
    renderWithProviders(<SkillsPage />);
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Riprova" }));
    expect(await screen.findByText("Ricerca web")).toBeInTheDocument();
  });
});
