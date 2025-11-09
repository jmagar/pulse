import { BrandingProfile } from "../../types/branding";
import { BrandingScriptReturn } from "./types";
import { parse, rgb, formatHex } from "culori";

function hexify(rgba: string): string | null {
  if (!rgba) return null;

  try {
    const color = parse(rgba);
    if (!color) return null;

    // Convert to RGB space
    const rgbColor = rgb(color);
    if (!rgbColor || rgbColor.mode !== "rgb") {
      return null;
    }

    let r = rgbColor.r ?? 0;
    let g = rgbColor.g ?? 0;
    let b = rgbColor.b ?? 0;
    const alpha = rgbColor.alpha ?? 1;

    if (alpha < 1) {
      r = r * alpha + (1 - alpha);
      g = g * alpha + (1 - alpha);
      b = b * alpha + (1 - alpha);
    }

    const blendedColor = { mode: "rgb" as const, r, g, b };
    const hex = formatHex(blendedColor);
    return hex ? hex.toUpperCase() : null;
  } catch (e) {
    return null;
  }
}

// Calculate contrast for text readability
function contrastYIQ(hex: string): number {
  if (!hex) return 0;
  const h = hex.replace("#", "");
  if (h.length < 6) return 0;
  const r = parseInt(h.slice(0, 2), 16),
    g = parseInt(h.slice(2, 4), 16),
    b = parseInt(h.slice(4, 6), 16);
  return (r * 299 + g * 587 + b * 114) / 1000;
}

// Infer color palette from snapshots
function inferPalette(
  snapshots: BrandingScriptReturn["snapshots"],
  cssColors: string[],
) {
  const freq = new Map<string, number>();
  const bump = (hex: string | null, weight = 1) => {
    if (!hex) return;
    freq.set(hex, (freq.get(hex) || 0) + weight);
  };

  for (const s of snapshots) {
    const area = Math.max(1, s.rect.w * s.rect.h);
    bump(hexify(s.colors.background), 0.5 + Math.log10(area + 10));
    bump(hexify(s.colors.text), 1.0);
    bump(hexify(s.colors.border), 0.3);
  }

  for (const c of cssColors) bump(hexify(c), 0.5);

  const ranked = Array.from(freq.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([h]) => h);

  const isGrayish = (hex: string) => {
    const h = hex.replace("#", "");
    if (h.length < 6) return true;
    const r = parseInt(h.slice(0, 2), 16),
      g = parseInt(h.slice(2, 4), 16),
      b = parseInt(h.slice(4, 6), 16);
    const max = Math.max(r, g, b),
      min = Math.min(r, g, b);
    return max - min < 15;
  };

  const background =
    ranked.find(h => isGrayish(h) && contrastYIQ(h) > 180) || "#FFFFFF";
  const textPrimary =
    ranked.find(h => !/^#FFFFFF$/i.test(h) && contrastYIQ(h) < 160) ||
    "#111111";
  const primary =
    ranked.find(h => !isGrayish(h) && h !== textPrimary && h !== background) ||
    "#000000";
  const accent = ranked.find(h => h !== primary && !isGrayish(h)) || primary;

  return {
    primary,
    accent,
    background,
    textPrimary: textPrimary,
    link: accent,
  };
}

// Infer spacing base unit
function inferBaseUnit(values: number[]): number {
  const vs = values
    .filter(v => Number.isFinite(v) && v > 0 && v <= 128)
    .map(v => Math.round(v));
  if (vs.length === 0) return 8;
  const candidates = [4, 6, 8, 10, 12];
  for (const c of candidates) {
    const ok =
      vs.filter(v => v % c === 0 || Math.abs((v % c) - c) <= 1 || v % c <= 1)
        .length / vs.length;
    if (ok >= 0.6) return c;
  }
  vs.sort((a, b) => a - b);
  const med = vs[Math.floor(vs.length / 2)];
  return Math.max(2, Math.min(12, Math.round(med / 2) * 2));
}

// Pick common border radius
function pickBorderRadius(radii: (number | null)[]): string {
  const rs = radii.filter((v): v is number => Number.isFinite(v));
  if (!rs.length) return "8px";
  rs.sort((a, b) => a - b);
  const med = rs[Math.floor(rs.length / 2)];
  return Math.round(med) + "px";
}

// Infer fonts list from stacks
function inferFontsList(
  fontStacks: string[][],
): Array<{ family: string; count: number }> {
  const freq: Record<string, number> = {};
  for (const stack of fontStacks) {
    for (const f of stack) {
      if (f) freq[f] = (freq[f] || 0) + 1;
    }
  }

  return Object.keys(freq)
    .sort((a, b) => freq[b] - freq[a])
    .slice(0, 10)
    .map(f => ({ family: f, count: freq[f] }));
}

// Pick logo from images
function pickLogo(images: Array<{ type: string; src: string }>): string | null {
  const byType = (t: string) => images.find(i => i.type === t)?.src;
  return (
    byType("logo") ||
    byType("logo-svg") ||
    byType("og") ||
    byType("twitter") ||
    byType("favicon") ||
    null
  );
}

// Process raw branding data into BrandingProfile
export function processRawBranding(raw: BrandingScriptReturn): BrandingProfile {
  const palette = inferPalette(raw.snapshots, raw.cssData.colors);

  // Typography
  const typography = {
    fontFamilies: {
      primary: raw.typography.stacks.body[0] || "system-ui, sans-serif",
      heading:
        raw.typography.stacks.heading[0] ||
        raw.typography.stacks.body[0] ||
        "system-ui, sans-serif",
    },
    fontStacks: raw.typography.stacks,
    fontSizes: raw.typography.sizes,
  };

  // Spacing
  const baseUnit = inferBaseUnit(raw.cssData.spacings);
  const borderRadius = pickBorderRadius([
    ...raw.snapshots.map(s => s.radius),
    ...raw.cssData.radii,
  ]);

  // Fonts list (all font stacks flattened)
  const allFontStacks = [
    ...Object.values(raw.typography.stacks).flat(),
    ...raw.snapshots.map(s => s.typography.fontStack).flat(),
  ];
  const fontsList = inferFontsList([allFontStacks]);

  // Images
  const images = {
    logo: pickLogo(raw.images),
    favicon: raw.images.find(i => i.type === "favicon")?.src || null,
    ogImage:
      raw.images.find(i => i.type === "og")?.src ||
      raw.images.find(i => i.type === "twitter")?.src ||
      null,
  };

  // Components (empty for now - LLM will populate)
  const components = {
    input: {
      borderColor: "#CCCCCC",
      borderRadius: borderRadius,
    },
  };

  const buttonSnapshots = raw.snapshots
    .filter(s => {
      if (!s.isButton) return false;
      if (s.rect.w < 30 || s.rect.h < 30) return false;
      if (!s.text || s.text.trim().length === 0) return false;

      const bgHex = hexify(s.colors.background);
      if (!bgHex) return false;

      return true;
    })
    .map(s => {
      let score = 0;

      if (s.hasCTAIndicator) score += 1000;

      const text = (s.text || "").toLowerCase();
      const ctaKeywords = [
        "sign up",
        "get started",
        "start deploying",
        "start",
        "deploy",
        "try",
        "demo",
        "contact",
        "buy",
        "subscribe",
        "join",
        "register",
        "get",
        "free",
        "join",
      ];
      if (ctaKeywords.some(kw => text.includes(kw))) score += 500;

      const bgHex = hexify(s.colors.background);
      if (
        bgHex &&
        bgHex !== "#FFFFFF" &&
        bgHex !== "#FAFAFA" &&
        bgHex !== "#F5F5F5"
      ) {
        score += 300;
      }

      if (text.length > 0 && text.length < 50) score += 100;

      const area = (s.rect.w || 0) * (s.rect.h || 0);
      score += Math.log10(area + 1) * 10;

      return { ...s, _score: score };
    })
    .sort((a: any, b: any) => (b._score || 0) - (a._score || 0))
    .slice(0, 50)
    .map((s, idx) => {
      let bgHex = hexify(s.colors.background);
      const borderHex =
        s.colors.borderWidth && s.colors.borderWidth > 0
          ? hexify(s.colors.border)
          : null;

      if (!bgHex) {
        bgHex = "transparent";
      }

      return {
        index: idx,
        text: s.text || "",
        html: "",
        classes: s.classes || "",
        background: bgHex,
        textColor: hexify(s.colors.text) || "#000000",
        borderColor: borderHex,
        borderRadius: s.radius ? `${s.radius}px` : "0px",
        shadow: s.shadow || null,
      };
    });

  return {
    colorScheme: raw.colorScheme,
    fonts: fontsList,
    colors: palette,
    typography,
    spacing: {
      baseUnit: baseUnit,
      borderRadius: borderRadius,
    },
    components,
    images,
    __button_snapshots: buttonSnapshots as any,
    __framework_hints: raw.frameworkHints as any,
  };
}
