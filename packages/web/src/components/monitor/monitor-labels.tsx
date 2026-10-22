// SPDX-License-Identifier: AGPL-3.0-or-later

"use client";

import { AlertCircle, CheckCircle2, Loader2, ShieldAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useI18n } from "@/lib/i18n/context";
import type { TranslationKey } from "@/lib/i18n/types";
import type { MonitorOutcome } from "@/lib/api-types";

/**
 * The types and groups the engine knows today. The engine's lists are open — a build
 * can register more — so a type or group missing here is shown under its own name
 * instead of being hidden.
 */
const TYPE_SHORT: Record<string, TranslationKey> = {
  tool_call: "monitor.type.tool_call",
  hook: "monitor.type.hook",
  webhook: "monitor.type.webhook",
  scheduled_run: "monitor.type.scheduled_run",
};

const TYPE_LONG: Record<string, TranslationKey> = {
  tool_call: "monitor.typeLong.tool_call",
  hook: "monitor.typeLong.hook",
  webhook: "monitor.typeLong.webhook",
  scheduled_run: "monitor.typeLong.scheduled_run",
};

const GROUPS: Record<string, TranslationKey> = {
  agents: "monitor.group.agents",
  automations: "monitor.group.automations",
};

const SECTIONS: Record<string, TranslationKey> = {
  arguments: "monitor.section.arguments",
  output: "monitor.section.output",
  toolCalls: "monitor.section.toolCalls",
  trigger: "monitor.section.trigger",
  channel: "monitor.section.channel",
  messageCount: "monitor.section.messageCount",
};

export function useMonitorLabels() {
  const { t } = useI18n();
  return {
    typeShort: (type: string) => (TYPE_SHORT[type] ? t(TYPE_SHORT[type]) : type),
    typeLong: (type: string) => (TYPE_LONG[type] ? t(TYPE_LONG[type]) : type),
    group: (group: string) => (GROUPS[group] ? t(GROUPS[group]) : group),
    section: (key: string) => (SECTIONS[key] ? t(SECTIONS[key]) : key),
  };
}

export function TypePill({ type }: { type: string }) {
  const labels = useMonitorLabels();
  return <Badge variant="outline">{labels.typeShort(type)}</Badge>;
}

export function OutcomePill({ outcome }: { outcome: MonitorOutcome | string }) {
  const { t } = useI18n();
  switch (outcome) {
    case "ok":
      return (
        <Badge variant="default">
          <CheckCircle2 aria-hidden />
          {t("monitor.outcome.ok")}
        </Badge>
      );
    case "error":
      return (
        <Badge variant="destructive">
          <AlertCircle aria-hidden />
          {t("monitor.outcome.error")}
        </Badge>
      );
    case "blocked":
      return (
        <Badge variant="outline">
          <ShieldAlert aria-hidden />
          {t("monitor.outcome.blocked")}
        </Badge>
      );
    case "running":
      return (
        <Badge variant="secondary">
          <Loader2 className="animate-spin" aria-hidden />
          {t("monitor.outcome.running")}
        </Badge>
      );
    default:
      return <Badge variant="outline">{outcome}</Badge>;
  }
}
