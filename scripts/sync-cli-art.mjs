// Sync the CLI banner renderer. The browser supplies the docs theme.
import { writeFile, mkdir, realpath, stat } from "node:fs/promises";
import { dirname, resolve, join, relative, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { execFileSync } from "node:child_process";
const docs = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const cli = process.argv[2]
  ? resolve(process.argv[2])
  : resolve(docs, "../../cli");
const git = (...args) => execFileSync("git", args, {
  cwd: cli,
  encoding: "utf8",
});
if (git("status", "--porcelain", "--untracked-files=all").trim()) {
  throw new Error(`CLI checkout has uncommitted changes: ${cli}`);
}
const revision = git("rev-parse", "HEAD").trim();
function readSource(name) {
  const source = git("show", `${revision}:src/tui/${name}`);
  if (!source.trim()) throw new Error(`Empty CLI source: ${name}`);
  return source;
}

const files = new Map();
for (const name of ["logo.js", "mascot.js"]) {
  files.set(
    name,
    `// Synced from alive5-cli ${revision}; use scripts/sync-cli-art.mjs to update.\n` +
      readSource(name).replaceAll("'./screen.js'", "'./theme.js'"),
  );
}
const screen = readSource("screen.js");
const mixStart = screen.indexOf("export const mix =");
const mixEnd = screen.indexOf("const sgrCache");
if (mixStart < 0 || mixEnd <= mixStart) {
  throw new Error("Could not locate the mix export in CLI screen.js");
}
files.set(
  "theme.js",
  `// Site palette adapter for the shared CLI renderer.\nexport const theme = {};\nexport function syncTheme() {\n  const styles = getComputedStyle(document.documentElement);\n  for (const [key, token] of Object.entries({ bg: 'surface', ink: 'ink-str', muted: 'muted', faint: 'faint', orange: 'a5', hot: 'a5' }))\n    theme[key] = styles.getPropertyValue('--' + token).trim();\n}\n` +
    screen.slice(mixStart, mixEnd),
);
const output = join(docs, "assets/cli");
const inspectModule = `const { SourceTextModule } = require("node:vm");
const module = new SourceTextModule(require("node:fs").readFileSync(0, "utf8"));
process.stdout.write(JSON.stringify(module.dependencySpecifiers));`;
for (const [name, content] of files) {
  let specifiers;
  try {
    specifiers = JSON.parse(execFileSync(process.execPath, ["--experimental-vm-modules", "--input-type=commonjs", "--eval", inspectModule], { input: content, stdio: "pipe" }));
  } catch (cause) {
    throw new Error(`Invalid CLI art module: ${name}`, { cause });
  }
  for (const specifier of specifiers.filter((path) => path.startsWith("./") || path.startsWith("../"))) {
    const target = fileURLToPath(new URL(specifier, pathToFileURL(join(output, name))));
    if (files.has(relative(output, target))) continue;
    const existing = target.startsWith(output + sep) && await realpath(target).catch(() => null);
    if (!existing || !existing.startsWith(output + sep) || !(await stat(existing)).isFile()) throw new Error(`Unresolved relative import in ${name}: ${specifier}`);
  }
}

await mkdir(output, { recursive: true });
for (const [name, content] of files) {
  await writeFile(join(output, name), content);
}
console.log(`Synced CLI art from ${revision}.`);
