/**
 * Downloads the browser binaries Playwright needs. `npm install` fetches the
 * packages but never the browsers, so without this a fresh clone fails at the
 * first `npm run e2e` with "Executable doesn't exist".
 *
 * Two downloads are needed, not one: @playwright/test and @playwright/mcp track
 * different Playwright builds (currently chromium-1234 and chromium-1237), so
 * each needs its own revision. They are cached per-revision in
 * ~/.cache/ms-playwright (%LOCALAPPDATA%\ms-playwright on Windows), so this is a
 * no-op on every run after the first.
 *
 * Never fails the install: a developer offline or behind a proxy still gets a
 * working `npm install`, just without e2e until they rerun `npm run e2e:install`.
 */
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);

if (process.env.PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD) {
  console.log('[playwright] PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD set — skipping browser download.');
  process.exit(0);
}

// These packages don't export ./cli.js, but package.json is always exported —
// so resolve that and walk to the sibling CLI. Invoking it through node (rather
// than the .bin shim) keeps this shell-free and identical on Windows and POSIX.
const cliFor = (pkg) => path.join(path.dirname(require.resolve(`${pkg}/package.json`)), 'cli.js');

const run = (label, args) => {
  console.log(`[playwright] ${label}...`);
  try {
    execFileSync(process.execPath, args, { stdio: 'inherit' });
    return true;
  } catch {
    console.warn(`[playwright] ${label} FAILED — run \`npm run e2e:install\` in admin-web when you have a connection.`);
    return false;
  }
};

const step = (label, pkg, args) => {
  let cli;
  try {
    cli = cliFor(pkg);
  } catch {
    console.warn(`[playwright] ${pkg} is not installed — skipping ${label}.`);
    return true;
  }
  return run(label, [cli, ...args]);
};

// Browsers for the test runner (`npm run e2e`).
const testOk = step('installing chromium for @playwright/test', 'playwright', ['install', 'chromium']);

// Browser for the Playwright MCP server, on its own revision.
const mcpOk = step('installing chromium for @playwright/mcp', '@playwright/mcp', [
  'install-browser',
  'chrome-for-testing',
]);

if (testOk && mcpOk) console.log('[playwright] browsers ready.');
