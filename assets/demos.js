const escapeHtml = (value) =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

const SCENARIOS = [
  {
    id: "appointment",
    label: "Appointment",
    incoming: "Could I reschedule my appointment?",
    reply: "Thanks for getting in touch. Which day works for you?",
  },
  {
    id: "hours",
    label: "Opening hours",
    incoming: "What are your opening hours?",
    reply: "Our example hours are Monday to Friday, 9am to 5pm.",
  },
  {
    id: "support",
    label: "Support request",
    incoming: "I need help with an invoice.",
    reply: "Thanks. Please share the invoice number so our team can help.",
  },
];
const motionIcon = (paused) => `<svg class="sc-play-icon" viewBox="0 0 10 12" aria-hidden="true" fill="currentColor">${paused ? '<path d="m2 1 7 5-7 5Z"/>' : '<path d="M2 1h2v10H2zM6 1h2v10H6z"/>'}</svg>`;

function wireShowcases() {
  document.querySelectorAll("[data-automation]").forEach((root) => {
    const motion = matchMedia("(prefers-reduced-motion: no-preference)");
    const reduced = !motion.matches;
    let selected = 0,
      elapsed = reduced ? 3200 : 0,
      phase = -1,
      autoAdvance = true;
    let paused = reduced,
      visible = false,
      frame = 0,
      lastFrame = 0;
    let drag = null;
    const moved = new Map();
    root.classList.add("flow-showcase");
    // The initial markup is in HTML so hydration preserves the responsive size.
    const scene = root.querySelector(".sc-scene"),
      svg = root.querySelector(".sc-wires");
    const cards = [...root.querySelectorAll(".sc-card")];
    const paths = [...svg.querySelectorAll("path")],
      packets = [...svg.querySelectorAll(".sc-packet")];
    const ports = [...svg.querySelectorAll(".sc-port")];
    let connectionFrame = 0,
      packetFrame = 0,
      pathsReady = false;
    const tabs = [...root.querySelectorAll("[data-example]")];
    const play = root.querySelector(".sc-play");
    const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
    function placeCard(index, x, y) {
      const card = cards[index];
      const maxX = Math.max(12, scene.clientWidth - card.offsetWidth - 12),
        maxY = Math.max(12, scene.clientHeight - card.offsetHeight - 12);
      x = clamp(x, 12, maxX);
      y = clamp(y, 12, maxY);
      moved.set(index, { x: x / maxX, y: y / maxY });
      connect();
    }
    function connect() {
      pathsReady = false;
      if (!connectionFrame)
        connectionFrame = requestAnimationFrame(updateConnections);
    }
    function updateConnections() {
      connectionFrame = 0;
      // Read every box before changing card positions or SVG geometry.
      const width = scene.clientWidth,
        height = scene.clientHeight;
      const boxes = cards.map((card, index) => {
        const box = {
          left: card.offsetLeft,
          top: card.offsetTop,
          width: card.offsetWidth,
          height: card.offsetHeight,
        };
        const pos = moved.get(index);
        if (pos) {
          const maxX = Math.max(12, width - box.width - 12),
            maxY = Math.max(12, height - box.height - 12);
          box.left = clamp(pos.x * maxX, 12, maxX);
          box.top = clamp(pos.y * maxY, 12, maxY);
        }
        return box;
      });
      svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
      cards.forEach((card, index) => {
        if (!moved.has(index)) return;
        card.style.left = boxes[index].left + "px";
        card.style.top = boxes[index].top + "px";
      });
      for (let i = 0; i < 2; i++) {
        const a = boxes[i],
          b = boxes[i + 1];
        const ac = [
            a.left + a.width / 2,
            a.top + a.height / 2,
          ],
          bc = [
            b.left + b.width / 2,
            b.top + b.height / 2,
          ];
        const vertical = Math.abs(bc[1] - ac[1]) > Math.abs(bc[0] - ac[0]);
        let start, end, path;
        if (vertical) {
          const down = bc[1] >= ac[1];
          start = [ac[0], a.top + (down ? a.height : 0)];
          end = [bc[0], b.top + (down ? 0 : b.height)];
          const mid = (start[1] + end[1]) / 2;
          path = `M${start} C${start[0]},${mid} ${end[0]},${mid} ${end}`;
        } else {
          const right = bc[0] >= ac[0];
          start = [a.left + (right ? a.width : 0), ac[1]];
          end = [b.left + (right ? 0 : b.width), bc[1]];
          const mid = (start[0] + end[0]) / 2;
          path = `M${start} C${mid},${start[1]} ${mid},${end[1]} ${end}`;
        }
        paths[i].setAttribute("d", path);
        [start, end].forEach((point, j) => {
          const port = ports[i * 2 + j];
          port.setAttribute("cx", point[0]);
          port.setAttribute("cy", point[1]);
        });
      }
      // Measure the new paths after the browser has rendered these writes.
      cancelAnimationFrame(packetFrame);
      packetFrame = requestAnimationFrame(() => {
        packetFrame = 0;
        pathsReady = true;
        drawPackets();
      });
    }
    function drawPackets() {
      if (!pathsReady) return;
      const points = [
        [700, 1600],
        [1800, 2700],
      ].map(([from, to], i) => {
        const fraction = (elapsed - from) / (to - from);
        if (fraction >= 0 && fraction <= 1 && paths[i].getAttribute("d")) {
          return paths[i].getPointAtLength(
            fraction * paths[i].getTotalLength(),
          );
        }
        return null;
      });
      points.forEach((point, i) => {
        const packet = packets[i];
        packet.style.opacity = point ? "1" : "0";
        if (point) {
          packet.setAttribute("cx", point.x);
          packet.setAttribute("cy", point.y);
        }
      });
    }
    function drawPhase() {
      drawPackets();
      const next = elapsed < 1600 ? 0 : elapsed < 2700 ? 1 : 2;
      if (next !== phase) {
        phase = next;
        root.dataset.phase = String(phase);
        cards.forEach((card, i) => {
          card.classList.toggle("sc-active", i === phase);
          card.classList.toggle("sc-complete", i < phase || phase === 2);
        });
        paths.forEach((path, i) =>
          path.classList.toggle("sc-traced", phase > i),
        );
        svg
          .querySelectorAll(".sc-port")
          .forEach((port) =>
            port.classList.toggle(
              "sc-traced",
              phase > Number(port.dataset.port[0]),
            ),
          );
      }
    }
    function choose(index, announce = false) {
      if (announce) autoAdvance = false;
      selected = index;
      elapsed = paused ? 3200 : 0;
      phase = -1;
      const sample = SCENARIOS[selected];
      root.dataset.sample = sample.id;
      root.querySelector("[data-incoming]").textContent = sample.incoming;
      root.querySelector("[data-template]").textContent = sample.reply;
      root.querySelector("[data-reply]").textContent = sample.reply;
      tabs.forEach((tab, i) => {
        tab.setAttribute("aria-selected", String(i === index));
        tab.tabIndex = i === index ? 0 : -1;
      });
      scene.setAttribute("aria-labelledby", tabs[index].id);
      if (announce)
        root.querySelector(".sc-announcement").textContent =
          sample.label + " example selected. This uses a fixed reply.";
      connect();
      drawPhase();
    }
    function tick(time) {
      frame = 0;
      if (!motion.matches) {
        syncMotion();
        return;
      }
      if (!visible || paused || document.hidden) {
        lastFrame = 0;
        return;
      }
      if (lastFrame) elapsed += Math.min(time - lastFrame, 100);
      lastFrame = time;
      if (elapsed >= 8500)
        choose(autoAdvance ? (selected + 1) % SCENARIOS.length : selected);
      drawPhase();
      frame = requestAnimationFrame(tick);
    }
    function schedule() {
      if (motion.matches && !frame && visible && !paused && !document.hidden)
        frame = requestAnimationFrame(tick);
    }
    play.addEventListener("click", () => {
      if (!motion.matches) return;
      paused = !paused;
      play.innerHTML = `${motionIcon(paused)} ${paused ? "Play" : "Pause"}`;
      play.setAttribute(
        "aria-label",
        paused ? "Play animation" : "Pause animation",
      );
      if (paused) {
        cancelAnimationFrame(frame);
        frame = 0;
        lastFrame = 0;
      } else {
        if (elapsed >= 2700) {
          elapsed = 0;
          phase = -1;
          drawPhase();
        }
        schedule();
      }
    });
    root.querySelector(".sc-samples").addEventListener("focusin", () => {
      autoAdvance = false;
    });
    tabs.forEach((tab, index) => {
      tab.addEventListener("click", () => choose(index, true));
      tab.addEventListener("keydown", (e) => {
        if (["ArrowRight", "ArrowLeft", "Home", "End"].includes(e.key)) {
          e.preventDefault();
          const next =
            e.key === "Home"
              ? 0
              : e.key === "End"
                ? tabs.length - 1
                : (index + (e.key === "ArrowRight" ? 1 : -1) + tabs.length) %
                  tabs.length;
          choose(next, true);
          tabs[next].focus();
        }
      });
    });
    cards.forEach((card, index) => {
      const head = card.querySelector(".sc-card-head"),
        grip = card.querySelector(".sc-grip");
      head.addEventListener("pointerdown", (e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        autoAdvance = false;
        drag = {
          index,
          id: e.pointerId,
          x: e.clientX,
          y: e.clientY,
          left: card.offsetLeft,
          top: card.offsetTop,
        };
        head.setPointerCapture(e.pointerId);
        card.classList.add("sc-dragging");
        grip.focus({ preventScroll: true });
      });
      head.addEventListener("pointermove", (e) => {
        if (drag?.index !== index || drag.id !== e.pointerId) return;
        placeCard(
          index,
          drag.left + e.clientX - drag.x,
          drag.top + e.clientY - drag.y,
        );
      });
      const end = () => {
        if (drag?.index === index) {
          drag = null;
          card.classList.remove("sc-dragging");
          root.querySelector(".sc-announcement").textContent =
            "Card moved. The connections follow its position.";
        }
      };
      head.addEventListener("pointerup", end);
      head.addEventListener("pointercancel", end);
      head.addEventListener("lostpointercapture", end);
      grip.addEventListener("keydown", (e) => {
        const directions = {
          ArrowLeft: [-1, 0],
          ArrowRight: [1, 0],
          ArrowUp: [0, -1],
          ArrowDown: [0, 1],
        };
        if (e.key === "Home") {
          e.preventDefault();
          moved.delete(index);
          card.style.left = "";
          card.style.top = "";
          connect();
          return;
        }
        const delta = directions[e.key];
        if (!delta) return;
        e.preventDefault();
        const step = e.shiftKey ? 1 : 12;
        placeCard(
          index,
          card.offsetLeft + delta[0] * step,
          card.offsetTop + delta[1] * step,
        );
      });
    });
    root.querySelector(".sc-reset").addEventListener("click", () => {
      moved.clear();
      cards.forEach((card) => {
        card.style.left = "";
        card.style.top = "";
      });
      connect();
      root.querySelector(".sc-announcement").textContent =
        "Card positions restored.";
    });
    const resize = new ResizeObserver(connect);
    resize.observe(scene);
    cards.forEach((card) => resize.observe(card));
    const observer = new IntersectionObserver(
      (entries) => {
        visible = entries[0].isIntersecting;
        if (!visible) {
          cancelAnimationFrame(frame);
          frame = 0;
          lastFrame = 0;
        } else schedule();
      },
      { threshold: 0.15 },
    );
    observer.observe(scene);
    document.addEventListener("visibilitychange", () => {
      lastFrame = 0;
      schedule();
    });
    function syncMotion() {
      play.disabled = !motion.matches;
      if (!motion.matches) {
        paused = true;
        cancelAnimationFrame(frame);
        frame = 0;
        lastFrame = 0;
        elapsed = 3200;
        phase = -1;
        drawPhase();
      }
      play.innerHTML = `${motionIcon(paused)} ${paused ? "Play" : "Pause"}`;
      play.setAttribute("aria-label", motion.matches ? (paused ? "Play animation" : "Pause animation") : "Play animation disabled by reduced motion preference");
    }
    motion.addEventListener("change", syncMotion);
    choose(0);
    syncMotion();
    schedule();
  });
}
wireShowcases();
