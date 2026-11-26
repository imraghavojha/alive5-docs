import wave from "./mascots/wave.js";
import { mix } from "./theme.js";

// The shared wordmark resolves its mascot through this module.
export const mascotById = () => wave;
export const mascotLeft = (width, mascot) => width - mascot.width - 1;

const cycle = wave.frames.reduce((sum, frame) => sum + frame.ms, 0);

function frameAt(time) {
  let elapsed = (time * 1000) % cycle;
  for (const frame of wave.frames) {
    if (elapsed < frame.ms) return frame;
    elapsed -= frame.ms;
  }
  return wave.frames[0];
}

export function drawMascot({ screen, x, y, width, height, artWidth, t, section }, mascot) {
  const left = x + mascotLeft(width, mascot);
  const top = y + Math.floor((height - mascot.height) / 2);
  if (left < x + artWidth + 2 || top < y) return;

  // Each terminal cell contains two source pixels over the page background.
  const { px } = frameAt(t);
  for (let row = 0; row < px.length; row += 2) {
    for (let col = 0; col < mascot.width; col++) {
      const upper = mascot.palette[px[row][col]];
      const lower = mascot.palette[px[row + 1][col]];
      const glyph = upper ? "▀" : lower ? "▄" : " ";
      screen.put(left + col, top + row / 2, glyph, upper ?? lower, upper ? lower : undefined);
    }
  }
  if (section) drawSectionDetail(screen, left, top, x + artWidth + 1, section, t);
}

function drawSectionDetail(screen, left, top, start, section, time) {
  const { put, theme: { bg, muted } } = screen;
  const gap = left - start;
  const cardX = Math.max(start, left - 9);
  const phase = Math.floor(time / 0.34) % 16;
  const compactCue = (text, y) => {
    const cue = text.slice(0, gap);
    if (cue) put(left - cue.length, y, cue);
  };
  const bubble = (text, y) => {
    if (gap < 7) {
      compactCue(text, y + 1);
      return;
    }
    put(cardX, y, "╭─────╮");
    put(cardX, y + 1, `│${text.padStart(Math.floor((5 + text.length) / 2)).padEnd(5)}│`);
    put(cardX, y + 2, "╰───┬─╯");
  };

  if (section === "inbox") {
    const pulse = (Math.sin(time * 2.2) + 1) / 2;
    const color = mix(bg, muted, 0.3 + pulse * 0.7);
    const count = Math.min(2, gap);
    put(left - (gap >= 7 ? 4 : count), top + 1, ")".repeat(count), color);
    if (gap >= 7) put(left - 7, top + 1, ")", mix(bg, muted, 0.25 + (1 - pulse) * 0.6));
  }
  if (section === "messages" && phase >= 2 && phase <= 11)
    bubble(phase < 4 ? "·" : phase < 6 ? "··" : "···", top);
  if (section === "conversations" && phase >= 2 && phase <= 12)
    bubble(phase < 7 ? "hi" : "ok", top + (phase < 7 ? 0 : 1));
  if (section === "contacts" && phase >= 2 && phase <= 12) {
    if (gap < 7) {
      compactCue("o =", top + 1);
      return;
    }
    const slide = phase < 4 ? 2 : phase > 10 ? 1 : 0;
    const x = Math.min(cardX + slide, left - 7);
    put(x, top, "┌─────┐");
    put(x, top + 1, "│ o = │");
    put(x, top + 2, "└─────┘");
  }
  if (section === "compose" && phase >= 3 && phase <= 10)
    bubble(phase < 5 ? ">_" : phase < 7 ? ">h_" : ">hi", top);
}
