// SPDX-License-Identifier: AGPL-3.0-or-later

import { useState } from "react";
import { screen } from "@testing-library/react";
import { renderWithProviders, userEvent } from "@/test-utils";
import { ListSearch, matchesSearch } from "./list-search";
import { ListEmpty, ListNoResults } from "./list-states";
import { ListDrawer } from "./list-drawer";
import { ListNameCell } from "./list-table";

describe("matchesSearch", () => {
  it("finds a row by any word of its visible text, in any order, ignoring case", () => {
    expect(matchesSearch("ADA mail", "Ada Lovelace", "ada@example.com", "Gmail")).toBe(true);
    expect(matchesSearch("lovelace ada", "Ada Lovelace")).toBe(true);
  });

  it("rejects a row when one of the words is missing from all its text", () => {
    expect(matchesSearch("ada zed", "Ada Lovelace", "ada@example.com")).toBe(false);
  });

  it("keeps every row for an empty or blank query", () => {
    expect(matchesSearch("", "anything")).toBe(true);
    expect(matchesSearch("   ", null, undefined)).toBe(true);
  });
});

describe("ListSearch", () => {
  it("reports what is typed and is reachable by its accessible name", async () => {
    const seen: string[] = [];
    function Harness() {
      const [value, setValue] = useState("");
      return <ListSearch value={value} onChange={(v) => { seen.push(v); setValue(v); }} />;
    }
    renderWithProviders(<Harness />);
    await userEvent.type(screen.getByRole("searchbox", { name: "Cerca" }), "ab");
    expect(seen).toEqual(["a", "ab"]);
  });
});

describe("list states", () => {
  it("shows the empty title, description and action together", () => {
    renderWithProviders(<ListEmpty title="Nessuna skill" description="Aggiungine una" action={<button>Aggiungi</button>} />);
    expect(screen.getByText("Nessuna skill")).toBeInTheDocument();
    expect(screen.getByText("Aggiungine una")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Aggiungi" })).toBeInTheDocument();
  });

  it("says there are no results when a search matches nothing", () => {
    renderWithProviders(<ListNoResults />);
    expect(screen.getByText("Nessun risultato")).toBeInTheDocument();
  });
});

describe("ListDrawer", () => {
  it("draws no footer strip when the drawer has no buttons", () => {
    renderWithProviders(<ListDrawer open onOpenChange={() => {}} title="Titolo">corpo</ListDrawer>);
    expect(screen.getByText("corpo")).toBeInTheDocument();
    expect(document.querySelector("[data-slot=sheet-footer]")).toBeNull();
  });
});

describe("ListNameCell", () => {
  it("keeps the full summary in the title so a clamped line can still be read", () => {
    renderWithProviders(
      <table><tbody><tr><ListNameCell name="Ada" summary="una descrizione molto lunga" /></tr></tbody></table>,
    );
    expect(screen.getByTitle("una descrizione molto lunga")).toHaveClass("line-clamp-2");
  });
});
