import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const hooksDir = path.join(repoRoot, ".git", "hooks");
const hookPath = path.join(hooksDir, "pre-commit");

if (!fs.existsSync(hooksDir)) {
  fs.mkdirSync(hooksDir, { recursive: true });
}

const hookScript = `#!/bin/sh
# Aboard pre-commit hook: verify no secrets are staged (SEC-5, SEC-10)
# Runs gitleaks protect --staged --redact --verbose

echo "[pre-commit] Checking staged files with gitleaks..."
gitleaks protect --staged --redact --verbose
EXIT_CODE=$?

if [ $EXIT_CODE -ne 0 ]; then
  echo ""
  echo "[pre-commit] ERROR: gitleaks detected secrets in staged files! Commit blocked." >&2
  exit $EXIT_CODE
fi

exit 0
`;

fs.writeFileSync(hookPath, hookScript, { encoding: "utf8", mode: 0o755 });
console.log(`[install-hooks] Successfully installed pre-commit hook at ${hookPath}`);
