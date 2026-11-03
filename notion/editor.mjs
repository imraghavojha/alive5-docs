import { readBlocks, listChildren, seedBlocks } from './api.mjs';
import { remapBlocks } from './site.mjs';
import { renderPage } from './render.mjs';

export async function ensureReference(client, pageId, url) {
  const blocks = await listChildren(client, pageId);
  if (blocks.some(b => b.paragraph?.rich_text.some(r => r.text?.link?.url === url))) return;
  await client.blocks.children.append({ block_id: pageId, children: [{ object: 'block', type: 'paragraph', paragraph: {
    rich_text: [{ type: 'text', text: { content: 'Open the official API reference in Postman.', link: { url } } }],
  } }] });
}

export async function updateEditor(client, article, record, previous, save, media) {
  if (record.editorLayout === 1) return false;
  const homepage = article.path === 'index.html';
  const widgets = article.blocks.filter(b => article.template.leaves[b.id]?.widget);
  if (!homepage && !widgets.length) return false;
  if (!record.editorUpdate) {
    const current = await readBlocks(client, record.id);
    if (renderPage(remapBlocks(current, record.bindings), previous, record.title) !== renderPage(article.blocks, article.template)) {
      throw new Error(`Notion has unsynced edits in ${article.path}. Build them before updating its editor layout.`);
    }
    if (homepage) {
      record.editorUpdate = { oldIds: current.map(b => b.id), bindings: {} };
      await save();
    }
  }
  if (homepage) {
    const update = record.editorUpdate;
    await seedBlocks(client, record.id, article.blocks, update.bindings, save, media, update.oldIds);
    const active = new Set((await listChildren(client, record.id)).map(b => b.id));
    for (const id of update.oldIds) if (active.has(id)) await client.blocks.delete({ block_id: id });
    record.bindings = update.bindings;
    delete record.editorUpdate;
  } else {
    for (const b of widgets) await client.blocks.update({ block_id: record.bindings[b.id], callout: b.callout });
  }
  record.editorLayout = 1;
  return true;
}
