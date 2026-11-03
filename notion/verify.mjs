import assert from 'node:assert/strict';
import { mkdtemp, cp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, dirname, extname } from 'node:path';
import { createServer } from 'node:http';
import { execFileSync } from 'node:child_process';
import { chromium } from 'playwright';
import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';
import { ROOT } from './site.mjs';
import { offlineSite } from './offline.mjs';
import { build, buildTree } from './build.mjs';
import { parseHTML, children } from './html.mjs';

if (process.argv.includes('--live')) await build({ check: true });
const temp = await mkdtemp(resolve(tmpdir(), 'alive5-notion-'));
let browser, server;
const failures = [];
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
  async function open(variant, path, width, frozen = false) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 1, colorScheme: 'light', reducedMotion: 'reduce', permissions: ['clipboard-read', 'clipboard-write'] });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.route('**/*', route => route.request().url().startsWith(origin) ? route.continue() : route.abort());
    if (frozen) {
      await page.clock.install({ time: new Date('2026-01-01T00:00:00Z') });
      await page.clock.pauseAt(new Date('2026-01-01T00:00:00Z'));
    }
    await page.goto(`${origin}/${variant}/${path}`, { waitUntil: 'networkidle' });
    if (frozen) await page.clock.runFor(1200);
    await page.evaluate(async () => { await document.fonts.ready; await Promise.all([...document.images].map(i => i.decode().catch(() => {}))); });
    assert.deepEqual(errors, [], `${variant}/${path}: JavaScript errors`);
    return { page, context };
  }
  for (const width of [1440, 390]) {
    for (const path of paths) {
      const shots = [];
      for (const variant of ['current', 'rendered']) {
        const { page, context } = await open(variant, path, width, true);
        const file = resolve(temp, `${variant}-${width}-${path.replaceAll('/', '-')}.png`);
        const bytes = await page.screenshot({ path: file, fullPage: true, animations: 'disabled', caret: 'hide' });
        shots.push(PNG.sync.read(bytes));
        await context.close();
      }
      const [a, b] = shots;
      if (a.width !== b.width || a.height !== b.height) { failures.push(`${path} @ ${width}: size ${a.width}x${a.height} / ${b.width}x${b.height}`); continue; }
      const diff = new PNG({ width: a.width, height: a.height });
      const pixels = pixelmatch(a.data, b.data, diff.data, a.width, a.height, { threshold: 0, includeAA: true });
      await writeFile(resolve(temp, `diff-${width}-${path.replaceAll('/', '-')}.png`), PNG.sync.write(diff));
      console.log(`${width} ${path}: ${pixels} different pixels`);
      if (pixels) failures.push(`${path} @ ${width}: ${pixels} pixels`);
    }
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
  assert.deepEqual(failures, [], 'Pixel differences');
  console.log(`${paths.length * 2} screenshot pairs: zero differing pixels. All behavioral checks passed.`);
} finally {
  await browser?.close();
  if (server) await new Promise(r => server.close(r));
  await rm(temp, { recursive: true, force: true });
}
