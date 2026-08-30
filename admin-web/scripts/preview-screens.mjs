import { chromium } from '@playwright/test';

/**
 * Renders every screen against fixtures and reports what looks wrong.
 *
 *   npm run dev                       # in one terminal
 *   node scripts/preview-screens.mjs  # 1440px light, the default
 *   W=360 node scripts/preview-screens.mjs
 *   THEME=dark node scripts/preview-screens.mjs
 *   THEME=both node scripts/preview-screens.mjs   # every screen twice, for comparison
 *
 * Screenshots land in preview-shots/ (git-ignored). The console line per screen is the point: it
 * flags horizontal overflow, console errors, a screen that is still a placeholder, and one that
 * rendered almost nothing — the four ways a screen fails while the build stays green.
 *
 * It drives the *real* application with the HTTP layer swapped for fixtures; see
 * src/preview/screens-preview.tsx. So it proves the screens draw, and nothing about API wiring.
 * It is not a substitute for running against the backend.
 *
 * Uses the installed Edge rather than Playwright's bundled Chromium, which cannot be downloaded on
 * a restricted network. Change `channel` if that is not true where you are.
 */
const ROUTES = [
  ['home', '/home'], ['departments', '/departments'],
  ['department', '/departments/11111111-1111-1111-1111-111111111111'],
  ['folder', '/folders/22222222-2222-2222-2222-222222222221'],
  ['preview', '/files/33333333-3333-3333-3333-333333333331'],
  ['letters', '/letters'],
  ['letter', '/letters/bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1'],
  ['my-uploads', '/my-uploads'], ['favorites', '/favorites'], ['downloads', '/downloads'],
  ['search', '/search?q=circular'], ['notifications', '/notifications'], ['profile', '/profile'],
  ['phonebook', '/phonebook'],
  ['admin-dash', '/admin'], ['admin-requests', '/admin/requests'], ['admin-members', '/admin/members'],
  ['admin-activity', '/admin/members/44444444-4444-4444-4444-444444444441'],
  ['admin-deletions', '/admin/deletions'], ['admin-reports', '/admin/reports'],
  ['admin-logs', '/admin/logs'], ['help', '/help'], ['privacy', '/privacy'],
];
const WIDTHS = [Number(process.env.W) || 1440];

/*
 * The theme is seeded through the preview harness's ?theme= parameter, which writes the real
 * storage key before the app mounts — so what is screenshotted goes through the same provider a
 * user would, rather than a special path that only exists for the camera.
 *
 * `both` is the useful one when changing colours: it puts light and dark of the same screen side by
 * side in preview-shots/, where a step that failed to re-tone is obvious at a glance.
 */
const THEMES = process.env.THEME === 'both' ? ['light', 'dark'] : [process.env.THEME || 'light'];

/** Vite moves to the next free port if 5173 is taken, so make the target sayable. */
const ORIGIN = `http://localhost:${process.env.PORT || 5173}`;

const browser = await chromium.launch({ channel: 'msedge' });
const problems = [];

for (const theme of THEMES) {
for (const width of WIDTHS) {
  for (const [name, route] of ROUTES) {
    const page = await browser.newPage({ viewport: { width, height: 900 }, deviceScaleFactor: 1 });
    const errors = [];
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    page.on('pageerror', (e) => errors.push('PAGEERROR ' + String(e)));

    await page.goto(`${ORIGIN}/screens-preview.html?theme=${theme}#${route}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1200);

    const info = await page.evaluate(() => ({
      overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      text: (document.body.innerText || '').slice(0, 120).replace(/\s+/g, ' '),
      h1: document.querySelector('h1')?.textContent || '(no h1)',
      /*
       * What the page is actually wearing, and the colour it settled on. A screen that reports the
       * requested theme but a near-white body has something painting over the canvas — which is the
       * failure this whole pass exists to catch, and it is invisible in a filename.
       */
      applied: document.documentElement.dataset.theme || '(none)',
      bodyColour: getComputedStyle(document.body).backgroundColor,
    }));

    const flags = [];
    if (info.overflow) flags.push(`OVERFLOW ${info.scrollWidth}>${info.clientWidth}`);
    if (errors.length) flags.push(`ERRORS: ${errors.slice(0, 2).join(' | ')}`);
    if (/Not implemented yet|Not Found/i.test(info.text)) flags.push('PLACEHOLDER/NOTFOUND');
    if (info.text.trim().length < 20) flags.push('NEARLY EMPTY');
    if (info.applied !== theme) flags.push(`THEME NOT APPLIED (${info.applied})`);

    console.log(`${theme.padEnd(5)} ${width} ${name.padEnd(16)} ${info.bodyColour.padEnd(18)} h1="${info.h1.slice(0, 34)}" ${flags.length ? '*** ' + flags.join(' ; ') : 'ok'}`);
    if (flags.length) problems.push(`${theme} ${width} ${name}: ${flags.join(' ; ')}`);

    await page.screenshot({ path: `./preview-shots/${theme}-${width}-${name}.png`, fullPage: true });
    await page.close();
  }
}
}

console.log(problems.length ? `\n${problems.length} PROBLEM(S)` : '\nall clean');
await browser.close();
