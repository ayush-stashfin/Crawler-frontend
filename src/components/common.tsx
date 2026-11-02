import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { mediaUrl } from '../api';
import type { MetricPoint, ScriptStatus } from '../types';

export function Icon({ name, className = '' }: { name: string; className?: string }) {
  return (
    <span className={`material-symbols-outlined ${className}`} aria-hidden="true">
      {name}
    </span>
  );
}

/**
 * An (i) button whose explanation shows while it's hovered or focused. The explanation sits on
 * document.body, so a scrolling table or a clipped card can't cut it off.
 */
/** Closes whichever info tip is open, so opening another never leaves two on screen. */
let closeOpenTip: (() => void) | null = null;

export function InfoTip({ label, children }: { label: string; children: ReactNode }) {
  const id = useId();
  const button = useRef<HTMLButtonElement>(null);
  const tip = useRef<HTMLSpanElement>(null);
  const [pos, setPos] = useState<CSSProperties | null>(null);
  const [open, setOpen] = useState(false); // closing keeps `pos`, so the tip fades out where it was instead of jumping to the corner
  const hide = useCallback(() => {
    setOpen(false);
    if (closeOpenTip === hide) closeOpenTip = null;
  }, []);
  // Placed in one step, below the button or above it when there's no room, so it never flashes in the wrong spot.
  const show = useCallback(() => {
    const r = button.current?.getBoundingClientRect();
    const el = tip.current;
    if (!r || !el) return;
    if (closeOpenTip && closeOpenTip !== hide) closeOpenTip(); // one tip at a time
    closeOpenTip = hide;
    const width = Math.min(360, window.innerWidth - 32);
    el.style.width = `${width}px`;
    const h = el.offsetHeight;
    const flip = r.bottom + 8 + h > window.innerHeight - 8 && r.top - 8 - h > 8;
    setOpen(true);
    setPos({
      top: flip ? r.top - 8 - h : r.bottom + 8,
      left: Math.max(16, Math.min(r.left - 10, window.innerWidth - width - 16)),
      width,
    });
  }, [hide]);
  // While open: follow the button on scroll, and close as soon as the pointer is anywhere else, so a missed
  // mouseleave (the page scrolled under a still mouse, say) can't leave it stuck on screen.
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      const b = button.current;
      if (e.pointerType !== 'touch' && b && !b.contains(e.target as Node) && !b.matches(':focus-visible')) hide();
    };
    const tapAway = (e: PointerEvent) => button.current && !button.current.contains(e.target as Node) && hide();
    window.addEventListener('scroll', show, true);
    window.addEventListener('resize', show);
    document.addEventListener('pointermove', away);
    document.addEventListener('pointerdown', tapAway);
    return () => {
      window.removeEventListener('scroll', show, true);
      window.removeEventListener('resize', show);
      document.removeEventListener('pointermove', away);
      document.removeEventListener('pointerdown', tapAway);
    };
  }, [open, show, hide]);
  useEffect(() => hide, [hide]);
  return (
    <span className="info-tip">
      <button
        type="button"
        ref={button}
        className="info-tip-button"
        aria-label={label}
        aria-describedby={id}
        onPointerEnter={show}
        onPointerLeave={(e) => e.pointerType !== 'touch' && hide()}
        onFocus={show}
        onBlur={hide}
        onKeyDown={(e) => e.key === 'Escape' && hide()}
        onClick={(e) => {
          e.stopPropagation();
          if (!open) show(); // a tap on a phone opens it
        }}
      >
        <Icon name="info" />
      </button>
      {createPortal(
        <span role="tooltip" id={id} ref={tip} className={`info-tip-body ${open ? 'open' : ''}`} style={pos ?? undefined}>
          {children}
        </span>,
        document.body,
      )}
    </span>
  );
}

/** How trending and the trend score are worked out; shown wherever a score appears. */
export function ScoreInfo() {
  return (
    <InfoTip label="How trending and the score are worked out">
      <b>How we score a post</b>
      We compare each post with the same brand’s recent posts of the same kind, at the same age.
      <ul>
        <li>
          <b>× usual:</b> how many times more views it got than that brand normally gets. 3× means three times more. For photos we count likes and comments
          instead of views.
        </li>
        <li>
          <b>Score:</b> one number that mixes four things: how far above usual it is (counts most), whether it’s still growing fast, how much people engage with
          it, and whether other brands are posting about the same topic. 0 is a normal post; higher is better.
        </li>
        <li>
          <b>Trending:</b> at least 2× usual, still growing, and in the day’s top 5.
        </li>
      </ul>
    </InfoTip>
  );
}

const BRAND_CLASSES = new Set(['paytm', 'phonepe', 'cred', 'slice', 'jupiter', 'mobikwik', 'indmoney']);
const brandKey = (name: string) => name.toLowerCase().replace(/[^a-z]/g, '');

/** Round initial (or profile picture) for a competitor, tinted per brand. */
export function BrandAvatar({ name, src }: { name: string; src?: string | null }) {
  const [failed, setFailed] = useState(false);
  const key = brandKey(name);
  const url = mediaUrl(src ?? null);
  return (
    <span className={`brand-avatar ${BRAND_CLASSES.has(key) ? `brand-${key}` : ''}`} aria-hidden="true">
      {url && !failed ? <img src={url} alt="" onError={() => setFailed(true)} /> : name.slice(0, 1).toUpperCase()}
    </span>
  );
}

/**
 * A post's cached thumbnail. Instagram links expire, so some posts have none:
 * those get a soft placeholder with the brand initial instead of a broken image.
 */
export function Thumb({ src, label, kind }: { src: string | null; label: string; kind?: string }) {
  const [failed, setFailed] = useState(false);
  const url = mediaUrl(src);
  return (
    <span className="thumb-box">
      {url && !failed ? (
        <img className="thumb" src={url} alt="" loading="lazy" onError={() => setFailed(true)} />
      ) : (
        <span className="thumb-fallback" aria-hidden="true">
          {label.slice(0, 1).toUpperCase()}
          {kind && <small>{kind}</small>}
        </span>
      )}
    </span>
  );
}

const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

/**
 * A number that eases from where it was (0 on first show) to its new value.
 * `format` gets the in-between values, so it decides the rounding.
 */
export function CountUp({ value, format, duration = 750 }: { value: number | null; format: (n: number | null) => string; duration?: number }) {
  const shown = useRef(0);
  const [n, setN] = useState<number | null>(value == null || reducedMotion() ? value : 0);
  useEffect(() => {
    if (value == null || reducedMotion()) {
      setN(value);
      shown.current = value ?? 0;
      return;
    }
    const from = shown.current;
    const start = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const k = Math.min(1, (t - start) / duration);
      shown.current = from + (value - from) * (1 - (1 - k) ** 3);
      setN(shown.current);
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);
  return <>{format(n)}</>;
}

export const roundInt = (n: number | null) => (n == null ? '–' : String(Math.round(n)));

/** The chevron button that opens and closes a `Collapse`; it sits inside the section's heading. */
export function CollapseToggle({ open, onToggle, controls, children }: { open: boolean; onToggle: () => void; controls: string; children: ReactNode }) {
  return (
    <button type="button" className="collapse-toggle" aria-expanded={open} aria-controls={controls} onClick={onToggle}>
      {children}
      <span className="collapse-chip">
        {open ? 'Hide' : 'Show'}
        <Icon name="expand_more" />
      </span>
    </button>
  );
}

/** Slides its content open and shut. Closed content stays mounted but can't be tabbed into. */
export function Collapse({ open, id, children }: { open: boolean; id: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.toggleAttribute('inert', !open);
  }, [open]);
  return (
    <div id={id} ref={ref} className={`collapse ${open ? 'open' : ''}`}>
      <div className="collapse-inner">{children}</div>
    </div>
  );
}

/** Adds `in` to the element the first time it scrolls into view; the CSS holds its entrance until then. */
export function useInView<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === 'undefined') {
      el.classList.add('in');
      return;
    }
    const io = new IntersectionObserver(
      ([e]) => {
        if (!e.isIntersecting) return;
        el.classList.add('in');
        io.disconnect();
      },
      { rootMargin: '0px 0px -60px 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return ref;
}

/**
 * A highlight that slides to whichever child has `.active` (sidebar pill, tab underline).
 * Put the returned ref on a positioned container and render `<span className="glider" style={style} />` in it.
 */
export function useGlider<T extends HTMLElement>(active: unknown) {
  const ref = useRef<T>(null);
  const [style, setStyle] = useState<CSSProperties>({ opacity: 0 });
  useLayoutEffect(() => {
    const measure = () => {
      const el = ref.current?.querySelector<HTMLElement>('.active');
      setStyle(
        el
          ? {
              width: el.offsetWidth,
              height: el.offsetHeight,
              transform: `translate(${el.offsetLeft}px, ${el.offsetTop}px)`,
            }
          : { opacity: 0 },
      );
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (ref.current) ro.observe(ref.current);
    const el = ref.current?.querySelector<HTMLElement>('.active');
    if (el) ro.observe(el);
    let live = true;
    document.fonts?.ready.then(() => live && measure());
    return () => {
      live = false;
      ro.disconnect();
    };
  }, [active]);
  // Slide only after the first placement, so it doesn't fly in from the corner on load.
  useEffect(() => {
    const id = requestAnimationFrame(() => ref.current?.classList.add('glide-ready'));
    return () => cancelAnimationFrame(id);
  }, []);
  return [ref, style] as const;
}

/** Pointer position on `.spot` cards (for the glow) and a small tilt on `.tilt` ones. */
export function usePointerGlow() {
  useEffect(() => {
    if (reducedMotion()) return;
    let last: HTMLElement | null = null;
    const onMove = (e: PointerEvent) => {
      const el = e.target instanceof Element ? e.target.closest<HTMLElement>('.spot') : null;
      if (last && last !== el) {
        last.style.removeProperty('--rx');
        last.style.removeProperty('--ry');
      }
      last = el;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width;
      const y = (e.clientY - r.top) / r.height;
      el.style.setProperty('--mx', `${(x * 100).toFixed(1)}%`);
      el.style.setProperty('--my', `${(y * 100).toFixed(1)}%`);
      if (el.classList.contains('tilt')) {
        el.style.setProperty('--rx', `${((0.5 - y) * 7).toFixed(2)}deg`);
        el.style.setProperty('--ry', `${((x - 0.5) * 9).toFixed(2)}deg`);
      }
    };
    document.addEventListener('pointermove', onMove, { passive: true });
    return () => document.removeEventListener('pointermove', onMove);
  }, []);
}

/** A thin bar that fills to `value` (0–1) when it comes into view. */
export function Meter({ value, tone = 'lilac', tick }: { value: number; tone?: 'lilac' | 'coral'; tick?: number }) {
  const v = Math.max(0, Math.min(1, value));
  return (
    <span className={`meter meter-${tone}`} style={{ '--v': v } as CSSProperties} aria-hidden="true">
      <i />
      {tick != null && <b style={{ left: `${Math.max(0, Math.min(1, tick)) * 100}%` }} />}
    </span>
  );
}

/** Position in an entrance sequence; the CSS turns it into a delay. */
export const stagger = (i: number): CSSProperties => ({ '--i': Math.min(i, 14) }) as CSSProperties;

/** Signal-matrix shade: lilac below the 2× bar, coral above it. */
export const heatLevel = (x: number | null) => {
  if (x == null) return 0;
  if (x < 1) return 1;
  if (x < 1.5) return 3;
  if (x < 2) return 5;
  if (x < 3) return 6;
  if (x < 8) return 7;
  return 8;
};

/** Daily reach (views for reels, likes + comments otherwise). */
export function reachSeries(history: MetricPoint[], isReel: boolean) {
  return history
    .map((h) => ({
      date: h.date,
      value: isReel ? h.views : h.likes == null && h.comments == null ? null : (h.likes ?? 0) + (h.comments ?? 0),
    }))
    .filter((p): p is { date: string; value: number } => p.value != null);
}

export const SCRIPT_STATUS: Record<ScriptStatus, { label: string; cls: string }> = {
  draft: { label: 'Needs review', cls: '' },
  needs_fix: { label: 'Needs fixes', cls: 'tag-fix' },
  approved: { label: 'Approved', cls: 'tag-approved' },
  rejected: { label: 'Rejected', cls: 'tag-rejected' },
};

export function ScriptTag({ status }: { status: ScriptStatus }) {
  const s = SCRIPT_STATUS[status] ?? { label: status, cls: '' };
  return <span className={`status-tag ${s.cls}`}>{s.label}</span>;
}

/** A loose cluster of posts and the one that broke away from it. */
export function BrandMark() {
  return (
    <svg className="brand-symbol brand-mark" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="4.5" cy="17" r="2.5" />
      <circle cx="9.5" cy="20.2" r="2" />
      <circle cx="9.2" cy="13.6" r="2.2" />
      <circle cx="14" cy="17.6" r="1.8" />
      <circle className="mark-ring" cx="18" cy="6" r="5" />
      <circle className="mark-outlier" cx="18" cy="6" r="3.3" />
    </svg>
  );
}
