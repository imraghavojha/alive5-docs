"use strict";

const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
const hero = document.querySelector(".hero");
const frame = hero.querySelector(".frame");
const edges = frame.querySelectorAll(".frame-edge");
const corner = frame.querySelector(".corner");
const highlight = frame.querySelector(".highlight");
const glow = highlight.querySelector(".highlight-glow");
const square = hero.querySelector(".scene-box");
const orbits = hero.querySelector(".orbits");
const scene = hero.querySelector(".scene");
const mascot = hero.querySelector(".stage .mascot");
const lockup = hero.querySelector(".lockup");
const title = lockup.querySelector(".title");
const headline = hero.querySelector("h1");
const cx = 414.895, cy = 466.977, rx = 414.396, ry = 415.615;
const artWidth = 830, artHeight = 606;
const openingSeconds = 6;

function svg(parent, tag, attributes) {
  const node = document.createElementNS("http://www.w3.org/2000/svg", tag);
  for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, value);
  parent.append(node);
  return node;
}

function ellipse(parent, scale, attributes = {}) {
  return svg(parent, "ellipse", {cx, cy, rx: rx * scale, ry: ry * scale, ...attributes});
}

function layer(parent, className) {
  const node = document.createElement("div");
  node.className = className;
  parent.append(node);
  return node;
}

function lines(className) {
  return svg(orbits, "svg", {class: `orbit-lines ${className}`, viewBox: `0 0 ${artWidth} ${artHeight}`});
}

function pose(parent, width) {
  const node = layer(parent, "orbit-pose");
  node.style.width = `${100 * width / artWidth}%`;
  return node;
}

function sprite(node, left, top, width, height) {
  const image = svg(node, "svg", {viewBox: `${left} ${top} ${width} ${height}`});
  image.style.left = `${100 * left / width}%`;
  image.style.top = `${100 * top / width}%`;
  return image;
}

const outer = lines("orbit-outer");
ellipse(outer, 2);
ellipse(outer, 2.5);
const moving = layer(orbits, "orbit-moving");
const satellites = layer(moving, "orbit-satellites");
const markers = layer(moving, "orbit-markers");

function buildOrbit({start, end, scale, period, degrees, diamond, satellite, labelY = -26}, i) {
  const line = lines("orbit-ring");
  ellipse(line, scale, {opacity: end ? 1 : .5});
  const dotLayer = layer(satellites, "orbit-dot-layer");
  const dots = Array.from({length: 9}, (_, index) => {
    const node = pose(dotLayer, 32);
    svg(sprite(node, -16, -16, 32, 32), "rect", {x: -10, y: -10, width: 20, height: 20, fill: satellite});
    return {node, offset: (index + 1) * Math.PI / 4};
  });
  const caption = pose(markers, 168);
  caption.classList.add("orbit-caption");
  const initialLabel = svg(sprite(caption, -84, -65, 168, 56), "text", {y: -28, class: "initial-label"});
  initialLabel.textContent = start;
  const label = svg(sprite(caption, -84, -65, 168, 56), "text", {y: labelY});
  label.textContent = end;
  const marker = pose(markers, 48);
  svg(sprite(marker, -24, -24, 48, 48), "path", {d: "M0 -15.556 15.556 0 0 15.556 -15.556 0Z", fill: diamond});
  const duration = Math.max(2.6, 1.5 * ry * Math.abs(scale - 1) / 57);
  return {line, dotLayer, dots, marker, caption, initialLabel, label, angle: degrees * Math.PI / 180,
    scale, period, duration, start: .5 + i * .12, i};
}

// Marker angles in the settled reference frame, measured clockwise from the right.
const rings = [
  {start: "Texts", end: "Wait", scale: 1.5, period: -250, degrees: -51.985, diamond: "#fec63a", satellite: "#fbd679"},
  {start: "Inbox", end: "", scale: 1.38, period: 300, degrees: -131.842, diamond: "#44ba82", satellite: "#94eacc"},
  {start: "JSON", end: "Read", scale: 1.1, period: -220, degrees: -115.370, diamond: "#55b3fb", satellite: "#55b3fb", labelY: -28},
  {start: "Agents", end: "Reply", scale: .75, period: 260, degrees: -66.709, diamond: "#fa500f", satellite: "#ff8204"}
].map(buildOrbit);
svg(lines("orbit-inner"), "ellipse", {class: "inner", cx: 415.412, cy, rx: 261.064, ry: 261.832});
orbits.append(moving);

const phrase = title.textContent;
// Preserve the visible copy if the deferred script arrives after first paint.
const animateCopy = !reducedMotion.matches && !performance.getEntriesByName("first-contentful-paint", "paint").length;
const words = [];
if (animateCopy) {
  title.replaceChildren();
  title.setAttribute("aria-label", phrase);
  for (const word of phrase.split(" ")) {
    if (words.length) title.append(" ");
    const group = document.createElement("span");
    group.className = "word";
    group.setAttribute("aria-hidden", "true");
    title.append(group);
    const letters = [];
    for (const character of word) {
      const letter = document.createElement("span");
      letter.className = "letter";
      letter.textContent = character;
      group.append(letter);
      letters.push({node: letter, jitter: (1 + Math.floor(Math.random() * 5)) * .005});
    }
    words.push({group, letters});
  }
}

function progress(time, start, duration) {
  return Math.max(0, Math.min(1, (time - start) / duration));
}
function ease(t, power = 4) {
  return t < .5 ? (2 * t) ** power / 2 : 1 - (2 - 2 * t) ** power / 2;
}
function sine(t) { return (1 - Math.cos(Math.PI * t)) / 2; }

let insetX, insetY, from, to, compact, titleEnd;
let orbitShift = 0;
let artLeft, artTop, artScale, clipBounds, copyBounds;
function measureTextClip() {
  const range = document.createRange();
  range.selectNodeContents(headline);
  const lines = [...range.getClientRects()];
  if (words.length) {
    // During the reveal the letters move inside stationary word boxes.
    // Combine words on the same baseline into the title's line rectangles.
    let line;
    for (const {group} of words) {
      const box = group.getBoundingClientRect();
      if (line && line.top === box.top) line.right = box.right;
      else {
        line = box.toJSON();
        lines.push(line);
      }
    }
  } else {
    range.selectNodeContents(title);
    lines.push(...range.getClientRects());
  }
  const art = orbits.getBoundingClientRect();
  return lines.map(line => ({
    x: line.left - art.left - 2,
    y: line.top - art.top + orbitShift - 2,
    width: line.right - line.left + 4,
    height: line.height + 4
  }));
}

let textLines, heroTop, heroHeight, clipVisible = false;
function updateTextClip() {
  // The moving sprites share one static clip. The ring lines stay visible under the copy.
  let path = `M${-artWidth} ${-artHeight}h${3 * artWidth}v${3 * artHeight}h${-3 * artWidth}z`;
  for (const {x, y, width, height} of textLines) {
    path += ` M${x} ${y - orbitShift}h${width}v${height}h${-width}z`;
  }
  moving.style.clipPath = clipVisible ? `path(evenodd, "${path}")` : "none";
}

function measure() {
  const bounds = hero.getBoundingClientRect();
  const box = square.getBoundingClientRect();
  const style = getComputedStyle(hero);
  insetX = parseFloat(style.getPropertyValue("--frame-x"));
  insetY = parseFloat(style.getPropertyValue("--frame-y"));
  compact = innerWidth < 640;
  from = {
    x: compact ? insetX : box.x - bounds.x,
    y: box.y - bounds.y,
    width: compact ? bounds.width - insetX * 2 : box.width,
    height: box.height
  };
  to = {width: bounds.width - insetX * 2, height: bounds.height - insetY * 2};

  heroTop = bounds.top + scrollY;
  heroHeight = bounds.height;
  const art = orbits.getBoundingClientRect();
  artLeft = art.left - bounds.left;
  artTop = art.top - bounds.top - orbitShift;
  artScale = art.width / artWidth;
  const sceneBounds = scene.getBoundingClientRect();
  clipBounds = {
    left: Math.max(sceneBounds.left - bounds.left, insetX),
    right: Math.min(sceneBounds.right - bounds.left, bounds.width - insetX),
    top: Math.max(sceneBounds.top - bounds.top, insetY),
    bottom: Math.min(sceneBounds.bottom - bounds.top, bounds.height - insetY)
  };
  copyBounds = [lockup, headline, mascot].map(node => {
    const rect = node.getBoundingClientRect();
    return {left: rect.left - bounds.left, right: rect.right - bounds.left,
      top: rect.top - bounds.top, bottom: rect.bottom - bounds.top};
  });
  for (const ring of rings) {
    ring.labelBounds = ring.label.getBBox();
    const initial = ring.initialLabel.getBBox();
    const label = ring.labelBounds;
    const x = Math.min(initial.x, label.x);
    const y = Math.min(initial.y, label.y);
    ring.introBounds = label.width ? {x, y,
      width: Math.max(initial.x + initial.width, label.x + label.width) - x,
      height: Math.max(initial.y + initial.height, label.y + label.height) - y
    } : initial;
  }
  textLines = measureTextClip();

  titleEnd = 0;
  let lineTop = null, line = -1, column = 0;
  for (const word of words) {
    if (word.group.offsetTop !== lineTop) {
      lineTop = word.group.offsetTop;
      line++;
      column = 0;
    }
    word.lineStart = line * .7;
    for (const letter of word.letters) {
      letter.start = line * .735 + column * letter.jitter;
      titleEnd = Math.max(titleEnd, letter.start + 1, word.lineStart + 1.3);
      letter.roll = column % 5 === 0 || column % 8 === 0 || "gjpqy".includes(letter.node.textContent);
      if (letter.roll) letter.node.dataset.repeat = letter.node.textContent;
      else delete letter.node.dataset.repeat;
      column++;
    }
  }
}

function translate(x, y) {
  return `translate3d(${x}px, ${y}px, 0)`;
}

function drawIntro(time) {
  const remaining = 1 - ease(progress(time, .3, 2.4));
  const widthDelta = (from.width - to.width) * remaining;
  const heightDelta = (from.height - to.height) * remaining;
  const scaleX = 1 + widthDelta / to.width;
  const scaleY = 1 + heightDelta / to.height;
  frame.style.transform = translate((from.x - insetX) * remaining, (from.y - insetY) * remaining);
  edges[0].style.transform = `scaleX(${scaleX})`;
  edges[1].style.transform = `${translate(0, to.height + heightDelta - 1)} scaleX(${scaleX})`;
  edges[2].style.transform = `scaleY(${scaleY})`;
  edges[3].style.transform = `${translate(to.width + widthDelta - 1, 0)} scaleY(${scaleY})`;
  corner.style.transform = translate(widthDelta, 0);

  // Run the copy's original reveal curves faster, ahead of the orbit handoff.
  const copyTime = (time - .05) * 4;
  const fade = animateCopy ? ease(progress(copyTime, 0, .8)) : 1;
  lockup.style.opacity = headline.style.opacity = fade;
  outer.style.opacity = .2 * ease(progress(time, 1.65, .8));
  if (!clipVisible && fade > 0) {
    clipVisible = true;
    updateTextClip();
  }
  if (words.length && copyTime >= titleEnd) {
    title.textContent = phrase;
    title.removeAttribute("aria-label");
    words.length = 0;
    textLines = measureTextClip();
    updateTextClip();
  }
  for (const word of words) {
    const reveal = ease(progress(copyTime, word.lineStart, 1.3), 5);
    word.group.style.clipPath = reveal < 1 ? `inset(0 0 ${(1 - reveal) * 100}% 0)` : "none";
    for (const letter of word.letters) {
      const travel = ease(progress(copyTime, letter.start, 1), 5);
      const y = 100 - travel * (letter.roll ? 200 : 100);
      letter.node.style.transform = `translateY(${y}%)`;
    }
  }
  highlight.style.opacity = sine(progress(time, 2.7, .45)) * (1 - sine(progress(time, 4.1, .3)));
  const x = 1 - progress(time, 3.1, .4) + progress(time, 3.9, .4);
  const y = progress(time, 2.7, .4) - progress(time, 3.5, .4);
  glow.style.transform = `translate3d(${x * 200 - 50}%, ${y * 125 - 50}%, 0)`;
}

function point(radians, scale) {
  return {x: cx + Math.cos(radians) * rx * scale, y: cy + Math.sin(radians) * ry * scale};
}

function position({x, y}) {
  return translate(x * artScale, y * artScale);
}

function angleAt(ring, time) {
  const offset = compact && ring.i === 0 ? -Math.PI / 6 : 0;
  return ring.angle + offset + Math.max(0, time - openingSeconds) * 2 * Math.PI / ring.period;
}

function clearance(box, obstacles) {
  let gap = Math.min(box.left - clipBounds.left, clipBounds.right - box.right,
    box.top - clipBounds.top, clipBounds.bottom - box.bottom);
  for (const obstacle of obstacles) {
    gap = Math.min(gap, Math.max(box.left - obstacle.right, obstacle.left - box.right,
      box.top - obstacle.bottom, obstacle.top - box.bottom));
  }
  return gap;
}

// Clearances are in CSS pixels. Keep the existing anchor longer than a new
// one would qualify for, and finish fading there before choosing another.
const hideGap = 9, showGap = 18, fadeSeconds = .25;
// Keep a short fully transparent interval on each side of an anchor change.
const hiddenSeconds = .075;
const anchorOrder = [-1, 0, 6, 1, 5, 2, 4, 3]; // Diamond, then satellites by angular distance.

function captionPlacement(slot, ring, marker, bounds, obstacles) {
  const anchor = slot.anchor < 0 ? marker : ring.dots[slot.anchor].point;
  const x = artLeft + anchor.x * artScale;
  const y = artTop + orbitShift + anchor.y * artScale;
  const left = x + (slot.dx + bounds.x - 8) * artScale;
  const top = y + (slot.dy + bounds.y - 8) * artScale;
  const box = {left, top, right: left + (bounds.width + 16) * artScale, bottom: top + (bounds.height + 16) * artScale};
  const gap = Math.min(clearance(box, obstacles), clearance({left: x, right: x, top: y, bottom: y}, obstacles));
  return {box, gap, x: anchor.x + slot.dx, y: anchor.y + slot.dy};
}

function findCaptionSlot(ring, marker, bounds, obstacles, opening) {
  const centerY = -bounds.y - bounds.height / 2;
  const offsets = [[0, 0], [0, 26 - bounds.y], [24 - bounds.x, centerY], [-24 - bounds.x - bounds.width, centerY]];
  for (const anchor of anchorOrder) {
    if (opening && anchor >= 0) break;
    for (const [dx, dy] of offsets) {
      const slot = {anchor, dx, dy};
      if (captionPlacement(slot, ring, marker, bounds, obstacles).gap >= showGap) return slot;
    }
  }
}

function placeCaption(ring, marker, time, obstacles) {
  const opening = time < 1.65;
  const bounds = opening ? ring.introBounds : ring.labelBounds;
  if (!bounds.width) return;
  const still = reducedMotion.matches;
  const state = ring.captionState ??= {opacity: 0, last: time, switchAt: 0};
  let step = Math.max(0, time - state.last) / fadeSeconds;
  state.last = time;
  if (still) {
    state.slot = undefined;
    state.retiring = false;
    state.switchAt = time;
  }
  if (!state.slot && time >= state.switchAt) {
    state.slot = findCaptionSlot(ring, marker, bounds, obstacles, opening);
    const immediate = time === 0 || still;
    state.opacity = immediate && state.slot ? 1 : 0;
    state.revealAt = immediate ? time : time + hiddenSeconds;
  }
  if (state.slot) {
    const pose = captionPlacement(state.slot, ring, marker, bounds, obstacles);
    if (pose.gap < hideGap) state.retiring = true;
    if (!state.retiring && time < state.revealAt) step = 0;
    state.opacity = Math.max(0, Math.min(1, state.opacity + (state.retiring ? -step : step)));
    state.pose = pose;
    if (state.retiring && state.opacity === 0) {
      state.slot = undefined;
      state.retiring = false;
      state.switchAt = time + hiddenSeconds;
    } else {
      obstacles.push(pose.box);
    }
  }
  return state;
}

let introComplete = false;
let orbitStarted = false, motionScale, motionCompact;
const orbitMotion = [];

function stopOrbitMotion() {
  for (const animation of orbitMotion) cancel(animation);
  orbitMotion.length = 0;
  motionScale = undefined;
  for (const ring of rings) {
    ring.revealPrepared = false;
    ring.loopPrepared = false;
  }
}

function prepareReveal(ring) {
  ring.revealPrepared = true;
  // With linear x, this cubic Bézier is the same 3t² - 2t³ as the radial reveal.
  const timing = {duration: ring.duration * 1000, easing: "cubic-bezier(.333333, 0, .666667, 1)",
    fill: "backwards"};
  function reveal(node, from, to) {
    node.style.transform = node === ring.line ? "none" : to;
    const animation = animate(node, [{transform: from}, {transform: to}], timing, ring.start);
    orbitMotion.push(animation);
    animation.finished.then(() => cancel(animation), () => {});
  }
  reveal(ring.line, `scale(${1 / ring.scale})`, "scale(1)");
  for (const {node, offset} of [{node: ring.marker, offset: 0}, ...ring.dots]) {
    const angle = angleAt(ring, 0) + offset;
    reveal(node, position(point(angle, 1)), position(point(angle, ring.scale)));
  }
}

function drawOpening(time, measureChanged = false) {
  if (!introComplete) drawIntro(time);
  const obstacles = [...copyBounds];
  for (const ring of rings) {
    // Smoothstep limits the radial entrance to 57 CSS pixels per second at full scale.
    const u = progress(time, ring.start, ring.duration);
    const scale = 1 + (ring.scale - 1) * u * u * (3 - 2 * u);
    if (measureChanged) ring.line.style.transform = scale === ring.scale ? "none" : `scale(${scale / ring.scale})`;
    if (!introComplete) {
      ring.dotLayer.style.opacity = ease(progress(time, .9 + ring.i * .12, .8));
      ring.initialLabel.ownerSVGElement.style.opacity = 1 - ease(progress(time, 1.4, .25));
      ring.label.ownerSVGElement.style.opacity = ease(progress(time, 1.75, .4));
    }
    const angle = angleAt(ring, time);
    const marker = point(angle, scale);
    if (measureChanged) ring.marker.style.transform = position(marker);
    for (const dot of ring.dots) {
      dot.point = point(angle + dot.offset, scale);
      if (measureChanged) dot.node.style.transform = position(dot.point);
    }
    const state = placeCaption(ring, marker, time, obstacles);
    if (state?.pose) ring.caption.style.transform = position(state.pose);
    ring.caption.style.opacity = state?.opacity ?? 0;
  }
  introComplete = time >= 4.4;
}

const mobileMenu = document.getElementById("mobile-menu");
const animations = new Map();
let visible = true, elapsed = 0, clockStart = null, pending, captionTimer;
function animate(node, keyframes, timing, start) {
  const animation = node.animate(keyframes, {fill: "both", ...timing});
  animations.set(animation, start);
  if (clockStart !== null) animation.startTime = clockStart + start * 1000;
  else {
    animation.pause();
    animation.currentTime = (elapsed - start) * 1000;
  }
  return animation;
}

function cancel(animation) {
  if (!animation) return;
  animations.delete(animation);
  animation.cancel();
}

function startMascot() {
  const riseDuration = 700;
  const holds = [1050, 390, 120, 510, 280, 650];
  const duration = holds.reduce((sum, hold) => sum + hold, 0);
  let offset = 0;
  const frames = holds.map((hold, i) => {
    const frame = {offset: offset / duration, transform: `translateY(${-i * 100 / holds.length}%)`,
      easing: "steps(1, end)"};
    offset += hold;
    return frame;
  });
  frames.push({...frames.at(-1), offset: 1});

  // Slide the full sprite through the crop and start the idle loop after it lands.
  for (const node of hero.querySelectorAll(".mascot-motion")) {
    animate(node, [{transform: "translateY(100%)"}, {transform: "translateY(0)"}],
      {duration: riseDuration, easing: "cubic-bezier(.2, .7, .3, 1)"}, 0);
    animate(node.querySelector(".sprite-ready"), frames,
      {duration, iterations: Infinity}, riseDuration / 1000);
  }
  hero.classList.add("animated");
}

function prepareLoop(ring) {
  if (ring.loopPrepared) return;
  ring.loopPrepared = true;
  const center = translate(cx * artScale, cy * artScale);
  const radius = rx * ring.scale * artScale;
  const ratio = ry / rx;
  // Rotate a position on the ellipse and counter-rotate the sprite so it stays upright.
  const transform = angle => `${center} scaleY(${ratio}) rotate(${angle}rad) translateX(${radius}px) rotate(${-angle}rad) scaleY(${1 / ratio})`;
  const turn = Math.sign(ring.period) * 2 * Math.PI;
  const timing = {duration: Math.abs(ring.period) * 1000, iterations: Infinity, fill: "none"};
  for (const {node, offset} of [{node: ring.marker, offset: 0}, ...ring.dots]) {
    const angle = angleAt(ring, openingSeconds) + offset;
    const frames = [angle, angle + turn].map(value => ({transform: transform(value)}));
    orbitMotion.push(animate(node, frames, timing, openingSeconds));
  }
}

function startOrbits() {
  orbitStarted = true;
  motionScale = artScale;
  motionCompact = compact;
  hero.classList.add("settled");
  for (const ring of rings) {
    ring.line.style.transform = "none";
    prepareLoop(ring);
  }
}

const captionStep = 1 / 60;
const captionSteps = 18;
let captionTime = openingSeconds, captionCheckpoint;
function captionStates(time) {
  const obstacles = [...copyBounds];
  return rings.map(ring => {
    const angle = angleAt(ring, time);
    const marker = point(angle, ring.scale);
    for (const dot of ring.dots) dot.point = point(angle + dot.offset, ring.scale);
    return {...placeCaption(ring, marker, time, obstacles)};
  });
}

function queueCaptions() {
  clearTimeout(captionTimer);
  if (clockStart !== null) {
    const wakeAt = clockStart + captionTime * 1000 - 40;
    captionTimer = setTimeout(planCaptions, Math.max(0, wakeAt - performance.now()));
  }
}

function rewindCaptions(time) {
  if (!captionCheckpoint) return;
  const {start, samples} = captionCheckpoint;
  const index = Math.max(0, Math.min(samples.length - 1, Math.floor((time - start) / captionStep)));
  captionTime = start + index * captionStep;
  for (const [i, state] of samples[index].entries()) {
    rings[i].captionState = state.last === undefined ? undefined : {...state};
  }
  captionCheckpoint = undefined;
}

function planCaptions() {
  const now = (performance.now() - clockStart) / 1000;
  const start = captionTime;
  const samples = [captionStates(start)];
  // Predict the short fades with the original collision rules. The compositor
  // interpolates each caption's pose and opacity until the next check.
  const steps = captionSteps + Math.max(0, Math.ceil((now - start) / captionStep));
  for (let i = 1; i <= steps; i++) samples.push(captionStates(start + i * captionStep));
  for (const [i, ring] of rings.entries()) {
    if (!ring.labelBounds.width) continue;
    const frames = samples.map((row, index) => ({
      offset: index / steps,
      opacity: row[i].opacity,
      transform: row[i].pose ? position(row[i].pose) : ring.caption.style.transform || "none"
    }));
    const previous = ring.captionAnimation;
    ring.captionAnimation = animate(ring.caption, frames, {duration: steps * captionStep * 1000, fill: "forwards"},
      start);
    // Keep the previous segment playing until the replacement reaches its first sample.
    if (previous) {
      previous.finished.then(() => cancel(previous), () => {});
    }
  }
  captionCheckpoint = {start, samples};
  captionTime = start + steps * captionStep;
  queueCaptions();
}

function tick(now) {
  if (clockStart === null) {
    clockStart = now - elapsed * 1000;
    for (const [animation, start] of animations) {
      animation.play();
      animation.startTime = clockStart + start * 1000;
    }
  }
  elapsed = (now - clockStart) / 1000;
  if (elapsed < openingSeconds) {
    drawOpening(elapsed);
    for (const ring of rings) {
      if (!ring.revealPrepared && elapsed >= ring.start - .3) prepareReveal(ring);
      if (elapsed >= 4.7 + ring.i * .28) prepareLoop(ring);
    }
    pending = requestAnimationFrame(tick);
  } else if (!orbitStarted) {
    drawOpening(openingSeconds);
    startOrbits();
    planCaptions();
  } else if (!captionCheckpoint) planCaptions();
  else queueCaptions();
}

const shouldPlay = () => visible && mobileMenu?.hidden !== false && !document.hidden && !reducedMotion.matches;
function syncHero() {
  cancelAnimationFrame(pending);
  if (shouldPlay()) pending = requestAnimationFrame(tick);
  else if (clockStart !== null) {
    elapsed = (performance.now() - clockStart) / 1000;
    clockStart = null;
    clearTimeout(captionTimer);
    for (const [animation, start] of animations) {
      animation.pause();
      animation.currentTime = (elapsed - start) * 1000;
    }
  }
}

function parallax() {
  const offset = reducedMotion.matches ? 0 : Math.max(0, Math.min(heroHeight, scrollY - heroTop));
  const shift = offset * .12;
  if (shift === orbitShift) return;
  orbitShift = shift;
  orbits.style.transform = translate(0, orbitShift);
  updateTextClip();
  if (captionTime > openingSeconds) {
    rewindCaptions(clockStart === null ? elapsed : (performance.now() - clockStart) / 1000);
    if (clockStart !== null) planCaptions();
  }
}

function resizeHero() {
  const time = clockStart === null ? elapsed : (performance.now() - clockStart) / 1000;
  measure();
  introComplete = false;
  const motionChanged = motionScale !== artScale || motionCompact !== compact;
  if (motionChanged) {
    stopOrbitMotion();
    motionScale = artScale;
    motionCompact = compact;
  }
  if (reducedMotion.matches) {
    drawOpening(openingSeconds, true);
  } else if (time < openingSeconds) {
    drawOpening(time, motionChanged);
    if (motionChanged) {
      for (const ring of rings) {
        if (time >= ring.start - .3) prepareReveal(ring);
      }
    }
  } else {
    // Keep the current caption anchor and rebuild animations for the new art scale.
    rewindCaptions(time);
    for (const ring of rings) cancel(ring.captionAnimation);
    drawOpening(time, motionChanged);
    startOrbits();
    if (clockStart !== null) planCaptions();
  }
  updateTextClip();
  parallax();
}
resizeHero();
if (!reducedMotion.matches) startMascot();
else hero.classList.add("settled");
syncHero();
new ResizeObserver(resizeHero).observe(hero);
document.fonts.ready.then(resizeHero);
document.fonts.addEventListener("loadingdone", resizeHero);
new IntersectionObserver(([entry]) => {
  visible = entry.isIntersecting;
  syncHero();
}).observe(hero);
window.addEventListener("scroll", parallax, {passive: true});
window.addEventListener("resize", resizeHero);
document.addEventListener("visibilitychange", syncHero);
reducedMotion.addEventListener("change", () => {
  stopOrbitMotion();
  for (const animation of animations.keys()) cancel(animation);
  clearTimeout(captionTimer);
  clockStart = null;
  elapsed = captionTime = openingSeconds;
  captionCheckpoint = undefined;
  orbitStarted = false;
  hero.classList.toggle("animated", !reducedMotion.matches);
  if (!reducedMotion.matches) startMascot();
  else hero.classList.add("settled");
  resizeHero();
  syncHero();
});

if (mobileMenu) {
  new MutationObserver(syncHero).observe(mobileMenu, {attributeFilter: ["hidden"]});
}

const share = document.querySelector(".share");
const statusText = share.nextElementSibling;
let feedbackTimer;
share.addEventListener("click", async () => {
  const url = location.href;
  clearTimeout(feedbackTimer);
  share.classList.remove("copied", "feedback");
  statusText.textContent = "Copy url to clipboard";
  async function nativeShare() {
    try {
      await navigator.share({title: document.title, url});
      return true;
    } catch (error) {
      return error.name === "AbortError";
    }
  }
  const nativeFirst = navigator.share && matchMedia("(pointer: coarse)").matches;
  if (nativeFirst && await nativeShare()) return;
  try {
    await navigator.clipboard.writeText(url);
    share.classList.add("copied");
    statusText.textContent = "URL copied";
  } catch {
    if (!nativeFirst && navigator.share && await nativeShare()) return;
    share.classList.add("feedback");
    statusText.textContent = "Copy the URL from the address bar";
  }
  feedbackTimer = setTimeout(() => {
    share.classList.remove("copied", "feedback");
    statusText.textContent = "Copy url to clipboard";
  }, 2200);
});

const mobileDemos = matchMedia("(max-width: 639px)");
let preferredDemo;
let playingDemo;

function setupDemo(video) {
  const frame = video.closest(".demo-frame");
  const toggle = frame.querySelector(".demo-toggle");
  const label = video.getAttribute("aria-label");
  const poster = frame.querySelector(".demo-poster");
  const image = poster.querySelector("img");
  const results = [...poster.querySelectorAll("[data-result]")].map(source => [source, source.media]);
  let usingMobile = mobileDemos.matches;
  let formats = supportedFormats();
  let sourceIndex = -1;
  let retriedSource = false;
  let showingResult = false;
  let nearby = false;
  let visibility = 0;
  let startedThisVisit = false;
  let userPaused = false;
  let selected = false;
  let watchdog;
  let frameCallback;
  let replayTimer;

  function supportedFormats() {
    const avc = usingMobile ? video.dataset.avcMobile : video.dataset.avc;
    const supported = {
      mp4: video.canPlayType(`video/mp4; codecs="${avc}"`),
      webm: video.canPlayType('video/webm; codecs="vp9"'),
    };
    // Prefer VP9 on phones where WebKit can stop presenting frames on MP4 replay.
    return (usingMobile ? ["webm", "mp4"] : ["mp4", "webm"]).filter(format => supported[format]);
  }

  function stopWatchdog() {
    clearInterval(watchdog);
    watchdog = undefined;
    if (frameCallback !== undefined) video.cancelVideoFrameCallback(frameCallback);
    frameCallback = undefined;
  }

  function stopTimers() {
    clearTimeout(replayTimer);
    replayTimer = undefined;
    stopWatchdog();
  }

  function canRetry() {
    return showingResult && formats.length > 0;
  }

  function updateToggleLabel() {
    toggle.setAttribute("aria-label", canRetry() ? "Retry playback" : `${selected ? "Pause" : "Play"} ${label}`);
  }

  function showResult(show) {
    if (showingResult === show) return;
    showingResult = show;
    for (const [source, media] of results) {
      source.media = show ? source.dataset.result : media;
    }
    updateToggleLabel();
  }

  function unloadSource() {
    stopTimers();
    frame.classList.remove("has-video-frame");
    if (sourceIndex >= 0) {
      sourceIndex = -1;
      video.pause();
      video.removeAttribute("src");
      video.load();
    }
  }

  function loadSource(index) {
    stopTimers();
    frame.classList.remove("has-video-frame");
    if (index !== sourceIndex) retriedSource = false;
    sourceIndex = index;
    const path = `${video.dataset.media}${usingMobile ? "-m" : ""}.${formats[index]}`;
    if (video.getAttribute("src") === path) video.load();
    else video.setAttribute("src", path);
  }

  function nextSource() {
    if (formats[sourceIndex + 1]) loadSource(sourceIndex + 1);
    else {
      unloadSource();
      showResult(true);
    }
    syncShowcase();
  }

  function startWatchdog() {
    const started = performance.now();
    let lastTime = video.currentTime;
    let lastProgress = started;
    let hasVideoFrame = frame.classList.contains("has-video-frame");
    let loading = !hasVideoFrame && video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA;
    let receivedFrameCallback = false;
    function presentedFrames() {
      const quality = video.getVideoPlaybackQuality?.();
      return quality ? quality.totalVideoFrames - quality.droppedVideoFrames : undefined;
    }
    let lastPresented = presentedFrames();
    function checkProgress(now, time, advanced = true) {
      // A rewind or a single frame at the new position is not playback progress.
      if (advanced && time > lastTime && !video.seeking) {
        lastProgress = now;
        if (!hasVideoFrame) {
          hasVideoFrame = true;
          frame.classList.add("has-video-frame");
        }
      }
      lastTime = time;
    }
    if (typeof video.requestVideoFrameCallback === "function") {
      const onFrame = (now, {mediaTime}) => {
        receivedFrameCallback = true;
        checkProgress(now, mediaTime);
        frameCallback = video.requestVideoFrameCallback(onFrame);
      };
      frameCallback = video.requestVideoFrameCallback(onFrame);
    }
    watchdog = setInterval(() => {
      const now = performance.now();
      // Some video renderers expose frame callbacks but only report frame counts.
      if (!receivedFrameCallback) {
        const presented = presentedFrames();
        checkProgress(now, video.currentTime, presented === undefined || presented > lastPresented);
        lastPresented = presented;
      }
      if (loading && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
        loading = false;
        lastProgress = now;
      }
      if (loading ? now - started < 5000 : now - lastProgress < 1500) return;
      if (retriedSource) nextSource();
      else {
        retriedSource = true;
        loadSource(sourceIndex);
        syncShowcase();
      }
    }, 250);
  }

  function play() {
    if (video.paused) video.play().catch(() => {});
    if (watchdog === undefined) startWatchdog();
  }

  function replay() {
    stopWatchdog();
    if (!selected || replayTimer !== undefined) return;
    replayTimer = setTimeout(() => {
      replayTimer = undefined;
      video.currentTime = 0;
      play();
    }, 1200);
  }

  function prepare() {
    if (usingMobile !== mobileDemos.matches) {
      usingMobile = mobileDemos.matches;
      formats = supportedFormats();
      unloadSource();
      showResult(false);
    }
    if (reducedMotion.matches) {
      unloadSource();
      showResult(false);
      toggle.hidden = true;
      return;
    }
    if ((nearby || visibility >= .5) && sourceIndex < 0 && !showingResult) {
      if (formats.length) loadSource(0);
      else showResult(true);
    }
    toggle.hidden = sourceIndex < 0 && !canRetry();
  }

  function select(shouldPlay, manual = false) {
    if (selected !== shouldPlay) {
      selected = shouldPlay;
      toggle.setAttribute("aria-pressed", String(selected));
      updateToggleLabel();
    }
    if (!selected) {
      stopTimers();
      video.pause();
      return;
    }
    if (!startedThisVisit) {
      startedThisVisit = true;
      if (!manual && video.currentTime > 0) {
        video.currentTime = 0;
        play();
        return;
      }
    }
    if (video.ended) replay();
    else play();
  }

  function updatePoster() {
    if (image.complete && !image.naturalWidth) poster.dataset.missing = image.alt;
    else delete poster.dataset.missing;
  }
  image.addEventListener("error", updatePoster);
  image.addEventListener("load", updatePoster);
  updatePoster();

  video.addEventListener("ended", replay);
  video.addEventListener("error", () => {
    if (sourceIndex >= 0 && video.error) nextSource();
  });

  const demo = {
    video,
    prepare,
    select,
    get eligible() { return visibility >= .5 && sourceIndex >= 0 && !userPaused; },
    updateVisibility(ratio) {
      if (visibility >= .5 && ratio < .5) {
        startedThisVisit = false;
        if (preferredDemo === demo) preferredDemo = undefined;
      }
      visibility = ratio;
    },
  };

  toggle.addEventListener("click", () => {
    const retry = canRetry();
    if (retry) {
      showResult(false);
      retriedSource = false;
      loadSource(0);
    }
    userPaused = !retry && selected;
    if (userPaused) {
      if (preferredDemo === demo) preferredDemo = undefined;
    } else {
      preferredDemo = demo;
      if (visibility < .5) video.scrollIntoView({block: "center"});
    }
    syncShowcase();
  });

  new IntersectionObserver(([entry]) => {
    nearby = entry.isIntersecting;
    syncShowcase();
  }, {rootMargin: "200px"}).observe(video);

  return demo;
}

const demos = [...document.querySelectorAll(".demo-frame video")].map(setupDemo);

function visibleFraction({video}) {
  const rect = video.getBoundingClientRect();
  const width = Math.max(0, Math.min(rect.right, document.documentElement.clientWidth) - Math.max(rect.left, 0));
  const height = Math.max(0, Math.min(rect.bottom, document.documentElement.clientHeight) - Math.max(rect.top, 0));
  return width * height / (rect.width * rect.height);
}

function syncShowcase() {
  demos.forEach(demo => demo.prepare());
  let next;
  if (!reducedMotion.matches && !document.hidden && mobileMenu?.hidden !== false) {
    const eligible = demos.filter(demo => demo.eligible);
    next = eligible.includes(preferredDemo) ? preferredDemo : eligible[0];
    if (next && next !== preferredDemo) {
      let highest = visibleFraction(next);
      for (const demo of eligible.slice(1)) {
        const fraction = visibleFraction(demo);
        if (fraction > highest) {
          highest = fraction;
          next = demo;
        }
      }
    }
  }
  if (playingDemo !== next) playingDemo?.select(false);
  playingDemo = next;
  playingDemo?.select(true, playingDemo === preferredDemo);
}

const playbackObserver = new IntersectionObserver(entries => {
  for (const entry of entries) {
    demos.find(demo => demo.video === entry.target).updateVisibility(entry.intersectionRatio);
  }
  syncShowcase();
}, {threshold: [0, .25, .5, .75, 1]});
demos.forEach(({video}) => playbackObserver.observe(video));

// Two films can swap which is more visible without crossing an observer threshold.
let showcaseFrame;
window.addEventListener("scroll", () => {
  if (showcaseFrame !== undefined || demos.filter(demo => demo.eligible).length < 2) return;
  showcaseFrame = requestAnimationFrame(() => {
    showcaseFrame = undefined;
    syncShowcase();
  });
}, {passive: true});
document.addEventListener("visibilitychange", syncShowcase);
reducedMotion.addEventListener("change", syncShowcase);
mobileDemos.addEventListener("change", syncShowcase);
if (mobileMenu) {
  new MutationObserver(syncShowcase).observe(mobileMenu, {attributeFilter: ["hidden"]});
}
