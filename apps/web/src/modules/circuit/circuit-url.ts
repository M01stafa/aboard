import type { CircuitUrlOptions } from "./types";

/**
 * Builds the URL for embedding CircuitJS1 in a same-origin iframe with the required parameters.
 * Conforms to docs/specs/modules.md §7.2 and DESIGN.md theme tokens.
 *
 * Parameters passed:
 * - hideMenu, hideSidebar, hideInfoBox, running, editable, lang
 * - whiteBackground: true for light theme, false for dark theme
 * - positiveColor, negativeColor, selectColor, currentColor: brand-aligned hex colors
 */
export function buildCircuitUrl(options: CircuitUrlOptions = {}): string {
  const isLight = options.theme !== "dark";
  const lang = options.lang === "ar" ? "ar" : "en";
  const hideMenu = options.hideMenu ?? false;
  const hideSidebar = options.hideSidebar ?? false;
  const hideInfoBox = options.hideInfoBox ?? false;
  const running = options.running ?? true;
  const editable = options.editable ?? true;

  const params = new URLSearchParams();
  params.set("hideMenu", String(hideMenu));
  params.set("hideSidebar", String(hideSidebar));
  params.set("hideInfoBox", String(hideInfoBox));
  params.set("whiteBackground", String(isLight));

  // Brand and theme colors per DESIGN.md §2 and §7
  if (isLight) {
    params.set("positiveColor", options.positiveColor ?? "#0E9F6E"); // green / success
    params.set("negativeColor", options.negativeColor ?? "#E02424"); // red / danger
    params.set("selectColor", options.selectColor ?? "#4F9ED5");     // tech blue
    params.set("currentColor", options.currentColor ?? "#D4AF37");   // brand gold
  } else {
    params.set("positiveColor", options.positiveColor ?? "#34D399"); // bright green for dark surface
    params.set("negativeColor", options.negativeColor ?? "#F87171"); // bright red for dark surface
    params.set("selectColor", options.selectColor ?? "#4F9ED5");     // tech blue
    params.set("currentColor", options.currentColor ?? "#FBBF24");   // bright gold for dark surface
  }

  params.set("running", String(running));
  params.set("lang", lang);
  params.set("editable", String(editable));

  return `/circuit/circuitjs.html?${params.toString()}`;
}
