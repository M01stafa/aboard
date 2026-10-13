---
trigger: glob
globs: "apps/web/**/*.tsx, apps/web/**/*.css, apps/web/src/theme/**, apps/web/public/icons/**, vendor/circuitjs1/war/*.css, vendor/circuitjs1/war/*.html"
description: "Aboard design system: colors, typography, spacing, components and visual rules from the root DESIGN.md. Applies to all UI work."
---

# Design rules

The design system below comes from `docs/DESIGN.md` (owner-maintained). Follow it for every UI change.

- Implement design values as tokens in `apps/web/src/theme/tokens.css` (light + `[data-theme="dark"]`), then use the tokens. Never hard-code a color, font or spacing value in a component.
- The same tokens drive the shell, the PDF UI, Excalidraw's brand accents (CSS variables scoped to the board container) and the CircuitJS colors (URL params + the fork's `circuitjs.css`).
- Every layout must work in Arabic (RTL) and English (LTR): use logical CSS properties.
- Spacing and component sizes follow the 8-point grid in `.agents/rules/spacing.md`. If a spacing value in `DESIGN.md` is not a multiple of 8, ask the owner instead of using or rounding it.
- If a needed value is missing from `DESIGN.md`, do not invent one: ask the owner, or use the nearest existing token and list it in your report.
- If the text below is empty or reports a missing file, `DESIGN.md` has not been added yet: stop UI styling work and tell the owner.

---

@[DESIGN.md](../../docs/DESIGN.md)
