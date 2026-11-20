import { spawnSync } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { credentials } from './api.mjs';
import { ROOT, readJSON } from './site.mjs';
const workflow = 'notion-sync.yml';
const activeStatuses = ['queued', 'in_progress', 'waiting', 'pending', 'requested'];
const { NOTION_TOKEN: token, ...env } = process.env;
function run(command, args, { input, capture = false, env: childEnv = env } = {}) {
  const stdio = [input === undefined ? 'inherit' : 'pipe', capture ? 'pipe' : 'inherit', 'inherit'];
  const result = spawnSync(command, args, { cwd: ROOT, env: childEnv, input, stdio, encoding: 'utf8' });
  if (result.error || result.status !== 0) throw new Error(`${command} ${args.join(' ')} failed.`);
  return result.stdout;
}
const git = (args, options) => run('git', args, options);
const pages = async () => Object.keys((await readJSON(new URL('./map.json', import.meta.url))).pages);
try {
  if (process.argv.length !== 3) throw new Error('Usage: NOTION_TOKEN=... npm run repoint -- <new page URL or ID>');
  process.env.NOTION_ROOT_PAGE_ID = process.argv[2];
  const { rootId } = credentials();
  const capture = { capture: true };
  if (git(['status', '--porcelain'], capture).trim()) throw new Error('Commit or stash all changes before repointing.');
  const origin = git(['remote', 'get-url', 'origin'], capture).trim();
  const remote = origin.match(/^(?:(?:https|ssh):\/\/(?:[^/@\s]+@)?|[^/@\s]+@)([\w.-]+)(?::\d+)?[:/]([\w.-]+\/[\w.-]+)\/?$/);
  if (!remote) throw new Error('Use a GitHub HTTPS or SSH URL for origin.');
  const host = remote[1].toLowerCase() === 'ssh.github.com' ? 'github.com' : remote[1].toLowerCase();
  const repo = remote[2].replace(/\.git$/, '');
  const gh = (args, options) => run('gh', [...args, '--repo', repo], { ...options, env: { ...env, GH_HOST: host } });
  git(['fetch', 'origin', 'main']);
  if (git(['rev-parse', 'HEAD'], capture) !== git(['rev-parse', 'FETCH_HEAD'], capture)) throw new Error('Start from the latest origin/main.');
  const previousPages = await pages();
  const local = { env: { ...env, NOTION_TOKEN: token, NOTION_ROOT_PAGE_ID: rootId } };
  for (const args of [['seed'], ['build'], ['verify', '--', '--live']]) run('npm', ['--prefix', 'notion', 'run', ...args], local);
  const secrets = Object.entries({ NOTION_TOKEN: token, NOTION_ROOT_PAGE_ID: rootId });
  const updated = [];
  let pushed = false;
  gh(['workflow', 'disable', workflow]);
  try {
    const busy = () => activeStatuses.some(status => gh(['run', 'list', '--workflow', workflow, '--all', '--status', status, '--limit', '1', '--json', 'databaseId', '--jq', '.[].databaseId'], capture).trim());
    while (busy()) await delay(5000);
    const paths = ['notion/map.json', 'notion/templates.json', 'assets/site.js', 'assets/search-index.json', 'assets/notion', 'sitemap.xml', 'api/reference.html', ...new Set([...previousPages, ...await pages()])];
    git(['add', '-A', '--', ...paths]);
    if (git(['diff', '--cached', '--name-only', '--', ...paths], capture).trim()) git(['commit', '-m', 'Repoint docs to new Notion workspace', '--', ...paths]);
    git(['push', 'origin', 'HEAD:main']);
    pushed = true;
    for (const [name, input] of secrets) {
      gh(['secret', 'set', name], { input });
      updated.push(name);
      console.log(`Updated ${name}.`);
    }
  } finally {
    if (!pushed || updated.length === secrets.length) {
      try { gh(['workflow', 'enable', workflow]); }
      catch (error) { console.error(error.message); process.exitCode = 1; }
    } else {
      console.error(`The map was pushed and the workflow remains disabled. Secrets updated: ${updated.join(', ') || 'none'}.`);
      console.error(`Set the remaining secrets with: gh secret set <NAME> --repo ${repo}, then run: gh workflow enable ${workflow} --repo ${repo}`);
    }
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
