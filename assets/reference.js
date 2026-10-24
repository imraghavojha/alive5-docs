(() => {
  const nav = document.querySelector(".reference-toc");
  const endpoints = [...document.querySelectorAll(".reference-entry[id]")];
  if (!nav || !endpoints.length) return;
  const links = [...nav.querySelectorAll(".reference-toc-endpoint")];
  let clickedActive;
  let userScrollPending = false;
  let scheduled = false;
  const update = () => {
    scheduled = false;
    const atBottom = scrollY > 0 && scrollY + innerHeight >= document.documentElement.scrollHeight - 8;
    const active = clickedActive || (atBottom ? endpoints.at(-1)
      : endpoints.filter((entry) => entry.getBoundingClientRect().top <= 161).at(-1) || endpoints[0]);
    links.forEach((link) => {
      const current = link.hash === `#${active.id}`;
      link.classList.toggle("on", current);
      if (current) link.setAttribute("aria-current", "location");
      else link.removeAttribute("aria-current");
    });
    const current = nav.querySelector(".on");
    if (current && nav.clientHeight) {
      const top = current.offsetTop;
      if (top < nav.scrollTop || top + current.offsetHeight > nav.scrollTop + nav.clientHeight) {
        nav.scrollTop = top - nav.clientHeight / 2;
      }
    }
  };
  const navigate = (hash) => {
    clickedActive = endpoints.find((entry) => hash === `#${encodeURIComponent(entry.id)}`);
    userScrollPending = false;
    update();
  };
  document.addEventListener("click", (event) => {
    if (event.defaultPrevented || event.button || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const link = event.target.closest("a[href]");
    if (link && link.hash && link.origin === location.origin &&
      link.pathname === location.pathname && link.search === location.search &&
      !link.download && (!link.target || link.target === "_self")) navigate(link.hash);
  });
  window.addEventListener("hashchange", () => navigate(location.hash));
  window.addEventListener("popstate", () => navigate(location.hash));
  // Keep the navigated endpoint selected during smooth scrolling, until the user scrolls.
  window.addEventListener("wheel", () => { userScrollPending = true; }, { passive: true });
  window.addEventListener("touchmove", () => { userScrollPending = true; }, { passive: true });
  window.addEventListener("pointerdown", (event) => {
    if (event.target === document.documentElement) userScrollPending = true;
  });
  window.addEventListener("keydown", (event) => {
    if (!event.defaultPrevented && !event.metaKey && !event.ctrlKey && !event.altKey &&
      !event.target.closest("input, textarea, select, [contenteditable], button") &&
      ["ArrowDown", "ArrowUp", "PageDown", "PageUp", "Home", "End", " "].includes(event.key)) {
      userScrollPending = true;
    }
  });
  window.addEventListener("scroll", () => {
    if (userScrollPending) {
      clickedActive = undefined;
      userScrollPending = false;
    }
    if (!scheduled) {
      scheduled = true;
      requestAnimationFrame(update);
    }
  }, { passive: true });
  update();
  window.addEventListener("resize", update);
  window.addEventListener("load", update);
})();
