// SPDX-License-Identifier: AGPL-3.0-or-later

"use client";

import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useI18n } from "@/lib/i18n/context";

/**
 * Whether a row matches what was typed: every word of the query appears in the
 * row's visible text (name, the line under it, badge text), in any order and
 * ignoring case.
 */
export function matchesSearch(query: string, ...fields: Array<string | null | undefined>): boolean {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const haystack = fields.filter(Boolean).join(" ").toLowerCase();
  return words.every((word) => haystack.includes(word));
}

/** The search box above a list; the page owns the query and filters its rows with `matchesSearch`. */
export function ListSearch({
  value,
  onChange,
  label,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  /** Accessible name and placeholder; defaults to "Search". */
  label?: string;
  className?: string;
}) {
  const { t } = useI18n();
  const text = label ?? t("common.search");
  return (
    <div className={className ?? "relative mt-6"}>
      <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
      <Input
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={text}
        aria-label={text}
        className="pl-9"
      />
    </div>
  );
}
