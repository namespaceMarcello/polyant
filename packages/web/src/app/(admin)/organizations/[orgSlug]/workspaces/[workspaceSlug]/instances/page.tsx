// SPDX-License-Identifier: AGPL-3.0-or-later

"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { toast } from "sonner";
import { Plus, Bot, Upload, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ListHead, ListNameCell, ListRow, ListTable } from "@/components/list-table";
import { ListSearch, matchesSearch } from "@/components/list-search";
import { ListEmpty, ListLoading, ListNoResults } from "@/components/list-states";
import { LoadFailed } from "@/components/ui/load-failed";
import { PageHeader } from "@/components/layout/page-header";
import { useResource } from "@/hooks/use-resource";
import { usePersistedState } from "@/hooks/use-persisted-state";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { api, getUserErrorMessage, type Instance } from "@/lib/api";
import { CreateInstanceSheet } from "./create-instance-sheet";
import { useFormat } from "@/lib/use-format";
import { isSafeImageSrc } from "@/lib/utils";
import { useI18n } from "@/lib/i18n/context";
import { instanceStatusLabel } from "@/lib/instance-status";
import type { TranslationKey } from "@/lib/i18n/types";
import { useTenantPaths, type TenantPaths } from "@/lib/tenant/use-tenant-paths";

const SHOW_INACTIVE_STORAGE_KEY = "instances-show-inactive";

const parseBool = (raw: string): boolean | undefined => (raw === "true" ? true : raw === "false" ? false : undefined);

/**
 * The agents of the workspace. An agent is a destination with a page of its own,
 * so a row goes there instead of opening a drawer.
 */
function InstanceList({ instances, t, paths }: {
  instances: Instance[];
  t: (key: TranslationKey, params?: Record<string, string | number>) => string;
  paths: TenantPaths;
}) {
  const router = useRouter();
  const fmt = useFormat();
  return (
    <ListTable className="mt-0">
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <ListHead>{t("instances.table.name")}</ListHead>
          <ListHead className="w-48">{t("instances.table.slug")}</ListHead>
          <ListHead className="w-32">{t("instances.table.status")}</ListHead>
          <ListHead align="end" className="w-36">{t("instances.table.updated")}</ListHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {instances.map((inst) => {
          const open = () => router.push(paths.workspace(`/instances/${encodeURIComponent(inst.slug)}`));
          return (
            <ListRow key={inst.id} onOpen={open}>
              <ListNameCell
                name={inst.name}
                onOpen={open}
                summary={inst.description || undefined}
                icon={
                  inst.icon && isSafeImageSrc(inst.icon) ? (
                    <Image
                      src={inst.icon}
                      alt=""
                      width={24}
                      height={24}
                      className="h-6 w-6 shrink-0 rounded object-cover"
                      unoptimized
                    />
                  ) : (
                    <Bot className="h-6 w-6 shrink-0 text-muted-foreground" />
                  )
                }
              />
              <TableCell>
                <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{inst.slug}</code>
              </TableCell>
              <TableCell>
                <Badge variant={inst.status === "active" ? "default" : "secondary"}>
                  {instanceStatusLabel(inst.status, t)}
                </Badge>
              </TableCell>
              <TableCell className="text-right text-muted-foreground">{fmt.relative(inst.updatedAt)}</TableCell>
            </ListRow>
          );
        })}
      </TableBody>
    </ListTable>
  );
}

export default function InstancesPage() {
  const { t } = useI18n();
  const router = useRouter();
  const paths = useTenantPaths();
  const { data, error, loading, reload } = useResource(["instances", paths.workspace("")], () => api.instances.list());
  const instances: Instance[] = data?.instances ?? [];
  const [dialogOpen, setDialogOpen] = useState(false);
  const [search, setSearch] = useState("");
  // Hide inactive instances by default.
  const [showInactive, setShowInactive] = usePersistedState(SHOW_INACTIVE_STORAGE_KEY, false, parseBool);
  const [importing, setImporting] = useState(false);
  const [importWarnings, setImportWarnings] = useState<{ type: string; message: string }[] | null>(null);
  const importFileRef = useRef<HTMLInputElement>(null);

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImporting(true);
    try {
      const text = await file.text();
      const bundle = JSON.parse(text);
      const result = await api.exportImport.importNew(bundle);

      if (result.warnings.length > 0) {
        setImportWarnings(result.warnings);
      }

      toast.success(t("exportImport.import.success"));

      // The list page reloads itself when it is opened again.
      router.push(paths.workspace(`/instances/${encodeURIComponent(result.slug)}`));
    } catch (err) {
      toast.error(getUserErrorMessage(err, t("exportImport.import.failed")));
    } finally {
      setImporting(false);
      if (importFileRef.current) importFileRef.current.value = "";
    }
  };

  // The active/all toggle and the search are purely client-side: the API
  // returns every agent regardless of status.
  const visibleInstances = instances
    .filter((i) => showInactive || i.status === "active")
    .filter((i) => matchesSearch(search, i.name, i.slug, i.description, instanceStatusLabel(i.status, t)))
    .sort((a, b) => a.name.localeCompare(b.name));
  const hiddenCount = instances.filter((i) => i.status !== "active").length;

  return (
    <div>
      <PageHeader
        title={t("instances.title")}
        subtitle={t("instances.subtitle")}
        actions={
          data !== undefined && (
            <>
              <Button
                variant="outline"
                onClick={() => importFileRef.current?.click()}
                disabled={importing}
                className="gap-2"
              >
                <Upload className="h-4 w-4" />
                {importing ? t("exportImport.import.uploading") : t("exportImport.importNew.button")}
              </Button>
              <input
                ref={importFileRef}
                type="file"
                accept=".json"
                className="hidden"
                onChange={handleImportFile}
              />
              <Button onClick={() => setDialogOpen(true)} data-tour="new-agent">
                <Plus className="h-4 w-4" />
                {t("instances.newInstance")}
              </Button>
            </>
          )
        }
      />

      {error && data === undefined ? (
        <LoadFailed onRetry={reload} />
      ) : loading && data === undefined ? (
        <ListLoading />
      ) : instances.length === 0 ? (
        <ListEmpty
          title={t("instances.empty.title")}
          description={t("instances.empty.description")}
          action={
            <Button variant="outline" onClick={() => setDialogOpen(true)}>
              {t("instances.empty.cta")}
            </Button>
          }
        />
      ) : (
        <>
          <div className="mt-6 flex items-center gap-3">
            <ListSearch value={search} onChange={setSearch} className="relative flex-1" />
            <div className="flex items-center rounded-md border">
              <Button
                variant={!showInactive ? "default" : "ghost"}
                size="sm"
                className="h-9 rounded-r-none"
                onClick={() => setShowInactive(false)}
              >
                {t("instances.filter.activeOnly")}
              </Button>
              <Button
                variant={showInactive ? "default" : "ghost"}
                size="sm"
                className="h-9 rounded-l-none"
                onClick={() => setShowInactive(true)}
              >
                {t("instances.filter.all")}
                {!showInactive && hiddenCount > 0 ? <span className="ml-1 opacity-70">({hiddenCount})</span> : null}
              </Button>
            </div>
          </div>
          <div className="mt-4">
            {visibleInstances.length === 0 ? (
              <ListNoResults />
            ) : (
              <InstanceList instances={visibleInstances} t={t} paths={paths} />
            )}
          </div>
        </>
      )}

      <CreateInstanceSheet
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onCreated={() => {
          setDialogOpen(false);
          reload();
        }}
      />

      {/* Import Warnings Dialog */}
      <Dialog open={importWarnings !== null} onOpenChange={() => setImportWarnings(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("exportImport.import.warningsTitle")}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {t("exportImport.import.warningsDescription")}
          </p>
          <ul className="max-h-64 space-y-1 overflow-y-auto text-sm">
            {importWarnings?.map((w, i) => (
              <li key={i} className="flex items-start gap-2 rounded p-2 bg-muted">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                {w.message}
              </li>
            ))}
          </ul>
        </DialogContent>
      </Dialog>
    </div>
  );
}
