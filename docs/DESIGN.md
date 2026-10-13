# Aboard Design System (DESIGN.md)

> **Version:** 2.1.0 (replaces 2.0.0 and "Alpha Tech" v1.0.0; changes in section 11)
> **Product:** Aboard ("Alpha board") · **Brand family:** Alpha
> **Stack:** Next.js (App Router) + React · phone, tablet, desktop
> **Directionality:** Arabic (RTL) and English (LTR), equal priority
> **Look:** engineering-blueprint precision; royal blue + ivory; gold and tech blue as accents; gear bronze as a secondary mark
> **Fonts:** Geist (Latin) + Alexandria (Arabic), both variable 100–900

This file is the single source of truth for visual decisions. It is written for a coding agent: rules are numbered, every value is a token, and section 10 is the self-check to run before finishing any UI task.

---

## 0. Hard rules (read first)

| # | Rule |
|---|---|
| R1 | All design values live in `apps/web/src/theme/tokens.css` (copy section 9 verbatim). Components use `var(--token)` only. **NEVER** write a hex, rgb(), px font size or spacing literal inside a component. |
| R2 | Spacing and sizes use the 8-point grid (`--space-*`). There is no 4px or 12px step. Exceptions are listed in 4.1 only. |
| R3 | Layout uses logical properties only: `margin-inline-start`, `padding-block`, `inset-inline-end`, `text-align: start`, `border-inline-start`. **NEVER** `left/right` in layout CSS. |
| R4 | Text color comes only from tokens whose name ends in `-text`, `-fg`, `--text-main` or `--text-muted`. `--*-fill`, `--brand-*` and `--tech-500` are never text on light surfaces. |
| R5 | Every interactive element has a `:focus-visible` style: `outline: 2px solid var(--focus-ring); outline-offset: 2px;`. **NEVER** `outline: none` without it. |
| R6 | **NEVER** apply `letter-spacing` to Arabic text. It breaks the joins between letters. Tracking tokens apply only under `:lang(en)` (section 3.4). |
| R7 | One gold CTA per screen, maximum. |
| R8 | Hover effects only inside `@media (hover: hover)`. Transforms and shadow transitions are removed under `prefers-reduced-motion: reduce`. |
| R9 | Technical strings (code, JSON, URLs, ids, versions, voltages, page numbers) are wrapped with `dir="ltr"` (or `<bdi>`) and use Latin digits. |
| R10 | Do not restyle the content of Excalidraw, CircuitJS1 or the PDF page canvas. Theme only their chrome (section 7). |

---

## 1. Principles

1. **Engineered precision.** Everything sits on an 8px grid. Borders are 1–2px. Corners come from the radius tokens only.
2. **Connected intelligence.** Tech blue is the single "active" hue: focus, links, selected state, node highlights. On light surfaces its readable form is `--accent-text`; on dark surfaces it is `--tech-500` itself.
3. **Functional prestige.** Royal blue carries structure and primary actions. Gold is rare: the one conversion action per screen and premium marks.
4. **Readable first.** WCAG 2.2 AA in both themes. Every pair in section 8 was computed with the WCAG formula.
5. **Quiet tools.** The whiteboard, circuit and PDF canvases keep their own content colors. The shell around them is calm.

---

## 2. Color

### 2.1 Brand colors

| Token | Hex | Use |
|---|---|---|
| `--brand-primary` | `#002C8C` | Header, brand identity, light primary button |
| `--brand-gold` | `#D4AF37` | Emblem border, premium badges, the single CTA |
| `--brand-canvas` | `#EDEAE1` | Light page background (ivory) |
| `--brand-tech` | `#4F9ED5` | Tech blue: fills, glows, decorative lines, active state on dark |
| `--brand-bronze` | `#8C5835` | Secondary button, mechanical tags |
| `--brand-night` | `#050B17` | Dark page background |

`#4F9ED5` is 2.4:1 on ivory and 2.9:1 on white: it fails as text and as a thin line on light surfaces. On light use `--accent-text` (`#1A63A0`).

Naming: earlier versions called this hue "cyan" and `--brand-accent-blue`. The one name is now **tech blue**, scale `--tech-*`.

### 2.2 Scales

Defined in section 9. Every theme token below points to a scale step or is listed there with its reason. Steps added in 2.1 so no theme value is orphaned: `--blue-925 #001F66`, `--tech-800 #17598F`, `--tech-750 #1A63A0`, `--gold-600 #B89528`.

### 2.3 Theme tokens

- Light is the default and is defined on bare `:root`.
- Dark is defined on `:root[data-theme="dark"]`.
- The `data-theme` attribute is set before first paint by `next-themes` (`attribute="data-theme"`, `defaultTheme="system"`, `enableSystem`, `disableTransitionOnChange`). With no saved choice it follows `prefers-color-scheme`. Do not add a second CSS media-query copy of the dark block: one copy cannot drift.
- Each theme sets `color-scheme` so native scrollbars, date pickers and autofill match.

Token roles:

| Group | Tokens | Rule |
|---|---|---|
| Surfaces | `--bg-body`, `--bg-surface`, `--bg-subtle`, `--input-bg` | Page → card → inset/hover row → field |
| Text | `--text-main`, `--text-muted` | Muted is for secondary text, placeholders, captions |
| Edges | `--border-card` (decorative, ~1.5:1), `--border-input` (control edge, ≥3:1) | Inputs, checkboxes, toggles use `--border-input` |
| Active | `--accent-text`, `--accent-text-strong`, `--focus-ring` | Strong is for text sitting on a tech-blue tint |
| Status | `--{success,warning,danger,info}-{text,bg,fill}` | `-text` on `-bg`; `-fill` for icons and dots next to a text label |
| Badges | `--badge-{primary,gold,tech,bronze}-{bg,fg,bd}` | Always as a set |
| Buttons | `--btn-{primary,gold,bronze}-*`, `--btn-outline-*` | Section 5.1 |

`--*-fill` colors are never the only carrier of meaning and never text (light info fill is 2.9:1 on white).

---

## 3. Typography

### 3.1 Families

Two variable families, one stack. Latin glyphs render in Geist; Arabic glyphs are not in Geist, so the browser falls back to Alexandria for them, per character. This gives one consistent Latin face in both directions and needs no per-language font switch.

| Role | Family | Why |
|---|---|---|
| Latin UI, headings, numbers, ids, badges | **Geist** (Vercel, OFL-1.1), variable `wght` 100–900 | Built for developer/AI products; precise, neutral, tabular figures |
| Arabic UI and headings | **Alexandria** (Mohamed Gaber & Julieta Ulanovsky, OFL-1.1), variable `wght` 100–900 | Geometric, Kufi-influenced construction that matches the engineering look; same weight range as Geist, so `font-weight: 600` means the same thing in both scripts |
| Code, JSON, server output | System monospace stack | No extra download |

Loading: both fonts are self-hosted from `apps/web/src/theme/fonts/` with `next/font/local`. No package, no request to any font CDN. Only two files ship:

| File | Covers | Why only this one |
|---|---|---|
| `fonts/geist/geist-latin-wght-normal.woff2` | Basic Latin + Latin-1 (all English UI) | Latin-ext, Cyrillic, Vietnamese are not used. Italic is not used (3.4). |
| `fonts/alexandria/alexandria-arabic-wght-normal.woff2` | Arabic script | Latin glyphs come from Geist |

```ts
// apps/web/src/theme/fonts.ts
import localFont from 'next/font/local';

export const geist = localFont({
  src: './fonts/geist/geist-latin-wght-normal.woff2',
  weight: '100 900',
  style: 'normal',
  display: 'swap',
  variable: '--font-geist-sans',
});

export const alexandria = localFont({
  src: './fonts/alexandria/alexandria-arabic-wght-normal.woff2',
  weight: '100 900',
  style: 'normal',
  display: 'swap',
  variable: '--font-alexandria',
  declarations: [{
    prop: 'unicode-range',
    value: 'U+0600-06FF, U+0750-077F, U+0870-08FF, U+200C-200E, U+2010-2011, U+204F, U+2E41, U+FB50-FDFF, U+FE70-FEFF',
  }],
});

export const fontClassNames = `${geist.variable} ${alexandria.variable}`;
// app/layout.tsx: <html lang={lang} dir={dir} className={fontClassNames} suppressHydrationWarning>
```

Each font folder keeps its `OFL.txt` license. To support another script later (Cyrillic, Vietnamese), add that subset file as a separate `localFont` with its own `unicode-range`, never as a second `src` entry with the same weight and style.

```css
--font-sans: var(--font-geist-sans), var(--font-alexandria), system-ui, -apple-system, 'Segoe UI', sans-serif;
--font-mono: ui-monospace, 'SF Mono', Menlo, Consolas, 'Liberation Mono', monospace;
```

`body { font-family: var(--font-sans); }`. Do not create other font-family values.

### 3.2 Weights

Variable fonts allow any value, but the UI uses only these tokens: `--weight-regular: 400` · `--weight-medium: 500` · `--weight-semibold: 600` · `--weight-bold: 700`. 800–900 is reserved for the logotype and hero display only.

### 3.3 Scale

Sizes and line heights in rem (1rem = 16px). Every line height is a multiple of 8px. Mobile applies below 640px.

| Style | Desktop size / line | Mobile size / line | Weight | Tracking (LTR only) |
|---|---|---|---|---|
| Display | 3rem / 3.5rem (48/56) | 2rem / 2.5rem (32/40) | 700 | -0.02em |
| Heading 1 | 2rem / 2.5rem (32/40) | 1.625rem / 2rem (26/32) | 700 | -0.01em |
| Heading 2 | 1.5rem / 2rem (24/32) | 1.25rem / 1.5rem (20/24) | 600 | 0 |
| Heading 3 | 1.125rem / 1.5rem (18/24) | 1.125rem / 1.5rem (18/24) | 600 | 0 |
| Body Large | 1.25rem / 2rem (20/32) | 1rem / 1.5rem (16/24) | 400 | 0 |
| Body | 1rem / 1.5rem (16/24) | 1rem / 1.5rem (16/24) | 400 | 0 |
| Label | 0.875rem / 1.5rem (14/24) | same | 500 | +0.01em |
| Micro | 0.75rem / 1rem (12/16) | same | 600 | +0.03em |
| Code | 0.875rem / 1.5rem (14/24) | same | 400 | 0 (monospace) |

### 3.4 Arabic adjustments

1. Tracking is LTR only: `:lang(en) { letter-spacing: var(--tracking-*) }`; Arabic is always `letter-spacing: 0`.
2. Arabic headings need room for tall letters and marks. Under `:lang(ar)`, Display and Heading 1 add 8px to the line height (Display 64 desktop / 48 mobile; H1 48 / 40). Still on the grid.
3. Arabic text is never smaller than 14px. Under `:lang(ar)` the Micro style becomes Label size (0.875rem / 1.5rem). Badges keep their 24px height.
4. Do not use synthetic bold or italic. Arabic has no italic; emphasise with weight.

### 3.5 Numbers and technical text

- `font-variant-numeric: tabular-nums` on tables, KPIs, timers, coordinates, any column of digits.
- Technical values (voltages, ids, versions, page numbers) use Latin digits and sit in `dir="ltr"` (R9).
- Form fields are at least 16px (prevents iOS zoom). Running text stays near 65 characters wide (`max-inline-size: 65ch`).

---

## 4. Spacing, layout, geometry

### 4.1 Spacing (8-point grid)

`--space-1` 8 · `--space-2` 16 (standard padding) · `--space-3` 24 (card padding, gutter) · `--space-4` 32 (section rhythm) · `--space-5` 40 · `--space-6` 48 · `--space-7` 56 · `--space-8` 64 (hero) · `--space-10` 80 · `--space-12` 96 · `--space-16` 128.

Allowed non-grid values, and only these: `0`, `auto`, `%`, `fr`, `ch`; borders and dividers of 1–2px; the focus outline and its offset (2px); offsets and blur inside the `--shadow-*` and `--glow-*` tokens; the card hover lift `translateY(-2px)`; third-party internals (Excalidraw, CircuitJS, PDF canvas).

### 4.2 Controls and icons

- Control heights: `--control-sm` 32 · `--control-md` 40 (default) · `--control-lg` 48. On `(pointer: coarse)` every control uses 48. Touch targets are at least 48×48.
- Controls are `display: inline-flex; align-items: center; block-size: var(--control-*); padding-block: 0; padding-inline: var(--space-2); box-sizing: border-box`. Height is fixed, so the border never adds to it and the 32px size works with a 24px line.
- Icons: 16 · 24 · 32, stroke icons drawn with `currentColor`.
- Workspace (proposed, confirm when built): tab bar 48 high, pane toolbar 48 high, split divider 8px hit area with a 2px visible line, minimum pane width 320.

### 4.3 Breakpoints

`sm 640` · `md 768` · `lg 1024` · `xl 1280` · `2xl 1536`. CSS custom properties cannot be used inside `@media`, so breakpoints live in `apps/web/src/theme/breakpoints.ts` and are written as literal `px` in media queries (`@media (min-width: 768px)`). Split view is disabled below `md`.

### 4.4 Radii

`--radius-sm` 8 (inputs, buttons, menus, tooltips) · `--radius-md` 16 (cards, dialogs) · `--radius-lg` 24 (hero panels, sheets) · `--radius-full` 9999px (badges, avatars, pills).

### 4.5 Elevation

`--shadow-1` resting cards · `--shadow-2` hover · `--shadow-3` dialogs, menus, popovers. Glows (`--glow-tech`, `--glow-gold`) are for hover on the matching button only, never at rest.

### 4.6 Motion

`--motion-fast` 150ms (color, background, border) · `--motion-base` 200ms (transform, shadow) · `--ease-standard: cubic-bezier(.2,0,0,1)`. Under `prefers-reduced-motion: reduce`: no transforms, no shadow transitions, colors may still fade.

---

## 5. Components

Shared: focus per R5 using `:focus-visible`. Hover per R8.

### 5.1 Buttons

Control `--control-md`, radius `--radius-sm`, Label style at 600, transition `background-color, border-color, color var(--motion-fast) var(--ease-standard), box-shadow var(--motion-base) var(--ease-standard)`.

| Variant | Rest | Hover | Active |
|---|---|---|---|
| Primary | bg `--btn-primary-bg`, text `--btn-primary-text` | bg `--btn-primary-hover`, `--shadow-2` | bg `--btn-primary-active` |
| Gold CTA (R7) | bg `--btn-gold-bg`, text `--btn-gold-text` | bg `--btn-gold-hover`, `--glow-gold` | bg `--btn-gold-active` |
| Tech outline | 2px solid `--accent-text`, transparent bg, text `--accent-text` | bg `--btn-outline-hover-bg`, text `--accent-text-strong`, `--glow-tech` | bg `--btn-outline-active-bg`, text `--accent-text-strong` |
| Bronze | bg `--btn-bronze-bg`, text `--btn-bronze-text` | bg `--btn-bronze-hover` | bg `--btn-bronze-hover` |
| Disabled (any) | bg `--bg-subtle`, 1px solid `--border-card`, text `--text-muted`, `cursor: not-allowed` | none | none |

Disabled has no extra opacity: the muted text stays readable (5.1:1). Use the `disabled` attribute on `<button>`, `aria-disabled="true"` on links.

### 5.2 Badges

Pill (`--radius-full`), Micro style (Label under `:lang(ar)`), `block-size: 24px` with content centered, `padding-inline: var(--space-1)`, 1px border. Colors from one `--badge-*` set. Status badges use `--{status}-text` on `--{status}-bg` and always carry a text label.

### 5.3 Form fields

`--control-md` (48 on coarse pointers), `padding-inline: var(--space-2)`, radius `--radius-sm`, 1px solid `--border-input`, bg `--input-bg`, text Body (16px). Placeholder `--text-muted`. Focus: border `--focus-ring` plus the R5 outline. Error: border `--danger-text`, message below in `--danger-text` with an icon, linked by `aria-describedby`. Labels sit above the field in Label style, always a real `<label>`.

### 5.4 Cards

bg `--bg-surface`, 1px solid `--border-card`, radius `--radius-md`, padding `--space-3`, `--shadow-1`, `overflow: hidden` (so the accent line follows the corners). Top accent line: `::before`, `block-size: 2px`, `background: var(--gradient-accent)`, decorative. The gradient runs gold → tech blue → royal blue from the inline start, so it flips in RTL (`--gradient-accent` is redefined under `[dir="rtl"]`). Only interactive cards hover: `translateY(-2px)` and `--shadow-2`.

### 5.5 Overlays

Dialog and menu: bg `--bg-surface`, 1px `--border-card`, `--shadow-3`, radius `--radius-lg` (dialog) or `--radius-sm` (menu). Backdrop `--overlay-backdrop`. Dialogs trap focus, close on Esc, return focus to the opener, and use `role="dialog"` + `aria-modal="true"` + a labelled title.

---

## 6. Right-to-left and bidirectional rules

1. `<html lang dir>` follows the chosen language (`ar` → `rtl`, `en` → `ltr`). Layout follows R3.
2. Mirror directional icons (back, forward, carets, breadcrumbs, progress): `[dir="rtl"] .icon-directional { transform: scaleX(-1); }`. Do not mirror clocks, media play, checkmarks, the logo, the "A" emblem or the gear network.
3. Code, JSON, URLs, ids and circuit values stay LTR (R9).
4. Fonts need no switching: the single `--font-sans` stack covers both scripts (3.1). Arabic rules in 3.4.
5. Gradients and shadows with a horizontal direction get an RTL override token (example: `--gradient-accent`).

---

## 7. Embedded tools

- The shell, tab bar, toolbars, dialogs and the PDF UI use the tokens above.
- Excalidraw, CircuitJS1 and the PDF page canvas keep their own content colors. Only their chrome follows the theme (Excalidraw CSS variables scoped to the board container, CircuitJS color URL parameters). Exact variable and parameter names are confirmed while building those modules (`docs/PROGRESS.md` V03).
- Every pane has `background: var(--bg-surface)` behind it so loading never flashes white in dark mode.

---

## 8. Contrast (WCAG 2.2, computed)

Text needs 4.5:1; large text, control edges and meaningful icons need 3:1. Tinted backgrounds were composited over the named surface before measuring.

| Pair | Light | Dark |
|---|---|---|
| `--text-main` on body / surface / subtle | 15.3 / 18.4 / 16.6 | 16.4 / 15.0 / 12.9 |
| `--text-muted` on body / surface / subtle | 4.7 / 5.7 / 5.1 | 7.6 / 7.0 / 6.0 |
| `--accent-text` on body / surface / subtle | 5.2 / 6.3 / 5.7 | 6.7 / 6.2 / 5.3 |
| Outline button hover / active text on its tint (over body) | 5.5 / 5.2 | 9.1 / 8.0 |
| `--focus-ring` on body / subtle | 5.2 / 5.7 | 6.7 / 5.3 |
| Primary button text (rest / hover / active) | 12.1 / 15.1 / 18.1 | 6.2 / 8.0 / 9.8 |
| Gold button text (rest / hover / active) | 8.6 / 6.3 / 5.2 | same |
| Bronze button text (rest / hover) | 5.9 / 8.6 | same |
| `--border-input` on input bg / body | 4.0 / 3.4 | 4.4 / 4.6 |
| Status text on its bg (success, warning, danger, info) | 6.8, 6.4, 5.5, 6.6 | 7.2, 8.2, 5.4, 7.8 |
| Badge text on its bg over surface (primary, gold, tech, bronze) | 9.6, 5.8, 6.4, 7.0 | 6.3, 8.9, 7.5, 6.9 |
| Badge text on its bg over body | 8.1, 5.0, 5.4, 5.9 | 7.2, 10.0, 8.5, 7.8 |

Known and accepted:
- Dark primary button boundary against the card is 2.9:1 (3.2 on body). Its label (6.2:1) identifies it; hover and focus add contrast.
- `--border-card` is decorative (1.6 light, 1.4 dark). Never use it as the only edge of a control.
- Light `--info-fill` (2.9:1) and `--warning-fill` (3.2:1) are only used beside a text label.

---

## 9. tokens.css (copy verbatim)

```css
/* apps/web/src/theme/tokens.css — generated from DESIGN.md v2.1.0. Edit DESIGN.md first. */
:root {
  /* ---------- scales ---------- */
  --blue-950:#00133E; --blue-925:#001F66; --blue-900:#002C8C; --blue-800:#0F3BA0; --blue-700:#1A47B8;
  --blue-600:#2558D0; --blue-500:#3B72F2; --blue-300:#8FB2FF; --blue-100:#E6EDFF;

  --tech-950:#0B253A; --tech-900:#143E5E; --tech-800:#17598F; --tech-750:#1A63A0; --tech-700:#29709F;
  --tech-500:#4F9ED5; --tech-300:#8BC4EC; --tech-100:#EAF4FB;

  --gold-900:#745B11; --gold-700:#A88622; --gold-600:#B89528; --gold-500:#D4AF37; --gold-300:#E7CF7E; --gold-100:#FAF5E3;

  --bronze-700:#6B4226; --bronze-500:#8C5835; --bronze-300:#B88564; --bronze-200:#D9A98A;

  --slate-900:#0F172A; --slate-700:#334155; --slate-500:#64748B; --slate-300:#CBD5E1; --slate-100:#F1F5F9;

  /* ---------- brand ---------- */
  --brand-primary:var(--blue-900); --brand-gold:var(--gold-500); --brand-canvas:#EDEAE1;
  --brand-tech:var(--tech-500); --brand-bronze:var(--bronze-500); --brand-night:#050B17;

  /* ---------- typography ---------- */
  --font-sans:var(--font-geist-sans), var(--font-alexandria), system-ui, -apple-system, 'Segoe UI', sans-serif;
  --font-mono:ui-monospace, 'SF Mono', Menlo, Consolas, 'Liberation Mono', monospace;
  --weight-regular:400; --weight-medium:500; --weight-semibold:600; --weight-bold:700;
  --tracking-display:-0.02em; --tracking-h1:-0.01em; --tracking-label:0.01em; --tracking-micro:0.03em;

  /* ---------- spacing, size, radius, motion ---------- */
  --space-1:0.5rem; --space-2:1rem; --space-3:1.5rem; --space-4:2rem; --space-5:2.5rem; --space-6:3rem;
  --space-7:3.5rem; --space-8:4rem; --space-10:5rem; --space-12:6rem; --space-16:8rem;
  --control-sm:2rem; --control-md:2.5rem; --control-lg:3rem;
  --radius-sm:0.5rem; --radius-md:1rem; --radius-lg:1.5rem; --radius-full:9999px;
  --motion-fast:150ms; --motion-base:200ms; --ease-standard:cubic-bezier(.2,0,0,1);

  /* ---------- light theme (default) ---------- */
  color-scheme:light;
  --bg-body:var(--brand-canvas); --bg-surface:#FFFFFF; --bg-subtle:#F5F3EC; --input-bg:#FFFFFF;
  --text-main:#0B132B; --text-muted:#5C677D;
  --border-card:#D5CEBE; --border-input:#857E6D;

  --accent-text:var(--tech-750); --accent-text-strong:var(--tech-800); --focus-ring:var(--tech-750);

  --btn-primary-bg:var(--blue-900); --btn-primary-hover:var(--blue-925); --btn-primary-active:var(--blue-950); --btn-primary-text:#FFFFFF;
  --btn-gold-bg:var(--gold-500); --btn-gold-hover:var(--gold-600); --btn-gold-active:var(--gold-700); --btn-gold-text:var(--blue-950);
  --btn-bronze-bg:var(--bronze-500); --btn-bronze-hover:var(--bronze-700); --btn-bronze-text:#FFFFFF;
  --btn-outline-hover-bg:rgba(79,158,213,.12); --btn-outline-active-bg:rgba(79,158,213,.20);

  --success-text:#065F46; --success-bg:#DEF7EC; --success-fill:#0E9F6E;
  --warning-text:#92400E; --warning-bg:#FEF3C7; --warning-fill:#D97706;
  --danger-text:#B91C1C;  --danger-bg:#FDE8E8;  --danger-fill:#E02424;
  --info-text:var(--tech-800); --info-bg:var(--tech-100); --info-fill:var(--tech-500);

  --badge-primary-bg:rgba(0,44,140,.12);  --badge-primary-fg:var(--blue-900);  --badge-primary-bd:rgba(0,44,140,.20);
  --badge-gold-bg:rgba(212,175,55,.15);   --badge-gold-fg:var(--gold-900);     --badge-gold-bd:var(--gold-500);
  --badge-tech-bg:rgba(79,158,213,.15);   --badge-tech-fg:var(--tech-800);     --badge-tech-bd:var(--tech-500);
  --badge-bronze-bg:rgba(140,88,53,.15);  --badge-bronze-fg:var(--bronze-700); --badge-bronze-bd:var(--bronze-500);

  --shadow-1:0 1px 3px rgba(0,44,140,.08);
  --shadow-2:0 4px 12px rgba(0,44,140,.14);
  --shadow-3:0 12px 28px rgba(5,11,23,.22);
  --glow-tech:0 0 16px rgba(79,158,213,.40);
  --glow-gold:0 0 18px rgba(212,175,55,.35);
  --overlay-backdrop:rgba(5,11,23,.60);
  --gradient-accent:linear-gradient(90deg, var(--gold-500), var(--tech-500), var(--blue-900));
}
[dir="rtl"] { --gradient-accent:linear-gradient(270deg, var(--gold-500), var(--tech-500), var(--blue-900)); }

:root[data-theme="dark"] {
  color-scheme:dark;
  --bg-body:var(--brand-night); --bg-surface:#0C162C; --bg-subtle:#142343; --input-bg:#081021;
  --text-main:#EDEAE1; --text-muted:#8FA2C4;
  --border-card:#1B2F58; --border-input:#5E7BAE;

  --accent-text:var(--tech-500); --accent-text-strong:var(--tech-300); --focus-ring:var(--tech-500);

  --btn-primary-bg:var(--blue-600); --btn-primary-hover:var(--blue-700); --btn-primary-active:var(--blue-800); --btn-primary-text:#FFFFFF;
  --btn-outline-hover-bg:rgba(79,158,213,.12); --btn-outline-active-bg:rgba(79,158,213,.20);

  --success-text:#34D399; --success-bg:rgba(52,211,153,.14);  --success-fill:#0E9F6E;
  --warning-text:#FBBF24; --warning-bg:rgba(251,191,36,.14);  --warning-fill:#D97706;
  --danger-text:#F87171;  --danger-bg:rgba(248,113,113,.14);  --danger-fill:#E02424;
  --info-text:var(--tech-300); --info-bg:rgba(79,158,213,.14); --info-fill:var(--tech-500);

  --badge-primary-bg:rgba(143,178,255,.16); --badge-primary-fg:var(--blue-300);   --badge-primary-bd:rgba(143,178,255,.40);
  --badge-gold-bg:rgba(212,175,55,.16);     --badge-gold-fg:var(--gold-300);      --badge-gold-bd:rgba(212,175,55,.50);
  --badge-tech-bg:rgba(79,158,213,.16);     --badge-tech-fg:var(--tech-300);      --badge-tech-bd:rgba(79,158,213,.50);
  --badge-bronze-bg:rgba(184,133,100,.16);  --badge-bronze-fg:var(--bronze-200);  --badge-bronze-bd:rgba(184,133,100,.50);

  --shadow-1:0 1px 3px rgba(0,0,0,.40);
  --shadow-2:0 4px 12px rgba(0,0,0,.45);
  --shadow-3:0 12px 28px rgba(0,0,0,.60);
  --glow-tech:0 0 16px rgba(79,158,213,.40);
  --glow-gold:0 0 18px rgba(212,175,55,.35);
  --overlay-backdrop:rgba(0,0,0,.65);
}

/* ---------- base ---------- */
html { background:var(--bg-body); color:var(--text-main); font-family:var(--font-sans); }
:lang(ar) { letter-spacing:0 !important; }                  /* R6 */
:focus-visible { outline:2px solid var(--focus-ring); outline-offset:2px; }   /* R5 */
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { transition-property:color, background-color, border-color !important; animation:none !important; }
}
```

---

## 10. Agent self-check (run before finishing any UI task)

- [ ] `grep -nE '#[0-9a-fA-F]{3,8}\b|rgba?\(' ` on changed component files returns nothing (tokens.css excepted).
- [ ] No `margin-left|margin-right|padding-left|padding-right|left:|right:|text-align: left|text-align: right` in layout CSS.
- [ ] Every spacing value is a `--space-*` token or an allowed exception from 4.1.
- [ ] No `letter-spacing` reaches Arabic text; no Arabic text below 14px.
- [ ] Only `--font-sans` and `--font-mono` are used; weights are 400/500/600/700 tokens.
- [ ] Every interactive element shows a `:focus-visible` outline; tab order is logical in both directions.
- [ ] Screen checked in light and dark, in `ar` and `en`, at 375px and 1280px.
- [ ] At most one gold CTA on the screen.
- [ ] Hover styles are inside `@media (hover: hover)`; reduced motion removes transforms.
- [ ] Any new color pair is added to section 8 with its computed ratio.

---

## 11. Changelog

**2.1.0**
- Fonts: replaced IBM Plex Sans Arabic + Inter + Space Grotesk with two variable families, Geist and Alexandria (100–900), in one fallback stack. Removed the never-loaded `Tajawal` fallback and `--font-tech`.
- Fonts are self-hosted with `next/font/local` from `apps/web/src/theme/fonts/`: one Latin subset file for Geist, one Arabic subset file for Alexandria with a matching `unicode-range`. (The old note passed `subsets` to `next/font/local`, which has no such option.)
- Added the missing Arabic rules: no letter-spacing, taller heading line heights, 14px minimum.
- Split "Micro / Code": code no longer gets 600 weight or tracking.
- Theme: `prefers-color-scheme` was promised but never implemented; now handled by `next-themes` before paint. Added `color-scheme`. Dark theme now defines its own fills and glows.
- Removed every hard-coded color from component specs (gold, bronze, outline, backdrop, gradient) by adding tokens and the missing scale steps.
- Outline button: active state on the body background was 4.4:1 (fails); hover and active text now use `--accent-text-strong` (5.2:1 or better).
- Disabled button: removed the extra `opacity .55` that dropped text to 2.3:1.
- Controls: 8px block padding + 24px line made the 32px compact size impossible; controls now use fixed height with centered content.
- Allowed-exceptions list now covers shadow offsets/blur and the 2px hover lift that were already in use.
- Breakpoints can't be CSS variables inside `@media`; now a TS constant with literal px queries.
- Focus uses `:focus-visible`; hover is gated by `(hover: hover)`; card accent line flips in RTL and clips to the radius.
- Contrast table: corrected dark `--border-input` (4.4, was 4.5) and added the missing rows (subtle surfaces, focus ring, button states, badges over body).
- Renamed "cyan" / `--brand-accent-blue` to tech blue / `--brand-tech`; `--brand-gear-bronze` to `--brand-bronze`; `--brand-dark-bg` to `--brand-night`.
