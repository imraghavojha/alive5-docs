import { Client } from '@notionhq/client';
import { signature } from './html.mjs';
import { uploadImage, localizeImages } from './media.mjs';

export function credentials() {
  const { NOTION_TOKEN: token, NOTION_ROOT_PAGE_ID: rootId } = process.env;
  if (!token || !rootId) throw new Error('Set NOTION_TOKEN and NOTION_ROOT_PAGE_ID.');
  if (!/^[a-f0-9-]{32,36}$/i.test(rootId)) throw new Error('NOTION_ROOT_PAGE_ID must be a page ID.');
  return { client: new Client({ auth: token, notionVersion: '2025-09-03', maxRetries: 5 }), rootId: rootId.replaceAll('-', '').toLowerCase() };
}
export async function listChildren(client, id) {
  const blocks = [];
  let cursor;
  do {
    const page = await client.blocks.children.list({ block_id: id, page_size: 100, ...(cursor ? { start_cursor: cursor } : {}) });
    blocks.push(...page.results.filter(b => !b.archived && !b.in_trash));
    cursor = page.has_more ? page.next_cursor : null;
    if (page.has_more && !cursor) throw new Error('Notion pagination ended without a cursor.');
  } while (cursor);
  return blocks;
}
export async function readBlocks(client, id) {
  const blocks = await listChildren(client, id);
  for (const b of blocks) {
    if (b.type === 'child_page' || b.type === 'child_database') throw new Error('Article bodies cannot contain nested pages or databases. Add articles under a section.');
    if (b.has_children) b[b.type].children = await readBlocks(client, b.id);
  }
  return blocks;
}
export async function readTree(client, rootId) {
  const root = await client.pages.retrieve({ page_id: rootId });
  if (root.archived || root.in_trash) throw new Error('The Notion root is archived.');
  const sections = [];
  for (const section of (await listChildren(client, rootId)).filter(b => b.type === 'child_page')) {
    const articles = [];
    for (const article of (await listChildren(client, section.id)).filter(b => b.type === 'child_page')) {
      articles.push({ id: article.id, title: article.child_page.title, blocks: await readBlocks(client, article.id) });
    }
    sections.push({ id: section.id, title: section.child_page.title, articles });
  }
  return sections;
}
export function requestBlock(block) {
  const { children, ...data } = block[block.type];
  if (block.type === 'table') data.children = children.slice(0, 100).map(requestBlock);
  return { object: 'block', type: block.type, [block.type]: data };
}
export async function seedBlocks(client, parent, source, bindings, save, media) {
  const existing = await listChildren(client, parent);
  if (existing.length > source.length) throw new Error('An unfinished seed page was edited. Move it out of the root before retrying seed.');
  for (let offset = 0; offset < source.length; ) {
    if (offset >= existing.length) {
      const batch = [];
      for (const block of source.slice(offset, offset + 40)) batch.push(requestBlock(media ? await uploadImage(client, block, media.root) : block));
      const response = await client.blocks.children.append({ block_id: parent, children: batch });
      if (response.results.length !== batch.length) throw new Error('Notion returned an incomplete append response.');
      existing.push(...response.results);
    }
    const local = source[offset], remote = existing[offset];
    if (media && remote.type === 'image' && remote.image.type === 'file') await localizeImages([{ articles: [{ blocks: [remote] }] }], media.fetchImage || fetch, media.known);
    if (signature(local) !== signature(remote)) throw new Error(`An unfinished seed block was edited (${local.type}). Refusing to overwrite it.`);
    bindings[local.id] = remote.id;
    await save();
    if (local[local.type].children?.length) await seedBlocks(client, remote.id, local[local.type].children, bindings, save, media);
    offset++;
  }
}
export async function ensurePage(client, parent, title, id) {
  if (id) return id;
  const matches = (await listChildren(client, parent)).filter(b => b.type === 'child_page' && b.child_page.title === title);
  if (matches.length) throw new Error(`A page titled "${title}" already exists without a mapping. Use an empty root, or restore notion/map.json.`);
  const page = await client.pages.create({ parent: { type: 'page_id', page_id: parent }, properties: { title: { type: 'title', title: [{ type: 'text', text: { content: title } }] } } });
  return page.id;
}
