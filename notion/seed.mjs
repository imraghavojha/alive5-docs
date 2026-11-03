import { resolve } from 'node:path';
import { inventory, ROOT, readJSON, writeJSON } from './site.mjs';
import { credentials, ensurePage, seedBlocks } from './api.mjs';
import { knownImages } from './media.mjs';

const { client, rootId } = credentials();
await client.pages.retrieve({ page_id: rootId });
const file = resolve(ROOT, 'notion/map.json');
let map = await readJSON(file);
const source = await inventory();
const media = { root: ROOT, known: await knownImages(ROOT) };
const templatesFile = resolve(ROOT, 'notion/templates.json');
let templates = map.rootId === rootId ? await readJSON(templatesFile).catch(e => { if (e.code === 'ENOENT') return {}; throw e; }) : {};
if (map.rootId !== rootId) map = { version: 1, rootId, navigation: { menu: source.menu, sidebar: source.sidebar }, sections: {}, pages: {} };
const save = () => writeJSON(file, map);
for (const section of source.sections) {
  const entry = Object.entries(map.sections).find(([, s]) => s.title === section.title);
  const id = await ensurePage(client, rootId, section.title, entry?.[0]);
  map.sections[id] ||= { title: section.title, hidden: section.hidden };
  await save();
  for (const article of section.articles) {
    const old = map.pages[article.path];
    if (old?.seeded) continue;
    const pageId = await ensurePage(client, id, article.title, old?.id);
    const record = map.pages[article.path] ||= { id: pageId, sectionId: id, title: article.title, label: article.label, page: article.template.page, section: article.template.section, bindings: {}, seeded: false };
    templates[article.path] ||= article.template;
    await writeJSON(templatesFile, templates);
    await save();
    await seedBlocks(client, pageId, article.blocks, record.bindings, save, media);
    record.seeded = true;
    await save();
    console.log(`Seeded ${article.path}`);
  }
}
console.log('Seed complete. Commit notion/map.json and notion/templates.json before enabling the workflow.');
