#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

const scanDirs = [
  path.join(rootDir, "apps/web/src"),
  path.join(rootDir, "apps/web/app"),
];

const ignoredFiles = new Set([
  path.normalize(path.join(rootDir, "apps/web/src/theme/tokens.css")),
  // Exclude whiteboard canvas drawing templates per .agents/rules/spacing.md §1
  path.normalize(path.join(rootDir, "apps/web/src/modules/board/templates.ts")),
  // Exclude rendered PDF pages per .agents/rules/spacing.md §1
  path.normalize(path.join(rootDir, "apps/web/src/modules/pdf/pdf-viewer.tsx")),
  path.normalize(path.join(rootDir, "apps/web/src/modules/pdf/pdf-text-layer.tsx")),
  path.normalize(path.join(rootDir, "apps/web/src/test/setup.ts")),
]);

function getFiles(dir) {
  let results = [];
  if (!fs.existsSync(dir)) return results;
  const list = fs.readdirSync(dir);
  for (const file of list) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      if (file !== "node_modules" && file !== ".next" && file !== "fonts") {
        results = results.concat(getFiles(fullPath));
      }
    } else if (/\.(css|tsx)$/.test(file) && !file.includes(".test.") && !file.includes(".spec.")) {
      if (!ignoredFiles.has(path.normalize(fullPath))) {
        results.push(fullPath);
      }
    }
  }
  return results;
}

const spacingProps = new Set([
  "margin", "margin-top", "margin-bottom", "margin-left", "margin-right",
  "margin-inline", "margin-inline-start", "margin-inline-end",
  "margin-block", "margin-block-start", "margin-block-end",
  "padding", "padding-top", "padding-bottom", "padding-left", "padding-right",
  "padding-inline", "padding-inline-start", "padding-inline-end",
  "padding-block", "padding-block-start", "padding-block-end",
  "gap", "row-gap", "column-gap",
  "inset", "inset-inline", "inset-inline-start", "inset-inline-end",
  "inset-block", "inset-block-start", "inset-block-end",
  "top", "bottom", "left", "right",
  // camelCase
  "marginTop", "marginBottom", "marginLeft", "marginRight",
  "marginInline", "marginInlineStart", "marginInlineEnd",
  "marginBlock", "marginBlockStart", "marginBlockEnd",
  "paddingTop", "paddingBottom", "paddingLeft", "paddingRight",
  "paddingInline", "paddingInlineStart", "paddingInlineEnd",
  "paddingBlock", "paddingBlockStart", "paddingBlockEnd",
  "rowGap", "columnGap",
  "insetInline", "insetInlineStart", "insetInlineEnd",
  "insetBlock", "insetBlockStart", "insetBlockEnd"
]);

const sizeProps = new Set([
  "width", "height", "min-width", "min-height", "max-width", "max-height",
  "inline-size", "block-size", "min-inline-size", "min-block-size",
  "max-inline-size", "max-block-size",
  // camelCase
  "minWidth", "minHeight", "maxWidth", "maxHeight",
  "inlineSize", "blockSize", "minInlineSize", "minBlockSize",
  "maxInlineSize", "maxBlockSize"
]);

function isValidSpacingValue(val) {
  const trimmed = val.trim().replace(/;$/, "");
  // Tokens
  if (/var\(--space-[a-zA-Z0-9_-]+\)/.test(trimmed)) return true;
  // Allowed exceptions per DESIGN.md §4.1: 0, auto, inherit, initial, unset, none
  if (/^(0|0px|auto|none|inherit|initial|unset)$/.test(trimmed)) return true;
  // Percentages / fluid fr
  if (/^(\d+(\.\d+)?%|\d+fr)$/.test(trimmed)) return true;
  // calc combining tokens
  if (/^calc\(.*\)$/.test(trimmed) && /var\(--space-/.test(trimmed)) return true;
  return false;
}

function isValidSizeValue(val) {
  const trimmed = val.trim().replace(/;$/, "");
  // Tokens: space, control, radius
  if (/var\(--(space|control|radius)-[a-zA-Z0-9_-]+\)/.test(trimmed)) return true;
  // Allowed exceptions per DESIGN.md §4.1: 0, auto, inherit, initial, unset, none, intrinsic
  if (/^(0|0px|auto|inherit|initial|unset|none|max-content|min-content|fit-content)$/.test(trimmed)) return true;
  // Fluid / viewport / fractions / ch
  if (/^(\d+(\.\d+)?(%|vw|vh|dvh|dvw|svh|svw|cqw|cqh|fr|ch))$/.test(trimmed)) return true;
  // Dividers / borders: 1px or 2px (DESIGN.md §4.1)
  if (/^(1px|2px)$/.test(trimmed)) return true;
  // Icons / touch targets: 16px, 24px, 32px, 48px, 64px, 320px
  if (/^(16px|24px|32px|48px|64px|320px)$/.test(trimmed)) return true;
  // Raw numbers in JSX: 0, 1, 2, 16, 24, 32, 48, 64
  if (/^(0|1|2|16|24|32|48|64)$/.test(trimmed)) return true;
  // calc combining tokens
  if (/^calc\(.*\)$/.test(trimmed) && /var\(--(space|control)/.test(trimmed)) return true;
  return false;
}

let violations = [];

for (const dir of scanDirs) {
  const files = getFiles(dir);
  for (const file of files) {
    const isCss = file.endsWith(".css");
    const relativePath = path.relative(rootDir, file).replace(/\\/g, "/");
    const content = fs.readFileSync(file, "utf8");
    const lines = content.split("\n");

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      // Skip comments or media queries
      if (trimmed.startsWith("/*") || trimmed.startsWith("//") || trimmed.startsWith("*")) continue;
      if (trimmed.startsWith("@media")) continue;

      if (isCss) {
        // Check CSS declarations: prop: value
        const cssMatch = trimmed.match(/^([a-zA-Z-]+)\s*:\s*([^;]+);?/);
        if (cssMatch) {
          const prop = cssMatch[1];
          const val = cssMatch[2].trim();

          if (spacingProps.has(prop)) {
            if (!isValidSpacingValue(val)) {
              violations.push({
                file: relativePath,
                line: i + 1,
                prop,
                val,
                reason: `Spacing property '${prop}' uses raw length '${val}' instead of var(--space-*) token or allowed exception.`
              });
            }
          } else if (sizeProps.has(prop)) {
            if (!isValidSizeValue(val)) {
              violations.push({
                file: relativePath,
                line: i + 1,
                prop,
                val,
                reason: `Size property '${prop}' uses literal '${val}' instead of token or allowed exception.`
              });
            }
          }
        }
      } else if (file.endsWith(".tsx")) {
        // Check JSX inline style objects: prop: "value" or prop: value
        const jsxMatch = trimmed.match(/\b([a-zA-Z]+)\s*:\s*["']?([^,"';}]+)["']?[,]?/);
        if (jsxMatch) {
          const prop = jsxMatch[1];
          const val = jsxMatch[2].trim();

          if (spacingProps.has(prop)) {
            if (!isValidSpacingValue(val)) {
              violations.push({
                file: relativePath,
                line: i + 1,
                prop,
                val,
                reason: `JSX style '${prop}' uses raw length '${val}' instead of var(--space-*) token.`
              });
            }
          } else if (sizeProps.has(prop)) {
            if (!isValidSizeValue(val)) {
              violations.push({
                file: relativePath,
                line: i + 1,
                prop,
                val,
                reason: `JSX style '${prop}' uses literal '${val}' instead of token.`
              });
            }
          }
        }
      }
    }
  }
}

if (violations.length > 0) {
  console.error(`\n[check-spacing] Found ${violations.length} spacing/sizing violation(s):`);
  for (const v of violations) {
    console.error(`  ${v.file}:${v.line} -> ${v.reason}`);
  }
  process.exit(1);
} else {
  console.log("[check-spacing] All spacing and sizing properties follow the 8-point grid tokens.");
  process.exit(0);
}
