import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { credentials, readTree } from './api.mjs';
import { ROOT, readJSON, writeJSON, remapBlocks, allocatePath, newTemplate, updateNavigation, validatePath } from './site.mjs';
import { renderPage, renderBlocks } from './render.mjs';
import { slug, escape } from './html.mjs';
import { localizeImages, knownImages } from './media.mjs';

export async function buildTree(tree, originalMap, templates, root = ROOT) {
  const map = structuredClone(originalMap);
  const used = new Set([...Object.keys(map.pages), '404.html', 'api/reference.html', 'index.html']);
  const byId = new Map(Object.entries(map.pages).map(([path, page]) => [page.id, path]));
  const fallback = Object.values(templates).find(t => t.before.includes('class="doc"'));
  if (!fallback) throw new Error('No article template exists. Run seed first.');
  const output = new Map(), seen = new Set(), sections = structuredClone(tree);
  for (const section of sections) {
    for (const article of section.articles) {
      if (seen.has(article.id)) throw new Error('Duplicate Notion page ID.');
      seen.add(article.id);
      const path = byId.get(article.id) || allocatePath(article.title, used);
      validatePath(path);
      article.path = path;
      let record = map.pages[path];
      if (!record) record = map.pages[path] = { id: article.id, title: article.title, label: article.title, page: slug(path), section: slug(section.title), sectionId: section.id, bindings: {}, seeded: true };
      const template = templates[path] || newTemplate(fallback, path, article.title, record.section);
      const blocks = remapBlocks(article.blocks, record.bindings);
      const body = !template.fresh ? renderPage(blocks, template, article.title) : template.before + `<h1>${escape(article.title)}</h1>` + renderBlocks(blocks, template, path) + template.after;
      output.set(path, body);
    }
  }
  const previous = Object.keys(map.pages);
  const removed = previous.filter(path => !seen.has(map.pages[path].id));
  for (const path of removed) { validatePath(path); delete map.pages[path]; }
  const js = await readFile(resolve(root, 'assets/site.js'), 'utf8');
  output.set('assets/site.js', updateNavigation(js, sections, map));
  const originalOrder = originalMap.order || Object.keys(originalMap.pages);
  const order = sections.flatMap(s => s.articles.map(a => a.path));
  const titles = new Map(sections.flatMap(s => s.articles.map(a => [a.path, a.title])));
  const renamed = [...titles].some(([path, title]) => title !== map.pages[path].title);
  if (map.order || renamed || JSON.stringify(order) !== JSON.stringify(originalOrder)) {
    const sequence = [...order];
    const referenceAt = Math.min(sequence.findIndex(p => p.startsWith('connectors/')), sequence.length);
    sequence.splice(referenceAt < 0 ? sequence.length : referenceAt, 0, 'api/reference.html');
    for (const [path, html] of output) {
      if (!path.endsWith('.html')) continue;
      const i = sequence.indexOf(path), prefix = '../'.repeat(path.split('/').length - 1);
      const link = (p, next) => p ? `<a${next ? ' class="next"' : ''} href="${prefix + p}"><span>${next ? 'Next' : 'Previous'}</span><strong>${next ? '' : '← '}${escape(titles.get(p) !== map.pages[p]?.title ? titles.get(p) || 'API reference' : map.pages[p]?.label || 'API reference')}${next ? ' →' : ''}</strong></a>` : '';
      output.set(path, html.replace(/<div class="pager">[\s\S]*?<\/div>/, () => `<div class="pager">${link(sequence[i - 1], false)}${link(sequence[i + 1], true)}</div>`));
    }
  }
  if (JSON.stringify(order) !== JSON.stringify(originalOrder)) map.order = order;
  for (const section of sections) map.sections[section.id] ||= { title: section.title, hidden: false, added: true };
  return { output, removed, map };
}
export async function build({ root = ROOT, check = false } = {}) {
  const { client, rootId } = credentials();
  const map = await readJSON(resolve(root, 'notion/map.json'));
  if (map.rootId !== rootId) throw new Error('Root differs from notion/map.json. Run npm run seed in the new workspace first.');
  if (!Object.keys(map.pages).length || Object.values(map.pages).some(p => !p.seeded)) throw new Error('Seed is incomplete. Run npm run seed first.');
  const templates = await readJSON(resolve(root, 'notion/templates.json'));
  const tree = await readTree(client, rootId);
  const images = await localizeImages(tree, fetch, await knownImages(root));
  const result = await buildTree(tree, map, templates, root);
  for (const [path, data] of images) result.output.set(path, data);
  if (!tree.length) throw new Error('No sections are visible. Refusing to delete the site; check root access.');
  const changed = [];
  for (const [path, html] of result.output) if (!Buffer.from(await readFile(resolve(root, path)).catch(e => { if (e.code === 'ENOENT') return ''; throw e; })).equals(Buffer.from(html))) changed.push(path);
  if (check) {
    if (changed.length || result.removed.length || JSON.stringify(map) !== JSON.stringify(result.map)) throw new Error(`Site differs from Notion: ${[...changed, ...result.removed].join(', ') || 'page map'}. Run npm run build.`);
    execFileSync(process.execPath, ['scripts/build-search-index.mjs', '--check'], { cwd: root, stdio: 'inherit' });
    console.log('All managed pages, navigation, and search match Notion.');
    return;
  }
  for (const [path, html] of result.output) {
    await mkdir(dirname(resolve(root, path)), { recursive: true });
    await writeFile(resolve(root, path), html);
  }
  for (const path of result.removed) await rm(resolve(root, path));
  await writeJSON(resolve(root, 'notion/map.json'), result.map);
  execFileSync(process.execPath, ['scripts/build-search-index.mjs'], { cwd: root, stdio: 'inherit' });
  console.log(`${changed.length} changed; ${result.removed.length} removed.`);
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await build({ check: process.argv.includes('--check') });
