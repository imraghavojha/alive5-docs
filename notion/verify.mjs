import assert from 'node:assert/strict';
import { mkdtemp, cp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, dirname, extname } from 'node:path';
import { createServer } from 'node:http';
import { execFileSync } from 'node:child_process';
import { chromium } from 'playwright';
import { ROOT } from './site.mjs';
import { offlineSite } from './offline.mjs';
import { build, buildTree } from './build.mjs';
import { parseHTML, children } from './html.mjs';

if (process.argv.includes('--live')) await build({ check: true });
const temp = await mkdtemp(resolve(tmpdir(), 'alive5-notion-'));
let browser, server;
const structure = node => ({ tag: node.tagName || node.nodeName, ...(node.value !== undefined ? { text: node.value } : {}), ...(node.attrs ? { attrs: node.attrs } : {}), children: children(node).map(structure) });
try {
  const { tree, map, templates } = await offlineSite(ROOT);
  const built = await buildTree(tree, map, templates);
  const paths = Object.keys(map.pages);
  for (const variant of ['current', 'rendered']) {
    const dest = resolve(temp, variant);
    await mkdir(dest);
    for (const dir of ['assets', 'scripts']) await cp(resolve(ROOT, dir), resolve(dest, dir), { recursive: true });
    for (const path of [...paths, 'api/reference.html', '404.html']) {
      await mkdir(dirname(resolve(dest, path)), { recursive: true });
      await cp(resolve(ROOT, path), resolve(dest, path));
    }
  }
  for (const [path, html] of built.output) {
    const original = await readFile(resolve(ROOT, path), 'utf8');
    if (path.endsWith('.html')) assert.deepEqual(structure(parseHTML(html)), structure(parseHTML(original)), `DOM text/structure: ${path}`);
    await writeFile(resolve(temp, 'rendered', path), html);
  }
  execFileSync(process.execPath, ['scripts/build-search-index.mjs'], { cwd: resolve(temp, 'rendered'), stdio: 'pipe' });
  assert.equal(await readFile(resolve(temp, 'rendered/assets/search-index.json'), 'utf8'), await readFile(resolve(ROOT, 'assets/search-index.json'), 'utf8'), 'Search index changed');
  console.log(`DOM text and structure: ${paths.length}/${paths.length} exact; search index exact.`);
  const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.woff2': 'font/woff2' };
  server = createServer(async (req, res) => {
    try {
      const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
      const file = resolve(temp, '.' + pathname);
      if (!file.startsWith(temp + '/') || !/\.(html|js|css|json|svg|png|webp|woff2)$/.test(file)) { res.writeHead(404).end(); return; }
      const data = await readFile(file);
      res.writeHead(200, { 'Content-Type': mime[extname(file)] || 'application/octet-stream' }).end(data);
    } catch { res.writeHead(404).end(); }
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const origin = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ headless: true });
  async function open(variant, path, width) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 1, colorScheme: 'light', reducedMotion: 'reduce', permissions: ['clipboard-read', 'clipboard-write'] });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.route('**/*', route => route.request().url().startsWith(origin) ? route.continue() : route.abort());
    await page.goto(`${origin}/${variant}/${path}`, { waitUntil: 'networkidle' });
    assert.deepEqual(errors, [], `${variant}/${path}: JavaScript errors`);
    return { page, context };
  }
  for (const width of [1440, 390]) {
    for (const variant of ['current', 'rendered']) {
      for (const path of ['api/authentication.html', 'api/send-a-message.html', 'integrations/widget.html']) {
        const { page, context } = await open(variant, path, width);
        for (const box of await page.locator('.code').all()) {
          const tabs = box.locator('[role="tab"]');
          for (let i = 0; i < await tabs.count(); i++) {
            await tabs.nth(i).click();
            assert.equal(await tabs.nth(i).getAttribute('aria-selected'), 'true');
            const pane = box.locator('pre:not([hidden])');
            assert.equal(await pane.count(), 1);
            await box.locator('.copy').click();
            assert.equal(await page.evaluate(() => navigator.clipboard.readText()), await pane.textContent());
          }
        }
        await page.locator('[data-copy-page]').click();
        assert.match(await page.evaluate(() => navigator.clipboard.readText()), /Authentication|Send a message|Install the chat widget/);
        await page.locator('[data-theme-toggle]').click();
        assert.equal(await page.locator('html').getAttribute('data-theme'), 'dark');
        await page.reload({ waitUntil: 'networkidle' });
        assert.equal(await page.locator('html').getAttribute('data-theme'), 'dark');
        await page.locator('[data-search]').click();
        await page.getByRole('textbox', { name: 'Search documentation' }).fill('sms');
        await page.locator('.search-results a').first().waitFor();
        assert.ok(await page.locator('.search-results a').count() > 0);
        await page.keyboard.press('Escape');
        if (width === 390) {
          await page.getByRole('button', { name: 'Documentation menu' }).click();
          assert.equal(await page.locator('#mobile-menu').isVisible(), true);
          await page.keyboard.press('Escape');
          assert.equal(await page.locator('#mobile-menu').isVisible(), false);
        }
        await context.close();
      }
      {
        const { page, context } = await open(variant, 'connectors/zapier.html', width);
        const links = new Set();
        for (const value of ['reminder', 'log', 'notify']) {
          await page.locator(`input[value="${value}"]`).check();
          links.add(await page.locator('[data-zapier-template]').getAttribute('href'));
          assert.ok((await page.locator('[data-action-event]').textContent()).trim());
        }
        assert.equal(links.size, 3);
        await context.close();
      }
      {
        const { page, context } = await open(variant, 'connectors/index.html', width);
        const messages = new Set();
        for (let i = 0; i < 3; i++) {
          const tab = page.locator(`[data-example="${i}"]`);
          await tab.click();
          assert.equal(await tab.getAttribute('aria-selected'), 'true');
          messages.add(await page.locator('[data-incoming]').textContent());
        }
        assert.equal(messages.size, 3);
        await page.locator('.sc-grip').first().focus();
        await page.keyboard.press('ArrowRight');
        await page.locator('.sc-reset').click();
        await context.close();
      }
      {
        const { page, context } = await open(variant, 'index.html', width);
        if (width === 390) {
          assert.equal(await page.locator('.tryout-section').isVisible(), false, 'CLI preview remains hidden on mobile');
          await context.close();
          console.log(`${variant} @ ${width}: tabs, copy, theme, search, mobile menu, Zapier and scenarios passed; CLI remains hidden as designed.`);
          continue;
        }
        await page.locator('#shell-tab-2').click();
        const prompt = page.locator('[data-shell] textarea');
        assert.match(await prompt.inputValue(), /channels list/);
        assert.equal(await page.locator('.shell-result-label').count(), 0);
        await prompt.press('Enter');
        await page.locator('.shell-result-label').waitFor();
        assert.match(await page.locator('.shell-history').textContent(), /example_channel/);
        await page.locator('[data-shell-reset]').click();
        assert.equal(await page.locator('.shell-result-label').count(), 0);
        await context.close();
      }
      console.log(`${variant} @ ${width}: tabs, code copy, copy page, theme persistence, search, mobile menu, Zapier, scenarios, CLI passed.`);
    }
  }
  // Exercise the search dialog after an archive, including its offline keyword suggestions.
  const archivedPath = 'connectors/n8n.html';
  const archivedId = map.pages[archivedPath]?.id;
  const archivedTree = tree.map(section => ({ ...section, articles: section.articles.filter(a => a.id !== archivedId) }));
  const archivedSite = await buildTree(archivedTree, map, templates);
  const dest = resolve(temp, 'rendered');
  for (const [path, content] of archivedSite.output) await writeFile(resolve(dest, path), content);
  await rm(resolve(dest, archivedPath), { force: true });
  execFileSync(process.execPath, ['scripts/build-search-index.mjs'], { cwd: dest });
  for (const offline of [false, true]) {
    const { page, context } = await open('rendered', 'index.html', 390);
    if (offline) await page.route('**/assets/search-index.json', route => route.abort());
    const indexLoaded = page.waitForEvent(offline ? 'requestfailed' : 'requestfinished',
      request => request.url().endsWith('/assets/search-index.json'));
    await page.locator('[data-search]').click();
    await indexLoaded;
    const search = page.getByRole('textbox', { name: 'Search documentation' });
    await search.fill('n8n');
    assert.equal(await page.locator(`.search-results a[href*="${archivedPath}"]`).count(), 0);
    await search.fill('Zapier');
    await page.locator('.search-results a[href*="connectors/zapier.html"]').first().click();
    assert.equal(await page.locator('h1').innerText(), 'Build with Zapier');
    await context.close();
  }
  console.log('Archived guide excluded from search with the index available and unavailable.');
  console.log('All behavioral checks passed.');
} finally {
  await browser?.close();
  if (server) await new Promise(r => server.close(r));
  await rm(temp, { recursive: true, force: true });
}
