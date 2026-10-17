#!/usr/bin/env node
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const vendorDir = path.join(rootDir, 'vendor', 'circuitjs1');
const targetDir = path.join(rootDir, 'apps', 'web', 'public', 'circuit');

console.log('=== Aboard: Building CircuitJS1 Fork ===');
console.log(`Root: ${rootDir}`);
console.log(`Submodule: ${vendorDir}`);
console.log(`Destination: ${targetDir}`);

// Verify submodule exists
if (!fs.existsSync(vendorDir) || !fs.existsSync(path.join(vendorDir, 'build.gradle'))) {
  console.error('ERROR: CircuitJS1 submodule not found at vendor/circuitjs1.');
  console.error('Run: git submodule update --init --recursive');
  process.exit(1);
}

// 1. Build fork using Gradle
console.log('\n[1/3] Compiling CircuitJS1 via Gradle (compileGwt)...');
try {
  execSync('gradle compileGwt', { cwd: vendorDir, stdio: 'inherit' });
} catch (err) {
  console.error('ERROR: gradle compileGwt failed.');
  process.exit(1);
}

console.log('\n[2/3] Assembling site artifacts (makeSite)...');
try {
  execSync('gradle makeSite', { cwd: vendorDir, stdio: 'inherit' });
} catch (err) {
  console.error('ERROR: gradle makeSite failed.');
  process.exit(1);
}

const siteDir = path.join(vendorDir, 'site');
if (!fs.existsSync(siteDir)) {
  console.error(`ERROR: Expected output directory not found at ${siteDir}`);
  process.exit(1);
}

// 2. Clean destination for idempotency
console.log('\n[3/3] Copying artifacts to apps/web/public/circuit/ (excluding WEB-INF)...');
if (fs.existsSync(targetDir)) {
  console.log(`Cleaning previous build at ${targetDir}...`);
  fs.rmSync(targetDir, { recursive: true, force: true });
}
fs.mkdirSync(targetDir, { recursive: true });

// Copy directory recursively, strictly excluding WEB-INF and any service worker files
function copyDir(src, dest) {
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.name === 'WEB-INF') {
      console.log(`  Skipping ${entry.name} (server-side / Java bytecode excluded)`);
      continue;
    }
    if (
      entry.name.startsWith('service-worker') ||
      entry.name === 'manifest.json' ||
      entry.name === 'update-service-worker.sh'
    ) {
      console.log(`  Skipping ${entry.name} (service worker / manifest excluded)`);
      continue;
    }

    if (entry.isDirectory()) {
      fs.mkdirSync(destPath, { recursive: true });
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

copyDir(siteDir, targetDir);

// Verify output
const htmlPath = path.join(targetDir, 'circuitjs.html');
if (!fs.existsSync(htmlPath)) {
  console.error('ERROR: circuitjs.html was not generated in public/circuit/');
  process.exit(1);
}

const htmlContent = fs.readFileSync(htmlPath, 'utf8');
if (htmlContent.includes('serviceWorker.register') || htmlContent.includes('manifest.json')) {
  console.error('ERROR: circuitjs.html still contains service worker or manifest reference!');
  process.exit(1);
}

console.log('\nBUILD SUCCESS: CircuitJS1 assets deployed to apps/web/public/circuit/');
console.log('✓ Idempotent clean and copy verified');
console.log('✓ WEB-INF excluded');
console.log('✓ Service worker and manifest absent');
