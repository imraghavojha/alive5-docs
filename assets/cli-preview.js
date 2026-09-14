import { drawLogo, theme } from "./cli-art.js";

const root = document.querySelector("[data-cli-preview]");
if (root) {
  const canvas = root.querySelector("canvas");
  const context = canvas.getContext("2d");
  const button = root.querySelector("[data-cli-motion]");
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  let paused = reduced.matches;
  let visible = false;
  let timer;
  let time = 0;
  let previous = 0;
  let width = 84;
  let cellWidth = 9;
  const cellHeight = 14;

  function paintCell(x, y, ch, fg = theme.ink, bg = theme.bg, bold = false) {
    context.fillStyle = bg;
    context.fillRect(x * cellWidth, y * cellHeight, cellWidth, cellHeight);
    context.fillStyle = fg;
    // Terminal box-drawing characters join at cell boundaries, independent of font metrics.
    const box = {
      "─": [1, 1, 0, 0],
      "│": [0, 0, 1, 1],
      "╭": [0, 1, 0, 1],
      "╮": [1, 0, 0, 1],
      "╰": [0, 1, 1, 0],
      "╯": [1, 0, 1, 0],
    }[ch];
    if (box) {
      const cx = (x + 0.5) * cellWidth,
        cy = (y + 0.5) * cellHeight;
      if (box[0]) context.fillRect(x * cellWidth, cy, cellWidth / 2 + 0.5, 1);
      if (box[1]) context.fillRect(cx, cy, cellWidth / 2, 1);
      if (box[2]) context.fillRect(cx, y * cellHeight, 1, cellHeight / 2 + 0.5);
      if (box[3]) context.fillRect(cx, cy, 1, cellHeight / 2);
      return;
    }
    context.font = `${bold ? "600" : "400"} 12px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`;
    context.fillText(ch, (x + 0.5) * cellWidth, y * cellHeight + 11, cellWidth);
  }
  function render() {
    context.textAlign = "center";
    context.fillStyle = theme.bg;
    context.fillRect(0, 0, canvas.width, canvas.height);
    drawLogo(
      { put: paintCell },
      {
        x: 1,
        y: 1,
        width: width - 2,
        height: 5,
        time,
        motion: paused ? "off" : "full",
        effect: "cosmos",
        variant: "frame",
      },
    );
  }
  function resize() {
    const available = root.querySelector(".shell-scroll").clientWidth - 32;
    width = Math.max(28, Math.floor(available / 9));
    cellWidth = Math.min(10, available / width);
    const logicalWidth = width * cellWidth;
    const logicalHeight = cellHeight * 7;
    const ratio = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.round(logicalWidth * ratio);
    canvas.height = logicalHeight * ratio;
    canvas.style.width = `${logicalWidth}px`;
    canvas.style.height = `${logicalHeight}px`;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    render();
  }
  function schedule() {
    clearTimeout(timer);
    const label = paused ? "Play animation" : "Pause animation";
    button.setAttribute("aria-label", label);
    button.title = label;
    button.querySelector("span").textContent = paused ? "▷" : "Ⅱ";
    if (paused || !visible || document.hidden) {
      previous = 0;
      return;
    }
    timer = setTimeout(() => {
      const now = performance.now();
      if (previous) time += Math.min((now - previous) / 1000, 0.3);
      previous = now;
      render();
      schedule();
    }, 167);
  }
  button.addEventListener("click", () => {
    paused = !paused;
    schedule();
  });
  reduced.addEventListener("change", () => {
    if (reduced.matches) paused = true;
    time = 0;
    render();
    schedule();
  });
  document.addEventListener("visibilitychange", schedule);
  new ResizeObserver(resize).observe(root);
  new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    schedule();
  }).observe(canvas);
  resize();
  schedule();
}
