// Site palette adapter for the shared CLI renderer.
export const theme = {};
export function syncTheme() {
  const styles = getComputedStyle(document.documentElement);
  for (const [key, token] of Object.entries({ bg: 'surface', ink: 'ink-str', muted: 'muted', faint: 'faint', orange: 'a5', hot: 'a5' }))
    theme[key] = styles.getPropertyValue('--' + token).trim();
}
export const mix = (a, b, t) => {
  const rgb = (c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
  const x = rgb(a);
  const y = rgb(b);
  return (
    '#' +
    x
      .map((n, i) =>
        Math.round(n + (y[i] - n) * Math.min(1, Math.max(0, t)))
          .toString(16)
          .padStart(2, '0'),
      )
      .join('')
  );
};

