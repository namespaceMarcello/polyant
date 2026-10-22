// SPDX-License-Identifier: AGPL-3.0-or-later

import type { MonitorOutcome } from "@/lib/api-types";

/**
 * The outcomes this build offers as a filter. `blocked` is a policy refusing a call;
 * nothing here produces it, so it is not offered until a build that records it adds it.
 */
export const MONITOR_OUTCOMES_UI = ["ok", "error", "running"] as const satisfies readonly MonitorOutcome[];
