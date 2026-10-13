---
trigger: glob
globs: "apps/web/**/*.tsx, apps/web/**/*.css, apps/web/src/theme/**, vendor/circuitjs1/war/*.css"
description: "Aboard 8-point spacing system for the website interface: every margin, padding, gap, offset and component size is 8px or a multiple of 8, through spacing tokens only. Not for canvas or document content."
---

# Spacing rules — 8-point grid

Every space in Aboard's interface is **8 px or a multiple of 8** (8, 16, 24, 32, 40, 48, 56, 64…). This is what makes the interface look aligned and consistent across the shell, the launcher, the toolbars, dialogs and settings in both languages.

## 1. Scope
Applies to the website's own interface: buttons, inputs, toolbars, tab bar, menus, dialogs, cards, panels, lists, text blocks, icons, and the layout between them (`apps/web/**`, the fork's `war/*.css`).

Does **not** apply to:
- content inside the whiteboard canvas (Excalidraw drawing), the circuit canvas, or rendered PDF pages;
- the internals of third-party components (Excalidraw's own toolbars, CircuitJS1's native dialogs, Google Picker); our wrappers around them still follow this file.

## 2. Spacing tokens (the only allowed values)
Defined once in `apps/web/src/theme/tokens.css`. Values are in `rem` so they scale with the user's browser text size; at the default root size `1rem = 16px`, so each token is an exact multiple of 8 px. Never change the root `font-size` on `html`.

```css
:root {
  --space-0: 0;
  --space-1: 0.5rem;   /*   8px */
  --space-2: 1rem;     /*  16px */
  --space-3: 1.5rem;   /*  24px */
  --space-4: 2rem;     /*  32px */
  --space-5: 2.5rem;   /*  40px */
  --space-6: 3rem;     /*  48px */
  --space-7: 3.5rem;   /*  56px */
  --space-8: 4rem;     /*  64px */
  --space-10: 5rem;    /*  80px */
  --space-12: 6rem;    /*  96px */
  --space-16: 8rem;    /* 128px */
}
```
Token `--space-N` always equals `N × 8px`. Add a larger token only as another multiple of 8.

## 3. Hard rules
1. `margin`, `padding`, `gap`, `row-gap`, `column-gap`, `inset`, `top/right/bottom/left` and their logical forms use **only** `var(--space-*)`, or `calc()` that combines tokens. No raw `px`, `rem` or `em` numbers.
2. Use logical properties so spacing flips correctly in Arabic: `padding-inline-start`, `margin-block-end`, `inset-inline-end` — never `left`/`right` variants.
3. Component sizes (height, width, min-height, min-width) are multiples of 8, using tokens.
4. `box-sizing: border-box` everywhere, so borders sit inside the box and the outer size stays on the grid.
5. If a value from `DESIGN.md` is not a multiple of 8, do not use it and do not round it silently: stop and ask the owner.
6. No "optical" one-off values (7px, 10px, 13px, 15px…). If something looks wrong, fix the structure or the line height, not the spacing.

## 4. Component sizing
| Element | Size |
|---|---|
| Button / input height | 32 (`--space-4`) compact, desktop only · 40 (`--space-5`) default · 48 (`--space-6`) large and touch |
| Button horizontal padding | 16 (`--space-2`) default · 24 (`--space-3`) large |
| Gap between icon and label inside a button | 8 (`--space-1`) |
| Icons | 16 · 24 · 32 |
| Minimum touch target (touch devices) | 48 × 48 (`--space-6`), even when the visible icon is smaller |
| Tab bar height | 40 desktop · 48 touch |
| Toolbar height | 48 |
| Dialog padding | 24 (`--space-3`) desktop · 16 (`--space-2`) mobile |
| Card / panel padding | 16 or 24 |
| Avatar / thumbnail sizes | 32 · 40 · 48 · 64 |

## 5. Spacing between elements (proximity)
Space inside a group is always smaller than space between groups.

| Relationship | Space |
|---|---|
| Label and its input; icon and text; tightly related items | 8 |
| Items in a list or a row of buttons | 8 or 16 |
| Form fields; cards in a grid | 16 or 24 |
| Groups inside a section | 24 or 32 |
| Sections on a page | 48 or 64 |
| Launcher hero / large page blocks | 64 to 128 |

Page gutters (`padding-inline` of the page container): 16 on mobile, 24 on tablet, 32 on desktop.

## 6. Text
- Font sizes come from `DESIGN.md` and are not bound by this rule.
- **Line heights** are multiples of 8 in px (16, 24, 32, 40, 48), so text sits on the same grid as everything else; set them as tokens next to the font sizes.
- Space between a heading and its text: 8 or 16. Between paragraphs: 16. Between a text block and the next component: 24.

## 7. Allowed exceptions (only these)
- Border and divider widths: 1 px or 2 px.
- Focus ring: `outline` 2 px with `outline-offset` 2 px (accessibility).
- `0` and `auto`.
- Percentages and fractions for fluid layout widths (`100%`, `1fr`, `50%`).
- Values inside third-party internals and canvas content (§1).

Anything else needs the owner's approval, recorded in `docs/PROGRESS.md` → Decisions log.

## 8. Checking
- `scripts/check-spacing.mjs` runs as part of `pnpm lint` and fails on raw length values in spacing properties and on non-token component sizes in `apps/web/**/*.css` and inline styles.
- When reviewing UI, verify with the browser's inspector that measured spaces are multiples of 8 at the default text size, in Arabic and English.
