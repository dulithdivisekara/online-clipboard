export type ToastKind = "ok" | "err" | "info";

export function showToast(message: string, kind: ToastKind = "ok"): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("cb:toast", { detail: { message, kind } }));
  if (kind === "ok") {
    flashFaviconSuccess();
  }
}

export async function copyTextSafely(text: string, successMessage = "Copied to clipboard"): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    showToast(successMessage);
    return true;
  } catch {
    showToast("Clipboard permission denied", "err");
    return false;
  }
}

export function flashFaviconSuccess(): void {
  if (typeof window === "undefined") return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const link = document.getElementById("faviconLink") as HTMLLinkElement | null;
  if (!link) return;

  try {
    const canvas = document.createElement("canvas");
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.fillStyle = "#13151e";
    ctx.beginPath();
    ctx.roundRect(0, 0, 64, 64, 16);
    ctx.fill();

    ctx.fillStyle = "#177a2b";
    ctx.beginPath();
    ctx.arc(32, 32, 20, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 4.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(22, 33);
    ctx.lineTo(29, 40);
    ctx.lineTo(43, 25);
    ctx.stroke();

    const prevHref = link.getAttribute("data-orig-href") || link.href;
    link.setAttribute("data-orig-href", prevHref);
    link.href = canvas.toDataURL("image/png");
    window.setTimeout(() => {
      link.href = prevHref;
    }, 1400);
  } catch {
    // Ignore canvas errors
  }
}

function convexSquircle(x: number): number {
  const clamped = Math.max(0, Math.min(1, x));
  return Math.pow(1 - Math.pow(1 - clamped, 4), 0.25);
}

function createOpticalDataUri(
  width: number,
  height: number,
  bezelWidth: number,
  mode: "disp" | "spec"
): string {
  const w = Math.max(16, Math.round(width));
  const h = Math.max(16, Math.round(height));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";

  const img = ctx.createImageData(w, h);
  const d = img.data;
  const r = Math.min(h / 2, w / 2);
  const specAngle = Math.PI / 3;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = (y * w + x) * 4;
      const dx = Math.min(x, w - 1 - x);
      const dy = Math.min(y, h - 1 - y);
      let fromSide = Math.min(dx, dy);

      if (dx < r && dy < r) {
        const cx = r - dx;
        const cy = r - dy;
        fromSide = Math.max(0, r - Math.hypot(cx, cy));
      }

      if (mode === "disp") {
        if (fromSide >= bezelWidth) {
          d[idx] = 128;
          d[idx + 1] = 128;
          d[idx + 2] = 0;
          d[idx + 3] = 255;
        } else {
          const t = fromSide / bezelWidth;
          const mag = convexSquircle(1 - t) * 127;
          const nx = x < w / 2 ? -1 : 1;
          const ny = y < h / 2 ? -1 : 1;
          d[idx] = Math.round(128 + nx * mag * (dx < dy ? 1 : 0.35));
          d[idx + 1] = Math.round(128 + ny * mag * (dy < dx ? 1 : 0.35));
          d[idx + 2] = 0;
          d[idx + 3] = 255;
        }
      } else {
        if (fromSide <= 3.2) {
          const peak = Math.exp(-Math.pow((fromSide - 0.9) / 1.1, 2));
          const dir = Math.cos(Math.atan2(y - h / 2, x - w / 2) - specAngle);
          const alpha = Math.max(0, Math.min(255, Math.round(peak * (0.45 + 0.55 * Math.abs(dir)) * 255)));
          d[idx] = 255;
          d[idx + 1] = 255;
          d[idx + 2] = 255;
          d[idx + 3] = alpha;
        } else {
          d[idx + 3] = 0;
        }
      }
    }
  }

  ctx.putImageData(img, 0, 0);
  return canvas.toDataURL("image/png");
}

export function initLiquidOptics(): void {
  if (typeof window === "undefined") return;

  // Delegated specular pointer tracking so dynamically mounted cards/modals also glow
  if (document.documentElement.dataset.lgDelegatedGlow !== "1") {
    document.documentElement.dataset.lgDelegatedGlow = "1";
    document.addEventListener("pointermove", (ev) => {
      const target = (ev.target as Element | null)?.closest<HTMLElement>(
        ".liquid-glass, .glass-card"
      );
      if (!target) return;
      const rect = target.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      target.style.setProperty("--mx", `${((ev.clientX - rect.left) / rect.width) * 100}%`);
      target.style.setProperty("--my", `${((ev.clientY - rect.top) / rect.height) * 100}%`);
    });
  }
}

export function attachNavBubble(nav: HTMLElement | null): () => void {
  if (typeof window === "undefined" || !nav) return () => {};
  const bubble = nav.querySelector<HTMLElement>("#navBubble");
  const links = Array.from(nav.querySelectorAll<HTMLAnchorElement>(".nav-link"));
  if (!bubble || links.length === 0) return () => {};

  const NAV_BUBBLE_KEY = "cb-nav-bubble";
  const activeLink = nav.querySelector<HTMLAnchorElement>(".nav-link.active") || links[0];
  const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const setBubbleBox = (x: number, width: number, swell = false, animate = true) => {
    if (!animate || reducedMotion()) {
      bubble.style.transition = "none";
    } else {
      bubble.style.transition = "";
    }
    bubble.style.width = `${width}px`;
    bubble.style.transform = `translate3d(${x}px, 0, 0)${swell ? " scale(1.03, 0.96)" : ""}`;
    bubble.style.opacity = "1";
  };

  const snapToLink = (link: HTMLElement, swell = false, animate = true) => {
    setBubbleBox(link.offsetLeft, link.offsetWidth, swell, animate);
  };

  // Seamless cross-page spring entry from the previously clicked pill if available
  let restoredPrev = false;
  try {
    const raw = sessionStorage.getItem(NAV_BUBBLE_KEY);
    if (raw) {
      sessionStorage.removeItem(NAV_BUBBLE_KEY);
      const prev = JSON.parse(raw) as { x?: number; w?: number };
      if (typeof prev.x === "number" && typeof prev.w === "number" && prev.w > 0) {
        restoredPrev = true;
        setBubbleBox(prev.x, prev.w, false, false);
        void bubble.offsetWidth;
        requestAnimationFrame(() => snapToLink(activeLink, false, true));
      }
    }
  } catch {
    // ignore storage failures
  }

  if (!restoredPrev) {
    snapToLink(activeLink, false, false);
    requestAnimationFrame(() => {
      bubble.style.transition = "";
    });
  }

  let pointerDown = false;
  let dragging = false;
  let downX = 0;

  const findLinkAtClientX = (clientX: number): HTMLAnchorElement | null => {
    let best: HTMLAnchorElement | null = null;
    let bestDist = Infinity;
    for (const link of links) {
      const r = link.getBoundingClientRect();
      if (clientX >= r.left && clientX <= r.right) return link;
      const center = (r.left + r.right) / 2;
      const dist = Math.abs(clientX - center);
      if (dist < bestDist) {
        bestDist = dist;
        best = link;
      }
    }
    return best;
  };

  const enterHandlers = links.map((link) => {
    const onEnter = () => {
      if (!dragging) snapToLink(link, link !== activeLink, true);
    };
    const onFocus = () => snapToLink(link, false, true);
    const onClick = () => {
      try {
        sessionStorage.setItem(
          NAV_BUBBLE_KEY,
          JSON.stringify({ x: link.offsetLeft, w: link.offsetWidth })
        );
      } catch {
        // ignore
      }
    };
    link.addEventListener("pointerenter", onEnter);
    link.addEventListener("focus", onFocus);
    link.addEventListener("click", onClick);
    return () => {
      link.removeEventListener("pointerenter", onEnter);
      link.removeEventListener("focus", onFocus);
      link.removeEventListener("click", onClick);
    };
  });

  const onNavLeave = () => {
    if (!dragging) snapToLink(activeLink, false, true);
  };

  const onPointerDown = (e: PointerEvent) => {
    if (e.button !== 0) return;
    pointerDown = true;
    dragging = false;
    downX = e.clientX;
  };

  const onPointerMove = (e: PointerEvent) => {
    if (!pointerDown) return;
    if (!dragging && Math.abs(e.clientX - downX) > 6) {
      dragging = true;
      nav.classList.add("is-dragging");
    }
    if (!dragging) return;
    const hit = findLinkAtClientX(e.clientX);
    if (hit) snapToLink(hit, true, true);
  };

  const onPointerUp = (e: PointerEvent) => {
    if (!pointerDown) return;
    pointerDown = false;
    if (!dragging) return;
    dragging = false;
    nav.classList.remove("is-dragging");
    const hit = findLinkAtClientX(e.clientX);
    if (hit && hit !== activeLink) {
      try {
        sessionStorage.setItem(
          NAV_BUBBLE_KEY,
          JSON.stringify({ x: hit.offsetLeft, w: hit.offsetWidth })
        );
      } catch {
        // ignore
      }
      window.location.href = hit.href;
    } else {
      snapToLink(activeLink, false, true);
    }
  };

  nav.addEventListener("pointerleave", onNavLeave);
  nav.addEventListener("pointerdown", onPointerDown);
  window.addEventListener("pointermove", onPointerMove);
  window.addEventListener("pointerup", onPointerUp);
  window.addEventListener("pointercancel", onPointerUp);

  let ro: ResizeObserver | null = null;
  if (typeof ResizeObserver !== "undefined") {
    ro = new ResizeObserver(() => snapToLink(activeLink, false, false));
    ro.observe(nav);
  }

  return () => {
    enterHandlers.forEach((off) => off());
    ro?.disconnect();
    nav.removeEventListener("pointerleave", onNavLeave);
    nav.removeEventListener("pointerdown", onPointerDown);
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", onPointerUp);
    window.removeEventListener("pointercancel", onPointerUp);
  };
}

export function attachSegmentedSpring(
  container: HTMLElement,
  onSelect: (index: number) => void
): () => void {
  const thumb = container.querySelector(".seg-thumb") as HTMLElement | null;
  const buttons = Array.from(container.querySelectorAll<HTMLButtonElement>(".seg-btn"));
  if (!thumb || buttons.length === 0) return () => {};

  const dispImg = document.getElementById("lgDispImg");
  const specImg = document.getElementById("lgSpecImg");
  const dispMap = document.getElementById("lgDispMap");
  const specAlpha = document.getElementById("lgSpecAlpha");

  const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  let activeIdx = Math.max(
    0,
    buttons.findIndex((b) => b.getAttribute("aria-selected") === "true")
  );
  let pos = activeIdx;
  let vel = 0;
  let scaleX = 1;
  let scaleY = 1;
  let scaleVelX = 0;
  let scaleVelY = 0;
  let targetIdx = activeIdx;
  let dragging = false;
  let pointerDown = false;
  let downX = 0;
  let holdTimer: number | null = null;
  let rafId = 0;

  const getBtnWidth = () => {
    const first = buttons[0];
    return first ? first.getBoundingClientRect().width : 100;
  };

  const syncMaps = () => {
    const w = getBtnWidth();
    const h = thumb.getBoundingClientRect().height || 36;
    if (dispImg && specImg && w > 0) {
      dispImg.setAttribute("width", String(Math.round(w)));
      dispImg.setAttribute("height", String(Math.round(h)));
      dispImg.setAttribute("href", createOpticalDataUri(w, h, 10, "disp"));
      specImg.setAttribute("width", String(Math.round(w)));
      specImg.setAttribute("height", String(Math.round(h)));
      specImg.setAttribute("href", createOpticalDataUri(w, h, 10, "spec"));
    }
  };

  const applyTransform = () => {
    const w = getBtnWidth();
    thumb.style.width = `${w}px`;
    const tx = pos * w;
    thumb.style.transform = `translate3d(${tx}px, 0, 0) scale(${scaleX.toFixed(4)}, ${scaleY.toFixed(4)})`;
  };

  const stepSpring = () => {
    const kPos = dragging ? 0.42 : 0.24;
    const dampPos = dragging ? 0.48 : 0.68;
    const kScale = 0.26;
    const dampScale = 0.58;

    const targetSX = dragging ? 1.12 + Math.min(0.1, Math.abs(vel) * 0.16) : 1;
    const targetSY = dragging ? 1.36 : 1;

    vel = (vel + (targetIdx - pos) * kPos) * dampPos;
    pos += vel;

    scaleVelX = (scaleVelX + (targetSX - scaleX) * kScale) * dampScale;
    scaleVelY = (scaleVelY + (targetSY - scaleY) * kScale) * dampScale;
    scaleX += scaleVelX;
    scaleY += scaleVelY;

    applyTransform();

    if (
      Math.abs(targetIdx - pos) > 0.001 ||
      Math.abs(vel) > 0.001 ||
      Math.abs(targetSX - scaleX) > 0.002 ||
      Math.abs(targetSY - scaleY) > 0.002 ||
      dragging
    ) {
      rafId = requestAnimationFrame(stepSpring);
    } else {
      pos = targetIdx;
      scaleX = 1;
      scaleY = 1;
      applyTransform();
      rafId = 0;
    }
  };

  const kick = () => {
    if (reducedMotion()) {
      pos = targetIdx;
      scaleX = 1;
      scaleY = 1;
      applyTransform();
      return;
    }
    if (!rafId) rafId = requestAnimationFrame(stepSpring);
  };

  const setSelected = (idx: number, notify = true) => {
    activeIdx = Math.max(0, Math.min(buttons.length - 1, idx));
    targetIdx = activeIdx;
    buttons.forEach((b, i) => b.setAttribute("aria-selected", i === activeIdx ? "true" : "false"));
    if (notify) onSelect(activeIdx);
    kick();
  };

  // Sync spring thumb when aria-selected changes via React keyboard navigation
  const mo = new MutationObserver(() => {
    const nextIdx = buttons.findIndex((b) => b.getAttribute("aria-selected") === "true");
    if (nextIdx >= 0 && nextIdx !== activeIdx && !dragging) {
      setSelected(nextIdx, false);
    }
  });
  buttons.forEach((b) => mo.observe(b, { attributes: true, attributeFilter: ["aria-selected"] }));

  const setDragging = (next: boolean) => {
    dragging = next;
    container.classList.toggle("is-dragging", next);
    if (dispMap) dispMap.setAttribute("scale", next ? "24" : "10");
    if (specAlpha) specAlpha.setAttribute("slope", next ? "0.84" : "0.44");
  };

  const onPointerDown = (e: PointerEvent) => {
    if (e.button !== 0 && e.pointerType === "mouse") return;
    pointerDown = true;
    downX = e.clientX;
    holdTimer = window.setTimeout(() => {
      if (pointerDown) {
        setDragging(true);
        kick();
      }
    }, 75);
  };

  const onPointerMove = (e: PointerEvent) => {
    if (!pointerDown) return;
    if (!dragging && Math.abs(e.clientX - downX) > 4) {
      setDragging(true);
    }
    if (!dragging) return;

    const rect = container.getBoundingClientRect();
    const w = getBtnWidth();
    const raw = (e.clientX - rect.left - 4 - w / 2) / w;
    const maxIdx = buttons.length - 1;
    if (raw < 0) targetIdx = Math.max(-0.22, raw / 4);
    else if (raw > maxIdx) targetIdx = maxIdx + Math.min(0.22, (raw - maxIdx) / 4);
    else targetIdx = raw;
    kick();
  };

  const onPointerUp = (e: PointerEvent) => {
    if (!pointerDown) return;
    pointerDown = false;
    if (holdTimer) clearTimeout(holdTimer);
    if (dragging) {
      const rect = container.getBoundingClientRect();
      const w = getBtnWidth();
      const snapped = Math.round((e.clientX - rect.left - 4 - w / 2) / w);
      setDragging(false);
      setSelected(snapped);
    }
  };

  const clickHandlers = buttons.map((btn, idx) => {
    const fn = () => setSelected(idx);
    btn.addEventListener("click", fn);
    return () => btn.removeEventListener("click", fn);
  });

  container.addEventListener("pointerdown", onPointerDown);
  window.addEventListener("pointermove", onPointerMove);
  window.addEventListener("pointerup", onPointerUp);
  window.addEventListener("pointercancel", onPointerUp);

  let ro: ResizeObserver | null = null;
  if (typeof ResizeObserver !== "undefined") {
    ro = new ResizeObserver(() => {
      syncMaps();
      applyTransform();
    });
    ro.observe(container);
  }
  syncMaps();
  applyTransform();

  return () => {
    if (rafId) cancelAnimationFrame(rafId);
    if (holdTimer) clearTimeout(holdTimer);
    mo.disconnect();
    ro?.disconnect();
    clickHandlers.forEach((off) => off());
    container.removeEventListener("pointerdown", onPointerDown);
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", onPointerUp);
    window.removeEventListener("pointercancel", onPointerUp);
  };
}
