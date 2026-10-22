// SPDX-License-Identifier: AGPL-3.0-or-later

"use client";

import { ExternalLink, Loader2 } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { LoadFailed } from "@/components/ui/load-failed";
import { api, type MonitorDetail, type MonitorSection } from "@/lib/api";
import { formatDuration } from "@/lib/format";
import { useI18n } from "@/lib/i18n/context";
import { useResource } from "@/hooks/use-resource";
import { useTenantPaths } from "@/lib/tenant/use-tenant-paths";
import { useFormat } from "@/lib/use-format";
import { isLive, type AnyMonitorItem } from "@/lib/monitor/live";
import { OutcomePill, TypePill, useMonitorLabels } from "./monitor-labels";

/** Pretty-print text that holds JSON; anything else is shown as it is. */
function readable(text: string): string {
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return text;
  }
}

function SectionBody({ section }: { section: MonitorSection }) {
  const { t } = useI18n();
  if (section.key === "trigger" && typeof section.value === "string") {
    const key = section.value === "manual" ? "monitor.trigger.manual" : "monitor.trigger.scheduled";
    return <p className="text-sm">{t(key)}</p>;
  }
  const text =
    section.kind === "json" ? JSON.stringify(section.value, null, 2) : typeof section.value === "string" ? readable(section.value) : JSON.stringify(section.value);
  if (section.kind === "text" && text.length < 80 && !text.includes("\n")) return <p className="text-sm">{text}</p>;
  return (
    <pre className="max-h-[360px] overflow-auto whitespace-pre-wrap break-words rounded-md bg-muted p-3 text-xs">{text}</pre>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 text-right">{children}</dd>
    </div>
  );
}

/**
 * The drawer for one row. A stored row reads its payload from the engine when it
 * opens, so the list stays light; a live row shows the previews the event carried and
 * says that it is provisional.
 */
export function MonitorDetailSheet({
  item,
  retentionDays,
  onClose,
}: {
  item: AnyMonitorItem | null;
  /** How long rows of this item's type are kept; `null` when they have no expiry of their own. */
  retentionDays: number | null | undefined;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const fmt = useFormat();
  const labels = useMonitorLabels();
  const paths = useTenantPaths();
  const live = item !== null && isLive(item);
  const stored = useResource<MonitorDetail>(item && !live ? ["monitor-detail", item.type, item.id] : null, () =>
    api.monitor.detail(item!.type, item!.id),
  );
  const detail: MonitorDetail | undefined = item ? (live ? item.detail : stored.data) : undefined;

  return (
    <Sheet open={item !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="w-full gap-0 sm:max-w-lg">
        {item && (
          <>
            <SheetHeader className="gap-2 border-b p-5 pr-12">
              <SheetTitle className="break-words text-base font-medium">{item.summary}</SheetTitle>
              <SheetDescription>{labels.typeLong(item.type)}</SheetDescription>
              <div className="flex flex-wrap gap-2 pt-1">
                <TypePill type={item.type} />
                <OutcomePill outcome={item.outcome} />
              </div>
            </SheetHeader>

            <div className="flex-1 space-y-6 overflow-y-auto p-5">
              <dl className="space-y-2">
                <Field label={t("monitor.detail.time")}>{fmt.dateTime(item.time)}</Field>
                <Field label={t("monitor.detail.agent")}>{item.agent.name}</Field>
                {item.durationMs !== null && <Field label={t("monitor.detail.duration")}>{formatDuration(item.durationMs)}</Field>}
                {item.conversationId && (
                  <Field label={t("monitor.detail.conversation")}>
                    <a
                      href={paths.workspace(`/conversations?id=${encodeURIComponent(item.conversationId)}`)}
                      className="inline-flex items-center gap-1 text-primary underline-offset-4 hover:underline"
                    >
                      <ExternalLink className="size-3" aria-hidden />
                      {t("monitor.detail.openConversation")}
                    </a>
                  </Field>
                )}
              </dl>

              {live && <p className="rounded-md bg-muted p-3 text-sm text-muted-foreground">{t("monitor.detail.provisional")}</p>}

              {!live && stored.loading && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                  {t("common.loading")}
                </div>
              )}
              {!live && stored.error !== undefined && (
                <LoadFailed message={t("monitor.detail.loadFailed")} onRetry={stored.reload} className="py-4" />
              )}

              {detail?.error && (
                <section className="space-y-2">
                  <h3 className="text-sm font-medium text-destructive">{t("monitor.detail.error")}</h3>
                  <pre className="whitespace-pre-wrap break-words rounded-md bg-destructive/10 p-3 text-xs">{detail.error}</pre>
                </section>
              )}

              {detail?.sections.map((section) => (
                <section key={section.key} className="space-y-2">
                  <h3 className="text-sm font-medium">{labels.section(section.key)}</h3>
                  <SectionBody section={section} />
                </section>
              ))}
            </div>

            <p className="border-t p-4 text-xs text-muted-foreground">
              {retentionDays == null
                ? t("monitor.detail.retentionConversation")
                : t("monitor.detail.retentionDays", { days: retentionDays })}
            </p>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
