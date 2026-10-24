(() => {
  const nav = document.querySelector(".reference-toc");
  const endpoints = [...document.querySelectorAll(".reference-entry[id]")];
  if (!nav || !endpoints.length) return;
  const links = [...nav.querySelectorAll(".reference-toc-endpoint")];
  let clickedActive;
  let userScrollPending = false;
  const doc = endpoints[0].closest(".doc");
  const visible = new Set();
  let atBottom = false;
  let observer;
  let activeLink;
  const navObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.target === activeLink && entry.intersectionRatio < 1 && entry.rootBounds.height) {
        nav.scrollBy({
          top: entry.boundingClientRect.top - entry.rootBounds.top - entry.rootBounds.height / 2,
          behavior: "instant",
        });
      }
    });
  }, { root: nav, threshold: 1 });
  const update = () => {
    const active = clickedActive || (atBottom && scrollY > 0 ? endpoints.at(-1)
      : endpoints.findLast((entry) => visible.has(entry)) || endpoints[0]);
    const current = links.find((link) => link.hash === `#${active.id}`);
    if (current === activeLink) return;
    if (activeLink) navObserver.unobserve(activeLink);
    activeLink = current;
    links.forEach((link) => {
      const selected = link === current;
      link.classList.toggle("on", selected);
      if (selected) link.setAttribute("aria-current", "location");
      else link.removeAttribute("aria-current");
    });
    if (current) navObserver.observe(current);
  };
  const sentinel = document.createElement("div");
  sentinel.setAttribute("aria-hidden", "true");
  sentinel.style.cssText = "height:0; width:1px; pointer-events:none";
  doc.append(sentinel);
  const bottomObserver = new IntersectionObserver(([entry]) => {
    atBottom = entry.isIntersecting;
    update();
  }, { rootMargin: "0px 0px 8px 0px" });
  bottomObserver.observe(sentinel);
  const resizeObserver = new ResizeObserver(([entry]) => {
    observer?.disconnect();
    visible.clear();
    // Observe every endpoint above the activation line, including endpoints
    // skipped by a large scroll jump and gaps between resource groups.
    observer = new IntersectionObserver((entries) => {
      entries.forEach(({ target, isIntersecting }) => {
        if (isIntersecting) visible.add(target);
        else visible.delete(target);
      });
      update();
    }, { rootMargin: `${Math.ceil(entry.borderBoxSize[0].blockSize)}px 0px ${161 - innerHeight}px 0px` });
    endpoints.forEach((endpoint) => observer.observe(endpoint));
    const paddingBottom = entry.borderBoxSize[0].blockSize - entry.contentRect.height - entry.contentRect.y;
    sentinel.style.transform = `translateY(${paddingBottom}px)`;
  });
  resizeObserver.observe(doc);
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
    update();
  }, { passive: true });
  update();
  window.addEventListener("resize", () => {
    resizeObserver.unobserve(doc);
    resizeObserver.observe(doc);
  });
})();
