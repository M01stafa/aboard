#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

const possibleSources = [
  path.join(rootDir, "apps/web/node_modules/@excalidraw/excalidraw/dist/prod/fonts"),
  path.join(rootDir, "node_modules/@excalidraw/excalidraw/dist/prod/fonts"),
];

const destDir = path.join(rootDir, "apps/web/public/fonts");

const sourceDir = possibleSources.find((p) => fs.existsSync(p));

if (!sourceDir) {
  console.error(
    `[copy-excalidraw-fonts] Error: Excalidraw font directory not found in node_modules.\nChecked:\n${possibleSources.join("\n")}`
  );
  process.exit(1);
}

fs.mkdirSync(destDir, { recursive: true });
fs.cpSync(sourceDir, destDir, { recursive: true });
console.log(`[copy-excalidraw-fonts] Successfully copied fonts from ${sourceDir} to ${destDir}`);
