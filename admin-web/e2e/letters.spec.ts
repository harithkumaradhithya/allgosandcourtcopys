import { expect, test, type Browser, type Page } from '@playwright/test';

/**
 * Writing a letter, end to end, against the real application and the real API.
 *
 * <p>Three things are asserted here that no unit test can reach, because all three are about the
 * browser rather than about a function: that a Tamil letter is drawn in Tamil down to its headings,
 * that typing on the letter itself is the same edit as typing in the form beside it, and that a
 * letter being written survives the page going away underneath it.
 *
 * <p><b>One session, in series.</b> Signing in once and keeping the page is not only faster: the API
 * rate-limits `/auth` to sixty requests a minute from one address, and every page load costs a token
 * refresh, so a suite that signed in for each test is eventually refused and fails for a reason that
 * has nothing to do with letters. Sharing a page also means these tests run one at a time, which
 * they would anyway — a drafts list is shared state, and a test that started a draft while another
 * asserted there were none would be red on a coin toss.
 */
test.describe.configure({ mode: 'serial' });

const MOBILE = process.env.E2E_MOBILE ?? '9999999999';
const PASSWORD = process.env.E2E_PASSWORD ?? 'Admin@12345';

/**
 * A subject no other run can have written.
 *
 * <p>These tests write into a real account against a real database, and one that fails part way
 * leaves its letter behind. A fixed subject would then make the next run fail too, on the leftovers
 * rather than on the code — the most misleading kind of red there is.
 */
const subjectFor = (what: string) => `${what} — e2e ${Date.now()}`;

let page: Page;

test.beforeAll(async ({ browser }: { browser: Browser }) => {
  page = await browser.newPage();

  await page.goto('/login');
  await page.getByLabel('Mobile number').fill(MOBILE);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: /sign in/i }).click();
  await expect(page).not.toHaveURL(/\/login/);
});

test.afterAll(async () => {
  await page.close();
});

/**
 * A block of the letter as it is typed into on the sheet itself.
 *
 * <p>The form beside it labels its boxes with the same words — that is the point of the feature —
 * so every locator here says which of the two it means rather than relying on a label being unique
 * on the page, which it deliberately is not.
 */
const onSheet = (hint: string) => page.locator(`.letter-editable[aria-label="${hint}"]`);

/** The boxes beside the letter. */
const inForm = () => page.getByTestId('letter-form');

/**
 * Opens the letters list and waits for both of its listings to have actually arrived.
 *
 * <p>Drafts and finished letters are two requests, and an empty list looks exactly like a list that
 * has not loaded. Counting rows before they land is how a test comes to assert that there are no
 * drafts a moment before three of them appear.
 */
async function openLetters() {
  const listed = Promise.all([
    page.waitForResponse((response) => response.url().includes('status=DRAFT')),
    page.waitForResponse((response) => response.url().includes('status=FINAL')),
  ]);
  await page.goto('/letters');
  await listed;
}

/**
 * Leaves nothing behind: every draft, and every letter an earlier run left saved.
 *
 * <p>One pass over one page load, because each load costs a token refresh against a rate limit that
 * exists for good reasons and is not this suite's to spend.
 */
async function clearMine() {
  await openLetters();

  // The copies kept in the browser, too. They outlive a letter being deleted from the server, and
  // one test's half-written letter offered back to the next is an isolation bug, not a finding.
  await page.evaluate(() => {
    Object.keys(window.localStorage)
      .filter((key) => key.startsWith('allgos.letter-draft'))
      .forEach((key) => window.localStorage.removeItem(key));
  });

  const rows = page
    .getByRole('listitem')
    .filter({ has: page.getByRole('button', { name: /^(Delete|Discard)$/ }) });

  for (let remaining = await rows.count(); remaining > 0; remaining -= 1) {
    await rows.first().getByRole('button', { name: /^(Delete|Discard)$/ }).click();
    await page.getByRole('dialog').getByRole('button', { name: /^(Delete|Discard)$/ }).click();
    await expect(page.getByRole('dialog')).toBeHidden();
  }

  await expect(rows).toHaveCount(0);
}

test.beforeEach(async () => {
  await clearMine();
});

test.describe('a letter in two languages', () => {
  test('a Tamil letter is Tamil down to its headings', async () => {
    await page.goto('/letters/new?lang=TA');

    // The part nobody types. This is the whole difference between a Tamil letter and an English one
    // with Tamil typed into it.
    const sheet = page.locator('.letter-sheet');
    await expect(sheet).toHaveAttribute('lang', 'ta');
    await expect(sheet.getByRole('heading', { name: 'அனுப்புநர்,' })).toBeVisible();
    await expect(sheet.getByRole('heading', { name: 'பெறுநர்,' })).toBeVisible();
    await expect(sheet.getByText('பொருள்:')).toBeVisible();
    await expect(sheet.getByText('பார்வை:')).toBeVisible();

    // And the boxes it is written in.
    await expect(page.getByRole('heading', { name: 'தலைப்பு' })).toBeVisible();
    await expect(inForm().getByLabel('கோப்பு எண்', { exact: true })).toBeVisible();

    // Dictation follows the letter rather than being chosen again for every field.
    await expect(inForm().getByLabel(/Dictation language/).first()).toHaveValue('ta-IN');
  });

  test("switching language changes the headings, never the writer's own words", async () => {
    await page.goto('/letters/new?lang=EN');

    const written = 'Kind attention is invited to the references cited.';
    await onSheet('Write the letter here').fill(written);

    await page
      .getByRole('group', { name: 'Letter language' })
      .getByRole('button', { name: 'தமிழ்' })
      .click();

    await expect(page.locator('.letter-sheet')).toHaveAttribute('lang', 'ta');
    await expect(page.locator('.letter-sheet').getByText('பொருள்:')).toBeVisible();
    // The stock salutation follows the language; the paragraph does not, and must not.
    await expect(onSheet('ஐயா/அம்மா,')).toHaveText('ஐயா/அம்மா,');
    await expect(onSheet('கடிதத்தை இங்கே எழுதுங்கள்')).toHaveText(written);
  });
});

test.describe('the letter is edited where it is read', () => {
  test('typing on the sheet is the same edit as typing in the form', async () => {
    await page.goto('/letters/new?lang=EN');

    await onSheet('What the letter is about').fill('Inspection of stock - Reg.');
    await expect(inForm().getByLabel('Subject', { exact: true })).toHaveValue(
      'Inspection of stock - Reg.',
    );

    // ...and back the other way, so neither side is the real one.
    await inForm().getByLabel('Subject', { exact: true }).fill('Inspection of stock - revised.');
    await expect(onSheet('What the letter is about')).toHaveText('Inspection of stock - revised.');
  });

  /*
   * The hints in the empty blocks are how somebody knows where to click. On paper they would be an
   * empty heading with a line of grey italics under it, which is not what anybody meant to print.
   */
  test('the hints in empty blocks are not part of the letter that prints', async () => {
    await page.goto('/letters/new?lang=EN');

    const copyTo = page.locator('.letter-sheet [data-empty="true"]').filter({ hasText: 'Copy to.' });
    await expect(copyTo).toBeVisible();

    await page.emulateMedia({ media: 'print' });
    await expect(copyTo).toBeHidden();
    await expect(onSheet('Who else gets a copy')).toBeHidden();

    await page.emulateMedia({ media: 'screen' });
  });
});

test.describe('a letter being written is never lost', () => {
  test('what was typed comes back after the page goes, and finishes as one letter', async () => {
    await page.goto('/letters/new?lang=EN');

    const subject = subjectFor('Supply of Modern Bicycles - Inspection of stock');
    await onSheet('What the letter is about').fill(subject);
    await onSheet('Who the letter is to').fill('1. The Commissioner of MBC & DNC, Ch-5.');
    await onSheet('Write the letter here').fill('It is requested to attend the inspection.');

    await expect(page.getByTestId('autosave-state')).toHaveAttribute('data-state', 'saved');

    // The browser going away mid-letter: closed, crashed, or the machine asleep.
    await page.reload();

    await expect(page.getByText(/An unfinished letter was kept on this computer/)).toBeVisible();
    await page.getByRole('button', { name: 'Carry on with it' }).click();
    await expect(inForm().getByLabel('Subject', { exact: true })).toHaveValue(subject);

    // Finishing it promotes the draft that was already there rather than writing a second letter.
    await page.getByRole('button', { name: 'Save letter' }).click();
    await expect(page.getByText('Saved. Print it now')).toBeVisible();

    await openLetters();
    await expect(page.getByText('Unfinished — pick up where you left off')).toBeHidden();
    await expect(page.getByRole('link', { name: subject })).toHaveCount(1);
  });

  test('a server that cannot be reached is said so, and the letter is kept anyway', async () => {
    await page.goto('/letters/new?lang=EN');

    // Every autosave now fails, which is what a restarting server, a dropped connection and a dead
    // network all look like from in here.
    await page.route('**/api/v1/letters/drafts**', (route) => route.abort('connectionfailed'));

    const written = 'This paragraph was typed while the server was down.';
    await onSheet('What the letter is about').fill('Inspection of stock - Reg.');
    await onSheet('Write the letter here').fill(written);

    await expect(page.getByTestId('autosave-state')).toHaveAttribute('data-state', 'local');
    await expect(page.getByText(/Kept on this computer/)).toBeVisible();

    // Kept all the same — which is the only thing that matters to whoever was writing it.
    await page.reload();
    await expect(page.getByText(/An unfinished letter was kept on this computer/)).toBeVisible();
    await page.getByRole('button', { name: 'Carry on with it' }).click();
    await expect(inForm().getByLabel('Body', { exact: true })).toHaveValue(written);

    await page.unroute('**/api/v1/letters/drafts**');
  });
});
