import assert from 'node:assert/strict';
import { chromium } from '../.tools/qa/node_modules/playwright-core/index.mjs';
import { resolve } from 'node:path';
const browser = await chromium.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true,
});
const findings = [];
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1100 },
  });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('http://127.0.0.1:3000');
  await page.getByRole('button', { name: 'Refresh status' }).waitFor();
  assert.equal(await page.getByText('Available', { exact: true }).count(), 3);
  assert.equal(
    await page
      .getByRole('img', { name: 'ZENOVEL Pharma Services' })
      .evaluate((image) => image.complete && image.naturalWidth > 0),
    true,
  );
  await page.getByRole('button', { name: 'Refresh status' }).click();
  await page.getByRole('button', { name: 'Refresh status' }).waitFor();
  assert.equal(await page.getByText('Available', { exact: true }).count(), 3);
  await page.getByLabel('Example field').fill('Preview input');
  await page.screenshot({
    path: resolve('docs/evidence/foundation-desktop.png'),
    fullPage: true,
  });
  findings.push(
    'PASS desktop live status, official logo, refresh, example input, no browser runtime exceptions',
  );
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
    true,
  );
  await page.screenshot({
    path: resolve('docs/evidence/foundation-mobile.png'),
    fullPage: true,
  });
  findings.push('PASS mobile 390px rendering, no horizontal page overflow');
  await page.route('http://127.0.0.1:4000/api/v1/**', (route) => route.abort());
  await page.getByRole('button', { name: 'Refresh status' }).click();
  await page
    .getByText('Some services are unavailable.', { exact: false })
    .waitFor();
  assert.equal(await page.getByText('Unavailable', { exact: true }).count(), 3);
  await page.screenshot({
    path: resolve('docs/evidence/foundation-unavailable.png'),
    fullPage: true,
  });
  findings.push(
    'PASS browser connectivity failure presents unavailable statuses and actionable feedback',
  );
  assert.deepEqual(errors, []);
  console.log(findings.join('\n'));
} finally {
  await browser.close();
}
