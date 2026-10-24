const ROOT = document.body.dataset.root || "";
const PAGE = document.body.dataset.page || "";
const href = (p) => ROOT + p;

const MENU = [
  ["start", "index.html", "Get started"],
  ["devres", "api/index.html", "Developer resources"],
  ["connectors", "connectors/index.html", "Connectors"],
  ["integrations", "integrations/index.html", "Integrations"],
  ["messaging", "api/send-a-message.html", "Messaging"],
  ["contacts", "api/contacts.html", "Contacts"],
  ["reporting", "api/reporting.html", "Reporting"],
];

function renderHeader() {
  const host = document.querySelector("[data-header]");
  if (!host) return;
  const section = document.body.dataset.section || "";
  host.innerHTML = `
    <div class="topbar">
      <div class="topbar-in">
        <a class="logo" href="${href("index.html")}">
          <span class="word">alive5</span><img class="mobile-brand" src="${href("assets/images/alive5-logo-small.png")}" srcset="${href("assets/images/alive5-logo-small-1x.webp")} 1x, ${href("assets/images/alive5-logo-small-2x.webp")} 2x, ${href("assets/images/alive5-logo-small-3x.webp")} 3x" alt="Alive5" width="55" height="32"><span class="kind">DOCS</span>
        </a>
        <div class="topbar-mid">
          <button class="searchbox" type="button" data-search>
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <circle cx="7" cy="7" r="4.6" stroke="currentColor" stroke-width="1.6"/>
              <path d="M10.6 10.6 14 14" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
            </svg>
            <span class="search-label">Search docs</span><span class="kbd">⌘ K</span>
          </button>
          <a class="askai" href="https://www.alive5.com" target="_blank" rel="noreferrer">Alive5.com ↗</a>
        </div>
        <div class="topbar-right">
          <button class="theme-toggle" type="button" data-theme-toggle aria-label="Switch to dark theme" aria-pressed="false">
            <svg class="theme-moon" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20.8 13.1A8.8 8.8 0 0 1 10.9 3.2a8.8 8.8 0 1 0 9.9 9.9Z"/></svg>
            <svg class="theme-sun" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="3.7"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>
          </button>
          <a class="create" href="https://meet.alive5.com" target="_blank" rel="noreferrer">Book a demo</a>
          <a class="signin" href="https://app.alive5.com" target="_blank" rel="noreferrer">Sign in <span aria-hidden="true">↗</span></a>
          <button class="mobile-menu-toggle" type="button" aria-label="Documentation menu" aria-expanded="false" aria-controls="mobile-menu">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16"/></svg>
          </button>
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
    </div>
    <div class="mobile-menu" id="mobile-menu" hidden>
      <nav aria-label="Sections">
        ${MENU.map(([id, path, label]) =>
          `<a href="${href(path)}"${id === section ? ' aria-current="page"' : ""}>${label}</a>`,
        ).join("")}
      </nav>
      <nav data-mobile-sidebar aria-label="Documentation"></nav>
    </div>`;
  const button = host.querySelector(".mobile-menu-toggle");
  const panel = host.querySelector(".mobile-menu");
  const mobile = matchMedia("(max-width: 720px)");
  const close = (restoreFocus = false) => {
    panel.hidden = true;
    button.setAttribute("aria-expanded", "false");
    if (restoreFocus) button.focus({ preventScroll: true });
  };
  button.addEventListener("click", () => {
    if (!panel.hidden) return close(true);
    panel.hidden = false;
    button.setAttribute("aria-expanded", "true");
    panel.querySelector("a")?.focus({ preventScroll: true });
    panel.scrollTop = 0;
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !panel.hidden) {
      event.preventDefault();
      close(true);
    }
  });
  document.addEventListener("click", (event) => {
    if (!panel.hidden && !panel.contains(event.target) && !button.contains(event.target)) {
      close(panel.contains(document.activeElement));
    }
  });
  panel.addEventListener("click", (event) => {
    if (event.target.closest("a")) close(true);
  });
  host.addEventListener("focusout", (event) => {
    if (!panel.hidden && !panel.contains(event.relatedTarget) && event.relatedTarget !== button) close();
  });
  mobile.addEventListener("change", () => {
    const active = document.activeElement;
    const wasInMenu = panel.contains(active) || active === button;
    close();
    if (wasInMenu) host.querySelector(".logo").focus({ preventScroll: true });
  });
}

function wireTheme() {
  const root = document.documentElement;
  const button = document.querySelector("[data-theme-toggle]");
  const system = matchMedia("(prefers-color-scheme: dark)");
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  let choice = null;
  let transitionTimer;
  try {
    const saved = localStorage.getItem("a5-theme");
    if (saved === "light" || saved === "dark") choice = saved;
  } catch { /* The theme still works when storage is unavailable. */ }
  const apply = (animate = false) => {
    if (animate && !reduced.matches) {
      clearTimeout(transitionTimer);
      document.body.classList.add("theme-switching");
      // Establish the transition before changing the inherited palette.
      getComputedStyle(document.body).backgroundColor;
      transitionTimer = setTimeout(() => document.body.classList.remove("theme-switching"), 170);
    }
    const dark = (choice || (system.matches ? "dark" : "light")) === "dark";
    root.dataset.theme = dark ? "dark" : "light";
    button?.setAttribute("aria-label", `Switch to ${dark ? "light" : "dark"} theme`);
    button?.setAttribute("aria-pressed", String(dark));
  };
  button?.addEventListener("click", () => {
    choice = root.dataset.theme === "dark" ? "light" : "dark";
    try { localStorage.setItem("a5-theme", choice); } catch {}
    apply(true);
  });
  system.addEventListener("change", () => { if (!choice) apply(); });
  window.addEventListener("storage", (event) => {
    if (event.key !== "a5-theme" && event.key !== null) return;
    choice = event.newValue === "light" || event.newValue === "dark" ? event.newValue : null;
    apply();
  });
  apply();
}

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
      ["api-sms-limits", "api/sms-limits.html", "SMS limits"],
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
      ["connectors-zapier", "connectors/zapier.html", "Zapier"],
      ["connectors-n8n", "connectors/n8n.html", "n8n"],
      ["connectors-node-red", "connectors/node-red.html", "Node-RED"],
      ["connectors-shuffle", "connectors/shuffle.html", "Shuffle"],
      ["connectors-github-actions", "connectors/github-actions.html", "GitHub Actions"],
      ["connectors-apify", "connectors/apify.html", "Apify"],
      ["connectors-directus", "connectors/directus.html", "Directus"],
    ],
  },
  {
    label: "Integrations",
    items: [
      ["int-overview", "integrations/index.html", "Overview"],
      ["int-widget", "integrations/widget.html", "Chat widget"],
      ["int-visitor", "integrations/visitor-data.html", "Visitor data"],
      ["int-crm", "integrations/crm.html", "CRM integrations"],
    ],
  },
];

function renderSidebar() {
  const host = document.querySelector("[data-sidebar]");
  if (!host) return;
  host.className = "sidebar";
  host.id = "docs-navigation";
  host.innerHTML =
    `<div id="sidebar-items">` +
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
  const items = host.querySelector("#sidebar-items");
  const mobileHost = document.querySelector("[data-mobile-sidebar]");
  if (mobileHost) {
    const mobile = matchMedia("(max-width: 720px)");
    const place = () => {
      const hadFocus = items.contains(document.activeElement);
      (mobile.matches ? mobileHost : host).append(items);
      if (hadFocus) document.querySelector(mobile.matches ? ".mobile-menu-toggle" : '.logo').focus({ preventScroll: true });
    };
    mobile.addEventListener("change", place);
    place();
  }
}

function renderDocFooter() {
  const host = document.querySelector("[data-docfoot]");
  if (!host) return;
  host.classList.add("docfoot");
  document.querySelector(".doc")?.append(host);
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
      `Prefer Postman? See the <a href="https://documenter.getpostman.com/view/12135254/UVsQr3zh" target="_blank" rel="noreferrer">official API collection</a>.`,
    ],
    [
      icon(
        '<circle cx="8" cy="8" r="6.2"/><path d="M6.3 6.2a1.8 1.8 0 1 1 2.5 1.7c-.5.2-.8.6-.8 1.1v.3"/><circle cx="8" cy="11.3" r=".7" fill="currentColor" stroke="none"/>',
      ),
      `Questions? <a href="https://meet.alive5.com" target="_blank" rel="noreferrer">Contact sales</a>.`,
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

function wireCode() {
  document.querySelectorAll(".code, .reference-code").forEach((box, boxIndex) => {
    const tabs = [...box.querySelectorAll(".tab")];
    const panes = [...box.querySelectorAll("pre")];
    const heading = box.closest(".reference-entry")?.querySelector("h3") ||
      [...document.querySelectorAll("h2, h3")].filter((h) =>
        h.compareDocumentPosition(box) & Node.DOCUMENT_POSITION_FOLLOWING).at(-1);
    const context = heading?.textContent.trim() || "Code example";
    panes.forEach((pane) => {
      // Preformatted examples can overflow; keyboard readers must be able to scroll them.
      pane.tabIndex = 0;
      pane.setAttribute("role", "region");
      if (!pane.hasAttribute("aria-label")) pane.setAttribute("aria-label",
        `${context}: ${box.querySelector("figcaption > span, .name")?.textContent.trim() || `code example ${boxIndex + 1}`}`);
    });
    if (tabs.length) {
      const tablist = document.createElement("div");
      tablist.className = "code-tabs";
      tablist.setAttribute("role", "tablist");
      tablist.setAttribute("aria-label", `${context} language`);
      tabs[0].before(tablist);
      tabs.forEach((tab, i) => {
        tablist.append(tab);
        tab.id = `code-tab-${boxIndex}-${i}`;
        tab.setAttribute("role", "tab");
        tab.setAttribute("aria-controls", `code-panel-${boxIndex}-${i}`);
        panes[i].id = `code-panel-${boxIndex}-${i}`;
        panes[i].setAttribute("role", "tabpanel");
        panes[i].removeAttribute("aria-label");
        panes[i].setAttribute("aria-labelledby", tab.id);
      });
      const select = (index) => {
        tabs.forEach((tab, i) => {
          tab.setAttribute("aria-selected", String(i === index));
          tab.tabIndex = i === index ? 0 : -1;
          panes[i].hidden = i !== index;
        });
      };
      tabs.forEach((tab, i) => {
        tab.addEventListener("click", () => select(i));
        tab.addEventListener("keydown", (e) => {
          if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) return;
          e.preventDefault();
          const next = e.key === "Home" ? 0 : e.key === "End" ? tabs.length - 1 :
            (i + (e.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
          select(next);
          tabs[next].focus();
        });
      });
      select(Math.max(0, tabs.findIndex((tab) => tab.getAttribute("aria-selected") === "true")));
    }
    const copy = box.querySelector(".copy");
    if (copy) {
      const copyLabel = `Copy ${box.querySelector("figcaption > span")?.textContent.toLowerCase() || "code"}: ${context}`;
      copy.setAttribute("aria-label", copyLabel);
      copy.setAttribute("aria-live", "polite");
      copy.addEventListener("click", async () => {
        const pane = panes.find((p) => !p.hidden) || panes[0];
        try {
          await navigator.clipboard.writeText((pane.querySelector("code") || pane).textContent);
          copy.textContent = "Copied";
          copy.setAttribute("aria-label", `Copied: ${context}`);
        } catch {
          copy.textContent = "Copy unavailable";
          copy.setAttribute("aria-label", `Copy unavailable: ${context}`);
        }
        setTimeout(() => {
          copy.textContent = "Copy";
          copy.setAttribute("aria-label", copyLabel);
        }, 1500);
      });
    }
  });
}

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
  const doc = heads[0].closest(".doc");
  const visible = new Set();
  let atBottom = false;
  let observer;
  const update = () => activate(atBottom && window.scrollY > 0
    ? heads.at(-1)
    : heads.findLast((head) => visible.has(head)) || heads[0]);
  const sentinel = document.createElement("div");
  sentinel.setAttribute("aria-hidden", "true");
  sentinel.style.cssText = "height:0; width:1px; pointer-events:none";
  doc.append(sentinel);
  const bottomObserver = new IntersectionObserver(([entry]) => {
    atBottom = entry.isIntersecting;
    update();
  }, { rootMargin: "0px 0px 8px 0px" });
  bottomObserver.observe(sentinel);
  const resizeObserver = new ResizeObserver(([entry]) => {
    observer?.disconnect();
    visible.clear();
    // Include the whole document above the activation line. A narrow band can
    // miss headings skipped by an anchor jump or leave gaps between sections.
    observer = new IntersectionObserver((entries) => {
      entries.forEach(({ target, isIntersecting }) => {
        if (isIntersecting) visible.add(target);
        else visible.delete(target);
      });
      update();
    }, { rootMargin: `${Math.ceil(entry.borderBoxSize[0].blockSize)}px 0px ${160 - innerHeight}px 0px` });
    heads.forEach((head) => observer.observe(head));
    // Move the zero-height marker through the bottom padding, without changing
    // document height, so it represents the page end rather than the footer.
    const paddingBottom = entry.borderBoxSize[0].blockSize - entry.contentRect.height - entry.contentRect.y;
    sentinel.style.transform = `translateY(${paddingBottom}px)`;
  });
  resizeObserver.observe(doc);
  window.addEventListener("resize", () => {
    resizeObserver.unobserve(doc);
    resizeObserver.observe(doc);
  });
  window.addEventListener("scroll", () => {
    if (atBottom) update();
  }, { passive: true });
  links.forEach((link, i) =>
    link.addEventListener("click", () => activate(heads[i])),
  );
  activate(heads[0]);
}

const SEARCH = [
  ["Build with Node-RED", "connectors/node-red.html", "connector node red nodes npm @imraghavojha/node-red-alive5 flows SMS automation"],
  ["Build with Shuffle", "connectors/shuffle.html", "connector public app Alive5 SMS security SOAR workflow automation"],
  ["Build with Zapier", "connectors/zapier.html", "connector Zap SMS chat contacts automation calendar sheets Slack"],
  [
    "Authentication",
    "api/authentication.html",
    "API key header token settings",
  ],
  ["Send a message", "api/send-a-message.html", "SMS outbound text"],
  [
    "SMS limits and compliance",
    "api/sms-limits.html",
    "segments 160 70 emoji MMS 500 KB file types opt-out STOP HELP 10DLC consent broadcast limits Canada E.164 NNID",
  ],
  [
    "Read messages",
    "api/receive-messages.html",
    "received messages polling conversation",
  ],
  ["Contacts", "api/contacts.html", "CRM tags users directory"],
  ["Reporting", "api/reporting.html", "analytics bots FAQ"],
  ["Errors and responses", "api/errors.html", "400 401 status failure"],
  ["API reference", "api/reference.html", "endpoint channels API"],
  ["Build with n8n", "connectors/n8n.html", "automation SMS verified community node"],
  ["Build with GitHub Actions", "connectors/github-actions.html", "connector GitHub Actions workflow SMS alive5-sms-action"],
  ["Build with Apify", "connectors/apify.html", "connector Apify Actor SMS recipients dataset"],
  ["Build with Directus", "connectors/directus.html", "connector Directus Flow SMS Marketplace npm environment API key"],
  ["Connectors", "connectors/index.html", "integrations automation"],
  ["Integrations", "integrations/index.html", "website live chat widget visitor data CRM conversation sync"],
  ["Install the chat widget", "integrations/widget.html", "website live chat widget embed script CSP nonce Drupal installation"],
  ["Pass visitor data", "integrations/visitor-data.html", "a5_firstname variables chat link UTM visitor name email custom data"],
  ["CRM integrations", "integrations/crm.html", "Salesforce HubSpot Dynamics 365 Dataverse JobDiva OAuth scopes field mapping conversation sync"],
  ["API overview", "api/index.html", "base URL resources REST"],
];
function wireSearch() {
  const dialog = document.createElement("dialog");
  dialog.className = "search-dialog";
  dialog.setAttribute("aria-label", "Search documentation");
  dialog.setAttribute("aria-modal", "true");
  dialog.innerHTML = `<div class="search-input-row"><span aria-hidden="true">⌕</span><input aria-label="Search documentation" aria-controls="search-results" aria-describedby="search-hint" placeholder="Search guides, endpoints, connectors…" autocomplete="off"><button type="button" aria-label="Esc — Close search">Esc</button></div><div class="search-results" id="search-results"></div><div class="search-hint" id="search-hint">↑ ↓ Navigate <span>↵ Open</span><span>esc Close</span></div><span class="sr-only" role="status" data-search-status></span>`;
  document.body.append(dialog);
  const input = dialog.querySelector("input"),
    results = dialog.querySelector(".search-results");
  let active = 0;
  let returnFocus;
  let index = [];
  let indexRequest;
  let indexFailed = false;
  const normalize = (value) => value.toLowerCase().replace(/[–—]/g, "-")
    .replace(/(?:^|\s)\/?public\/\d+\.\d+(?=\/|\s|$)/g, " ")
    .replace(/\//g, " ").replace(/\s+/g, " ").trim();
  const escape = (value) => value.replace(/[&<>"']/g, (char) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
  const curated = SEARCH.map(([title, path, keywords]) => ({ title, path, keywords, heading: "", snippet: "", text: "" }));
  const rank = (row, query, terms) => {
    const title = normalize(row.title), heading = normalize(row.heading);
    const keywords = normalize(`${row.id || ""} ${row.endpoint || ""} ${row.keywords || ""}`);
    const body = normalize(row.text);
    const endpoint = normalize(row.endpoint || "");
    const endpointPath = endpoint.replace(/^(get|post|put|patch|delete|head|options)\s+/, "");
    const all = `${title} ${heading} ${keywords} ${body}`;
    if (!terms.every((term) => all.includes(term))) return 0;
    const contains = (field) => terms.every((term) => field.includes(term));
    // Curated keywords also identify the section that actually documents them.
    const sectionKeywords = row.id && contains(body) && contains(normalize(row.pageKeywords || ""));
    const score = endpoint && (endpoint === query || endpointPath === query) ? 1200
      : endpoint && terms.length > 1 && contains(endpoint) ? 1100
      : (!row.id && title === query) || heading === query || normalize(row.id || "") === query ? 1000
      : contains(row.id ? heading : title) ? 800
      : contains(keywords) || sectionKeywords ? 500 : 200;
    return score + (row.id ? 30 : row.keywords ? 10 : 0)
      + (contains(normalize(row.snippet)) ? 20 : 0)
      + (body.includes(query) ? 10 / (1 + body.indexOf(query)) : 0);
  };
  const draw = () => {
    const selected = results.querySelectorAll("a")[active];
    const selectedURL = selected?.href;
    const restoreFocus = selected && document.activeElement === selected;
    const query = normalize(input.value.trim());
    const terms = [...new Set(query.split(/\s+/).filter(Boolean))];
    const highlight = (value) => {
      if (!terms.length) return escape(value);
      const pattern = new RegExp(terms.slice().sort((a, b) => b.length - a.length)
        .map((term) => {
          const literal = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
          return term.length === 1 && /\w/.test(term) ? `\\b${literal}\\b` : literal;
        }).join("|"), "gi");
      let output = "", start = 0;
      for (const match of value.matchAll(pattern)) {
        output += escape(value.slice(start, match.index)) + `<mark>${escape(match[0])}</mark>`;
        start = match.index + match[0].length;
      }
      return output + escape(value.slice(start));
    };
    const ranked = terms.length ? [...curated, ...index]
      .map((row) => ({ ...row, score: rank(row, query, terms) }))
      .filter((row) => row.score).sort((a, b) => b.score - a.score) : curated;
    // Keep each page together, ordered by its strongest match; show eight links total.
    const groups = new Map();
    for (const row of ranked) {
      if (!groups.has(row.path)) groups.set(row.path, []);
      const group = groups.get(row.path);
      if (!group.some((hit) => (hit.id || "") === (row.id || ""))) group.push(row);
    }
    let count = 0;
    const content = [];
    for (const rows of groups.values()) {
      const hits = rows.slice(0, 8 - count);
      if (!hits.length) break;
      count += hits.length;
      content.push(`<p>${highlight(hits[0].title)}</p>` + hits.map((row) => {
        const label = row.heading || row.title;
        const context = row.heading ? `${row.title} › ${row.heading}` : row.title;
        const body = normalize(row.text);
        const position = Math.min(...terms.map((term) => body.indexOf(term)).filter((pos) => pos >= 0));
        const start = position >= 140 && Number.isFinite(position) ? Math.max(0, position - 40) : 0;
        const snippet = start ? row.text.slice(start, start + 140) : row.snippet;
        const anchorMatch = row.id && terms.some((term) => normalize(row.id).includes(term));
        return `<a href="${escape(href(row.path + (row.id ? "#" + encodeURIComponent(row.id) : "")))}"><span class="search-doc-icon" aria-hidden="true">▤</span><span class="search-result-copy">${highlight(label)}<small>${highlight(context)}</small>${row.endpoint || anchorMatch ? `<small>${highlight(row.endpoint || "#" + row.id)}</small>` : ""}${snippet ? `<small class="search-snippet">${start ? "…" : ""}${highlight(snippet)}${row.text.length > start + 140 ? "…" : ""}</small>` : ""}</span><span class="search-enter" aria-hidden="true">↵</span></a>`;
      }).join(""));
    }
    dialog.querySelector("[data-search-status]").textContent = `${count} documentation results${indexFailed ? "; section search unavailable" : ""}`;
    results.innerHTML = content.length ? content.join("")
      : `<div class="search-empty">No results for “${escape(input.value.trim())}”<small>${indexRequest && !index.length && !indexFailed ? "Loading section search…" : "Try “API key”, “SMS”, or “Zapier”."}</small></div>`;
    if (indexFailed) results.insertAdjacentHTML("beforeend", '<div class="search-empty"><small>Section search is unavailable. Reopen search to retry.</small></div>');
    const links = [...results.querySelectorAll("a")];
    active = Math.max(0, links.findIndex((link) => link.href === selectedURL));
    mark();
    if (restoreFocus) links[active]?.focus({ preventScroll: true });
  };
  const loadIndex = () => {
    if (indexRequest) return;
    indexFailed = false;
    indexRequest = fetch(href("assets/search-index.json"))
      .then((response) => {
        if (!response.ok) throw new Error("Search index unavailable");
        return response.json();
      })
      .then((pages) => {
        index = pages.flatMap((page) => {
          const entry = curated.find((row) => row.path === page.path);
          return page.sections.map((section) => ({ ...section, path: page.path,
            heading: section.id ? section.heading : "", title: page.h1,
            keywords: section.keywords || (section.id ? "" : entry?.keywords || ""), pageKeywords: entry?.keywords || "" }));
        });
      })
      .catch(() => { indexFailed = true; indexRequest = undefined; })
      .finally(() => { if (dialog.open) draw(); });
  };
  const mark = () => {
    const links = [...results.querySelectorAll("a")];
    links.forEach((a, i) =>
      a.classList.toggle("selected", i === active),
    );
    input.setAttribute("aria-description", links[active] ? `Selected result: ${links[active].innerText.replaceAll("\n", " ")}` : "No matching results");
  };
  const open = () => {
    if (dialog.open) return;
    returnFocus = document.activeElement;
    input.value = "";
    loadIndex();
    draw();
    dialog.showModal();
    input.focus();
  };
  const close = () => {
    dialog.close();
    if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true });
  };
  dialog.addEventListener("cancel", (e) => { e.preventDefault(); close(); });
  input.addEventListener("input", draw);
  dialog
    .querySelector("button")
    .addEventListener("click", close);
  dialog.addEventListener("click", (e) => {
    if (e.target === dialog) close();
  });
  results.addEventListener("click", (e) => {
    if (e.target.closest("a")) close();
  });
  results.addEventListener("focusin", (e) => {
    const link = e.target.closest("a");
    if (link) {
      active = [...results.querySelectorAll("a")].indexOf(link);
      mark();
    }
  });
  dialog.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      e.preventDefault();
      close();
      return;
    }
    if (e.key === "Tab") {
      const focusable = [...dialog.querySelectorAll("input, button, a[href]")];
      const first = focusable[0], last = focusable.at(-1);
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
    const links = [...results.querySelectorAll("a")];
    if (["ArrowDown", "ArrowUp"].includes(e.key) && (e.target === input || e.target.closest(".search-results"))) {
      e.preventDefault();
      active =
        (active +
          (["ArrowDown", "ArrowRight"].includes(e.key) ? 1 : -1) +
          links.length) %
        Math.max(1, links.length);
      mark();
      links[active]?.scrollIntoView({ block: "nearest" });
      if (e.target !== input) links[active]?.focus();
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
      ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") ||
      (e.key === "/" && !e.metaKey && !e.ctrlKey && !e.altKey &&
        !document.activeElement.closest("input, textarea, select, [contenteditable]:not([contenteditable=false])"))
    ) {
      e.preventDefault();
      open();
    }
  });
}

function enhanceDocs() {
  const main = document.querySelector("main");
  if (main) main.tabIndex = -1;
  document.querySelector(".skip")?.addEventListener("click", () => main?.focus());
  document.querySelectorAll(".info-tip").forEach((tip) => {
    tip.addEventListener("pointerenter", () => tip.classList.remove("is-dismissed"));
    tip.addEventListener("focusin", () => tip.classList.remove("is-dismissed"));
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") document.querySelectorAll(".info-tip").forEach((tip) =>
      tip.classList.add("is-dismissed"));
  });
  document.querySelectorAll("table.tbl").forEach((table, index) => {
    const wrap = document.createElement("div");
    wrap.className = "table-scroll";
    wrap.tabIndex = 0;
    wrap.setAttribute("role", "region");
    const heading = table.closest(".reference-entry")?.querySelector("h3") ||
      [...document.querySelectorAll("h2, h3")].filter((h) =>
        h.compareDocumentPosition(table) & Node.DOCUMENT_POSITION_FOLLOWING).at(-1);
    wrap.setAttribute("aria-label", `${heading?.textContent.trim() || "Documentation"}: data table ${index + 1}`);
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
wireTheme();
renderSidebar();
renderDocFooter();
wireCode();
wireToc();
wireSearch();

enhanceDocs();
