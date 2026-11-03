import { randomUUID } from 'node:crypto';
import { inventory } from './site.mjs';

export async function offlineSite(root) {
  const source = await inventory(root);
  const map = { version: 1, rootId: randomUUID(), navigation: { menu: source.menu, sidebar: source.sidebar }, sections: {}, pages: {} };
  const templates = {}, tree = [];
  for (const section of source.sections) {
    const id = randomUUID();
    map.sections[id] = { title: section.title, hidden: section.hidden };
    const entry = { id, title: section.title, articles: [] };
    tree.push(entry);
    for (const a of section.articles) {
      const pageId = randomUUID(), bindings = {};
      const api = b => {
        const id = randomUUID(); bindings[b.id] = id;
        const data = structuredClone(b[b.type]);
        const normalize = values => values.map(r => ({ ...r, plain_text: r.text.content, href: r.text.link?.url || null,
          annotations: { bold: false, italic: false, strikethrough: false, underline: false, code: false, color: 'default', ...r.annotations } }));
        for (const key of ['rich_text', 'caption']) if (data[key]) data[key] = normalize(data[key]);
        if (data.cells) data.cells = data.cells.map(normalize);
        if (data.children) data.children = data.children.map(api);
        return { object: 'block', id, type: b.type, has_children: !!data.children?.length, archived: false, in_trash: false, [b.type]: data };
      };
      entry.articles.push({ id: pageId, title: a.title, blocks: a.blocks.map(api) });
      templates[a.path] = a.template;
      map.pages[a.path] = { id: pageId, sectionId: id, title: a.title, label: a.label, page: a.template.page, section: a.template.section, bindings, seeded: true };
    }
  }
  return { tree, map, templates };
}
