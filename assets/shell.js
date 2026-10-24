const OPS = [
  {
    label: "Preview an SMS",
    cmd: 'alive5 sms send --from +12025550100 --to +12025550123 --channel example_channel --user example_user --message "Hello from Alive5." --dry-run',
    doc: "api/send-a-message.html",
    docLabel: "Learn more about sending messages",
    res: {
      ok: true,
      data: {
        preview: true,
        validated: "locally",
        method: "POST",
        url: "https://api.alive5.com/public/1.0/conversations/sms/send",
        form: {
          phone_number_from: "+12025550100",
          phone_number_to: "+12025550123",
          message: "Hello from Alive5.",
          channel_id: "example_channel",
          user_id: "example_user",
        },
      },
      error: null,
      meta: {
        schemaVersion: 1,
      },
    },
  },
  {
    label: "List conversations",
    cmd: "alive5 conversations list --type sms --since 2026-09-01 --until 2026-09-11",
    doc: "api/receive-messages.html",
    docLabel: "Learn more about reading conversations",
    res: {
      ok: true,
      data: [
        {
          id: "example_conversation",
          type: "sms",
          channel: {
            id: "example_channel",
            name: "Example team",
          },
          assignedTo: "example_user",
          startedAt: "2026-09-09T15:00:00.000Z",
          endedAt: null,
          contact: {
            id: "example_contact_1",
            firstName: "Alex",
            lastName: "Example",
            email: "alex@example.com",
            phone: "+12025550123",
          },
          tags: [],
          messages: [
            {
              id: "example_message",
              at: "2026-09-09T15:00:00.000Z",
              sender: "+12025550123",
              text: "Can I move my appointment to Friday?",
            },
          ],
        },
      ],
      error: null,
      meta: {
        schemaVersion: 1,
        page: 1,
        totalPages: 1,
        nextPage: null,
      },
    },
  },
  {
    label: "Get channels and users",
    cmd: "alive5 channels list",
    doc: "api/send-a-message.html",
    docLabel: "Learn more about channels and users",
    res: {
      ok: true,
      data: [
        {
          id: "example_channel",
          name: "+12025550100",
          users: [
            {
              id: "example_user",
              name: "Example team",
              email: "team@example.com",
              role: "agent",
            },
          ],
        },
      ],
      error: null,
      meta: {
        schemaVersion: 1,
      },
    },
  },
  {
    label: "List teammates",
    cmd: "alive5 users list",
    doc: "api/reference.html#users",
    docLabel: "Explore the users API",
    res: {
      ok: true,
      data: [
        {
          id: "example_user",
          name: "Example team",
          email: "team@example.com",
          role: "agent",
          channelIds: ["example_channel"],
        },
      ],
      error: null,
      meta: {
        schemaVersion: 1,
      },
    },
  },
  {
    label: "List contacts",
    cmd: "alive5 contacts list --page 1 --limit 2",
    doc: "api/contacts.html",
    docLabel: "Learn more about contacts",
    res: {
      ok: true,
      data: [
        {
          id: "example_contact_1",
          firstName: "Alex",
          lastName: "Example",
          email: "alex@example.com",
          phone: "+12025550123",
          company: null,
          tags: [],
          updatedAt: null,
        },
        {
          id: "example_contact_2",
          firstName: "Sam",
          lastName: "Example",
          email: "sam@example.com",
          phone: "+12025550124",
          company: null,
          tags: [],
          updatedAt: null,
        },
      ],
      error: null,
      meta: {
        schemaVersion: 1,
        page: 1,
        totalRecords: 2,
        totalPages: 1,
        nextPage: null,
      },
    },
  },
  {
    label: "List tags",
    cmd: "alive5 tags list",
    doc: "api/reference.html#tags",
    docLabel: "Explore the tags API",
    res: {
      ok: true,
      data: [
        {
          id: "example_tag",
          name: "Follow up",
        },
      ],
      error: null,
      meta: {
        schemaVersion: 1,
      },
    },
  },
];
const shellEscape = (value) =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
function paintJson(value) {
  const raw = JSON.stringify(value, null, 2);
  const tokens =
    /"(?:\\.|[^"\\])*"\s*:?|\b(?:true|false|null|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)\b/g;
  let output = "",
    end = 0;
  for (const match of raw.matchAll(tokens)) {
    output += shellEscape(raw.slice(end, match.index));
    const token = match[0];
    const kind = token.startsWith('"')
      ? token.trimEnd().endsWith(":")
        ? "key"
        : "str"
      : "num";
    output += `<span class="${kind}">${shellEscape(token)}</span>`;
    end = match.index + token.length;
  }
  return output + shellEscape(raw.slice(end));
}
function parseCommand(command) {
  const tokens = command.match(/"(?:\\.|[^"\\])*"|'[^']*'|\S+/g) || [];
  const words = [],
    flags = Object.create(null);
  const unquote = (s) =>
    s.startsWith('"') ? JSON.parse(s) : s.startsWith("'") ? s.slice(1, -1) : s;
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i].startsWith("--")) {
      if (tokens[i] === "--dry-run") {
        flags["dry-run"] = true;
        continue;
      }
      if (!tokens[i + 1] || tokens[i + 1].startsWith("--"))
        throw Error(`Missing value for ${tokens[i]}.`);
      flags[tokens[i].slice(2)] = unquote(tokens[++i]);
    } else words.push(unquote(tokens[i]));
  }
  return { base: words.join(" "), flags };
}
function shellResponse(op, flags) {
  const res = structuredClone(op.res);
  const allowed = new Set(
    [...op.cmd.matchAll(/--([a-z-]+)/g)].map((m) => m[1]),
  );
  for (const flag of Object.keys(flags))
    if (!allowed.has(flag)) throw Error(`Unsupported example flag: --${flag}.`);
  if (op === OPS[0]) {
    if (!flags["dry-run"])
      throw Error("This example requires --dry-run. Nothing is sent.");
    for (const field of ["from", "to"])
      if (!/^\+[1-9]\d{7,14}$/.test(flags[field] || ""))
        throw Error(`Use --${field} with an E.164 phone number.`);
    if (!flags.channel || !flags.user)
      throw Error("Provide --channel and --user.");
    if (!flags.message?.trim() || flags.message.length > 1600)
      throw Error("Provide --message with 1–1600 characters.");
    res.data.form = {
      phone_number_from: flags.from,
      phone_number_to: flags.to,
      message: flags.message,
      channel_id: flags.channel,
      user_id: flags.user,
    };
  }
  if (op === OPS[1]) {
    if (flags.type !== "sms")
      throw Error("This browser example supports --type sms.");
    const validDate = (date) =>
      /^\d{4}-\d{2}-\d{2}$/.test(date || "") &&
      !Number.isNaN(Date.parse(date)) &&
      new Date(date).toISOString().slice(0, 10) === date;
    if (
      !validDate(flags.since) ||
      !validDate(flags.until) ||
      flags.since >= flags.until
    )
      throw Error("Use real YYYY-MM-DD dates, with --until after --since.");
    res.data = res.data.filter(
      (row) => row.startedAt >= flags.since && row.startedAt < flags.until,
    );
  }
  if (op === OPS[4]) {
    const page = Number(flags.page || 1),
      limit = Number(flags.limit || 25);
    if (
      !Number.isInteger(page) ||
      page < 1 ||
      !Number.isInteger(limit) ||
      limit < 1 ||
      limit > 100
    )
      throw Error("Use a positive --page and a --limit from 1 to 100.");
    res.meta = {
      schemaVersion: 1,
      page,
      totalRecords: 2,
      totalPages: Math.ceil(2 / limit),
      nextPage: page < Math.ceil(2 / limit) ? page + 1 : null,
    };
    res.data = res.data.slice((page - 1) * limit, page * limit);
  }
  return res;
}
function wireShell() {
  const root = document.querySelector("[data-shell]");
  if (!root) return;
  const list = root.querySelector(".tryout-list"),
    out = root.querySelector(".shell-out"),
    input = root.querySelector("textarea"),
    form = root.querySelector("form"),
    scroll = root.querySelector(".shell-scroll"),
    foot = document.querySelector("[data-shell-doc]");
  const announce = (text) => {
    root.querySelector("[data-shell-announcement]").textContent = text;
  };
  const history = [];
  let historyIndex = 0,
    serial = 0,
    busy = false;
  list.innerHTML = OPS.map(
    (op, i) =>
      `<button type="button" role="tab" id="shell-tab-${i}" aria-controls="shell-panel" aria-selected="${i === 0}" tabindex="${i === 0 ? 0 : -1}">${op.label}</button>`,
  ).join("");
  const buttons = [...list.querySelectorAll("button")];
  scroll.tabIndex = 0;
  scroll.setAttribute("role", "region");
  scroll.setAttribute("aria-label", "Terminal output and command prompt");
  const fit = () => {
    input.style.height = "auto";
    input.style.height = Math.max(26, input.scrollHeight) + "px";
  };
  let inputWidth;
  new ResizeObserver(([entry]) => {
    if (entry.contentRect.width === inputWidth) return;
    inputWidth = entry.contentRect.width;
    fit();
  }).observe(input);
  const stage = (index, focus = true) => {
    const op = OPS[index];
    buttons.forEach((b, i) => {
      b.setAttribute("aria-selected", String(i === index));
      b.tabIndex = i === index ? 0 : -1;
    });
    root
      .querySelector(".shell")
      .setAttribute("aria-labelledby", `shell-tab-${index}`);
    input.value = op.cmd;
    fit();
    foot.href = href(op.doc);
    foot.textContent = op.docLabel;
    if (focus) {
      input.focus({ preventScroll: true });
      scroll.scrollTop = scroll.scrollHeight;
    }
  };
  const welcome = () => {
    serial++;
    announce("");
    busy = false;
    form.removeAttribute("aria-busy");
    input.disabled = false;
    out.innerHTML = `<div class="shell-intro">Welcome to Alive5 Shell!<br>Example commands with fictional responses.<br><br><span class="shell-bullet">–</span> View commands: <button type="button" data-stage="help">alive5 help ▷</button><br><span class="shell-bullet">–</span> List example channels: <button type="button" data-stage="2">alive5 channels list ▷</button><br><span class="shell-bullet">–</span> Preview an SMS: <button type="button" data-stage="0">alive5 sms send ▷</button></div><div class="shell-history"></div>`;
    stage(0, false);
    scroll.scrollTop = 0;
  };
  const run = () => {
    const command = input.value.trim();
    if (!command || busy) return;
    if (["clear", "alive5 clear"].includes(command)) {
      welcome();
      input.value = "";
      fit();
      return;
    }
    history.push(command);
    if (history.length > 40) history.shift();
    historyIndex = history.length;
    input.value = "";
    fit();
    const block = document.createElement("div");
    block.className = "shell-history-entry";
    block.innerHTML = `<div class="shell-history-command"><span>$</span> ${shellEscape(command)}</div><div class="shell-response"></div>`;
    out.querySelector(".shell-history").append(block);
    const entries = out.querySelectorAll(".shell-history-entry");
    if (entries.length > 15) entries[0].remove();
    const response = block.querySelector(".shell-response");
    if (["help", "alive5 help"].includes(command))
      response.innerHTML = `<div class="shell-help-list">${OPS.map((op, i) => `<button type="button" data-stage="${i}">${shellEscape(op.cmd.split(" --")[0])} ▷</button><span>${op.label}</span>`).join("")}</div>`;
    else {
      let result;
      try {
        const parsed = parseCommand(command),
          op = OPS.find((o) => o.cmd.split(" --")[0] === parsed.base);
        if (!op)
          throw Error("Unknown command. Type alive5 help to see examples.");
        result = shellResponse(op, parsed.flags);
      } catch (error) {
        response.innerHTML = `<span class="shell-error">${shellEscape(error.message)}</span>`;
        announce(error.message);
        scroll.scrollTop = scroll.scrollHeight;
        return;
      }
      announce("Preparing example response");
      busy = true;
      const ticket = ++serial;
      response.innerHTML =
        '<span class="shell-working">Preparing example response<span>···</span></span>';
      form.setAttribute("aria-busy", "true");
      setTimeout(
        () => {
          if (ticket !== serial) return;
          response.innerHTML = `<div class="shell-result-label">Local example <span>· No API request</span></div><pre>${paintJson(result)}</pre>`;
          busy = false;
          announce("Example response ready. Nothing sent.");
          form.removeAttribute("aria-busy");
          scroll.scrollTop = Math.max(0, block.offsetTop - 12);
        },
        matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 450,
      );
    }
    scroll.scrollTop = scroll.scrollHeight;
  };
  buttons.forEach((button, i) => {
    button.addEventListener("click", () => stage(i, false));
    button.addEventListener("keydown", (e) => {
      if (
        [
          "ArrowDown",
          "ArrowUp",
          "ArrowLeft",
          "ArrowRight",
          "Home",
          "End",
        ].includes(e.key)
      ) {
        e.preventDefault();
        const next =
          e.key === "Home"
            ? 0
            : e.key === "End"
              ? buttons.length - 1
              : (i +
                  (["ArrowDown", "ArrowRight"].includes(e.key) ? 1 : -1) +
                  buttons.length) %
                buttons.length;
        stage(next, false);
        buttons[next].focus();
      }
    });
  });
  out.addEventListener("click", (e) => {
    const button = e.target.closest("[data-stage]");
    if (!button) return;
    if (button.dataset.stage === "help") {
      input.value = "alive5 help";
      fit();
      input.focus({ preventScroll: true });
    } else stage(Number(button.dataset.stage));
  });
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    run();
  });
  input.addEventListener("input", fit);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      run();
    }
    if (
      ["ArrowUp", "ArrowDown"].includes(e.key) &&
      history.length &&
      !e.shiftKey &&
      input.selectionStart === input.selectionEnd &&
      (e.key === "ArrowUp"
        ? input.selectionStart === 0
        : input.selectionEnd === input.value.length)
    ) {
      e.preventDefault();
      historyIndex = Math.max(
        0,
        Math.min(history.length, historyIndex + (e.key === "ArrowUp" ? -1 : 1)),
      );
      input.value = history[historyIndex] || "";
      fit();
    }
  });
  root.querySelector("[data-shell-reset]").addEventListener("click", () => {
    welcome();
    input.focus({ preventScroll: true });
  });
  root.querySelector("[data-shell-prompt]").addEventListener("click", () => {
    input.focus({ preventScroll: true });
    scroll.scrollTop = scroll.scrollHeight;
  });
  const narrow = matchMedia("(max-width:720px)");

  const shell = root.querySelector(".shell"),
    grip = root.querySelector("[data-shell-resize]");
  grip.setAttribute("aria-controls", shell.id);
  let extra = 0;
  const baseHeight = () =>
    narrow.matches ? 480 : Math.round(list.getBoundingClientRect().height);
  const size = () => {
    const base = baseHeight(),
      max = base + 480;
    extra = Math.max(0, Math.min(extra, max - base));
    shell.style.height = `${base + extra}px`;
    grip.setAttribute("aria-valuemin", String(base));
    grip.setAttribute("aria-valuemax", String(max));
    grip.setAttribute("aria-valuenow", String(base + extra));
  };
  grip.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    grip.setPointerCapture(e.pointerId);
    const startY = e.clientY,
      startExtra = extra;
    document.documentElement.classList.add("is-resizing");
    const move = (ev) => {
      extra = startExtra + ev.clientY - startY;
      size();
    };
    const end = () => {
      document.documentElement.classList.remove("is-resizing");
      grip.removeEventListener("pointermove", move);
      grip.removeEventListener("pointerup", end);
      grip.removeEventListener("pointercancel", end);
      grip.removeEventListener("lostpointercapture", end);
    };
    grip.addEventListener("pointermove", move);
    grip.addEventListener("pointerup", end, { once: true });
    grip.addEventListener("pointercancel", end, { once: true });
    grip.addEventListener("lostpointercapture", end, { once: true });
  });
  grip.addEventListener("keydown", (e) => {
    if (!["ArrowUp", "ArrowDown", "Home", "End"].includes(e.key)) return;
    e.preventDefault();
    extra = e.key === "Home" ? 0 : e.key === "End" ? 480 :
      extra + (e.key === "ArrowDown" ? 40 : -40);
    size();
  });
  grip.addEventListener("dblclick", () => {
    extra = 0;
    size();
  });
  new ResizeObserver(size).observe(list);
  narrow.addEventListener("change", size);
  const orient = () => {
    list.setAttribute(
      "aria-orientation",
      narrow.matches ? "horizontal" : "vertical",
    );
    fit();
  };
  narrow.addEventListener("change", orient);
  welcome();
  orient();
}
wireShell();
