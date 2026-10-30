// Sync the dependency-free renderer and frames from an Alive5 CLI checkout.
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
const docs = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const cli = process.argv[2]
  ? resolve(process.argv[2])
  : resolve(docs, "../../cli");
const revision = execFileSync("git", ["rev-parse", "HEAD"], {
  cwd: cli,
  encoding: "utf8",
}).trim();
const output = join(docs, "assets/cli");
await mkdir(join(output, "mascots"), { recursive: true });
for (const name of [
  "logo.js",
  "mascot.js",
  "mascots/isometric-desktop.js",
  "mascots/pocket-macintosh.js",
]) {
  const source = await readFile(join(cli, "src/tui", name), "utf8");
  await writeFile(
    join(output, name),
    `// Synced from alive5-cli ${revision}; use scripts/sync-cli-art.mjs to update.\n` +
      source.replaceAll("'./screen.js'", "'./theme.js'"),
  );
}
const screen = await readFile(join(cli, "src/tui/screen.js"), "utf8");
const mix = screen.slice(
  screen.indexOf("export const mix ="),
  screen.indexOf("const sgrCache"),
);
await writeFile(
  join(output, "theme.js"),
  `// Site palette adapter for the shared CLI renderer.\nexport const theme = {};\nexport function syncTheme() {\n  const styles = getComputedStyle(document.documentElement);\n  for (const [key, token] of Object.entries({ bg: 'surface', ink: 'ink-str', muted: 'muted', faint: 'faint', orange: 'a5', hot: 'a5' }))\n    theme[key] = styles.getPropertyValue('--' + token).trim();\n}\n` +
    mix,
);
console.log(`Synced CLI art from ${revision}.`);
