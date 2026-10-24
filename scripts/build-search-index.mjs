#!/usr/bin/env node
// Run from any directory: node scripts/build-search-index.mjs [--check]
import { readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const entities = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
const decode = (s) => s.replace(/&(#x[\da-f]+|#\d+|\w+);/gi, (match, key) =>
  key[0] === "#" ? String.fromCodePoint(key[1].toLowerCase() === "x"
    ? parseInt(key.slice(2), 16) : Number(key.slice(1))) : entities[key] ?? match);
const text = (html) => decode(html
  .replace(/<!--[^]*?-->/g, " ")
  .replace(/<(script|style|button|nav|aside)\b[^>]*>[^]*?<\/\1\s*>/gi, " ")
  .replace(/<\/(?:span|a)>\s*(?=<(?:span|a)\b)/gi, " ")
  .replace(/<\/?(?:p|div|pre|li|tr|td|th|h[1-6]|br|figcaption)\b[^>]*>/gi, " ")
  .replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim();
const attribute = (tag, name) => decode(tag.match(new RegExp(`\\b${name}\\s*=\\s*["']([^"']*)["']`, "i"))?.[1] || "");

async function crawl(dir) {
  const files = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.isDirectory() && !["assets", "scripts", ".git", "node_modules"].includes(entry.name)) {
      files.push(...await crawl(join(dir, entry.name)));
    } else if (entry.isFile() && entry.name.endsWith(".html") && entry.name !== "404.html") {
      files.push(join(dir, entry.name));
    }
  }
  return files.sort();
}

const pages = [];
for (const file of await crawl(root)) {
  const html = await readFile(file, "utf8");
  const main = html.match(/<main\b[^>]*>([^]*?)<\/main>/i)?.[1]
    .replace(/<div\b[^>]*class=["']pager["'][^>]*>[^]*$/i, "");
  if (!main) continue;
  // Track ancestors so endpoint h3s use the id on their .reference-entry wrapper.
  const stack = [], headings = [];
  const voidTags = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"]);
  for (const match of main.matchAll(/<!--[\s\S]*?-->|<\/?([a-z][\w-]*)\b[^>]*>/gi)) {
    if (!match[1]) continue;
    const tag = match[1].toLowerCase();
    if (match[0].startsWith("</")) {
      const index = stack.findLastIndex((node) => node.tag === tag);
      if (index !== -1) {
        for (const node of stack.splice(index)) node.end = match.index;
      }
      continue;
    }
    const node = { tag, start: match.index, content: match.index + match[0].length,
      id: attribute(match[0], "id"), end: main.length };
    const endpoint = stack.findLast((parent) => parent.endpoint);
    node.endpoint = attribute(match[0], "class").split(/\s+/).includes("reference-entry");
    if (/^h[123]$/.test(tag)) headings.push({ ...node, endpoint });
    if (!voidTags.has(tag) && !match[0].endsWith("/>")) stack.push(node);
  }
  const title = text(html.match(/<title\b[^>]*>([^]*?)<\/title>/i)?.[1] || "");
  const headingText = (heading) => text(main.slice(heading.content, main.indexOf(`</${heading.tag}`, heading.content))
    .replace(/<span\b[^>]*class=["'][^"']*\bmethod\b[^"']*["'][^>]*>[^]*?<\/span>/gi, ""));
  const h1 = headings.find((heading) => heading.tag === "h1");
  const eligible = headings.filter((heading) => heading.tag === "h1" || heading.id || heading.endpoint?.id);
  const sections = eligible.map((heading, index) => {
    const close = main.indexOf(`</${heading.tag}`, heading.content);
    const start = main.indexOf(">", close) + 1;
    const end = Math.min(eligible[index + 1]?.start ?? main.length, heading.endpoint?.end ?? main.length);
    const body = text(main.slice(start, end));
    const path = heading.endpoint ? text(main.slice(start, end).match(/<p\b[^>]*class=["']path["'][^>]*>([^]*?)<\/p>/i)?.[1] || "") : "";
    const method = path ? text(main.slice(heading.content, close).match(/<span\b[^>]*class=["'][^"']*\bmethod\b[^"']*["'][^>]*>([^]*?)<\/span>/i)?.[1] || "") : "";
    const endpoint = [method, path].filter(Boolean).join(" ");
    return { id: heading.id || heading.endpoint?.id || "", heading: headingText(heading),
      ...(endpoint ? { endpoint, keywords: `${method} ${path.split(/[\/_-]+/).filter(Boolean).join(" ")}`.trim() } : {}),
      snippet: body.slice(0, 140), text: body };
  });
  pages.push({ path: relative(root, file).replaceAll("\\", "/"), title, h1: h1 ? headingText(h1) : title, sections });
}
const output = join(root, "assets/search-index.json");
const json = JSON.stringify(pages) + "\n";
if (process.argv.includes("--check")) {
  const existing = await readFile(output, "utf8").catch((error) => {
    if (error.code !== "ENOENT") throw error;
    return null;
  });
  if (existing !== json) {
    console.error("Search index is stale. Run node scripts/build-search-index.mjs.");
    process.exitCode = 1;
  } else console.log("Search index is up to date.");
} else {
  await writeFile(output, json);
  console.log(`Indexed ${pages.length} pages and ${pages.reduce((sum, page) => sum + page.sections.length, 0)} headings.`);
}
