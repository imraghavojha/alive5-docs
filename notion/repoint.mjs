import { execFileSync, spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { credentials } from './api.mjs';
import { ROOT } from './site.mjs';

try {
  if (process.argv.length !== 3) throw new Error('Usage: NOTION_TOKEN=... npm run repoint -- <new page URL or ID>');
  if (execFileSync('git', ['status', '--porcelain'], { cwd: ROOT, encoding: 'utf8' }).trim()) throw new Error('Commit or stash all changes before repointing.');
  process.env.NOTION_ROOT_PAGE_ID = process.argv[2];
  const { rootId } = credentials();
  const env = { ...process.env, NOTION_ROOT_PAGE_ID: rootId };
  function run(command, args, input) {
    const result = spawnSync(command, args, { cwd: resolve(ROOT, 'notion'), env, input, stdio: input === undefined ? 'inherit' : ['pipe', 'inherit', 'inherit'] });
    if (result.error || result.status !== 0) throw new Error(`${command} ${args.join(' ')} failed; repoint stopped.`);
  }
  run('npm', ['run', 'seed']);
  run('npm', ['run', 'build']);
  run('npm', ['run', 'verify', '--', '--live']);
  run('gh', ['secret', 'set', 'NOTION_TOKEN'], env.NOTION_TOKEN);
  run('gh', ['secret', 'set', 'NOTION_ROOT_PAGE_ID'], rootId);
  const quote = value => "'" + value.replaceAll("'", "'\\''") + "'";
  console.log('Repoint complete. Commit the refreshed map, templates, and generated output:');
  console.log(`cd ${quote(ROOT)} && git add -A -- notion/map.json notion/templates.json '*.html' assets/site.js assets/search-index.json assets/notion && git commit -m 'Repoint docs to new Notion workspace'`);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
