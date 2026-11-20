import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { credentials, readTree } from './api.mjs';
import { ROOT, readJSON, writeJSON, remapBlocks, allocatePath, newTemplate, updateNavigation, validatePath } from './site.mjs';
import { renderPage, renderBlocks, hasContent } from './render.mjs';
import { BASE, slug, escape, resolvePageLinks, parseHTML, walk, attr } from './html.mjs';
import { localizeImages, knownImages } from './media.mjs';

function archivedTarget(href, page, archived) {
  if (!href) return;
  const url = URL.parse(href, BASE + page);
  if (!url) return;
  url.search = '';
  url.hash = '';
  const path = url.href.slice(BASE.length);
  if (url.href.startsWith(BASE) && archived.has(path)) return path;
}

function filterHomeLinks(blocks, archived) {
  return blocks.filter(block => {
    const data = block[block.type];
    if (data.children) data.children = filterHomeLinks(data.children, archived);
    if (data.children?.length || !['paragraph', 'heading_1', 'heading_2', 'heading_3', 'numbered_list_item', 'bulleted_list_item'].includes(block.type)) return true;
    const words = data.rich_text.filter(r => (r.text?.content ?? r.plain_text ?? '').trim());
    return !words.length || !words.every(r => archivedTarget(r.text?.link?.url ?? r.href, 'index.html', archived));
  });
}

function checkWidgets(template, html, path) {
  for (const leaf of Object.values(template.leaves)) {
    if (!leaf.widget) continue;
    const first = html.indexOf(leaf.html);
    if (first < 0) throw new Error(`${path}: missing ${leaf.widget} widget. Restore its Notion callout or add a callout containing ⟦${leaf.widget}⟧.`);
    if (html.includes(leaf.html, first + leaf.html.length)) throw new Error(`${path}: duplicate ${leaf.widget} widget. Keep one callout on this page.`);
  }
}

async function renderSitemap(pages, root) {
  const paths = new Set(['index.html', 'api/reference.html', ...Object.keys(pages)]);
  const previous = await readFile(resolve(root, 'sitemap.xml'), 'utf8').catch(error => {
    if (error.code === 'ENOENT') return '';
    throw error;
  });
  // Preserve the published order for URLs that still exist.
  const ordered = [];
  for (const [, url] of previous.matchAll(/<loc>([^<]+)<\/loc>/g)) {
    if (!url.startsWith(BASE)) continue;
    const path = url.slice(BASE.length) || 'index.html';
    if (paths.delete(path)) ordered.push(path);
  }
  ordered.push(...[...paths].sort());
  const entries = ordered.map(path => `  <url><loc>${BASE}${path === 'index.html' ? '' : path}</loc></url>`);
  return ['<?xml version="1.0" encoding="UTF-8"?>', '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">', ...entries, '</urlset>', ''].join('\n');
}

export async function buildTree(tree, originalMap, templates, root = ROOT) {
  const map = structuredClone(originalMap);
  const active = new Set(tree.flatMap(s => s.articles.map(a => a.id)));
  const removed = Object.keys(map.pages).filter(path => !active.has(map.pages[path].id));
  if (removed.length > 3) throw new Error('Refusing to delete more than 3 pages in one run.');
  if (removed.includes('index.html')) throw new Error('Refusing to delete index.html.');
  const tombstones = map.tombstones || {};
  const used = new Set([...Object.keys(map.pages), ...Object.values(tombstones).map(t => t.path), '404.html', 'api/reference.html', 'index.html']);
  const byId = new Map([...Object.entries(tombstones).map(([id, t]) => [id, t.path]), ...Object.entries(map.pages).map(([path, page]) => [page.id, path])]);
  const fallback = Object.values(templates).find(t => t.before.includes('class="doc"'));
  if (!fallback) throw new Error('No article template exists. Run seed first.');
  const output = new Map(), seen = new Set(), sections = structuredClone(tree);
  let renamed = false;
  for (const section of sections) {
    const published = [];
    for (const article of section.articles) {
      if (seen.has(article.id)) throw new Error('Duplicate Notion page ID.');
      seen.add(article.id);
      const existing = byId.get(article.id);
      const bindings = map.pages[existing]?.bindings || tombstones[article.id]?.record?.bindings;
      if (!hasContent(remapBlocks(article.blocks, bindings), templates[existing] || { leaves: {} }, existing || 'index.html')) {
        if (existing) throw new Error(`Empty existing article: ${existing}`);
        console.warn(`Skipping empty new article: ${article.title}`);
        continue;
      }
      const path = existing || allocatePath(article.title, used);
      validatePath(path);
      article.path = path;
      byId.set(article.id, path);
      let record = map.pages[path] ||= tombstones[article.id]?.record;
      delete tombstones[article.id];
      if (!record) record = map.pages[path] = { id: article.id, title: article.title, label: article.title, page: slug(path), section: slug(section.title), bindings: {}, seeded: true };
      if (record.title !== article.title) {
        if (record.label === record.title) record.label = article.title;
        record.title = article.title;
        renamed = true;
      }
      published.push(article);
    }
    section.articles = published;
  }
  const archived = new Set([...removed, ...Object.values(tombstones).map(t => t.path)]);
  const paths = new Map([...byId].map(([id, path]) => [id.replaceAll('-', '').toLowerCase(), path]));
  for (const section of sections) {
    const sectionGuide = section.articles.find(a => templates[a.path]?.before.includes('class="doc"'));
    for (const article of section.articles) {
      const path = article.path, record = map.pages[path];
      const template = templates[path] || newTemplate(templates[sectionGuide?.path] || fallback, path, article.title, {
        slug: record.section, title: section.title, path: sectionGuide?.path || section.articles[0].path,
      });
      let blocks = remapBlocks(resolvePageLinks(article.blocks, paths), record.bindings);
      if (path === 'index.html' && archived.size) blocks = filterHomeLinks(blocks, archived);
      const body = template.fresh ? template.before + renderBlocks(blocks, template, path) + template.after : renderPage(blocks, template, article.title);
      checkWidgets(template, body, path);
      output.set(path, body);
    }
  }
  for (const path of removed) {
    validatePath(path);
    (map.tombstones ||= {})[map.pages[path].id] = { path, record: map.pages[path] };
    delete map.pages[path];
  }
  const js = await readFile(resolve(root, 'assets/site.js'), 'utf8');
  output.set('assets/site.js', updateNavigation(js, sections, map));
  const referencePath = 'api/reference.html';
  output.set(referencePath, await readFile(resolve(root, referencePath), 'utf8'));
  const originalOrder = originalMap.order || Object.keys(originalMap.pages);
  const order = sections.flatMap(s => s.articles.map(a => a.path));
  const reordered = JSON.stringify(order) !== JSON.stringify(originalOrder);
  if (map.order || renamed || reordered) {
    const sequence = [...order];
    const referenceAt = Math.min(sequence.findIndex(p => p.startsWith('connectors/')), sequence.length);
    sequence.splice(referenceAt < 0 ? sequence.length : referenceAt, 0, referencePath);
    for (const [path, html] of output) {
      if (!path.endsWith('.html') || (path === referencePath && !reordered)) continue;
      const i = sequence.indexOf(path), prefix = '../'.repeat(path.split('/').length - 1);
      const link = (p, next) => p ? `<a${next ? ' class="next"' : ''} href="${prefix + p}"><span>${next ? 'Next' : 'Previous'}</span><strong>${next ? '' : '← '}${escape(map.pages[p]?.label ?? 'API reference')}${next ? ' →' : ''}</strong></a>` : '';
      output.set(path, html.replace(/<div class="pager">[\s\S]*?<\/div>/, () => `<div class="pager">${link(sequence[i - 1], false)}${link(sequence[i + 1], true)}</div>`));
    }
  }
  if (renamed || reordered) map.order = order;
  for (const section of sections) map.sections[section.id] ||= { title: section.title, hidden: false, added: true };
  output.set('sitemap.xml', await renderSitemap(map.pages, root));
  if (archived.size) {
    for (const [page, html] of output) {
      if (!page.endsWith('.html')) continue;
      const links = walk(parseHTML(html)).filter(node => node.tagName === 'a');
      const targets = new Set(links.map(link => archivedTarget(attr(link, 'href'), page, archived)).filter(Boolean));
      for (const target of targets) console.warn(`::warning::${page} links to archived guide ${target}`);
    }
  }
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
