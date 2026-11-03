import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { convert } from '../convert.mjs';
import { renderPage } from '../render.mjs';
import { plain, rich } from '../html.mjs';
import { ROOT, remapBlocks } from '../site.mjs';
import { updateEditor, ensureReference } from '../editor.mjs';
import { widgetNotes, widgetIcon } from '../widgets.mjs';

function memoryClient(initial = []) {
  const blocks = structuredClone(initial), calls = [];
  return { blocks, calls, client: { blocks: {
    children: {
      list: async () => ({ results: structuredClone(blocks.filter(b => !b.archived)), has_more: false }),
      append: async ({ children }) => {
        calls.push('append');
        const results = children.map(b => ({ ...structuredClone(b), id: `remote-${blocks.length++}` }));
        blocks.splice(blocks.length - results.length, results.length, ...results);
        return { results };
      },
    },
    delete: async ({ block_id }) => { calls.push('delete'); blocks.find(b => b.id === block_id).archived = true; },
    update: async ({ block_id, callout }) => { calls.push('update'); blocks.find(b => b.id === block_id).callout = callout; },
  } } };
}

test('homepage has separate native card headings and descriptions, with byte-identical HTML', async () => {
  const html = await readFile(`${ROOT}/index.html`, 'utf8');
  const { blocks, template } = convert(html, 'index.html');
  assert.equal(renderPage(blocks, template), html);
  for (const [title, description] of [['Zapier', 'Connect conversations to your apps'], ['Live chat', 'Website conversations with your team'], ['Messaging API', 'Send and receive texts with REST']]) {
    const index = blocks.findIndex(b => b.type === 'heading_3' && plain(b.heading_3.rich_text).trim() === title);
    assert.ok(index >= 0);
    assert.equal(blocks[index + 1].type, 'paragraph');
    assert.equal(plain(blocks[index + 1].paragraph.rich_text), description);
  }
  assert.ok(blocks.some(b => b.type === 'heading_2' && plain(b.heading_2.rich_text) === 'Developer quickstart'));
  assert.ok(blocks.some(b => b.type === 'bulleted_list_item' && plain(b.bulleted_list_item.rich_text) === 'Alive5 CLI — Coming soon'));
  assert.ok(!blocks.some(b => /QUICKSTARTREST|ACCOUNTSign|CLIComing|ZapierConnect|Hello from/.test(plain(b[b.type].rich_text))));
});

test('all three widget notes use one neutral icon and restore the original widgets', async () => {
  const found = [];
  for (const path of ['index.html', 'connectors/index.html', 'connectors/zapier.html']) {
    const html = await readFile(`${ROOT}/${path}`, 'utf8');
    const { blocks, template } = convert(html, path);
    const block = blocks.find(b => template.leaves[b.id]?.widget);
    const id = template.leaves[block.id].widget;
    assert.equal(plain(block.callout.rich_text), widgetNotes[id]);
    assert.deepEqual(block.callout.icon, widgetIcon);
    assert.doesNotMatch(plain(block.callout.rich_text), /⟦|⟧/);
    assert.equal(renderPage(blocks, template), html);
    found.push(id);
  }
  assert.deepEqual(found.sort(), Object.keys(widgetNotes).sort());
});

test('Reference gets exactly one linked sentence using the existing Postman target', async () => {
  const html = await readFile(`${ROOT}/api/reference.html`, 'utf8');
  const url = html.match(/href="(https:\/\/documenter\.getpostman\.com\/[^\"]+)"/)[1];
  const mock = memoryClient();
  await ensureReference(mock.client, 'section', url);
  await ensureReference(mock.client, 'section', url);
  assert.equal(mock.blocks.length, 1);
  assert.equal(mock.blocks[0].paragraph.rich_text[0].text.link.url, url);
  assert.equal(plain(mock.blocks[0].paragraph.rich_text), 'Open the official API reference in Postman.');
  assert.deepEqual(mock.calls, ['append']);
});

const migration = () => {
  const html = '<main><h1>Docs</h1><div><strong>Title</strong><span>Description</span></div></main>';
  const old = convert(html, 'legacy.html');
  const article = { path: 'index.html', ...convert(html, 'index.html') };
  const record = { id: 'same-page', title: 'Docs', bindings: Object.fromEntries(old.blocks.map((b, i) => [b.id, `old-${i}`])) };
  const mock = memoryClient(old.blocks.map(b => ({ ...b, id: record.bindings[b.id] })));
  return { html, old, article, record, mock };
};

test('editor migration resumes without duplicates, retains the page, and is then a no-op', async () => {
  const { html, old, article, record, mock } = migration();
  const remove = mock.client.blocks.delete;
  mock.client.blocks.delete = async () => { throw new Error('Interrupted'); };
  await assert.rejects(updateEditor(mock.client, article, record, old.template, async () => {}), /Interrupted/);
  assert.ok(record.editorUpdate);
  mock.client.blocks.delete = remove;
  assert.equal(await updateEditor(mock.client, article, record, old.template, async () => {}), true);
  const active = mock.blocks.filter(b => !b.archived);
  assert.equal(active.length, article.blocks.length);
  assert.equal(record.id, 'same-page');
  assert.equal(renderPage(remapBlocks(active, record.bindings), article.template), html);
  const state = JSON.stringify(record), calls = mock.calls.length;
  assert.equal(await updateEditor(mock.client, article, record, article.template, async () => {}), false);
  assert.equal(JSON.stringify(record), state);
  assert.equal(mock.calls.length, calls);
});

test('editor migration refuses to replace unsynced author edits', async () => {
  const { old, article, record, mock } = migration();
  mock.blocks[0].paragraph.rich_text = rich('An author changed this');
  await assert.rejects(updateEditor(mock.client, article, record, old.template, async () => {}), /unsynced edits/);
  assert.deepEqual(mock.calls, []);
});
