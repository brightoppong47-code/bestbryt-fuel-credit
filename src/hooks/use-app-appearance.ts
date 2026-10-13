/**
 * Manages app appearance: colour theme and app icon (favicon).
 * Settings are persisted in localStorage so they survive refreshes.
 */

import { useEffect, useState } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

export type ThemeMode = "light" | "dark" | "system";

export type ColorTheme =
  | "navy"      // current default — deep navy / blue
  | "forest"    // deep green
  | "ember"     // warm amber / orange
  | "slate"     // neutral slate grey
  | "crimson"   // bold red
  | "violet";   // purple

export type AppIcon = "BB" | "BV" | "F" | "G" | "S";

export interface AppearanceSettings {
  themeMode: ThemeMode;
  colorTheme: ColorTheme;
  appIcon: AppIcon;
  logoDataUrl?: string; // base64 data URL of the uploaded logo image
}

const STORAGE_KEY = "bbv-appearance";

const DEFAULTS: AppearanceSettings = {
  themeMode: "system",
  colorTheme: "navy",
  appIcon: "BB",
};

// ─── Theme CSS variable sets ──────────────────────────────────────────────────

const COLOR_THEMES: Record<ColorTheme, {
  label: string;
  description: string;
  primary: string;
  primaryFg: string;
  accent: string;
  accentFg: string;
  ring: string;
  swatches: string[];
}> = {
  navy: {
    label: "Navy Blue",
    description: "Professional deep blue (default)",
    primary: "oklch(0.62 0.19 259.81)",
    primaryFg: "oklch(1.00 0 0)",
    accent: "oklch(0.95 0.03 236.82)",
    accentFg: "oklch(0.38 0.14 265.52)",
    ring: "oklch(0.62 0.19 259.81)",
    swatches: ["#2d5be3", "#1e3a8a"],
  },
  forest: {
    label: "Forest Green",
    description: "Earthy and natural",
    primary: "oklch(0.52 0.15 155)",
    primaryFg: "oklch(1.00 0 0)",
    accent: "oklch(0.93 0.05 150)",
    accentFg: "oklch(0.30 0.12 155)",
    ring: "oklch(0.52 0.15 155)",
    swatches: ["#16a34a", "#14532d"],
  },
  ember: {
    label: "Ember Orange",
    description: "Bold, energetic warmth",
    primary: "oklch(0.65 0.20 50)",
    primaryFg: "oklch(1.00 0 0)",
    accent: "oklch(0.94 0.06 55)",
    accentFg: "oklch(0.35 0.15 50)",
    ring: "oklch(0.65 0.20 50)",
    swatches: ["#ea580c", "#9a3412"],
  },
  slate: {
    label: "Slate Grey",
    description: "Minimal and understated",
    primary: "oklch(0.50 0.04 250)",
    primaryFg: "oklch(1.00 0 0)",
    accent: "oklch(0.93 0.02 250)",
    accentFg: "oklch(0.30 0.04 250)",
    ring: "oklch(0.50 0.04 250)",
    swatches: ["#475569", "#1e293b"],
  },
  crimson: {
    label: "Crimson Red",
    description: "Strong and commanding",
    primary: "oklch(0.56 0.22 25)",
    primaryFg: "oklch(1.00 0 0)",
    accent: "oklch(0.94 0.06 25)",
    accentFg: "oklch(0.30 0.18 25)",
    ring: "oklch(0.56 0.22 25)",
    swatches: ["#dc2626", "#7f1d1d"],
  },
  violet: {
    label: "Violet Purple",
    description: "Creative and modern",
    primary: "oklch(0.58 0.22 300)",
    primaryFg: "oklch(1.00 0 0)",
    accent: "oklch(0.93 0.06 298)",
    accentFg: "oklch(0.30 0.17 300)",
    ring: "oklch(0.58 0.22 300)",
    swatches: ["#7c3aed", "#4c1d95"],
  },
};

export { COLOR_THEMES };

export const APP_ICONS: Record<AppIcon, { label: string; display: string; description: string }> = {
  BB: { label: "BB", display: "BB", description: "BESTBRYT (default)" },
  BV: { label: "BV", display: "BV", description: "BESTBRYT VENTURES" },
  F:  { label: "F",  display: "F",  description: "Fuel" },
  G:  { label: "G",  display: "G",  description: "Ghana" },
  S:  { label: "S",  display: "S",  description: "Secretary / Staff" },
};

// ─── Hook ─────────────────────────────────────────────────────────────────────

function loadSettings(): AppearanceSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULTS;
    return { ...DEFAULTS, ...JSON.parse(raw) as Partial<AppearanceSettings> };
  } catch {
    return DEFAULTS;
  }
}

function saveSettings(s: AppearanceSettings) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
}

/** Apply a color theme to the document root */
function applyColorTheme(theme: ColorTheme) {
  const t = COLOR_THEMES[theme];
  const root = document.documentElement;
  root.style.setProperty("--primary", t.primary);
  root.style.setProperty("--primary-foreground", t.primaryFg);
  root.style.setProperty("--accent", t.accent);
  root.style.setProperty("--accent-foreground", t.accentFg);
  root.style.setProperty("--ring", t.ring);
  // Also update sidebar vars to match
  root.style.setProperty("--sidebar-primary", t.primary);
  root.style.setProperty("--sidebar-primary-foreground", t.primaryFg);
  root.style.setProperty("--sidebar-accent", t.accent);
  root.style.setProperty("--sidebar-accent-foreground", t.accentFg);
  root.style.setProperty("--sidebar-ring", t.ring);
}

/** Apply dark / light / system mode */
function applyThemeMode(mode: ThemeMode) {
  const root = document.documentElement;
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const isDark = mode === "dark" || (mode === "system" && prefersDark);
  root.classList.toggle("dark", isDark);
}

export function useAppAppearance() {
  const [settings, setSettings] = useState<AppearanceSettings>(loadSettings);

  // Apply on mount and whenever settings change
  useEffect(() => {
    applyColorTheme(settings.colorTheme);
    applyThemeMode(settings.themeMode);
    saveSettings(settings);
  }, [settings]);

  // Keep system-mode in sync with OS changes
  useEffect(() => {
    if (settings.themeMode !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => applyThemeMode("system");
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [settings.themeMode]);

  const update = (partial: Partial<AppearanceSettings>) => {
    setSettings((prev) => ({ ...prev, ...partial }));
  };

  return { settings, update };
}
