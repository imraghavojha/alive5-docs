import { drawLogo, theme, syncTheme } from "./cli-art.js";

const root = document.querySelector("[data-cli-preview]");
if (root) {
  const canvas = root.querySelector("canvas");
  const scroll = root.querySelector(".shell-scroll");
  const context = canvas.getContext("2d");
  const button = root.querySelector("[data-cli-motion]");
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  const minColumns = 34;
  let columns = minColumns;
  const rows = 5;
  const padding = 4;
  let cellWidth = 9;
  let cellHeight = 18;
  let paused = false;
  let visible = false;
  let timer;
  let time = 0;

  const corners = {
    "╭": [1, 1], "╮": [-1, 1], "╰": [1, -1], "╯": [-1, -1],
    "┌": [1, 1], "┐": [-1, 1], "└": [1, -1], "┘": [-1, -1],
  };

  function paintCell(x, y, ch, fg = theme.ink) {
    const left = x * cellWidth;
    const top = y * cellHeight + padding;
    const cx = left + cellWidth / 2;
    const cy = top + cellHeight / 2;
    context.fillStyle = fg;
    if (ch === "█" || ch === "▀" || ch === "▄") {
      const half = cellHeight / 2;
      context.fillRect(left, ch === "▄" ? cy : top, cellWidth, ch === "█" ? cellHeight : half);
    } else if (ch === "─" || ch === "┬") {
      context.fillRect(left, cy - 0.5, cellWidth, 1);
      if (ch === "┬") context.fillRect(cx - 0.5, cy, 1, cellHeight / 2);
    } else if (ch === "│") {
      context.fillRect(cx - 0.5, top, 1, cellHeight);
    } else if (corners[ch]) {
      const [horizontal, vertical] = corners[ch];
      const radius = "╭╮╰╯".includes(ch) ? cellWidth / 3 : 0;
      context.beginPath();
      context.moveTo(cx + horizontal * cellWidth / 2, cy);
      context.lineTo(cx + horizontal * radius, cy);
      context.quadraticCurveTo(cx, cy, cx, cy + vertical * radius);
      context.lineTo(cx, cy + vertical * cellHeight / 2);
      context.strokeStyle = fg;
      context.stroke();
    } else if (ch !== " ") {
      context.fillText(ch, cx, cy, cellWidth);
    }
  }

  function render() {
    context.clearRect(0, 0, columns * cellWidth, rows * cellHeight + padding * 2);
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.font = `${cellWidth * 1.55}px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`;
    drawLogo(
      {
        put: (x, y, text, fg) =>
          [...text].forEach((ch, col) => paintCell(x + col, y, ch, fg)),
        theme,
      },
      {
        x: 0,
        y: 0,
        width: columns,
        height: rows,
        variant: "frame",
        mascot: "wave",
        effect: "plain",
        time,
        motion: reduced.matches ? "off" : "full",
        section: root.dataset.cliSection,
      },
    );
  }

  function resize(available) {
    columns = Math.max(minColumns, Math.min(78, Math.floor(available / 9)));
    cellWidth = Math.min(9, available / columns);
    cellHeight = cellWidth * 2;
    const width = columns * cellWidth;
    const height = rows * cellHeight + padding * 2;
    const ratio = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    render();
  }

  function updateMotion() {
    clearInterval(timer);
    button.hidden = reduced.matches;
    const label = paused ? "Play animation" : "Pause animation";
    button.setAttribute("aria-label", label);
    button.title = label;
    button.firstElementChild.textContent = paused ? "▷" : "Ⅱ";
    if (reduced.matches || paused || !visible || document.hidden) return;
    const startedAt = performance.now() - time * 1000;
    timer = setInterval(() => {
      time = (performance.now() - startedAt) / 1000;
      render();
    }, 40);
  }

  function restart() {
    time = 0;
    render();
    updateMotion();
  }

  root.addEventListener("cli-section-change", restart);
  button.addEventListener("click", () => {
    paused = !paused;
    updateMotion();
  });
  reduced.addEventListener("change", restart);
  document.addEventListener("visibilitychange", updateMotion);
  new MutationObserver(() => {
    syncTheme();
    render();
  }).observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme"],
  });
  new ResizeObserver(([entry]) => {
    if (entry.contentRect.width > 0) resize(entry.contentRect.width);
  }).observe(scroll);
  new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    updateMotion();
  }).observe(canvas);
  syncTheme();
  updateMotion();
}
