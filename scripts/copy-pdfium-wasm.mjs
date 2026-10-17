#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

const possibleSources = [
  path.join(rootDir, "apps/web/node_modules/@embedpdf/pdfium/dist/pdfium.wasm"),
  path.join(rootDir, "node_modules/@embedpdf/pdfium/dist/pdfium.wasm"),
];

const destDir = path.join(rootDir, "apps/web/public/wasm");
const destFile = path.join(destDir, "pdfium.wasm");

const sourceFile = possibleSources.find((p) => fs.existsSync(p));

if (!sourceFile) {
  console.error(
    `[copy-pdfium-wasm] Error: PDFium WASM binary not found in node_modules.\nChecked:\n${possibleSources.join("\n")}`
  );
  process.exit(1);
}

fs.mkdirSync(destDir, { recursive: true });
fs.copyFileSync(sourceFile, destFile);
console.log(`[copy-pdfium-wasm] Successfully copied WASM from ${sourceFile} to ${destFile}`);
