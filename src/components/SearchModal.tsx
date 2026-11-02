import { useEffect, useRef, useState } from 'react';
import type { KeyboardEvent, ReactNode } from 'react';
import type { Competitor, Post, ScriptSummary } from '../types';
import type { Page } from './Shell';
import { dayLabel, fmtX } from '../format';
import { BrandAvatar, Icon } from './common';
import { Modal } from './Dialog';

type Item = { id: string; group: string; label: string; sub?: string; meta?: ReactNode; icon: ReactNode; run: () => void };

type Props = {
  onClose: () => void;
  posts: Post[];
  competitors: Competitor[];
  scripts: ScriptSummary[];
  days: string[];
  onPage: (p: Page) => void;
  onDay: (d: string) => void;
  onBrand: (id: number) => void;
  onOpenPost: (id: number, list: number[]) => void;
  onScript: (postId: number) => void;
};

const VIEWS: { id: Page; label: string; icon: string }[] = [
  { id: 'trending', label: 'Trending today', icon: 'trending_up' },
  { id: 'posts', label: 'All posts', icon: 'article' },
  { id: 'competitors', label: 'Competitors', icon: 'groups' },
  { id: 'scripts', label: 'Scripts', icon: 'edit_note' },
];

/** Every query word must appear somewhere in the item. */
export function SearchModal(props: Props) {
  const { onClose, posts, competitors, scripts, days } = props;
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => inputRef.current?.focus(), []);
  useEffect(() => setActive(0), [query]);
  useEffect(() => listRef.current?.querySelector('.active')?.scrollIntoView({ block: 'nearest' }), [active]);

  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const hit = (text: string) => words.every((w) => text.toLowerCase().includes(w));
  const go = (fn: () => void) => () => {
    onClose();
    fn();
  };

  const views: Item[] = VIEWS.filter((v) => hit(`view ${v.label}`)).map((v) => ({
    id: `v-${v.id}`,
    group: 'Views',
    label: v.label,
    icon: <Icon name={v.icon} />,
    run: go(() => props.onPage(v.id)),
  }));
  const brands: Item[] = competitors
    .filter((c) => hit(`${c.name} ${c.handle} brand competitor`))
    .map((c) => ({
      id: `c-${c.id}`,
      group: 'Competitors',
      label: c.name,
      sub: `@${c.handle} · ${c.posts_tracked} posts`,
      meta: c.trending ? `${c.trending} trending` : undefined,
      icon: <BrandAvatar name={c.name} src={c.avatar} />,
      run: go(() => props.onBrand(c.id)),
    }));
  const found = posts
    .filter((p) => (words.length ? hit(`${p.competitor} ${p.creator} ${p.kind} ${p.caption_full} ${p.trending ? 'trending breakout' : ''}`) : p.trending))
    .sort((a, b) => (b.score ?? -1) - (a.score ?? -1))
    .slice(0, 8);
  const foundIds = found.map((p) => p.post_id);
  const postItems: Item[] = found.map((p) => ({
    id: `p-${p.post_id}`,
    group: words.length ? 'Posts' : 'Today’s breakouts',
    label: p.caption || 'No caption',
    sub: `${p.competitor} · ${p.kind}${p.creator ? ` · @${p.creator}` : ''}`,
    meta: p.scored ? <strong>{fmtX(p.outperformance)}</strong> : undefined,
    icon: <BrandAvatar name={p.competitor} />,
    run: go(() => props.onOpenPost(p.post_id, foundIds)),
  }));
  const scriptItems: Item[] = (words.length ? scripts.filter((s) => hit(`script ${s.title} ${s.competitor} ${s.product_name} ${s.caption}`)) : [])
    .slice(0, 5)
    .map((s) => ({
      id: `s-${s.post_id}`,
      group: 'Scripts',
      label: s.title,
      sub: `${s.competitor} · ${s.product_name} · v${s.version}`,
      icon: <Icon name="edit_note" />,
      run: go(() => props.onScript(s.post_id)),
    }));
  const dayItems: Item[] = days
    .filter((d) => words.length > 0 && hit(`day ${d} ${dayLabel(d)}`))
    .slice(0, 6)
    .map((d) => ({ id: `d-${d}`, group: 'Snapshot days', label: dayLabel(d), sub: d, icon: <Icon name="calendar_today" />, run: go(() => props.onDay(d)) }));

  const items = [...views, ...brands, ...postItems, ...scriptItems, ...dayItems];

  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      e.stopPropagation();
      setActive((a) => Math.min(items.length - 1, a + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      e.stopPropagation();
      setActive((a) => Math.max(0, a - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      items[active]?.run();
    }
  };

  let group = '';
  return (
    <Modal onClose={onClose} label="Search">
      <section className="search-modal" onKeyDown={onKey}>
        <div className="search-field-large">
          <Icon name="search" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search a post, competitor, script, day or view…"
            role="combobox"
            aria-expanded="true"
            aria-controls="search-results"
            aria-activedescendant={items[active] ? `si-${items[active].id}` : undefined}
          />
          <kbd>ESC</kbd>
        </div>
        <div className="search-results" id="search-results" role="listbox" ref={listRef}>
          {items.map((it, i) => {
            const head = it.group !== group;
            group = it.group;
            return (
              <div key={it.id} role="presentation">
                {head && <span className="mini-label" style={{ display: 'block' }}>{it.group.toUpperCase()}</span>}
                <button
                  type="button"
                  id={`si-${it.id}`}
                  role="option"
                  aria-selected={i === active}
                  className={`search-item ${i === active ? 'active' : ''}`}
                  onMouseMove={() => i !== active && setActive(i)}
                  onClick={it.run}
                  tabIndex={-1}
                >
                  {it.icon}
                  <span className="search-item-copy">
                    <span>{it.label}</span>
                    {it.sub && <small>{it.sub}</small>}
                  </span>
                  {it.meta}
                  <kbd>↵</kbd>
                </button>
              </div>
            );
          })}
          {items.length === 0 && <div className="search-empty">Nothing matches “{query}”.</div>}
        </div>
      </section>
    </Modal>
  );
}
