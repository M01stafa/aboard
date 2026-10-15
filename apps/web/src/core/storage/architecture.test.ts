import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";

function getAllFiles(dir: string, extList: string[] = [".ts", ".tsx", ".js", ".jsx"]): string[] {
  if (!fs.existsSync(dir)) return [];
  let files: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files = files.concat(getAllFiles(fullPath, extList));
    } else if (extList.includes(path.extname(entry.name))) {
      files.push(fullPath);
    }
  }
  return files;
}

describe("Storage Architecture Boundary (Task 20 / Requirement 3)", () => {
  it("enforces that tool modules never import Dexie or db directly", () => {
    const modulesDir = path.resolve(__dirname, "../../modules");
    const moduleFiles = getAllFiles(modulesDir);

    const forbiddenPatterns = [
      /from\s+["']dexie["']/,
      /from\s+["']@\/core\/db["']/,
      /from\s+["']@\/core\/db\/.*["']/,
      /from\s+["']\.\.?\/.*\/core\/db.*["']/,
      /from\s+["']@\/core\/storage\/local-provider["']/,
    ];

    const violations: { file: string; line: string }[] = [];

    for (const filePath of moduleFiles) {
      const content = fs.readFileSync(filePath, "utf-8");
      const lines = content.split("\n");
      for (const line of lines) {
        for (const pattern of forbiddenPatterns) {
          if (pattern.test(line)) {
            violations.push({ file: path.relative(process.cwd(), filePath), line: line.trim() });
          }
        }
      }
    }

    expect(
      violations,
      `Modules must only interact with ProjectService. Found violations:\n${JSON.stringify(violations, null, 2)}`
    ).toEqual([]);
  });
});
