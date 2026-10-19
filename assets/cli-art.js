export const theme = {
  bg: "#ffffff",
  ink: "#313747",
  muted: "#657080",
  orange: "#c64c27",
};
const mix = (a, b, t) => {
  const rgb = (c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
  const x = rgb(a),
    y = rgb(b);
  return (
    "#" +
    x
      .map((n, i) =>
        Math.round(n + (y[i] - n) * Math.min(1, Math.max(0, t)))
          .toString(16)
          .padStart(2, "0"),
      )
      .join("")
  );
};

const label = ["╭─────────────╮", "│   Alive5    │", "╰─────────────╯"];

export function drawLogo(
  screen,
  { x, y, width = 48, height = 7, time = 0, motion = "full" },
) {
  const lines = label[0].length > width - 2 ? ["Alive5"] : label;
  const artWidth = Math.max(...lines.map((line) => line.length));
  const top = y + Math.floor((height - lines.length) / 2);
  const animated = motion === "full" || (motion === "subtle" && time < 0.85);
  const t = animated ? time : 0;
  const stars = width < 50 ? 6 : 8;
  for (let i = 0; i < stars; i++) {
    const px = Math.floor(
      ((i * width) / stars + t * (i % 2 ? 1 : 0.6)) % width,
    );
    const py = i % 2 ? height - 1 : 0;
    const bright = (Math.sin(t * 1.2 + i * 2) + 1) / 2;
    screen.put(
      x + px,
      y + py,
      i % 3 ? "·" : "+",
      mix(theme.bg, theme.muted, 0.3 + bright * 0.28),
    );
  }

  const paint = (px, py, glyph, color) => {
    if (px < 0 || px >= width || py < 0 || py >= height) return;
    if (px <= artWidth && py >= top - y && py < top - y + lines.length) return;
    screen.put(x + px, y + py, glyph, color);
  };
  const planetX = Math.max(artWidth + 3, width - 11);
  if (planetX + 9 <= width) {
    const planetY = Math.floor((height - 3) / 2);

    const moonX = planetX + 4 + Math.round(Math.cos(t * 0.45) * 5);
    const moonY = planetY + 1 + Math.round(Math.sin(t * 0.45));
    if (width >= 50) paint(moonX, moonY, "o", mix(theme.bg, theme.muted, 0.8));
    ["   .-.  /", " /(___)/ ", "/  '-'   "].forEach((line, row) => {
      [...line].forEach((glyph, col) => {
        if (glyph !== " ")
          paint(
            planetX + col,
            planetY + row,
            glyph,
            glyph === "/" ? mix(theme.bg, theme.muted, 0.65) : theme.muted,
          );
      });
    });
  }
  if (animated) {
    for (let i = 0; i < 2; i++) {
      const phase = (t + i * 6) % 12;
      if (phase >= 4) continue;
      const head = Math.floor((phase / 4) * (width + 10)) - 5;
      const py = i ? height - 1 : 0;
      for (let tail = 4; tail >= 0; tail--) {
        const px = i ? width - 1 - head + tail : head - tail;
        if (py === height - 1 && px <= artWidth + 1) continue;
        paint(
          px,
          py,
          tail === 0 ? "*" : tail < 3 ? "-" : ".",
          mix(theme.bg, theme.ink, 0.62 - tail * 0.1),
        );
      }
    }
  }
  lines.forEach((line, row) => {
    [...line].forEach((char, col) => {
      if (char === " ") return;
      const fg = char === "5" ? theme.orange : theme.ink;
      screen.put(x + col, top + row, char, fg, theme.bg, false);
    });
  });
}
