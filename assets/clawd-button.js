(() => {
  const wrap = document.querySelector('[data-clawd]');
  if (!wrap) return;
  const sprite = wrap.querySelector('.clawd-sprite');
  const button = wrap.querySelector('a');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const ink = document.createElement('div');
  ink.className = 'ink-cover';
  ink.setAttribute('aria-hidden', 'true');

  function bloom(x, y, opening) {
    const radius = Math.ceil(Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y))) + 2;
    const circle = r => 'circle(' + r + 'px at ' + x + 'px ' + y + 'px)';
    const frames = [{clipPath: circle(0)}, {clipPath: circle(radius)}];
    document.body.append(ink);
    return ink.animate(opening ? frames : frames.reverse(), {
      duration: 520, easing: 'cubic-bezier(.65,0,.25,1)', fill: 'both',
    }).finished;
  }

  if (wrap.dataset.clawd === 'peek') {
    let leaving = false;
    button.addEventListener('click', async event => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey ||
          event.shiftKey || event.altKey || reduced.matches || !ink.animate) return;
      event.preventDefault();
      if (leaving) return;
      leaving = true;
      try {
        const pose = new DOMMatrixReadOnly(getComputedStyle(sprite).transform);
        await sprite.animate([
          {transform: 'translate(' + pose.m41 + 'px,' + pose.m42 + 'px)'},
          {transform: 'translate(' + pose.m41 + 'px,-10px)', offset: .57},
          {transform: 'translate(' + pose.m41 + 'px,0)'},
        ], {duration: 420, easing: 'ease-in-out', fill: 'forwards'}).finished;
        const box = sprite.getBoundingClientRect();
        await bloom(box.left + box.width / 2, box.top + box.height / 2, true);
        sessionStorage.setItem('alive5-ink-arrival', String(Date.now() + 30000));
      } finally {
        location.assign(button.href);
      }
    });
    addEventListener('pageshow', event => {
      if (!event.persisted) return;
      leaving = false;
      ink.remove();
      ink.getAnimations().forEach(a => a.cancel());
      sprite.getAnimations().filter(a => !a.animationName).forEach(a => a.cancel());
    });
    return;
  }

  async function arrive() {
    const root = document.documentElement;
    if (!root.classList.contains('ink-arrival')) return;
    const flyer = sprite.cloneNode();
    flyer.classList.add('clawd-falling');
    try {
      if (reduced.matches || !ink.animate) return;
      const box = sprite.getBoundingClientRect();
      const target = button.getBoundingClientRect();
      Object.assign(flyer.style, {left: box.left + 'px', top: box.top + 'px'});
      sprite.style.visibility = 'hidden';
      document.body.append(flyer);
      const reveal = bloom(target.left + target.width / 2, target.top + target.height / 2, false);
      root.classList.remove('ink-arrival');
      const fromTop = -(box.bottom + 4);
      const jump = flyer.animate([
        {transform: 'translate(-24px,' + fromTop + 'px)', easing:'cubic-bezier(.45,0,.8,.5)'},
        {transform: 'translate(0,0)', offset:.69, easing:'cubic-bezier(.18,.75,.42,1)'},
        {transform: 'translate(0,-12px)', offset:.81, easing:'ease-in'},
        {transform: 'translate(0,0)', offset:.94},
        {transform: 'translate(0,0)'},
      ], {duration: 880, fill:'both'});
      await Promise.all([reveal, jump.finished]);
    } finally {
      root.classList.remove('ink-arrival');
      ink.remove();
      flyer.remove();
      sprite.style.visibility = '';
    }
  }
  // The global header script sets the button's final vertical position.
  document.addEventListener('DOMContentLoaded', arrive, {once:true});
})();
