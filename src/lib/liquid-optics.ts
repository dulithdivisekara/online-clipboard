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

  let curX = activeLink.offsetLeft;
  let curW = activeLink.offsetWidth;
  let targetX = curX;
  let targetW = curW;
  let velX = 0;
  let velW = 0;
  let scaleX = 1;
  let scaleY = 1;
  let scaleVelX = 0;
  let scaleVelY = 0;
  let pointerDown = false;
  let dragging = false;
  let suppressClick = false;
  let downX = 0;
  let holdTimer: number | null = null;
  let rafId = 0;

  bubble.style.transition = "none";

  const applyTransform = () => {
    bubble.style.width = `${curW.toFixed(2)}px`;
    bubble.style.transform = `translate3d(${curX.toFixed(2)}px, 0, 0) scale(${scaleX.toFixed(4)}, ${scaleY.toFixed(4)})`;
    bubble.style.opacity = curW > 0 ? "1" : "0";
  };

  const stepSpring = () => {
    const kPos = dragging ? 0.42 : 0.24;
    const dampPos = dragging ? 0.48 : 0.68;
    const kScale = 0.26;
    const dampScale = 0.58;

    const targetSX = dragging ? 1.06 + Math.min(0.06, Math.abs(velX) * 0.006) : 1;
    const targetSY = dragging ? 1.14 : 1;

    velX = (velX + (targetX - curX) * kPos) * dampPos;
    velW = (velW + (targetW - curW) * kPos) * dampPos;
    curX += velX;
    curW += velW;

    scaleVelX = (scaleVelX + (targetSX - scaleX) * kScale) * dampScale;
    scaleVelY = (scaleVelY + (targetSY - scaleY) * kScale) * dampScale;
    scaleX += scaleVelX;
    scaleY += scaleVelY;

    applyTransform();

    if (
      Math.abs(targetX - curX) > 0.08 ||
      Math.abs(targetW - curW) > 0.08 ||
      Math.abs(velX) > 0.08 ||
      Math.abs(velW) > 0.08 ||
      Math.abs(targetSX - scaleX) > 0.002 ||
      Math.abs(targetSY - scaleY) > 0.002 ||
      dragging
    ) {
      rafId = requestAnimationFrame(stepSpring);
    } else {
      curX = targetX;
      curW = targetW;
      velX = 0;
      velW = 0;
      scaleX = 1;
      scaleY = 1;
      applyTransform();
      rafId = 0;
    }
  };

  const kick = () => {
    if (reducedMotion()) {
      curX = targetX;
      curW = targetW;
      scaleX = 1;
      scaleY = 1;
      applyTransform();
      return;
    }
    if (!rafId) rafId = requestAnimationFrame(stepSpring);
  };

  const setDragging = (next: boolean) => {
    dragging = next;
    nav.classList.toggle("is-dragging", next);
  };

  const snapTargetTo = (link: HTMLElement, animate = true) => {
    targetX = link.offsetLeft;
    targetW = link.offsetWidth;
    if (!animate || reducedMotion()) {
      curX = targetX;
      curW = targetW;
      applyTransform();
    } else {
      kick();
    }
  };

  const setScrubTarget = (clientX: number) => {
    const navRect = nav.getBoundingClientRect();
    const relX = clientX - navRect.left;
    const first = links[0];
    const last = links[links.length - 1];
    const firstCenter = first.offsetLeft + first.offsetWidth / 2;
    const lastCenter = last.offsetLeft + last.offsetWidth / 2;

    if (relX <= firstCenter) {
      targetX = first.offsetLeft + Math.max(-10, (relX - firstCenter) / 4);
      targetW = first.offsetWidth;
      return;
    }
    if (relX >= lastCenter) {
      targetX = last.offsetLeft + Math.min(10, (relX - lastCenter) / 4);
      targetW = last.offsetWidth;
      return;
    }

    for (let i = 0; i < links.length - 1; i++) {
      const a = links[i];
      const b = links[i + 1];
      const ca = a.offsetLeft + a.offsetWidth / 2;
      const cb = b.offsetLeft + b.offsetWidth / 2;
      if (relX >= ca && relX <= cb) {
        const t = cb === ca ? 0 : (relX - ca) / (cb - ca);
        targetX = a.offsetLeft + (b.offsetLeft - a.offsetLeft) * t;
        targetW = a.offsetWidth + (b.offsetWidth - a.offsetWidth) * t;
        return;
      }
    }
  };

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

  const saveNavBubbleRect = (link: HTMLElement) => {
    try {
      sessionStorage.setItem(
        NAV_BUBBLE_KEY,
        JSON.stringify({ x: link.offsetLeft, w: link.offsetWidth })
      );
    } catch {
      // ignore
    }
  };

  // Seamless cross-page spring entry from the previously clicked/dragged pill if available
  let restoredPrev = false;
  try {
    const raw = sessionStorage.getItem(NAV_BUBBLE_KEY);
    if (raw) {
      sessionStorage.removeItem(NAV_BUBBLE_KEY);
      const prev = JSON.parse(raw) as { x?: number; w?: number };
      if (typeof prev.x === "number" && typeof prev.w === "number" && prev.w > 0) {
        restoredPrev = true;
        curX = prev.x;
        curW = prev.w;
        applyTransform();
        requestAnimationFrame(() => snapTargetTo(activeLink, true));
      }
    }
  } catch {
    // ignore storage failures
  }

  if (!restoredPrev) {
    snapTargetTo(activeLink, false);
  }

  const enterHandlers = links.map((link) => {
    const onEnter = () => {
      if (!pointerDown && !dragging) snapTargetTo(link, true);
    };
    const onFocus = () => snapTargetTo(link, true);
    const onClick = (e: MouseEvent) => {
      if (suppressClick) {
        e.preventDefault();
        return;
      }
      saveNavBubbleRect(link);
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

  const onDragStart = (e: DragEvent) => e.preventDefault();
  const onNavLeave = () => {
    if (!pointerDown && !dragging) snapTargetTo(activeLink, true);
  };

  const onPointerDown = (e: PointerEvent) => {
    if (e.button !== 0 && e.pointerType === "mouse") return;
    pointerDown = true;
    suppressClick = false;
    downX = e.clientX;
    holdTimer = window.setTimeout(() => {
      if (pointerDown) {
        setDragging(true);
        setScrubTarget(downX);
        kick();
      }
    }, 75);
  };

  const onPointerMove = (e: PointerEvent) => {
    if (!pointerDown) return;
    if (!dragging && Math.abs(e.clientX - downX) > 4) {
      setDragging(true);
      kick();
    }
    if (!dragging) return;
    setScrubTarget(e.clientX);
    kick();
  };

  const onPointerUp = (e: PointerEvent) => {
    if (!pointerDown) return;
    pointerDown = false;
    if (holdTimer) {
      clearTimeout(holdTimer);
      holdTimer = null;
    }
    if (!dragging) return;

    suppressClick = true;
    window.setTimeout(() => {
      suppressClick = false;
    }, 80);

    setDragging(false);
    const hit = findLinkAtClientX(e.clientX);
    if (hit && hit !== activeLink) {
      snapTargetTo(hit, true);
      saveNavBubbleRect(hit);
      window.location.href = hit.href;
    } else {
      snapTargetTo(activeLink, true);
    }
  };

  nav.addEventListener("dragstart", onDragStart);
  nav.addEventListener("pointerleave", onNavLeave);
  nav.addEventListener("pointerdown", onPointerDown);
  window.addEventListener("pointermove", onPointerMove);
  window.addEventListener("pointerup", onPointerUp);
  window.addEventListener("pointercancel", onPointerUp);

  let ro: ResizeObserver | null = null;
  if (typeof ResizeObserver !== "undefined") {
    ro = new ResizeObserver(() => {
      if (!dragging) snapTargetTo(activeLink, false);
    });
    ro.observe(nav);
  }

  return () => {
    if (rafId) cancelAnimationFrame(rafId);
    if (holdTimer) clearTimeout(holdTimer);
    enterHandlers.forEach((off) => off());
    ro?.disconnect();
    nav.removeEventListener("dragstart", onDragStart);
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

    const targetSX = dragging ? 1.06 + Math.min(0.06, Math.abs(vel) * 0.1) : 1;
    const targetSY = dragging ? 1.14 : 1;

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
      applyTransform();
    });
    ro.observe(container);
  }
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
