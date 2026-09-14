// Browser-only examples. No API client, credentials, or network execution.
const OPS = [
  {
    label: "Send an SMS",
    cmd: 'alive5 messages send --to +12025550123 --text "Hello from Alive5."',
    doc: "api/send-a-message.html",
    docLabel: "Learn more about sending messages",
    res: {
      code: 200,
      data: {
        message_id: "example_message",
        message_status: "queued",
        thread_id: "example_thread",
        from: "+12025550100",
        to: "+12025550123",
        direction: "outbound",
        message: "Hello from Alive5.",
      },
      error: {},
    },
  },
  {
    label: "List conversations",
    cmd: "alive5 conversations list --channel sms",
    doc: "api/receive-messages.html",
    docLabel: "Learn more about reading conversations",
    res: {
      code: 200,
      data: {
        Items: [
          {
            alive5_sessionID: "example_conversation",
            channel_label: "Example team",
            alive_sms_phone_number: "+12025550100",
            contacts_first_name: "Alex",
            chat_conversation: [
              {
                message_content: "Can I move my appointment to Friday?",
                created_by: "+12025550123",
                created_at: 1757372041880,
              },
            ],
          },
        ],
      },
      error: {},
    },
  },
  {
    label: "Get channels and users",
    cmd: "alive5 channels list",
    doc: "api/send-a-message.html",
    docLabel: "Learn more about channels and users",
    res: {
      code: 200,
      data: {
        Items: [
          {
            channel_id: "example_channel",
            channel_label: "+12025550100",
            agents: [
              {
                user_id: "example_user",
                screen_name: "Example team",
                email: "team@example.com",
              },
            ],
          },
        ],
      },
      error: {},
    },
  },
  {
    label: "Create a contact",
    cmd: "alive5 contacts create --first Alex --phone +12025550123",
    doc: "api/contacts.html",
    docLabel: "Learn more about contacts",
    res: {
      code: 200,
      data: {
        crm_id: "example_contact_1",
        contacts_first_name: "Alex",
        contacts_phone_mobile: "+12025550123",
        created_at: 1757372112004,
      },
      error: {},
    },
  },
  {
    label: "List contacts",
    cmd: "alive5 contacts list --page 1 --limit 2",
    doc: "api/contacts.html",
    docLabel: "Learn more about contacts",
    res: {
      code: 200,
      data: {
        total: 2,
        page: 1,
        limit: 2,
        Items: [
          {
            crm_id: "example_contact_1",
            contacts_first_name: "Alex",
            contacts_phone_mobile: "+12025550123",
          },
          {
            crm_id: "example_contact_2",
            contacts_first_name: "Sam",
            contacts_phone_mobile: "+12025550124",
          },
        ],
      },
      error: {},
    },
  },
  {
    label: "Pull a report",
    cmd: "alive5 reports performance --from 09-01-2026 --to 09-10-2026",
    doc: "api/reporting.html",
    docLabel: "Learn more about reporting",
    res: {
      code: 200,
      data: {
        date_start: "09-01-2026",
        date_end: "09-10-2026",
        messages_in: 348,
        messages_out: 402,
        conversations: 96,
        median_first_reply_seconds: 74,
      },
      error: {},
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
      if (!tokens[i + 1] || tokens[i + 1].startsWith("--"))
        throw Error(`Missing value for ${tokens[i]}.`);
      flags[tokens[i].slice(2)] = unquote(tokens[++i]);
    } else words.push(unquote(tokens[i]));
  }
  return { base: words.join(" "), flags };
}
function shellResponse(op, flags) {
  const res = structuredClone(op.res);
  if (op === OPS[0]) {
    if (!flags.to || !/^\+[1-9]\d{7,14}$/.test(flags.to))
      throw Error(
        "Use --to with a number in E.164 format, such as +12025550123.",
      );
    if (!flags.text?.trim())
      throw Error('Add your message with --text "Hello".');
    res.data.to = flags.to;
    res.data.message = flags.text;
  }
  if (op.cmd.startsWith("alive5 contacts create")) {
    if (!flags.first?.trim() || !/^\+[1-9]\d{7,14}$/.test(flags.phone || ""))
      throw Error("Provide --first and a valid --phone number.");
    res.data.contacts_first_name = flags.first;
    res.data.contacts_phone_mobile = flags.phone;
  }

  if (op.cmd.startsWith("alive5 conversations list") && flags.channel !== "sms")
    throw Error("This example supports --channel sms.");
  if (op.cmd.startsWith("alive5 contacts list")) {
    const page = Number(flags.page),
      limit = Number(flags.limit);
    if (
      !Number.isInteger(page) ||
      page < 1 ||
      !Number.isInteger(limit) ||
      limit < 1 ||
      limit > 100
    )
      throw Error("Use a positive --page and a --limit from 1 to 100.");
    res.data.page = page;
    res.data.limit = limit;
    res.data.Items = res.data.Items.slice((page - 1) * limit, page * limit);
  }
  if (op.cmd.startsWith("alive5 reports performance")) {
    if (
      !/^\d{2}-\d{2}-\d{4}$/.test(flags.from || "") ||
      !/^\d{2}-\d{2}-\d{4}$/.test(flags.to || "")
    )
      throw Error("Use --from and --to dates in MM-DD-YYYY format.");
    res.data.date_start = flags.from;
    res.data.date_end = flags.to;
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
  const fit = () => {
    input.style.height = "auto";
    input.style.height = Math.max(26, input.scrollHeight) + "px";
  };
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
    out.innerHTML = `<div class="shell-intro">Welcome to Alive5 Shell!<br>Explore the API with example data. No account required.<br><br><span class="shell-bullet">–</span> View commands: <button type="button" data-stage="help">alive5 help ▷</button><br><span class="shell-bullet">–</span> List example channels: <button type="button" data-stage="2">alive5 channels list ▷</button><br><span class="shell-bullet">–</span> Send a message: <button type="button" data-stage="0">alive5 messages send ▷</button></div><div class="shell-history"></div>`;
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
          response.innerHTML = `<div class="shell-result-label">200 OK <span>· Example response</span></div><pre>${paintJson(result)}</pre>`;
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
    button.addEventListener("click", () => stage(i));
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
  // By default the terminal matches the command list; dragging the grip extends it.
  const shell = root.querySelector(".shell"),
    grip = root.querySelector("[data-shell-resize]");
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
    };
    grip.addEventListener("pointermove", move);
    grip.addEventListener("pointerup", end, { once: true });
    grip.addEventListener("pointercancel", end, { once: true });
  });
  grip.addEventListener("keydown", (e) => {
    if (!["ArrowUp", "ArrowDown"].includes(e.key)) return;
    e.preventDefault();
    extra += e.key === "ArrowDown" ? 40 : -40;
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
