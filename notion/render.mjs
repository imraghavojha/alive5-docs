import { escape, plain, renderRich, signature, slug, siteURL, fragment, walk, text } from './html.mjs';

import { widgetNotes } from './widgets.mjs';

const keys = node => typeof node === 'string' ? [] : node.key ? [node.key] : (node.parts || []).flatMap(keys);
const live = blocks => blocks.filter(b => !b.archived && !b.in_trash);
export function renderBlocks(blocks, template = { leaves: {} }, path = template.path || 'index.html', listTag) {
  blocks = live(blocks);
  const render = b => renderBlock(b, template, path);
  let out = '';
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    if (/^(bulleted|numbered)_list_item$/.test(b.type)) {
      const group = [b];
      while (blocks[i + 1]?.type === b.type) group.push(blocks[++i]);
      const tag = b.type === 'numbered_list_item' ? 'ol' : 'ul';
      out += tag === listTag ? group.map(render).join('') : `<${tag}>${group.map(render).join('')}</${tag}>`;
    } else if (b.type === 'code') {
      const group = [b];
      while (plain(group.at(-1).code.caption) && blocks[i + 1]?.type === 'code' && plain(blocks[i + 1].code.caption)) group.push(blocks[++i]);
      out += codeGroup(group, template, path);
    } else out += render(b);
  }
  return out;
}
export function hasContent(blocks, template, path) {
  const doc = fragment(renderBlocks(blocks, { ...template, quiet: true }, path));
  return !!text(doc).trim() || walk(doc).some(n => ['pre', 'img', 'table'].includes(n.tagName));
}
function codeGroup(blocks, template, path, node) {
  const head = blocks.length > 1 ? blocks.map((b, i) => `<button class="tab" aria-selected="${i === 0}" type="button">${escape(plain(b.code.caption) || b.code.language)}</button>`).join('') : `<span class="name">${escape(plain(blocks[0].code.caption) || blocks[0].code.language)}</span>`;
  return `${node?.open || '<div class="code">'}<div class="code-head">${head}<button class="copy" type="button">Copy</button></div>${blocks.map((b, i) => `<pre${i ? ' hidden' : ''}>${template.leaves[b.id]?.signature === signature(b) ? template.leaves[b.id].inner : escape(plain(b.code.rich_text))}</pre>`).join('')}${node?.close || '</div>'}`;
}
function fallback(b, path) {
  const d = b[b.type] || {};
  const url = d.url || d.external?.url || d.file?.url;
  const label = plain(d.rich_text) || plain(d.caption) || d.text || d.title || url;
  if (typeof label !== 'string' || !label) return '';
  return `<p>${renderRich([{ type: 'text', text: { content: label, link: url ? { url } : null } }], path)}</p>`;
}
function renderBlock(b, template, path) {
  const d = b[b.type] || {};
  const leaf = template.leaves[b.id];
  const same = leaf?.type === b.type;
  const unchanged = same && leaf.signature === signature(b);
  const sub = live(d.children || []);
  if (leaf?.widget && b.type === 'callout') return leaf.html;
  if (b.type === 'callout') {
    const widget = Object.values(template.leaves).find(l => l.widget && [widgetNotes[l.widget], `⟦${l.widget}⟧`].includes(plain(d.rich_text)));
    if (widget) return widget.html;
    if (/^⟦.*⟧$/.test(plain(d.rich_text))) throw new Error(`Unknown widget marker: ${plain(d.rich_text)}`);
  }
  if (b.type === 'table') {
    if (unchanged && sub.length === leaf.rows.length && sub.every((r, i) => r.id === leaf.rows[i].key && signature(r) === leaf.rows[i].signature)) return leaf.html;
    const rows = sub.map((r, i) => {
      if (r.type !== 'table_row' || r.table_row.cells.length !== d.table_width) throw new Error('Invalid table row');
      const old = template.leaves[r.id];
      if (old && signature(r) === old.signature) return old.html;
      return `<tr>${r.table_row.cells.map((c, j) => {
        const tag = (i === 0 && d.has_column_header) || (j === 0 && d.has_row_header) ? 'th' : 'td';
        const cell = old?.cells[j];
        return `${cell?.open?.startsWith(`<${tag}`) ? cell.open : `<${tag}>`}${renderRich(c, path)}</${tag}>`;
      }).join('')}</tr>`;
    });
    return `<table class="tbl">${d.has_column_header ? `<thead>${rows.shift() || ''}</thead>` : ''}<tbody>${rows.join('')}</tbody></table>`;
  }
  if (b.type === 'image') {
    if (unchanged) return leaf.html;
    const url = siteURL(d.external?.url || d.file?.url, path);
    if (!url) return `<p>${escape(plain(d.caption))}</p>`;
    const img = `<img src="${escape(url)}" alt="${escape(plain(d.caption))}" loading="lazy">`;
    return same ? img : `<figure class="page-art">${img}</figure>`;
  }
  if (b.type === 'code') return unchanged ? leaf.html : `${same ? leaf.open : '<pre>'}${escape(plain(d.rich_text))}${same ? leaf.close : '</pre>'}`;
  if (b.type === 'divider') return '<hr>';
  if (b.type === 'bookmark' || b.type === 'link_preview') return fallback(b, path);
  if (['column_list', 'column', 'synced_block'].includes(b.type)) return renderBlocks(sub, template, path);
  const tag = { paragraph: 'p', heading_1: 'h2', heading_2: 'h2', heading_3: 'h3', bulleted_list_item: 'li', numbered_list_item: 'li', callout: 'div', quote: 'blockquote', toggle: 'details', to_do: 'div' }[b.type];
  if (!tag) {
    if (!template.quiet) console.warn(`${path}: unsupported Notion block ${b.type}; using fallback.`);
    return fallback(b, path);
  }
  if (unchanged && !sub.length && !leaf.subLayout?.length) return leaf.html;
  const body = unchanged ? leaf.subLayout ? leaf.head : leaf.inner : renderRich(d.rich_text, path, leaf?.inLink);
  const nested = leaf?.subLayout?.length ? renderLayout({ parts: leaf.subLayout, open: '', close: '' }, sub, template, path) : renderBlocks(sub, template, path);
  if (b.type === 'toggle') return `<details><summary>${body}</summary>${nested}</details>`;
  const attrs = /^heading_/.test(b.type) ? ` id="${slug(plain(d.rich_text))}-${b.id.replaceAll('-', '').slice(0, 8)}"` : b.type === 'callout' ? ' class="note"' : '';
  return `${same ? leaf.open : `<${tag}${attrs}>`}${b.type === 'to_do' ? `<input type="checkbox" disabled${d.checked ? ' checked' : ''}> ` : ''}${body}${nested}${same ? leaf.close : `</${tag}>`}`;
}
export function renderLayout(node, blocks, template, path) {
  if (node.key) return blocks.map(b => renderBlock(b, template, path)).join('');
  if (node.code) {
    if (blocks.every(b => b.type === 'code') && blocks.length === node.keys.length && blocks.every((b, i) => b.id === node.keys[i] && signature(b) === template.leaves[b.id].signature)) return node.original;
    if (blocks.every(b => b.type === 'code')) return codeGroup(blocks, template, path, node);
    return renderBlocks(blocks, template, path);
  }
  const entries = [], owner = new Map();
  let prefix = '';
  for (const part of node.parts || []) {
    if (typeof part === 'string') { prefix += part; continue; }
    const descendants = keys(part);
    if (!descendants.length) { prefix += renderLayout(part, [], template, path); continue; }
    const entry = { part, prefix };
    entries.push(entry);
    for (const key of descendants) owner.set(key, entry);
    prefix = '';
  }
  const listTag = node.open?.match(/^<(ol|ul)\b/)?.[1];
  for (let i = 0; i < blocks.length; i++) {
    if (owner.has(blocks[i].id) || !/^(numbered|bulleted)_list_item$/.test(blocks[i].type)) continue;
    const tag = blocks[i].type === 'numbered_list_item' ? 'ol' : 'ul';
    const type = blocks[i].type;
    let next = i + 1;
    while (blocks[next]?.type === type && !owner.has(blocks[next].id)) next++;
    const adjacent = [blocks[i - 1]?.type === type && owner.get(blocks[i - 1].id), blocks[next]?.type === type && owner.get(blocks[next].id)];
    const entry = adjacent.find(e => e?.part?.open?.match(new RegExp(`^<${tag}\\b`)));
    if (entry) owner.set(blocks[i].id, entry);
  }
  let opening = node.open || '';
  if (node.link && blocks.some(b => template.leaves[b.id]?.signature !== signature(b))) {
    const url = blocks.flatMap(b => b[b.type].rich_text || []).map(r => r.text?.link?.url).find(Boolean);
    if (url) {
      const safe = siteURL(url, path);
      opening = opening.replace(/href="[^"]*"/, () => safe ? `href="${escape(safe)}"` : '');
    }
  }
  let out = opening + (entries[0]?.prefix || '');
  if (entries.length) entries[0].prefix = '';
  const emitted = new Set();
  for (let i = 0; i < blocks.length; i++) {
    const entry = owner.get(blocks[i].id);
    if (!entry) {
      const added = [blocks[i]];
      while (blocks[i + 1] && !owner.has(blocks[i + 1].id)) added.push(blocks[++i]);
      out += renderBlocks(added, template, path, listTag);
      continue;
    }
    const group = [blocks[i]];
    if (!entry.part.key) {
      const listType = /^<(ol|ul)\b/.test(entry.part.open || '') && blocks[i].type;
      while (blocks[i + 1]) {
        if (listType && blocks[i + 1].type !== listType) break;
        const next = owner.get(blocks[i + 1].id);
        const following = blocks.slice(i + 1).map(b => owner.get(b.id)).find(Boolean);
        if (next !== entry && (next || !(following === entry || entry.part.code && blocks[i + 1].type === 'code'))) break;
        group.push(blocks[++i]);
      }
    }
    out += (emitted.has(entry) ? '' : entry.prefix) + renderLayout(entry.part, group, template, path);
    emitted.add(entry);
  }
  return out + prefix + (node.close || '');
}
export function renderPage(blocks, template, title = template.title) {
  let result = template.before + renderLayout(template.tree, live(blocks), template, template.path) + template.after;
  if (title !== template.title) {
    result = result.replace(/(<h1\b[^>]*>)[\s\S]*?(<\/h1>)/, (_, open, close) => open + escape(title) + close)
      .replaceAll(escape(template.title) + ' · Alive5 Docs', () => escape(title) + ' · Alive5 Docs');
  }
  return result;
}
