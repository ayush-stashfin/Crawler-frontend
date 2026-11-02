import { useEffect, useRef, useState } from 'react';
import type { AuthUser, Run } from '../types';
import { dayLabel, fmtDateTime, fmtInt, readableError, timeAgo } from '../format';
import { BrandMark, CountUp, Icon, roundInt, useGlider } from './common';

export type Page = 'trending' | 'posts' | 'competitors' | 'scripts';

const NAV: { id: Page; label: string; icon: string }[] = [
  { id: 'trending', label: 'Trending', icon: 'trending_up' },
  { id: 'posts', label: 'All posts', icon: 'article' },
  { id: 'competitors', label: 'Competitors', icon: 'groups' },
  { id: 'scripts', label: 'Scripts', icon: 'edit_note' },
];

type SidebarProps = {
  page: Page;
  onPage: (p: Page) => void;
  toReview: number;
  user: AuthUser | null;
  onSignOut: () => void;
  collapsed: boolean;
  onToggle: () => void;
};

export function Sidebar({ page, onPage, toReview, user, onSignOut, collapsed, onToggle }: SidebarProps) {
  const [navRef, glide] = useGlider<HTMLElement>(`${page}-${collapsed}`);
  return (
    <aside className="sidebar" aria-label="Main navigation">
      <a className="brand" href="#trending" aria-label="StashCrawl home" onClick={() => onPage('trending')}>
        <BrandMark />
        StashCrawl
      </a>
      <nav className="side-nav" ref={navRef}>
        <span className="glider" style={glide} aria-hidden="true" />
        {NAV.map((n) => (
          <button
            key={n.id}
            type="button"
            className={`side-link ${page === n.id ? 'active' : ''}`}
            aria-current={page === n.id ? 'page' : undefined}
            title={collapsed ? n.label : undefined}
            onClick={() => onPage(n.id)}
          >
            <Icon name={n.icon} />
            <span>{n.label}</span>
            {n.id === 'scripts' && toReview > 0 && <span className="nav-badge">{toReview}</span>}
          </button>
        ))}
      </nav>
      <div className="sidebar-bottom">
        <button
          type="button"
          className="side-link nav-toggle"
          onClick={onToggle}
          aria-expanded={!collapsed}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          <Icon name={collapsed ? 'left_panel_open' : 'left_panel_close'} />
          <span>Collapse</span>
        </button>
        <div className="user-profile">
          <UserAvatar user={user} />
          <span>
            <b>{user ? user.name : 'Stashfin'}</b>
            <small>{user ? user.email : 'Marketing team'}</small>
          </span>
          {user && (
            <button type="button" className="sign-out" onClick={onSignOut} aria-label="Sign out" title="Sign out">
              <Icon name="logout" />
            </button>
          )}
        </div>
      </div>
    </aside>
  );
}

function UserAvatar({ user }: { user: AuthUser | null }) {
  const [failed, setFailed] = useState(false);
  const initial = (user?.name || 'Stashfin').slice(0, 1).toUpperCase();
  return (
    <span className="user-avatar" aria-hidden="true">
      {user?.picture && !failed ? <img src={user.picture} alt="" referrerPolicy="no-referrer" onError={() => setFailed(true)} /> : initial}
    </span>
  );
}

type TopbarProps = {
  page: Page;
  onPage: (p: Page) => void;
  counts: { trending: number; posts: number; competitors: number };
  days: string[];
  day: string | null;
  onDay: (d: string) => void;
  runs: Run[];
  onReload: () => void;
  reloading: boolean;
  onSearch: () => void;
  theme: 'light' | 'dark';
  onTheme: () => void;
  onSignOut?: () => void;
};

const TABS: { id: Page; label: string; count: 'trending' | 'posts' | 'competitors' }[] = [
  { id: 'trending', label: 'Trending', count: 'trending' },
  { id: 'posts', label: 'All posts', count: 'posts' },
  { id: 'competitors', label: 'Competitors', count: 'competitors' },
];

/** Closes a popover on an outside click or Escape. */
function useDismiss(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && close();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, close]);
  return ref;
}

export function Topbar(props: TopbarProps) {
  const { page, onPage, counts, days, day, onDay } = props;
  const [dayMenu, setDayMenu] = useState(false);
  const [runsOpen, setRunsOpen] = useState(false);
  const dayRef = useDismiss(dayMenu, () => setDayMenu(false));
  const runsRef = useDismiss(runsOpen, () => setRunsOpen(false));

  const idx = day ? days.indexOf(day) : -1; // days are newest first
  const older = idx >= 0 && idx < days.length - 1 ? days[idx + 1] : null;
  const newer = idx > 0 ? days[idx - 1] : null;
  const last = props.runs[0];
  const [tabsRef, glide] = useGlider<HTMLDivElement>(page);
  const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

  return (
    <header className="topbar">
      <div className="top-tabs" role="tablist" aria-label="Dashboard views" ref={tabsRef}>
        <span className="glider" style={glide} aria-hidden="true" />
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            type="button"
            aria-selected={page === t.id}
            className={`top-tab ${page === t.id ? 'active' : ''}`}
            onClick={() => onPage(t.id)}
          >
            {t.label}{' '}
            <span>
              <CountUp value={counts[t.count]} format={roundInt} />
            </span>
          </button>
        ))}
      </div>
      <div className="top-controls">
        <div className="day-picker-wrap" ref={dayRef}>
          <div className="day-control">
            <button type="button" className="icon-button" disabled={!older} onClick={() => older && onDay(older)} aria-label="Previous day">
              ‹
            </button>
            <button type="button" className="day-picker" onClick={() => setDayMenu((o) => !o)} aria-expanded={dayMenu} disabled={!days.length}>
              {dayLabel(day)} <span>⌄</span>
            </button>
            <button type="button" className="icon-button" disabled={!newer} onClick={() => newer && onDay(newer)} aria-label="Next day">
              ›
            </button>
          </div>
          <div className={`day-dropdown ${dayMenu ? 'open' : ''}`}>
            {days.map((d) => (
              <button
                key={d}
                type="button"
                className={d === day ? 'active' : ''}
                onClick={() => {
                  onDay(d);
                  setDayMenu(false);
                }}
              >
                {dayLabel(d)}
              </button>
            ))}
          </div>
        </div>

        <div className="pipeline-wrap" ref={runsRef}>
          <button type="button" className="pipeline-pill" onClick={() => setRunsOpen((o) => !o)} aria-expanded={runsOpen}>
            <i style={last?.status === 'failed' ? { background: 'var(--coral)' } : last?.status === 'running' ? { background: '#e8b04f' } : undefined} />
            <span>
              {!last ? 'No runs yet' : last.status === 'running' ? 'Pipeline running…' : `Updated ${timeAgo(last.finished_at ?? last.started_at)}`}
            </span>
          </button>
          <div className={`pipeline-popover ${runsOpen ? 'open' : ''}`}>
            <div className="pipeline-popover-head">
              <b>Recent runs</b>
              <button type="button" className="text-link" onClick={props.onReload} disabled={props.reloading}>
                {props.reloading ? 'Reloading…' : 'Reload data'}
              </button>
            </div>
            {props.runs.length === 0 && <div className="pipeline-empty">No pipeline runs recorded yet.</div>}
            {props.runs.slice(0, 8).map((r) => (
              <div className="run-row" key={r.run_id}>
                <i className={r.status === 'failed' ? 'run-error' : r.status === 'running' ? 'run-pending' : ''} />
                <span>
                  <b>
                    {fmtDateTime(r.started_at)} · <span style={{ textTransform: 'capitalize' }}>{r.kind}</span>
                  </b>
                  <small>
                    {r.status === 'failed'
                      ? readableError(r.error || 'The run stopped.')
                      : `${fmtInt(r.snapshots)} snapshots · ${fmtInt(r.scored)} scored · ${fmtInt(r.trending)} trending`}
                  </small>
                </span>
                {r.status === 'failed' ? (
                  <span className="run-failed">Failed</span>
                ) : r.status === 'running' ? (
                  <span className="run-running">Running</span>
                ) : (
                  <span className="run-ok">Complete</span>
                )}
              </div>
            ))}
          </div>
        </div>

        <button
          type="button"
          className={`refresh-button ${props.reloading ? 'is-busy' : ''}`}
          onClick={props.onReload}
          disabled={props.reloading}
          aria-label={props.reloading ? 'Refreshing' : 'Refresh data'}
          title="Refresh data"
        >
          <Icon name="refresh" />
          <span>{props.reloading ? 'Refreshing…' : 'Refresh'}</span>
        </button>
        <button type="button" className="global-search" onClick={props.onSearch} aria-keyshortcuts="Meta+K Control+K">
          <Icon name="search" />
          <span>Search posts, brands, days</span>
          <kbd>{isMac ? '⌘' : 'Ctrl'} K</kbd>
        </button>
        <button type="button" className="theme-toggle" onClick={props.onTheme} aria-label={`Switch to ${props.theme === 'light' ? 'dark' : 'light'} theme`}>
          <Icon name={props.theme === 'light' ? 'light_mode' : 'dark_mode'} />
        </button>
        {props.onSignOut && (
          <button type="button" className="theme-toggle topbar-signout" onClick={props.onSignOut} aria-label="Sign out">
            <Icon name="logout" />
          </button>
        )}
      </div>
    </header>
  );
}
