import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { convert } from './convert.mjs';
import { slug, escape, fragment, text } from './html.mjs';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const readJSON = async path => JSON.parse(await readFile(path, 'utf8'));
export async function writeJSON(path, data) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path + '.tmp', JSON.stringify(data, null, 2) + '\n');
  await rename(path + '.tmp', path);
}
export function navigation(js) {
  const get = name => vm.runInNewContext(js.match(new RegExp(`const ${name} = (\\[[\\s\\S]*?\\n\\]);`))[1], Object.create(null), { timeout: 1000 });
  return { menu: JSON.parse(JSON.stringify(get('MENU'))), sidebar: JSON.parse(JSON.stringify(get('SIDEBAR'))) };
}
export async function inventory(root = ROOT) {
  const nav = navigation(await readFile(resolve(root, 'assets/site.js'), 'utf8'));
  const groups = [{ label: nav.menu.find(([, path]) => path === 'index.html')?.[2] || 'Get started', items: [['home', 'index.html', 'Get started']], hidden: true }, ...nav.sidebar];
  const sections = [];
  for (const group of groups) {
    const articles = [];
    for (const [id, path, label] of group.items) {
      if (path === 'api/reference.html') continue;
      const html = await readFile(resolve(root, path), 'utf8').catch(e => { if (path === 'index.html' && e.code === 'ENOENT') return null; throw e; });
      if (html === null) continue;
      const article = convert(html, path);
      articles.push({ path, label, id, title: article.template.title, ...article });
    }
    sections.push({ title: text(fragment(group.label)), hidden: !!group.hidden, articles });
  }
  return { ...nav, sections };
}
export function remapBlocks(blocks, bindings = {}) {
  const reverse = Object.fromEntries(Object.entries(bindings).map(([local, remote]) => [remote, local]));
  const visit = b => ({ ...b, id: reverse[b.id] || b.id, [b.type]: { ...b[b.type], ...(b[b.type].children ? { children: b[b.type].children.map(visit) } : {}) } });
  return blocks.map(visit);
}
export function allocatePath(title, used) {
  const base = slug(title);
  let name = `${base}.html`, i = 2;
  while (used.has(name)) name = `${base}-${i++}.html`;
  used.add(name);
  return name;
}
export function newTemplate(base, path, title, section) {
  const prefix = '../'.repeat(path.split('/').length - 1);
  let shell = base.before + `<h1>${escape(title)}</h1>` + base.after;
  shell = shell.replace(/(?:\.\.\/)*assets\//g, prefix + 'assets/')
    .replace(/data-root="[^"]*"/, `data-root="${prefix}"`)
    .replace(/data-page="[^"]*"/, `data-page="${slug(path)}"`)
    .replace(/data-section="[^"]*"/, `data-section="${escape(section)}"`)
    .replace(/<title>[\s\S]*?<\/title>/, () => `<title>${escape(title)} · Alive5 Docs</title>`)
    .replace(/(<meta\s+(?:property|name)="(?:og:title|twitter:title)"\s+content=")[^"]*/g, (_, opening) => opening + escape(title) + ' · Alive5 Docs')
    .replace(/(<meta\s+(?:property|name)="(?:description|og:description|twitter:description)"\s+content=")[^"]*/g, (_, opening) => opening + escape(title))
    .replace(/(<link rel="canonical" href=")[^"]*/g, (_, opening) => opening + 'https://imraghavojha.github.io/alive5-docs/' + path)
    .replace(/(<meta property="og:url" content=")[^"]*/g, (_, opening) => opening + 'https://imraghavojha.github.io/alive5-docs/' + path);
  return { ...convert(shell, path).template, fresh: true };
}
export function updateNavigation(js, sections, map) {
  const original = map.navigation;
  const sidebar = sections.filter(s => !map.sections[s.id]?.hidden || s.articles.some(a => a.path !== 'index.html')).map(s => ({ label: escape(s.title), items: s.articles.map(a => {
    const old = map.pages[a.path];
    return [old.page, a.path, escape(a.title === old.title ? old.label : a.title)];
  }) }));
  let reference = sidebar.find(g => g.label === 'Reference');
  if (!reference) { reference = { label: 'Reference', items: [] }; sidebar.splice(Math.min(2, sidebar.length), 0, reference); }
  reference.items.push(['api-reference', 'api/reference.html', 'API reference']);
  const active = new Set(sections.flatMap(s => s.articles.map(a => a.path)));
  const menu = original.menu.filter(([, path]) => active.has(path)).map(item => [...item]);
  const known = new Set(Object.entries(map.sections).filter(([, s]) => !s.added).map(([id]) => id));
  for (const s of sections) if (!known.has(s.id) && s.articles.length) menu.push([slug(s.title), s.articles[0].path, escape(s.title)]);
  for (const item of menu) {
    const s = sections.find(s => s.articles.some(a => a.path === item[1]));
    const old = map.sections[s.id];
    if (old && old.title !== s.title) item[2] = escape(s.title);
  }
  menu.sort((a, b) => sections.findIndex(s => s.articles.some(p => p.path === a[1])) - sections.findIndex(s => s.articles.some(p => p.path === b[1])) || original.menu.findIndex(m => m[0] === a[0]) - original.menu.findIndex(m => m[0] === b[0]));
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const current = navigation(js);
  if (!same(current.sidebar, sidebar)) js = js.replace(/const SIDEBAR = \[[\s\S]*?\n\];/, () => `const SIDEBAR = ${JSON.stringify(sidebar, null, 2)};`);
  const unchangedSections = sections.length === known.size && sections.every((s, i) => s.id === [...known][i] && s.title === map.sections[s.id].title) && original.menu.every(([, path]) => active.has(path));
  const desiredMenu = unchangedSections ? original.menu : menu;
  if (!same(current.menu, desiredMenu)) js = js.replace(/const MENU = \[[\s\S]*?\n\];/, () => `const MENU = ${JSON.stringify(desiredMenu, null, 2)};`);
  return js;
}
export function validatePath(path) {
  if (!/^(?:[a-z0-9-]+\/)*[a-z0-9-]+\.html$/.test(path) || ['404.html', 'api/reference.html'].includes(path)) throw new Error(`Invalid managed page path: ${path}`);
  return path;
}
