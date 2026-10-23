// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { JsonTree } from "./json-tree";

describe("JsonTree", () => {
  const value = { customer: { name: "Ada", tags: ["vip"] }, confirmed: true, notes: null };

  it("shows the first level with its branches closed", () => {
    render(<JsonTree value={value} />);
    expect(screen.getByText("confirmed:")).toBeInTheDocument();
    expect(screen.getByText("true")).toBeInTheDocument();
    expect(screen.getByText("null")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "customer" })).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("name:")).not.toBeInTheDocument();
  });

  it("opens and closes one branch at a time with its toggle", async () => {
    render(<JsonTree value={value} />);
    await userEvent.click(screen.getByRole("button", { name: "customer" }));
    expect(screen.getByText('"Ada"')).toBeInTheDocument();
    // The nested array stays closed until it is opened in turn.
    expect(screen.queryByText('"vip"')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "tags" }));
    expect(screen.getByText('"vip"')).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "customer" }));
    expect(screen.queryByText('"Ada"')).not.toBeInTheDocument();
  });

  it("gives an empty branch no toggle", () => {
    render(<JsonTree value={{ empty: {}, list: [] }} />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.getByText("{0}")).toBeInTheDocument();
    expect(screen.getByText("[0]")).toBeInTheDocument();
  });
});
