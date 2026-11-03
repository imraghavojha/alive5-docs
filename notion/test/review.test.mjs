import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { offlineSite } from '../offline.mjs';
import { ROOT } from '../site.mjs';
import { buildTree } from '../build.mjs';
import { convert } from '../convert.mjs';
import { renderPage, renderBlocks } from '../render.mjs';
import { rich, parseHTML, walk, attr, text } from '../html.mjs';

const fixture = await offlineSite(ROOT);
const paragraph = value => ({ id: 'new-paragraph', type: 'paragraph', paragraph: { rich_text: rich(value) } });
const build = (tree, map = fixture.map) => buildTree(tree, map, fixture.templates);

test('review 1: reject mass deletion, homepage deletion, and empty existing bodies', async () => {
  const empty = structuredClone(fixture.tree);
  empty.forEach(s => { s.articles = []; });
  await assert.rejects(build(empty), /delet/i);
  const four = structuredClone(fixture.tree);
  four[2].articles.splice(0, 4);
  await assert.rejects(build(four), /3|three/);
  const home = structuredClone(fixture.tree);
  home[0].articles = [];
  await assert.rejects(build(home), /index\.html/);
  for (const blocks of [[], [{ ...paragraph('Removed'), archived: true }]]) {
    const tree = structuredClone(fixture.tree);
    tree[1].articles[0].blocks = blocks;
    await assert.rejects(build(tree), /empty.*api\/index\.html/i);
  }
  const three = structuredClone(fixture.tree);
  three[2].articles.splice(0, 3);
  assert.equal((await build(three)).removed.length, 3);
});

test('review 2: obfuscated and nonallowlisted URLs become inert text', () => {
  for (const url of [' javascript:alert(1)', 'java\tscript:alert(1)', '\nJaVa\rScRiPt:alert(1)', 'data:text/html,<script>alert(1)</script>', 'vbscript:alert(1)', 'tel:123', 'https://[broken']) {
    const p = paragraph('<unsafe>');
    p.paragraph.rich_text[0].text.link = { url };
    assert.equal(renderBlocks([p]), '<p>&lt;unsafe&gt;</p>', url);
    const bookmark = renderBlocks([{ id: 'bookmark', type: 'bookmark', bookmark: { url, caption: rich('<unsafe>') } }]);
    assert.equal(bookmark, '<p>&lt;unsafe&gt;</p>', url);
    const { blocks, template } = convert('<main><h1>Title</h1><a href="https://example.com"><h3>Card</h3><p>Details</p></a></main>', 'index.html');
    blocks[0].heading_3.rich_text = [{ type: 'text', text: { content: 'Card', link: { url } } }];
    assert.ok(walk(parseHTML(renderPage(blocks, template))).filter(n => n.tagName === 'a').every(n => !attr(n, 'href')));
  }
  for (const url of ['https://example.com/a', 'http://example.com/', 'mailto:docs@example.com', '../api/errors.html', '#key']) {
    const p = paragraph('Allowed');
    p.paragraph.rich_text[0].text.link = { url };
    assert.match(renderBlocks([p], { leaves: {} }, 'api/authentication.html'), /<a href="/);
  }
});

test('review 3: inserted list items keep one container and genuine child lists', () => {
  for (const tag of ['ol', 'ul']) {
    const type = tag === 'ol' ? 'numbered_list_item' : 'bulleted_list_item';
    for (const position of [0, 1, 2]) {
      const { blocks, template } = convert(`<main><h1>Title</h1><${tag}><li>First</li><li>Last</li></${tag}></main>`, 'index.html');
      blocks.splice(position, 0, { id: 'inserted', type, [type]: { rich_text: rich('Inserted'), children: [{ id: 'nested', type, [type]: { rich_text: rich('Nested') } }] } });
      const doc = parseHTML(renderPage(blocks, template));
      const lists = walk(doc).filter(n => n.tagName === tag);
      assert.equal(lists.length, 2);
      assert.equal(lists[0].childNodes.filter(n => n.tagName === 'li').length, 3);
      assert.equal(lists[1].parentNode.tagName, 'li');
      assert.match(text(lists[1].parentNode), /InsertedNested/);
    }
  }
});

test('review 4: unsupported blocks warn with the page and preserve safe fallback content', async t => {
  const warnings = [];
  t.mock.method(console, 'warn', message => warnings.push(message));
  const tree = structuredClone(fixture.tree);
  tree[1].articles[0].blocks.push(
    { id: 'pdf', type: 'pdf', pdf: { external: { url: 'https://example.com/a?x=1&y=2' }, caption: rich('<PDF>') } },
    { id: 'embed', type: 'embed', embed: { url: ' javascript:alert(1)', caption: rich('<embed>') } },
    { id: 'text', type: 'unsupported', unsupported: { rich_text: rich('<text>') } },
    { id: 'empty', type: 'unsupported', unsupported: {} },
  );
  const result = await build(tree);
  const html = result.output.get('api/index.html');
  assert.match(html, /href="https:\/\/example.com\/a\?x=1&amp;y=2">&lt;PDF&gt;<\/a>/);
  assert.match(html, /&lt;embed&gt;/);
  assert.match(html, /&lt;text&gt;/);
  assert.equal(result.output.size, 22);
  assert.equal(warnings.length, 4);
  assert.ok(warnings.every(w => w.includes('api/index.html')));
});

test('review 5: deleted paths stay reserved and restored page IDs recover their URL and bindings', async () => {
  const tree = structuredClone(fixture.tree);
  const removed = tree[4].articles.splice(1, 1)[0];
  const path = 'connectors/zapier.html';
  const first = await build(tree);
  assert.ok(first.map.tombstones[removed.id]);
  assert.ok(first.removed.includes(path));
  const reserved = structuredClone(first.map);
  reserved.tombstones['another-page'] = { path: 'new-guide.html' };
  tree[4].articles.push({ id: 'new-page', title: 'New guide', blocks: [paragraph('New')] });
  const second = await build(tree, reserved);
  assert.equal(second.map.pages['new-guide-2.html'].id, 'new-page');
  removed.title = 'A different title';
  tree[4].articles.push(removed);
  const restored = await build(tree, second.map);
  assert.equal(restored.map.pages[path].id, removed.id);
  assert.deepEqual(restored.map.pages[path].bindings, fixture.map.pages[path].bindings);
  assert.ok(restored.output.has(path));
  assert.ok(!restored.map.tombstones[removed.id]);
});

test('review 6: managed Notion links and page mentions resolve, including forward links to new pages', async () => {
  const tree = structuredClone(fixture.tree);
  const target = fixture.map.pages['api/authentication.html'].id;
  const newId = '01234567-89ab-cdef-0123-456789abcdef';
  tree[5].articles.push({ id: newId, title: 'New target', blocks: [paragraph('New')] });
  const p = paragraph('');
  p.paragraph.rich_text = [
    ...[`https://www.notion.so/${target.replaceAll('-', '')}`, `https://www.notion.so/Authentication-${target}`, `https://team.notion.site/${newId.replaceAll('-', '')}#section`].map(url => ({ type: 'text', text: { content: 'Link', link: { url } } })),
    { type: 'mention', plain_text: 'Authentication', mention: { type: 'page', page: { id: target } } },
    { type: 'text', text: { content: 'External', link: { url: 'https://www.notion.so/ffffffffffffffffffffffffffffffff' } } },
  ];
  tree[1].articles[0].blocks.push(p);
  const result = await build(tree);
  const html = result.output.get('api/index.html');
  assert.equal((html.match(/href="\.\.\/api\/authentication.html">(?:Link|Authentication)<\/a>/g) || []).length, 3);
  assert.match(html, /href="\.\.\/new-target.html#section">Link<\/a>/);
  assert.match(html, /href="https:\/\/www.notion.so\/ffffffffffffffffffffffffffffffff">External<\/a>/);
});

test('review 7: Pages reconciliation retries failed or stale builds even without content changes', async () => {
  const workflow = await readFile(`${ROOT}/.github/workflows/notion-sync.yml`, 'utf8');
  const step = workflow.slice(workflow.indexOf('      - name: Request a Pages build'));
  assert.doesNotMatch(step, /steps\.commit\.outputs\.changed/);
  assert.match(step, /if:.*!cancelled\(\)/);
  const script = step.match(/        run: \|\n([\s\S]*)$/)?.[1].replace(/^          /gm, '');
  assert.ok(script);
  const dir = await mkdtemp(join(tmpdir(), 'notion-pages-test-'));
  try {
    await writeFile(join(dir, 'gh'), `#!/bin/bash\ncase "$*" in\n  *commits/main*) echo head ;;\n  *builds/latest*) if [ "$LATEST" = missing ]; then exit 1; fi; printf '%s\\n' "$LATEST" ;;\n  *'--method POST'*) echo request >> "$CALLS"; exit "\${POST_FAIL:-0}" ;;\n  *) exit 9 ;;\nesac\n`, { mode: 0o755 });
    for (const [latest, expected] of [['head\tbuilt', 0], ['old\tbuilt', 1], ['head\terrored', 1], ['head\tbuilding', 0], ['head\tqueued', 0], ['missing', 1]]) {
      const calls = join(dir, 'calls');
      await writeFile(calls, '');
      execFileSync('bash', ['-euo', 'pipefail', '-c', script], { env: { ...process.env, PATH: `${dir}:${process.env.PATH}`, GITHUB_REPOSITORY: 'owner/repo', LATEST: latest, CALLS: calls } });
      assert.equal((await readFile(calls, 'utf8')).trim() ? 1 : 0, expected, latest);
    }
    const calls = join(dir, 'calls');
    await writeFile(calls, '');
    const env = { ...process.env, PATH: `${dir}:${process.env.PATH}`, GITHUB_REPOSITORY: 'owner/repo', LATEST: 'old\tbuilt', CALLS: calls };
    assert.throws(() => execFileSync('bash', ['-euo', 'pipefail', '-c', script], { env: { ...env, POST_FAIL: '42' } }));
    execFileSync('bash', ['-euo', 'pipefail', '-c', script], { env });
    assert.equal((await readFile(calls, 'utf8')).trim().split('\n').length, 2);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('re-check 1: site URL rewriting never turns a path into an executable scheme', () => {
  const base = 'https://imraghavojha.github.io/alive5-docs/';
  for (const path of ['index.html', 'api/index.html']) {
    for (const tail of ['javascript:alert(1)', 'data:text/html,test', 'api/contacts.html', '/example.com']) {
      const url = base + tail;
      const p = paragraph('Link');
      p.paragraph.rich_text[0].text.link = { url };
      const variants = [renderBlocks([p], { leaves: {} }, path), renderBlocks([{ id: 'bookmark', type: 'bookmark', bookmark: { url } }], { leaves: {} }, path)];
      const { blocks, template } = convert('<main><h1>Title</h1><a href="https://example.com"><h3>Card</h3></a></main>', path);
      blocks[0].heading_3.rich_text = p.paragraph.rich_text;
      variants.push(renderPage(blocks, template));
      for (const html of variants) {
        const href = attr(walk(parseHTML(html)).find(n => n.tagName === 'a'), 'href');
        assert.match(href, /^\.\.?\//);
        assert.equal(new URL(href, base + path).protocol, 'https:');
        assert.equal(new URL(href, base + path).origin, new URL(base).origin);
      }
    }
  }
});

test('re-check 2: existing articles require meaningful rendered body content', async t => {
  t.mock.method(console, 'warn', () => {});
  const blank = paragraph(' \n\t\u00a0');
  const emptyBodies = [
    [blank],
    [{ id: 'container', type: 'column_list', column_list: { children: [{ id: 'column', type: 'column', column: { children: [blank] } }] } }],
    [{ id: 'skipped', type: 'unsupported', unsupported: {} }],
    [{ id: 'skipped-child', type: 'unsupported', unsupported: { children: [paragraph('Not rendered')] } }],
    [{ id: 'divider', type: 'divider', divider: {} }],
  ];
  const original = structuredClone(fixture.tree[1].articles[1].blocks.find(b => b.type === 'paragraph'));
  original.paragraph.rich_text = [];
  emptyBodies.push([original]);
  for (const blocks of emptyBodies) {
    const tree = structuredClone(fixture.tree);
    tree[1].articles[1].blocks = blocks;
    await assert.rejects(build(tree), /Empty existing article: api\/authentication.html/);
  }
  const meaningful = [
    paragraph('Real text'),
    { id: 'code', type: 'code', code: { language: 'javascript', rich_text: rich('return 1'), caption: [] } },
    { id: 'image', type: 'image', image: { type: 'external', external: { url: 'https://example.com/image.png' }, caption: [] } },
    { id: 'table', type: 'table', table: { table_width: 1, has_column_header: false, children: [{ id: 'row', type: 'table_row', table_row: { cells: [rich('Value')] } }] } },
    { id: 'fallback', type: 'embed', embed: { url: 'https://example.com' } },
  ];
  for (const block of meaningful) {
    const tree = structuredClone(fixture.tree);
    tree[1].articles[1].blocks = [block];
    assert.ok((await build(tree)).output.has('api/authentication.html'));
  }
  const tree = structuredClone(fixture.tree);
  tree[4].articles[1].blocks = tree[4].articles[1].blocks.filter(b => b.type === 'callout' && b.callout.rich_text.some(r => r.text?.content === '⟦zapier-previews⟧'));
  assert.ok((await build(tree)).output.has('connectors/zapier.html'));
});

test('re-check 3: empty new pages are skipped repeatedly, then publish once filled', async t => {
  const warnings = [];
  t.mock.method(console, 'warn', message => warnings.push(message));
  const tree = structuredClone(fixture.tree);
  const drafts = [[], [paragraph(' ')], [{ id: 'empty', type: 'column', column: { children: [] } }], [{ id: 'unknown', type: 'unsupported', unsupported: {} }]];
  for (const [i, blocks] of drafts.entries()) tree[1].articles.push({ id: `draft-${i}`, title: `Draft ${i}`, blocks });
  const first = await build(tree);
  assert.deepEqual(first.map, fixture.map);
  assert.equal(first.output.size, 22);
  assert.doesNotMatch(first.output.get('assets/site.js'), /Draft [0-3]/);
  const second = await build(tree, first.map);
  assert.deepEqual(second.map, fixture.map);
  assert.deepEqual([...second.output], [...first.output]);
  assert.equal(warnings.filter(w => /Skipping empty new article: Draft/.test(w)).length, 8);
  tree[1].articles.at(-4).blocks = [paragraph('Ready to publish')];
  const filled = await build(tree, second.map);
  assert.equal(filled.map.pages['draft-0.html'].id, 'draft-0');
  assert.match(filled.output.get('assets/site.js'), /Draft 0/);
  assert.match(filled.output.get('draft-0.html'), /Ready to publish/);
});

test('re-check 4: paragraphs and different list types always break list merging', () => {
  for (const position of [0, 1, 2]) {
    for (const type of ['numbered_list_item', 'bulleted_list_item']) {
      const { blocks, template } = convert('<main><h1>Title</h1><ol><li>First</li><li>Last</li></ol></main>', 'index.html');
      blocks.splice(position, 0, { id: 'inserted', type, [type]: { rich_text: rich('Inserted') } }, paragraph('Separator'));
      const doc = parseHTML(renderPage(blocks, template));
      const separator = walk(doc).find(n => n.tagName === 'p' && text(n) === 'Separator');
      assert.equal(separator.parentNode.tagName, 'main');
      for (const list of walk(doc).filter(n => ['ol', 'ul'].includes(n.tagName))) {
        assert.ok(list.childNodes.filter(n => n.tagName).every(n => n.tagName === 'li'));
        if (position < 2 || type === 'bulleted_list_item') assert.ok(!(text(list).includes('Inserted') && text(list).includes('Last')));
      }
    }
  }
});
