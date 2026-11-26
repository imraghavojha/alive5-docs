import { drawLogo, theme, syncTheme } from "./cli-art.js";

const root = document.querySelector("[data-cli-preview]");
if (root) {
  const canvas = root.querySelector("canvas");
  const scroll = root.querySelector(".shell-scroll");
  const context = canvas.getContext("2d");
  const columns = 34;
  const rows = 5;
  const padding = 4;
  let cellWidth = 9;
  let cellHeight = 18;

  const corners = { "╭": [1, 1], "╮": [-1, 1], "╰": [1, -1], "╯": [-1, -1] };

  function paintCell(x, y, ch, fg = theme.ink) {
    const left = x * cellWidth;
    const top = y * cellHeight + padding;
    const cx = left + cellWidth / 2;
    const cy = top + cellHeight / 2;
    context.fillStyle = fg;
    if (ch === "█" || ch === "▀" || ch === "▄") {
      const half = cellHeight / 2;
      context.fillRect(left, ch === "▄" ? cy : top, cellWidth, ch === "█" ? cellHeight : half);
    } else if (ch === "─") {
      context.fillRect(left, cy - 0.5, cellWidth, 1);
    } else if (ch === "│") {
      context.fillRect(cx - 0.5, top, 1, cellHeight);
    } else if (corners[ch]) {
      const [horizontal, vertical] = corners[ch];
      const radius = cellWidth / 3;
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
    syncTheme();
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
      { x: 0, y: 0, width: columns, height: rows, variant: "frame", mascot: "wave", effect: "plain" },
    );
  }

  function resize() {
    cellWidth = Math.min(9, Math.max(1, Math.floor((scroll.clientWidth - 32) / columns)));
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

  new MutationObserver(render).observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme"],
  });
  new ResizeObserver(resize).observe(scroll);
  resize();
}
