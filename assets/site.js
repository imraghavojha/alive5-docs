/* Shared chrome + interactions for the Alive5 developer docs. */

const ROOT = document.body.dataset.root || "";
const PAGE = document.body.dataset.page || "";
const href = (p) => ROOT + p;

const MENU = [
  ["start", "index.html", "Get started"],
  ["devres", "api/index.html", "Developer resources"],
  ["connectors", "connectors/index.html", "Connectors"],
  ["messaging", "api/send-a-message.html", "Messaging"],
  ["contacts", "api/contacts.html", "Contacts"],
  ["reporting", "api/reporting.html", "Reporting"],
];

/* --------------------------------------------------------------- header */
function renderHeader() {
  const host = document.querySelector("[data-header]");
  if (!host) return;
  const section = document.body.dataset.section || "";
  host.innerHTML = `
    <div class="topbar">
      <div class="topbar-in">
        <a class="logo" href="${href("index.html")}">
          <span class="word">alive5</span><img class="mobile-brand" src="${href("assets/images/alive5-logo.png")}" alt="Alive5" width="55" height="32"><span class="kind">DOCS</span>
        </a>
        <div class="topbar-mid">
          <button class="searchbox" type="button" data-search>
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <circle cx="7" cy="7" r="4.6" stroke="currentColor" stroke-width="1.6"/>
              <path d="M10.6 10.6 14 14" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
            </svg>
            Search docs<span class="kbd">⌘ K</span>
          </button>
          <a class="askai" href="https://www.alive5.com" target="_blank" rel="noreferrer">Alive5.com ↗</a>
        </div>
        <div class="topbar-right">
          <a class="create" href="https://meet.alive5.com" target="_blank" rel="noreferrer">Book a demo</a>
          <a class="signin" href="https://app.alive5.com" target="_blank" rel="noreferrer">Sign in <span aria-hidden="true">↗</span></a>
        </div>
      </div>
    </div>
    <div class="menubar">
      <div class="menubar-in">
        <nav aria-label="Sections">
          ${MENU.map(
            ([id, path, label]) =>
              `<a href="${href(path)}"${id === section ? ' aria-current="page"' : ""}>${label}</a>`,
          ).join("")}
        </nav>
        <div class="menu-right">
          <a href="${href("api/reference.html")}">API reference</a>
          <a href="https://support.alive5.com" target="_blank" rel="noreferrer">Help ↗</a>
        </div>
      </div>
    </div>`;
}

/* -------------------------------------------------------------- sidebar */
const SIDEBAR = [
  {
    label: "Alive5 API",
    items: [
      ["api", "api/index.html", "Overview"],
      ["api-auth", "api/authentication.html", "Authentication"],
      ["api-errors", "api/errors.html", "Errors and responses"],
    ],
  },
  {
    label: "Messaging and data",
    items: [
      ["api-send", "api/send-a-message.html", "Send a message"],
      ["api-receive", "api/receive-messages.html", "Read messages"],
      ["api-contacts", "api/contacts.html", "Contacts"],
      ["api-report", "api/reporting.html", "Reporting"],
    ],
  },
  {
    label: "Reference",
    items: [["api-reference", "api/reference.html", "API reference"]],
  },
  {
    label: "Connectors",
    items: [
      ["connectors", "connectors/index.html", "Overview"],
      ["connectors-n8n", "connectors/n8n.html", "n8n"],
      ["connectors-pipedream", "connectors/pipedream.html", "Pipedream"],
      ["connectors-make", "connectors/make.html", "Make"],
      ["connectors-keragon", "connectors/keragon.html", "Keragon"],
    ],
  },
];

function renderSidebar() {
  const host = document.querySelector("[data-sidebar]");
  if (!host) return;
  host.className = "sidebar";
  host.id = "docs-navigation";
  host.innerHTML =
    `<button class="mobile-nav" type="button" aria-expanded="false" aria-controls="sidebar-items">Browse documentation <span>⌄</span></button><div id="sidebar-items">` +
    SIDEBAR.map(
      (g) => `
    <div class="sidebar-group">
      <div class="label">${g.label}</div>
      ${g.items
        .map(
          ([id, path, label]) =>
            `<a href="${href(path)}"${id === PAGE ? ' aria-current="page"' : ""}>${label}</a>`,
        )
        .join("")}
    </div>`,
    ).join("") +
    `</div>`;
  host.querySelector(".mobile-nav").addEventListener("click", (e) => {
    const b = e.currentTarget;
    b.setAttribute(
      "aria-expanded",
      String(b.getAttribute("aria-expanded") !== "true"),
    );
  });
}

/* --------------------------------------------------------------- footer */
function renderDocFooter() {
  const host = document.querySelector("[data-docfoot]");
  if (!host) return;
  host.classList.add("docfoot");
  const icon = (paths) =>
    `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
  const rows = [
    [
      icon(
        '<circle cx="8" cy="8" r="6.2"/><circle cx="8" cy="8" r="2.6"/><path d="m3.6 3.6 2.5 2.5M9.9 9.9l2.5 2.5M12.4 3.6 9.9 6.1M6.1 9.9l-2.5 2.5"/>',
      ),
      `Need help? Visit the <a href="https://support.alive5.com" target="_blank" rel="noreferrer">help center</a>.`,
    ],
    [
      icon(
        '<rect x="1.8" y="2.8" width="12.4" height="10.4" rx="2"/><path d="m4.8 6.3 1.9 1.7-1.9 1.7M8.6 10h2.6"/>',
      ),
      `Building an integration? Explore the <a href="${href("api/reference.html")}">API reference</a>.`,
    ],
    [
      icon(
        '<rect x="3" y="1.8" width="10" height="12.4" rx="1.8"/><path d="M5.6 5.3h4.8M5.6 8h4.8M5.6 10.7h2.8"/>',
      ),
      `Prefer Postman? See the <a href="https://www.alive5.com/api" target="_blank" rel="noreferrer">official API collection</a>.`,
    ],
    [
      icon(
        '<circle cx="8" cy="8" r="6.2"/><path d="M6.3 6.2a1.8 1.8 0 1 1 2.5 1.7c-.5.2-.8.6-.8 1.1v.3"/><circle cx="8" cy="11.3" r=".7" fill="currentColor" stroke="none"/>',
      ),
      `Questions? <a href="https://meet.alive5.com" target="_blank" rel="noreferrer">Contact Sales</a>.`,
    ],
    [
      icon(
        '<rect x="1.8" y="1.8" width="5.2" height="5.2" rx="1.2"/><rect x="9" y="1.8" width="5.2" height="5.2" rx="1.2"/><rect x="1.8" y="9" width="5.2" height="5.2" rx="1.2"/><rect x="9" y="9" width="5.2" height="5.2" rx="1.2"/>',
      ),
      `Already a customer? <a href="https://app.alive5.com" target="_blank" rel="noreferrer">Open your dashboard</a>.`,
    ],
  ];
  host.innerHTML = `<div class="docfoot-in wrap">
    <ul class="help-list">${rows.map(([svg, text]) => `<li>${svg}<span>${text}</span></li>`).join("")}</ul>
    <p class="docfoot-made">© ${new Date().getFullYear()} Alive5</p>
  </div>`;
}

/* ------------------------------------------------------------ code tabs */
function wireCode() {
  document.querySelectorAll(".code").forEach((box) => {
    const tabs = [...box.querySelectorAll(".tab")];
    const panes = [...box.querySelectorAll("pre")];
    tabs.forEach((tab, i) =>
      tab.addEventListener("click", () => {
        tabs.forEach((t, j) =>
          t.setAttribute("aria-selected", String(i === j)),
        );
        panes.forEach((p, j) => (p.hidden = i !== j));
      }),
    );
    const copy = box.querySelector(".copy");
    if (copy)
      copy.addEventListener("click", async () => {
        const pane = panes.find((p) => !p.hidden) || panes[0];
        try {
          await navigator.clipboard.writeText(pane.innerText);
          copy.textContent = "Copied";
        } catch {
          copy.textContent = "Press ⌘C";
        }
        setTimeout(() => (copy.textContent = "Copy"), 1500);
      });
  });
}

/* --------------------------------------------------------- toc scrollspy */
function wireToc() {
  const toc = document.querySelector("[data-toc]");
  if (!toc) return;
  const heads = [...document.querySelectorAll(".doc h2[id]")];
  if (!heads.length) {
    toc.remove();
    return;
  }
  toc.className = "toc";
  toc.innerHTML =
    `<div class="label">On this page</div>` +
    heads.map((h) => `<a href="#${h.id}">${h.textContent}</a>`).join("");
  const links = [...toc.querySelectorAll("a")];
  const activate = (active) =>
    links.forEach((link, i) => {
      link.classList.toggle("on", heads[i] === active);
      if (heads[i] === active) link.setAttribute("aria-current", "location");
      else link.removeAttribute("aria-current");
    });
  let scheduled = false;
  const update = () => {
    scheduled = false;
    const atBottom =
      window.scrollY > 0 &&
      window.scrollY + innerHeight >= document.documentElement.scrollHeight - 8;
    const active = atBottom
      ? heads.at(-1)
      : heads.filter((h) => h.getBoundingClientRect().top <= 160).at(-1) ||
        heads[0];
    activate(active);
  };
  window.addEventListener(
    "scroll",
    () => {
      if (!scheduled) {
        scheduled = true;
        requestAnimationFrame(update);
      }
    },
    { passive: true },
  );
  links.forEach((link, i) =>
    link.addEventListener("click", () => activate(heads[i])),
  );
  update();
}

/* --------------------------------------------------------------- search */
const SEARCH = [
  [
    "Authentication",
    "api/authentication.html",
    "API key header token settings",
  ],
  ["Send a message", "api/send-a-message.html", "SMS outbound text"],
  [
    "Read messages",
    "api/receive-messages.html",
    "received messages polling conversation",
  ],
  ["Contacts", "api/contacts.html", "CRM tags users directory"],
  ["Reporting", "api/reporting.html", "analytics bots FAQ"],
  ["Errors and responses", "api/errors.html", "400 401 status failure"],
  ["API reference", "api/reference.html", "endpoint channels API"],
  [
    "Pipedream",
    "connectors/pipedream.html",
    "connector workflow trigger automation",
  ],
  ["Make", "connectors/make.html", "make.com connector scenario automation"],
  ["Build with n8n", "connectors/n8n.html", "automation SMS verified community node"],
  ["Keragon", "connectors/keragon.html", "connector workflow healthcare"],
  ["Connectors", "connectors/index.html", "integrations automation"],
  ["API overview", "api/index.html", "base URL resources REST"],
];
function wireSearch() {
  const dialog = document.createElement("dialog");
  dialog.className = "search-dialog";
  dialog.setAttribute("aria-label", "Search documentation");
  dialog.innerHTML = `<div class="search-input-row"><span aria-hidden="true">⌕</span><input aria-label="Search documentation" placeholder="Search guides, endpoints, connectors…" autocomplete="off"><button type="button" aria-label="Close search">Esc</button></div><div class="search-results"></div><div class="search-hint">↑ ↓ Navigate <span>↵ Open</span><span>esc Close</span></div>`;
  document.body.append(dialog);
  const input = dialog.querySelector("input"),
    results = dialog.querySelector(".search-results");
  let active = 0;
  const draw = () => {
    const q = input.value.toLowerCase().trim().split(/\s+/).filter(Boolean);
    const hits = SEARCH.filter((row) =>
      q.every((term) => row.join(" ").toLowerCase().includes(term)),
    );
    active = 0;
    results.innerHTML = hits.length
      ? `<p>${q.length ? "Results" : "Explore the docs"}</p>` +
        hits
          .map(
            ([title, path]) =>
              `<a href="${href(path)}"><span class="search-doc-icon">▤</span><span>${title}<small>${path.startsWith("connectors") ? "Connectors" : "Developer resources"}</small></span><span class="search-enter">↵</span></a>`,
          )
          .join("")
      : `<div class="search-empty">No results for this search.<small>Try “API key”, “SMS”, or “Make”.</small></div>`;
    mark();
  };
  const mark = () =>
    [...results.querySelectorAll("a")].forEach((a, i) =>
      a.classList.toggle("selected", i === active),
    );
  const open = () => {
    if (dialog.open) return;
    input.value = "";
    draw();
    dialog.showModal();
    input.focus();
  };
  input.addEventListener("input", draw);
  dialog
    .querySelector("button")
    .addEventListener("click", () => dialog.close());
  dialog.addEventListener("click", (e) => {
    if (e.target === dialog) dialog.close();
  });
  dialog.addEventListener("keydown", (e) => {
    const links = [...results.querySelectorAll("a")];
    if (["ArrowDown", "ArrowUp"].includes(e.key)) {
      e.preventDefault();
      active =
        (active +
          (["ArrowDown", "ArrowRight"].includes(e.key) ? 1 : -1) +
          links.length) %
        Math.max(1, links.length);
      mark();
      links[active]?.scrollIntoView({ block: "nearest" });
    }
    if (e.key === "Enter" && e.target === input) {
      e.preventDefault();
      links[active]?.click();
    }
  });
  document
    .querySelectorAll("[data-search]")
    .forEach((b) => b.addEventListener("click", open));
  document.addEventListener("keydown", (e) => {
    if (
      ((e.metaKey || e.ctrlKey) && e.key === "k") ||
      (e.key === "/" && !/input|textarea/i.test(document.activeElement.tagName))
    ) {
      e.preventDefault();
      open();
    }
  });
}

/* ------------------------------------------------- landing: copy buttons */
function wireKeyCopy() {
  document.querySelectorAll("[data-copy]").forEach((b) => {
    b.addEventListener("click", async () => {
      const prev = b.innerHTML;
      try {
        await navigator.clipboard.writeText(b.dataset.copy);
        b.textContent = "Copied";
      } catch {
        b.textContent = "Copy failed";
      }
      setTimeout(() => (b.innerHTML = prev), 1400);
    });
  });
}

/* ------------------------------------------------ landing: Alive5 Shell */
function enhanceDocs() {
  document.querySelectorAll("table.tbl").forEach((table) => {
    const wrap = document.createElement("div");
    wrap.className = "table-scroll";
    wrap.tabIndex = 0;
    wrap.setAttribute("role", "region");
    wrap.setAttribute("aria-label", "Scrollable data table");
    table.before(wrap);
    wrap.append(table);
  });
  const doc = document.querySelector(".doc");
  if (!doc) return;
  const sub = doc.querySelector(".sub");
  const bar = document.createElement("div");
  bar.className = "doc-actions";
  bar.innerHTML = `<button type="button" data-copy-page><svg width="13" height="13" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><rect x="7" y="7" width="10" height="11" rx="2"/><path d="M12 7V3H3v10h4"/></svg> Copy page</button><a href="https://app.alive5.com" target="_blank" rel="noreferrer">Open dashboard ↗</a>`;
  sub?.after(bar);
  bar.querySelector("button").addEventListener("click", async (e) => {
    try {
      await navigator.clipboard.writeText(doc.innerText);
      bar.querySelector("button").textContent = "✓ Copied";
    } catch {
      bar.querySelector("button").textContent = "Copy unavailable";
    }
    setTimeout(
      () =>
        (bar.querySelector("button").innerHTML =
          `<svg width="13" height="13" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><rect x="7" y="7" width="10" height="11" rx="2"/><path d="M12 7V3H3v10h4"/></svg> Copy page`),
      1500,
    );
  });
  document.querySelectorAll('a[href^="https://"]').forEach((a) => {
    a.rel = "noreferrer noopener";
    a.target = "_blank";
  });
}
renderHeader();
const sectionBar = document.querySelector(".menubar-in");
const selectedSection = sectionBar?.querySelector("[aria-current]");
if (sectionBar) {
  const cue = () =>
    sectionBar.parentElement.classList.toggle(
      "has-left",
      sectionBar.scrollLeft > 8,
    );
  sectionBar.addEventListener("scroll", cue, { passive: true });
}
if (sectionBar && selectedSection && matchMedia("(max-width: 720px)").matches) {
  sectionBar.scrollLeft = Math.max(
    0,
    selectedSection.offsetLeft - sectionBar.clientWidth / 2,
  );
}
renderSidebar();
renderDocFooter();
wireCode();
wireToc();
wireSearch();
wireKeyCopy();

enhanceDocs();
