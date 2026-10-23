(() => {
  const nav = document.querySelector(".reference-toc");
  const endpoints = [...document.querySelectorAll(".reference-entry[id]")];
  const links = [...nav.querySelectorAll(".reference-toc-endpoint")];
  const update = () => {
    const active = endpoints.filter((entry) => entry.getBoundingClientRect().top <= 161).at(-1) || endpoints[0];
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
  let observer;
  const observe = () => {
    if (observer) observer.disconnect();
    // A narrow band below the header tracks the endpoint being read.
    observer = new IntersectionObserver(update, {
      rootMargin: `-160px 0px -${Math.max(0, innerHeight - 162)}px 0px`,
    });
    endpoints.forEach((entry) => observer.observe(entry));
    update();
  };
  observe();
  window.addEventListener("resize", observe);
  window.addEventListener("load", update);
})();
