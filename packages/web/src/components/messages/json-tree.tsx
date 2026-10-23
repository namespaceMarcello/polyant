// SPDX-License-Identifier: AGPL-3.0-or-later

"use client";

/**
 * JsonTree
 *
 * A JSON value laid out as a tree whose objects and arrays open and close with
 * a +/− toggle. Only the first level is shown open: a turn's payload is several
 * screens tall, and the reader goes looking for one branch of it.
 */

import { useState } from "react";
import { cn } from "@/lib/utils";

type Composite = Record<string, unknown> | unknown[];

function isComposite(value: unknown): value is Composite {
  return value !== null && typeof value === "object";
}

function entriesOf(value: Composite): Array<[string, unknown]> {
  return Array.isArray(value) ? value.map((item, i) => [String(i), item]) : Object.entries(value);
}

/** `{3}` or `[2]`: the shape and size of a closed branch, without words to translate. */
function Summary({ value }: { value: Composite }) {
  const size = Array.isArray(value) ? value.length : Object.keys(value).length;
  const [open, close] = Array.isArray(value) ? ["[", "]"] : ["{", "}"];
  return (
    <span className="text-muted-foreground tabular-nums">
      {open}
      {size}
      {close}
    </span>
  );
}

function Scalar({ value }: { value: unknown }) {
  if (typeof value === "string") {
    return <span className="whitespace-pre-wrap break-words text-foreground">&quot;{value}&quot;</span>;
  }
  if (value === undefined) return <span className="text-muted-foreground">undefined</span>;
  return <span className="text-primary">{JSON.stringify(value)}</span>;
}

function Node({ name, value }: { name: string; value: unknown }) {
  const [open, setOpen] = useState(false);
  const composite = isComposite(value);
  const empty = composite && entriesOf(value).length === 0;

  return (
    <li>
      <div className="flex items-start gap-1">
        {composite && !empty ? (
          <button
            type="button"
            aria-expanded={open}
            aria-label={name}
            onClick={() => setOpen((o) => !o)}
            className="mt-px flex size-3.5 shrink-0 items-center justify-center rounded-sm border text-[10px] leading-none text-muted-foreground hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {open ? "−" : "+"}
          </button>
        ) : (
          <span className="size-3.5 shrink-0" />
        )}
        <span className="shrink-0 text-muted-foreground">{name}:</span>
        <span className="min-w-0">{composite ? <Summary value={value} /> : <Scalar value={value} />}</span>
      </div>
      {composite && open && <Entries value={value} nested />}
    </li>
  );
}

function Entries({ value, nested = false }: { value: Composite; nested?: boolean }) {
  return (
    <ul className={cn("flex flex-col gap-0.5", nested && "ml-1.5 mt-0.5 border-l pl-3")}>
      {entriesOf(value).map(([key, item]) => (
        <Node key={key} name={key} value={item} />
      ))}
    </ul>
  );
}

export function JsonTree({ value, className }: { value: unknown; className?: string }) {
  return (
    <div className={cn("overflow-x-auto rounded-md border bg-muted/30 p-3 font-mono text-[11px] leading-relaxed", className)}>
      {isComposite(value) && entriesOf(value).length > 0 ? (
        <Entries value={value} />
      ) : isComposite(value) ? (
        <Summary value={value} />
      ) : (
        <Scalar value={value} />
      )}
    </div>
  );
}
