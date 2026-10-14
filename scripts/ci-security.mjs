import { execSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const nextDir = path.join(repoRoot, "apps", "web", ".next");

console.log("=== Aboard CI Security Checks (SEC-5, SEC-10) ===\n");

let failed = false;

// 1. Run gitleaks across repo history and uncommitted/staged files
console.log("[1/3] Running Gitleaks scan (detect --redact --verbose)...");
try {
  execSync("gitleaks detect --redact --verbose", {
    cwd: repoRoot,
    stdio: "inherit",
  });
  // Also scan staged and working tree changes if any
  try {
    execSync("gitleaks protect --staged --redact --verbose", {
      cwd: repoRoot,
      stdio: "inherit",
    });
  } catch (err) {
    throw err;
  }
  console.log("✓ Gitleaks scan passed: no leaks detected.\n");
} catch (err) {
  console.error("✗ Gitleaks scan FAILED: secrets detected in repository history or staged files!\n");
  failed = true;
}

// 2. Run dependency audit
console.log("[2/3] Running production dependency audit (pnpm audit --prod --audit-level=high)...");
try {
  execSync("pnpm audit --prod --audit-level=high", {
    cwd: repoRoot,
    stdio: "inherit",
    shell: true,
  });
  console.log("✓ Dependency audit passed: no unapproved high/critical vulnerabilities.\n");
} catch (err) {
  console.error("✗ Dependency audit FAILED!\n");
  failed = true;
}

// 3. Search .next build output for leaked secrets
console.log("[3/3] Scanning .next build output for exposed secrets...");
if (!fs.existsSync(nextDir)) {
  console.log("Notice: apps/web/.next not found, building production bundle...");
  execSync("pnpm --filter web build", {
    cwd: repoRoot,
    stdio: "inherit",
    shell: true,
  });
}

const forbiddenStrings = [
  "service_role",
  "GOOGLE_CLIENT_SECRET",
  "TOKEN_ENC_KEY",
  "BEGIN PRIVATE KEY",
  "-----BEGIN",
];

function scanBuildOutput(dir) {
  let hits = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== "cache" && entry.name !== "dev") {
        hits = hits.concat(scanBuildOutput(fullPath));
      }
    } else if (entry.isFile() && !entry.name.endsWith(".map")) {
      const content = fs.readFileSync(fullPath, "utf8");
      for (const pattern of forbiddenStrings) {
        if (content.includes(pattern)) {
          hits.push({
            file: path.relative(nextDir, fullPath),
            pattern,
          });
        }
      }
    }
  }

  return hits;
}

const leakMatches = scanBuildOutput(nextDir);
if (leakMatches.length > 0) {
  console.error("✗ LEAK DETECTED in .next build output:");
  for (const match of leakMatches) {
    console.error(`  - Found "${match.pattern}" in ${match.file}`);
  }
  console.error("");
  failed = true;
} else {
  console.log("✓ .next bundle scan passed: no server secrets or private keys found in client/server output.\n");
}

if (failed) {
  console.error("=== Aboard CI Security Checks FAILED ===");
  process.exit(1);
} else {
  console.log("=== All CI Security Checks PASSED ===");
  process.exit(0);
}
