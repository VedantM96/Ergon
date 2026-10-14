import {
  animate as motionAnimate,
  stagger as motionStagger,
  inView as motionInView,
  hover as motionHover,
  press as motionPress,
  scroll as motionScroll,
  spring as motionSpring
} from "motion";

const animate: any = motionAnimate;
const stagger: any = motionStagger;
const inView: any = motionInView;
const hover: any = motionHover;
const press: any = motionPress;
const scroll: any = motionScroll;
const spring: any = motionSpring;

const enterEase = "cubic-bezier(0.22, 1, 0.36, 1)";
const reduced = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const controlBindings = new WeakSet<Element>();
const scrollBindings = new WeakMap<Element, () => void>();
let driftItems: any[] = [];
let started = false;

function ready() {
  document.documentElement.classList.add("motion-ready");
  const underline = document.querySelector(".wordmark-sweep") as HTMLElement | null;
  if (!reduced() && underline) {
    animate(underline, { transform: ["scaleX(0)", "scaleX(1)"] }, { duration: 0.38, easing: enterEase });
  }
  const first = [document.querySelector(".rail"), document.querySelector(".topbar")].filter(Boolean) as HTMLElement[];
  if (first.length && !reduced()) {
    animate(first, { opacity: [0, 1], transform: ["translateY(8px)", "translateY(0px)"] }, { duration: 0.32, delay: stagger(0.05), easing: enterEase });
  }
  started = true;
  return Promise.resolve(true);
}

function reveal(elements: Element | Element[] | NodeListOf<Element> | null) {
  const list = elements ? (elements instanceof Element ? [elements] : [...elements]) : [];
  if (!list.length) return;
  if (reduced()) {
    list.forEach(el => {
      (el as HTMLElement).style.opacity = "1";
      (el as HTMLElement).style.transform = "none";
    });
    return;
  }
  list.forEach((el, index) =>
    inView(el, () => {
      animate(el, { opacity: [0, 1], transform: ["translateY(12px)", "translateY(0px)"] }, { duration: 0.34, delay: index * 0.05, easing: enterEase });
    })
  );
}

function sweep(highlightEls: Element[] | NodeListOf<Element>) {
  const list = [...highlightEls];
  if (!list.length) return;
  if (reduced()) {
    list.forEach(el => {
      const fill = el.querySelector(".hl-fill") as HTMLElement | null;
      if (fill) fill.style.transform = "scaleX(1)";
    });
    return;
  }
  list.forEach(el => {
    const fill = el.querySelector(".hl-fill") as HTMLElement | null;
    if (fill) fill.style.transform = "scaleX(0)";
  });
  const fills = list.map(el => el.querySelector(".hl-fill")).filter(Boolean) as HTMLElement[];
  if (fills.length) {
    animate(fills, { transform: ["scaleX(0)", "scaleX(1)"] }, { duration: 0.46, delay: stagger(0.055), easing: enterEase });
  }
}

function countTo(el: HTMLElement, from: number, to: number, opts: { duration?: number; pad?: number } = {}) {
  const duration = reduced() ? 0 : (opts.duration ?? 0.72);
  if (duration === 0) {
    el.textContent = String(Math.round(to)).padStart(opts.pad || 0, "0");
    return;
  }
  animate(from, to, {
    duration,
    easing: enterEase,
    onUpdate: (value: number) => {
      el.textContent = String(Math.round(value)).padStart(opts.pad || 0, "0");
    },
    onComplete: () => {
      el.textContent = String(Math.round(to)).padStart(opts.pad || 0, "0");
    }
  });
}

function gauge(pathEl: SVGGeometryElement | null, score: number) {
  if (!pathEl) return;
  const r = Number(pathEl.getAttribute("r")) || 14;
  const circumference = 2 * Math.PI * r;
  const end = circumference * (1 - Math.max(0, Math.min(100, score)) / 100);
  pathEl.style.strokeDasharray = String(circumference);
  if (reduced()) {
    pathEl.style.strokeDashoffset = String(end);
    return;
  }
  animate(pathEl, { strokeDashoffset: [circumference, end] }, { duration: 0.38, easing: enterEase });
}

function colorAt(score: number) {
  const css = getComputedStyle(document.documentElement);
  return css.getPropertyValue(score <= 15 ? "--clear" : score <= 45 ? "--fuzzy" : "--vague").trim();
}

function debt(el: HTMLElement, from: number, to: number) {
  countTo(el, from, to, { duration: 0.82, pad: 2 });
  if (!reduced()) {
    animate(el, { color: [colorAt(from), colorAt(to)] }, { duration: 0.82, easing: enterEase });
  } else {
    el.style.color = colorAt(to);
  }
}

function flight(fromEl: HTMLElement, toEl: HTMLElement) {
  if (!fromEl || !toEl || reduced()) return Promise.resolve();
  const a = fromEl.getBoundingClientRect(),
    b = toEl.getBoundingClientRect();
  const ghost = document.createElement("span");
  ghost.className = "flight-ghost";
  ghost.textContent = fromEl.querySelector("h4")?.textContent || "Approved promise";
  ghost.style.left = a.left + "px";
  ghost.style.top = a.top + "px";
  ghost.style.width = Math.max(160, Math.min(a.width, 280)) + "px";
  document.body.append(ghost);
  const dx = b.left - a.left,
    dy = b.top - a.top;
  return new Promise<void>(resolve =>
    animate(
      ghost,
      {
        transform: ["translate(0px,0px) scale(1)", "translate(" + dx + "px," + dy + "px) scale(.48)"],
        opacity: [0.92, 0]
      },
      {
        duration: 0.42,
        easing: enterEase,
        onComplete: () => {
          ghost.remove();
          resolve();
        }
      }
    )
  );
}

function flip(root: HTMLElement | null, mutateFn: () => void) {
  if (!root) {
    mutateFn();
    return;
  }
  const before = new Map([...root.querySelectorAll<HTMLElement>(".task-card[data-id]")].map(el => [el.dataset.id!, el.getBoundingClientRect()]));
  mutateFn();
  if (reduced()) return;
  for (const el of root.querySelectorAll<HTMLElement>(".task-card[data-id]")) {
    const old = before.get(el.dataset.id!);
    if (!old) continue;
    const next = el.getBoundingClientRect(),
      dx = old.left - next.left,
      dy = old.top - next.top;
    if (Math.abs(dx) + Math.abs(dy) < 1) continue;
    animate(
      el,
      { transform: ["translate(" + dx + "px," + dy + "px)", "translate(0px,0px)"] },
      { type: "spring", stiffness: 260, damping: 28 }
    );
  }
}

function pulse(el: HTMLElement | null) {
  if (!el || reduced()) return;
  const ring = document.createElement("span");
  ring.className = "pulse-ring";
  el.append(ring);
  animate(
    ring,
    { transform: ["scale(.96)", "scale(1.08)"], opacity: [0.75, 0] },
    {
      duration: 0.48,
      easing: enterEase,
      onComplete: () => ring.remove()
    }
  );
}

function toastElement(el: HTMLElement) {
  if (reduced()) {
    setTimeout(() => el.remove(), 2600);
    return;
  }
  animate(el, { transform: ["translateY(8px)", "translateY(0px)"], opacity: [0, 1] }, { type: "spring", stiffness: 260, damping: 28 });
  setTimeout(
    () =>
      animate(el, { transform: ["translateY(0px)", "translateY(5px)"], opacity: [1, 0] }, { duration: 0.18, easing: enterEase, onComplete: () => el.remove() }),
    2800
  );
}

function startDrift(elements: Element[] | NodeListOf<Element>) {
  if (started === false || reduced()) return;
  driftItems = [...elements].map(el =>
    animate(
      el,
      { transform: ["translate3d(0,0,0)", "translate3d(3%,-3%,0)"] },
      { duration: 40, repeat: Infinity, repeatType: "reverse", easing: "linear" }
    )
  );
  const pause = () => driftItems.forEach(item => (document.hidden ? item.pause() : item.play()));
  document.addEventListener("visibilitychange", pause);
  pause();
}

function showToast(message: string, type: "info" | "success" | "error" = "info") {
  const region = document.querySelector("#toast-region");
  if (!region) return null;
  const el = document.createElement("div");
  el.className = "toast " + type;
  const dot = document.createElement("span");
  dot.className = "toast-mark";
  const text = document.createElement("span");
  text.textContent = String(message);
  el.append(dot, text);
  region.append(el);
  toastElement(el);
  return el;
}

function progress(el: HTMLElement | null, value: number) {
  if (!el) return;
  if (reduced()) {
    el.style.transform = "scaleX(" + value + ")";
    return;
  }
  animate(el, { transform: "scaleX(" + value + ")" }, { duration: 0.22, easing: enterEase });
}

function syncMinimap(container: HTMLElement | null, marker: HTMLElement | null) {
  if (!container || !marker || scrollBindings.has(container)) return;
  const stop = scroll(
    (progressVal: number) => {
      const max = container.clientHeight - 22;
      marker.style.transform = "translateY(" + Math.max(0, Math.min(1, progressVal)) * Math.max(0, max) + "px)";
    },
    { target: container }
  );
  scrollBindings.set(container, stop);
}

function changeView(outgoing: HTMLElement | null, incoming: HTMLElement | null) {
  if (!outgoing || !incoming) return Promise.resolve();
  incoming.hidden = false;
  if (reduced()) {
    outgoing.hidden = true;
    incoming.hidden = false;
    incoming.style.opacity = "1";
    incoming.style.transform = "none";
    return Promise.resolve();
  }
  return new Promise<void>(resolve =>
    animate(outgoing, { opacity: [1, 0], transform: ["translateY(0px)", "translateY(-3px)"] }, {
      duration: 0.12,
      easing: enterEase,
      onComplete: () => {
        outgoing.hidden = true;
        incoming.hidden = false;
        animate(incoming, { opacity: [0, 1], transform: ["translateY(8px)", "translateY(0px)"] }, {
          duration: 0.26,
          easing: enterEase,
          onComplete: () => resolve()
        });
      }
    })
  );
}

function bindControls(scope: Element | Document = document) {
  const items =
    (scope as Element).matches?.("button,a")
      ? [scope as Element, ...scope.querySelectorAll("button,a")]
      : [...scope.querySelectorAll("button,a")];
  for (const el of items) {
    if (controlBindings.has(el)) continue;
    controlBindings.add(el);
    hover(el, (element: HTMLElement) => {
      if (reduced()) return;
      animate(element, { transform: "translateY(-1px) scale(1.01)" }, { duration: 0.14, easing: enterEase });
      return () => animate(element, { transform: "translateY(0px) scale(1)" }, { duration: 0.14, easing: enterEase });
    });
    press(el, (element: HTMLElement) => {
      if (reduced()) return;
      animate(element, { transform: "scale(.97)" }, { duration: 0.12, easing: enterEase });
      return () => animate(element, { transform: "scale(1)" }, { duration: 0.14, easing: enterEase });
    });
  }
}

function reducedMotion() {
  return reduced();
}

export const ergonMotion = {
  ready,
  reveal,
  sweep,
  countTo,
  gauge,
  flight,
  flip,
  pulse,
  toast: showToast,
  toastElement,
  drift: startDrift,
  startDrift,
  reduced: reducedMotion,
  progress,
  syncMinimap,
  changeView,
  bindControls,
  debt
};
