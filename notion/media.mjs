import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { resolve, basename } from 'node:path';
import { BASE } from './html.mjs';

export async function knownImages(root) {
  const result = new Map();
  const dir = resolve(root, 'assets/notion');
  for (const name of await readdir(dir).catch(e => { if (e.code === 'ENOENT') return []; throw e; })) {
    const bytes = await readFile(resolve(dir, name));
    result.set(createHash('sha256').update(bytes).digest('hex').slice(0, 24), `assets/notion/${name}`);
  }
  return result;
}
export async function uploadImage(client, block, root) {
  const url = block.type === 'image' && block.image.external?.url;
  if (!url || !url.startsWith(BASE + 'assets/notion/')) return block;
  const filename = basename(new URL(url).pathname);
  const type = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', svg: 'image/svg+xml' }[filename.split('.').at(-1)];
  if (!type) throw new Error('Unsupported seed image format.');
  const data = new Blob([await readFile(resolve(root, 'assets/notion', filename))], { type });
  const upload = await client.fileUploads.create({ mode: 'single_part', filename, content_type: type });
  const sent = await client.fileUploads.send({ file_upload_id: upload.id, file: { data, filename } });
  if (sent.status !== 'uploaded') throw new Error('Notion image upload did not complete.');
  return { ...block, image: { type: 'file_upload', file_upload: { id: upload.id }, caption: block.image.caption } };
}
export async function localizeImages(tree, fetchImage = fetch, known = new Map()) {
  const files = new Map();
  async function visit(blocks) {
    for (let i = 0; i < blocks.length; i++) {
      const b = blocks[i];
      if (b.type === 'image' && b.image.type === 'file') {
        const url = new URL(b.image.file.url);
        if (url.protocol !== 'https:' || !/\.(amazonaws\.com|notion-static\.com|notion\.so|notion\.site)$/.test(url.hostname)) throw new Error('Unexpected Notion image host.');
        const response = await fetchImage(url, { signal: AbortSignal.timeout(30000), redirect: 'error' });
        if (!response.ok) throw new Error(`Image download failed: ${response.status}`);
        const mime = response.headers.get('content-type')?.split(';')[0];
        const ext = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif' }[mime];
        if (!ext) {
          console.warn(`Skipping uploaded image ${b.id}: unsupported image type ${mime}.`);
          blocks.splice(i--, 1);
          continue;
        }
        const buffer = Buffer.from(await response.arrayBuffer());
        if (buffer.length > 20 * 1024 * 1024) throw new Error('Image exceeds 20 MB.');
        const hash = createHash('sha256').update(buffer).digest('hex').slice(0, 24);
        const name = known.get(hash) || `assets/notion/${hash}.${ext}`;
        files.set(name, buffer);
        b.image = { type: 'external', external: { url: BASE + name }, caption: b.image.caption || [] };
      }
      if (b[b.type]?.children) await visit(b[b.type].children);
    }
  }
  for (const section of tree) for (const article of section.articles) await visit(article.blocks);
  return files;
}
