// SPDX-License-Identifier: AGPL-3.0-or-later

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { api, getUserErrorMessage } from "@/lib/api";
import { ListDrawer } from "@/components/list-drawer";
import { useI18n } from "@/lib/i18n/context";
import { useTenantPaths } from "@/lib/tenant/use-tenant-paths";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}

function toSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export function CreateInstanceSheet({ open, onOpenChange, onCreated }: Props) {
  const router = useRouter();
  const { t } = useI18n();
  const paths = useTenantPaths();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);
  const [description, setDescription] = useState("");
  const [creating, setCreating] = useState(false);

  const handleNameChange = (value: string) => {
    setName(value);
    if (!slugEdited) setSlug(toSlug(value));
  };

  const handleSlugChange = (value: string) => {
    setSlugEdited(true);
    setSlug(toSlug(value));
  };

  const isValid = name.trim().length > 0 && slug.length > 0;

  const handleCreate = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!isValid) return;
    setCreating(true);
    try {
      const { instance } = await api.instances.create({
        name: name.trim(),
        slug,
        description: description.trim() || undefined,
      });
      toast.success(t("instances.create.success"));
      resetForm();
      onCreated();
      // The engine files the agent in the workspace named by the URL
      // (`request()` sends it as `X-Workspace-Slug`), so the pushed URL is the
      // workspace the agent is actually in.
      // Land on the prompts: what the agent says is the first thing to write for
      // a new one.
      router.push(paths.workspace(`/instances/${encodeURIComponent(instance.slug)}?tab=prompts`));
    } catch (err) {
      toast.error(getUserErrorMessage(err, t("instances.create.error")));
    } finally {
      setCreating(false);
    }
  };

  const resetForm = () => {
    setName("");
    setSlug("");
    setSlugEdited(false);
    setDescription("");
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) resetForm();
    onOpenChange(next);
  };

  return (
    <ListDrawer
      open={open}
      onOpenChange={handleOpenChange}
      title={t("instances.create.title")}
      description={t("instances.create.description")}
      primary={
        <Button type="submit" form="create-instance-form" disabled={!isValid || creating}>
          {creating ? t("instances.create.creating") : t("instances.create.button")}
        </Button>
      }
    >
      <form id="create-instance-form" onSubmit={handleCreate} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="name">{t("instances.table.name")}</Label>
          <Input
            id="name"
            placeholder={t("instances.create.namePlaceholder")}
            value={name}
            onChange={(e) => handleNameChange(e.target.value)}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="slug">{t("instances.table.slug")}</Label>
          <Input
            id="slug"
            placeholder={t("instances.create.slugPlaceholder")}
            value={slug}
            onChange={(e) => handleSlugChange(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">{t("instances.create.slugHelp")}</p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="description">{t("instances.table.description")}</Label>
          <Textarea
            id="description"
            placeholder={t("instances.create.descriptionPlaceholder")}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
          />
        </div>

        <p className="text-xs text-muted-foreground">{t("instances.create.reviewInfo")}</p>
      </form>
    </ListDrawer>
  );
}
