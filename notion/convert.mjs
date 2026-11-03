import { attr, hasClass, children, walk, text, rich, richText, parseHTML, BASE, signature } from './html.mjs';

import { widgetNotes, widgetIcon } from './widgets.mjs';

export function convert(html, path) {
  const doc = parseHTML(html);
  const main = walk(doc).find(n => n.tagName === 'main');
  const h1 = walk(main).find(n => n.tagName === 'h1');
  const body = walk(doc).find(n => n.tagName === 'body');
  const blocks = [], leaves = {};
  const home = path === 'index.html';
  const card = n => home && n?.tagName === 'div' && children(n).some(c => c.tagName === 'strong') && children(n).some(c => c.tagName === 'span');
  const quickstart = n => home && hasClass(n, 'head') && hasClass(n.parentNode, 'keycard');
  let serial = 0;
  const slice = n => html.slice(n.sourceCodeLocation.startOffset, n.sourceCodeLocation.endOffset);
  const inner = n => html.slice(n.sourceCodeLocation.startTag?.endOffset ?? n.sourceCodeLocation.startOffset, n.sourceCodeLocation.endTag?.startOffset ?? n.sourceCodeLocation.endOffset);
  const shell = n => ({ open: html.slice(n.sourceCodeLocation.startOffset, n.sourceCodeLocation.startTag?.endOffset ?? n.sourceCodeLocation.startOffset), close: n.sourceCodeLocation.endTag ? html.slice(n.sourceCodeLocation.endTag.startOffset, n.sourceCodeLocation.endOffset) : '' });
  const add = (n, type, data, target, extra = {}) => {
    let parent = n.parentNode;
    while (parent && parent.tagName !== 'a') parent = parent.parentNode;
    const id = `block-${++serial}`;
    const block = { object: 'block', id, type, [type]: data };
    target.push(block);
    const leaf = { key: id, type, ...shell(n), html: slice(n), inner: inner(n), signature: signature(block), ...(parent ? { inLink: true } : {}), ...extra };
    leaves[id] = leaf;
    return leaf;
  };
  function layout(n, target) {
    if (!n.sourceCodeLocation) return { open: '', close: '', parts: children(n).map(c => layout(c, target)) };
    if (n.nodeName === '#comment' || (n.nodeName === '#text' && !text(n).trim())) return slice(n);
    if (n === h1 || hasClass(n, 'crumbs') || hasClass(n, 'pager') || n.tagName === 'svg' || attr(n, 'aria-hidden') === 'true' && !hasClass(n, 'devres-term') || ['button', 'source'].includes(n.tagName)) return slice(n);
    if (home && hasClass(n, 'linecard')) return slice(n);
    const widget = attr(n, 'data-automation') ? 'connector-scenarios' : hasClass(n, 'zapier-product') ? 'zapier-previews' : hasClass(n, 'tryout-section') ? 'cli-preview' : null;
    if (widget) return add(n, 'callout', { rich_text: rich(widgetNotes[widget]), icon: widgetIcon }, target, { widget });
    const illustration = hasClass(n, 'dashboard-figure') ? ['api-key-settings', 'Illustration of the API-key settings. No account data shown.'] : hasClass(n, 'devres-term') ? ['api-terminal', attr(n, 'aria-label')] : null;
    if (illustration) return add(n, 'image', { type: 'external', external: { url: BASE + `assets/notion/${illustration[0]}.png` }, caption: rich(illustration[1]) }, target);
    if (n.tagName === 'img') return add(n, 'image', { type: 'external', external: { url: new URL(attr(n, 'src'), BASE + path).href }, caption: rich(attr(n, 'alt')) }, target);
    if (hasClass(n, 'code') && n.tagName === 'div') {
      const pres = children(n).filter(c => c.tagName === 'pre');
      const head = children(n).find(c => hasClass(c, 'code-head'));
      const tabs = head ? walk(head).filter(c => hasClass(c, 'tab')) : [];
      const name = head && walk(head).find(c => hasClass(c, 'name'));
      const parts = [];
      for (const [i, pre] of pres.entries()) {
        const caption = text(tabs[i] || name || { childNodes: [] }).trim();
        const language = /node|javascript/i.test(caption) ? 'javascript' : /json|response/i.test(caption) ? 'json' : /html/i.test(caption) ? 'html' : /yaml/i.test(caption) ? 'yaml' : /curl|bash|shell/i.test(caption) ? 'bash' : 'plain text';
        parts.push(add(pre, 'code', { rich_text: rich(text(pre)), caption: rich(caption), language }, target));
      }
      if (!pres.length) throw new Error(`Code container without pre: ${path}`);
      return { ...shell(n), parts, code: true, original: slice(n), keys: parts.map(p => p.key), head: head ? slice(head) : '' };
    }
    if (n.tagName === 'table') {
      const rows = walk(n).filter(c => c.tagName === 'tr');
      const rowBlocks = [];
      const rowTemplates = rows.map(row => {
        const cells = children(row).filter(c => ['td', 'th'].includes(c.tagName));
        return add(row, 'table_row', { cells: cells.map(c => richText(c, path)) }, rowBlocks, { cells: cells.map(c => ({ ...shell(c), inner: inner(c) })) });
      });
      const width = rowBlocks[0].table_row.cells.length;
      if (rowBlocks.some(r => r.table_row.cells.length !== width)) throw new Error(`Nonrectangular table: ${path}`);
      return add(n, 'table', { table_width: width, has_column_header: rows[0] && children(rows[0]).some(c => c.tagName === 'th'), has_row_header: false, children: rowBlocks }, target, { rows: rowTemplates, header: slice(n).includes('<thead>') });
    }
    if (home && n.tagName === 'li' && hasClass(n, 'coming-soon')) return add(n, 'bulleted_list_item', { rich_text: rich(children(n).filter(c => c.tagName).map(c => text(c).trim()).join(' — ')) }, target);
    if (card(n) || quickstart(n)) return { ...shell(n), parts: children(n).map(c => layout(c, target)) };
    if (n.tagName === 'li') {
      const nested = children(n).filter(c => ['p', 'ul', 'ol'].includes(c.tagName));
      const head = { ...n, childNodes: children(n).filter(c => !nested.includes(c)) };
      const sub = [];
      const subLayout = nested.map(c => layout(c, sub));
      return add(n, n.parentNode.tagName === 'ol' ? 'numbered_list_item' : 'bulleted_list_item', { rich_text: richText(head, path), ...(sub.length ? { children: sub } : {}) }, target, { subLayout, head: children(n).filter(c => !nested.includes(c)).map(slice).join('') });
    }
    const isLeaf = ['p', 'h2', 'h3', 'h4', 'h5', 'h6', 'pre', 'figcaption'].includes(n.tagName) || !children(n).some(c => c.tagName && ['p', 'h1', 'h2', 'h3', 'div', 'section', 'ul', 'ol', 'li', 'table', 'figure', 'img', 'a'].includes(c.tagName));
    if (isLeaf && text(n).trim()) {
      const cardTitle = card(n.parentNode) && n.tagName === 'strong';
      const quickstartTitle = quickstart(n.parentNode) && n === children(n.parentNode).find(c => c.tagName === 'span');
      const sectionTitle = home && n.tagName === 'h3' && hasClass(n.parentNode, 'browse-group');
      const type = cardTitle ? 'heading_3' : quickstartTitle || sectionTitle ? 'heading_2' : /^h[2-6]$/.test(n.tagName) ? `heading_${Math.min(3, Number(n.tagName[1]))}` : n.tagName === 'pre' ? 'code' : hasClass(n, 'note') ? 'callout' : 'paragraph';
      const data = type === 'code' ? { rich_text: rich(text(n)), caption: [], language: 'plain text' } : { rich_text: richText(n, path) };
      if (quickstartTitle) data.rich_text = rich(text(n).trim() === 'ACCOUNT' ? 'Account' : 'Developer quickstart');
      return add(n, type, data, target);
    }
    if (!children(n).length) return slice(n);
    return { ...shell(n), ...(n.tagName === 'a' ? { link: true } : {}), parts: children(n).map(c => layout(c, target)) };
  }
  const tree = { open: '', close: '', parts: children(main).map(n => layout(n, blocks)) };
  const loc = main.sourceCodeLocation;
  return { blocks, template: { path, title: text(h1), page: attr(body, 'data-page'), section: attr(body, 'data-section'), before: html.slice(0, loc.startTag.endOffset), after: html.slice(loc.endTag.startOffset), tree, leaves } };
}
