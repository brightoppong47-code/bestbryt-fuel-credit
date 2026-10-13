import { useRef } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import type { Id } from "@/convex/_generated/dataModel.d.ts";
import { useAppAppearance, COLOR_THEMES, APP_ICONS } from "@/hooks/use-app-appearance.ts";
import type { ThemeMode, ColorTheme, AppIcon } from "@/hooks/use-app-appearance.ts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Sun, Moon, Monitor, Palette, LayoutGrid, ImagePlus, Trash2, Upload, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils.ts";
import { toast } from "sonner";
import { useState } from "react";

// ─── Theme mode picker ────────────────────────────────────────────────────────

const MODES: { id: ThemeMode; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: "light",  label: "Light",  icon: Sun },
  { id: "dark",   label: "Dark",   icon: Moon },
  { id: "system", label: "System", icon: Monitor },
];

// ─── Main component ───────────────────────────────────────────────────────────

export function AppearanceSettings() {
  const { settings, update } = useAppAppearance();
  const logoInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  // Convex: logo stored server-side so all devices share it
  const appSettingsResult = useQuery(api.appSettings.getAppSettings);
  const generateUploadUrl = useMutation(api.appSettings.generateLogoUploadUrl);
  const saveLogoStorageId = useMutation(api.appSettings.saveLogoStorageId);
  const removeLogo = useMutation(api.appSettings.removeLogo);

  const logoUrl = appSettingsResult?.logoUrl ?? null;

  // ── Logo upload ─────────────────────────────────────────────────────────────
  const handleLogoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      toast.error("Logo must be under 2 MB. Please use a smaller image.");
      return;
    }

    setUploading(true);
    try {
      // Resize to max 400px tall via canvas before upload
      const resized = await resizeLogo(file);

      // Upload to Convex storage
      const uploadUrl = await generateUploadUrl();
      const res = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": resized.type },
        body: resized,
      });
      if (!res.ok) throw new Error("Upload failed");
      const { storageId } = await res.json() as { storageId: Id<"_storage"> };
      await saveLogoStorageId({ storageId });

      // Also clear old localStorage logo so layout doesn't use both
      update({ logoDataUrl: undefined });
      toast.success("Logo updated — visible on all devices now.");
    } catch {
      toast.error("Failed to upload logo. Please try again.");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  const handleRemoveLogo = async () => {
    try {
      await removeLogo();
      update({ logoDataUrl: undefined });
      toast.success("Logo removed.");
    } catch {
      toast.error("Failed to remove logo.");
    }
  };

  return (
    <div className="space-y-5">
      {/* ── Business Logo ────────────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <ImagePlus className="w-4 h-4 text-primary" />
            Business Logo
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-xs text-muted-foreground leading-relaxed">
            Upload your company logo. It appears in the sidebar and mobile header on{" "}
            <span className="font-semibold text-foreground">all devices</span>{" "}
            — stored securely in the cloud.
            PNG or SVG recommended, max 2 MB.
          </p>

          {appSettingsResult === undefined ? (
            <Skeleton className="h-20 w-full rounded-xl" />
          ) : logoUrl ? (
            /* ── Preview ─────────────────────────────────────────────────── */
            <div className="flex items-center gap-4">
              <div className="w-20 h-20 rounded-xl border bg-muted flex items-center justify-center overflow-hidden shrink-0">
                <img
                  src={logoUrl}
                  alt="Business logo"
                  className="max-w-full max-h-full object-contain p-1"
                />
              </div>
              <div className="flex flex-col gap-2">
                <button
                  onClick={() => logoInputRef.current?.click()}
                  disabled={uploading}
                  className="flex items-center gap-2 text-sm font-medium text-primary hover:underline disabled:opacity-50"
                >
                  {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                  {uploading ? "Uploading…" : "Replace logo"}
                </button>
                <button
                  onClick={handleRemoveLogo}
                  disabled={uploading}
                  className="flex items-center gap-2 text-sm text-destructive hover:underline disabled:opacity-50"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Remove logo
                </button>
              </div>
            </div>
          ) : (
            /* ── Upload prompt ──────────────────────────────────────────── */
            <button
              onClick={() => logoInputRef.current?.click()}
              disabled={uploading}
              className={cn(
                "w-full rounded-xl border-2 border-dashed py-8 flex flex-col items-center gap-2",
                "text-muted-foreground hover:border-primary hover:text-primary transition-colors disabled:opacity-50"
              )}
            >
              {uploading
                ? <Loader2 className="w-7 h-7 animate-spin" />
                : <ImagePlus className="w-7 h-7" />
              }
              <span className="text-sm font-medium">{uploading ? "Uploading…" : "Click to upload logo"}</span>
              {!uploading && <span className="text-xs">PNG, JPG, SVG — max 2 MB</span>}
            </button>
          )}

          <input
            ref={logoInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleLogoChange}
          />
        </CardContent>
      </Card>

      {/* ── Colour mode ─────────────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Monitor className="w-4 h-4 text-primary" />
            Appearance Mode
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-2">
            {MODES.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => update({ themeMode: id })}
                className={cn(
                  "flex flex-col items-center gap-2 rounded-xl border py-4 text-sm font-medium transition-colors",
                  settings.themeMode === id
                    ? "bg-primary text-primary-foreground border-primary shadow-sm"
                    : "bg-background text-foreground border-border hover:bg-muted"
                )}
              >
                <Icon className="w-5 h-5" />
                {label}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* ── Colour theme ─────────────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Palette className="w-4 h-4 text-primary" />
            Colour Theme
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {(Object.entries(COLOR_THEMES) as [ColorTheme, typeof COLOR_THEMES[ColorTheme]][]).map(([id, t]) => (
              <button
                key={id}
                onClick={() => update({ colorTheme: id })}
                className={cn(
                  "relative flex items-center gap-3 rounded-xl border p-3 text-left transition-colors",
                  settings.colorTheme === id
                    ? "border-primary ring-2 ring-primary/30 bg-primary/5"
                    : "border-border hover:bg-muted"
                )}
              >
                <div className="flex gap-1 shrink-0">
                  {t.swatches.map((c) => (
                    <span
                      key={c}
                      className="w-5 h-5 rounded-full border border-white/20 shadow-sm"
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-semibold leading-tight truncate">{t.label}</p>
                  <p className="text-xs text-muted-foreground leading-tight truncate">{t.description}</p>
                </div>
                {settings.colorTheme === id && (
                  <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-primary" />
                )}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* ── App Icon (used as fallback when no logo) ──────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <LayoutGrid className="w-4 h-4 text-primary" />
            App Icon (Fallback)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground mb-3 leading-relaxed">
            Used when no logo is uploaded. Changes the initials shown in the sidebar.
          </p>
          <div className="flex flex-wrap gap-2">
            {(Object.entries(APP_ICONS) as [AppIcon, typeof APP_ICONS[AppIcon]][]).map(([id, icon]) => (
              <button
                key={id}
                onClick={() => update({ appIcon: id })}
                className={cn(
                  "flex flex-col items-center gap-1.5 rounded-xl border p-3 min-w-[72px] transition-colors",
                  settings.appIcon === id
                    ? "border-primary bg-primary/10"
                    : "border-border hover:bg-muted"
                )}
              >
                <div
                  className={cn(
                    "w-11 h-11 rounded-xl flex items-center justify-center font-bold text-lg",
                    settings.appIcon === id
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-foreground"
                  )}
                >
                  {icon.display}
                </div>
                <span className="text-xs text-muted-foreground">{icon.description}</span>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Resize image to max 400px tall, preserving aspect ratio */
function resizeLogo(file: File): Promise<File> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        const MAX_H = 400;
        const scale = img.height > MAX_H ? MAX_H / img.height : 1;
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) { resolve(file); return; }
        ctx.drawImage(img, 0, 0, w, h);
        canvas.toBlob(
          (blob) => {
            if (!blob) { resolve(file); return; }
            resolve(new File([blob], file.name.replace(/\.[^.]+$/, ".png"), { type: "image/png" }));
          },
          "image/png"
        );
      };
      img.src = ev.target?.result as string;
    };
    reader.readAsDataURL(file);
  });
}
