import { useMemo, useState } from 'react';
import type { Competitor, KindFilter, Post } from '../types';
import type { Result } from '../format';
import { ageAgo, dayLabel, fmtCompact, fmtShortDate, fmtX, resultOf } from '../format';
import { Icon, ScoreInfo, Thumb, stagger } from './common';
import { matchesKind } from './TrendingPage';

type SortKey = 'reach' | 'outperformance' | 'score' | 'posted_at';

type Props = {
  posts: Post[];
  competitors: Competitor[];
  day: string;
  competitorId: number | null;
  onCompetitor: (id: number | null) => void;
  kind: KindFilter;
  onKind: (k: KindFilter) => void;
  onOpen: (id: number, list: number[]) => void;
  onToast: (msg: string) => void;
};

const MEDIA: { id: Post['media_type']; label: string }[] = [
  { id: 'reel', label: 'Reels' },
  { id: 'image', label: 'Images' },
  { id: 'carousel', label: 'Carousels' },
];
const RESULTS: Result[] = ['Scored · trending', 'Scored · watch', 'Scored · not trending', 'Not scored'];
const TAG: Record<Result, string> = {
  'Scored · trending': 'tag-trending',
  'Scored · watch': 'tag-watch',
  'Scored · not trending': '',
  'Not scored': '',
};

const csvCell = (v: unknown) => {
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function PostsPage(props: Props) {
  const { posts, competitors, day, competitorId, onCompetitor, kind, onKind, onOpen } = props;
  const [query, setQuery] = useState('');
  const [result, setResult] = useState<Result | 'all'>('all');
  const [media, setMedia] = useState<Post['media_type'] | 'all'>('all');
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'outperformance', dir: -1 });

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return posts
      .filter(
        (p) =>
          (competitorId == null || p.competitor_id === competitorId) &&
          matchesKind(p, kind) &&
          (media === 'all' || p.media_type === media) &&
          (result === 'all' || resultOf(p) === result) &&
          (!q || `${p.competitor} ${p.creator} ${p.caption_full}`.toLowerCase().includes(q)),
      )
      .sort((a, b) => {
        const va = a[sort.key];
        const vb = b[sort.key];
        if (va == null && vb == null) return 0;
        if (va == null) return 1; // empty values last either way
        if (vb == null) return -1;
        return (va < vb ? -1 : va > vb ? 1 : 0) * sort.dir;
      });
  }, [posts, competitorId, kind, media, result, query, sort]);

  const ids = rows.map((r) => r.post_id);
  const toggle = (key: SortKey) => setSort((s) => (s.key === key ? { key, dir: s.dir === 1 ? -1 : 1 } : { key, dir: -1 }));
  const arrow = (key: SortKey) => (sort.key === key ? (sort.dir < 0 ? '↓' : '↑') : '');
  const ariaSort = (key: SortKey) => (sort.key === key ? (sort.dir < 0 ? 'descending' : 'ascending') : 'none');

  const exportCsv = () => {
    const head = ['competitor', 'type', 'creator', 'posted_at', 'reach', 'reach_unit', 'x_usual', 'score', 'result', 'caption', 'url'];
    const lines = rows.map((p) =>
      [p.competitor, p.kind, p.creator, p.posted_at, p.reach, p.reach_unit, p.outperformance?.toFixed(2), p.score, resultOf(p), p.caption_full, p.ig_url]
        .map(csvCell)
        .join(','),
    );
    const blob = new Blob([[head.join(','), ...lines].join('\n')], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `outlier-posts-${day}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
    props.onToast(`Exported ${rows.length} posts`);
  };

  return (
    <div className="page-shell">
      <div className="page-intro">
        <div>
          <span className="section-index">POST LIBRARY · {dayLabel(day).toUpperCase()}</span>
          <h1>All posts</h1>
          <p>Every post tracked across your competitors, sorted against its usual performance.</p>
        </div>
        <button type="button" className="button button-secondary" onClick={exportCsv} disabled={!rows.length}>
          <Icon name="download" /> Export
        </button>
      </div>

      <div className="post-filter-bar">
        <label className="search-field">
          <Icon name="search" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search caption or creator" aria-label="Search caption or creator" />
        </label>
        <select value={competitorId ?? ''} onChange={(e) => onCompetitor(e.target.value ? Number(e.target.value) : null)} aria-label="Competitor">
          <option value="">All brands</option>
          {competitors.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select value={kind} onChange={(e) => onKind(e.target.value as KindFilter)} aria-label="Post type">
          <option value="all">All types</option>
          <option value="own">Own posts</option>
          <option value="collab">Creator collabs</option>
        </select>
        <select value={media} onChange={(e) => setMedia(e.target.value as Post['media_type'] | 'all')} aria-label="Media type">
          <option value="all">All media</option>
          {MEDIA.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label} ({posts.filter((p) => p.media_type === m.id).length})
            </option>
          ))}
        </select>
        <select value={result} onChange={(e) => setResult(e.target.value as Result | 'all')} aria-label="Result">
          <option value="all">All results</option>
          {RESULTS.map((r) => (
            <option key={r}>{r}</option>
          ))}
        </select>
        <span className="results-count">{rows.length} posts shown</span>
      </div>

      <div className="table-wrap">
        <table className="posts-table">
          <thead>
            <tr>
              <th>POST</th>
              <th>COMPETITOR</th>
              <th aria-sort={ariaSort('posted_at')}>
                <button type="button" onClick={() => toggle('posted_at')}>
                  DATE POSTED {arrow('posted_at')}
                </button>
              </th>
              <th aria-sort={ariaSort('reach')}>
                <button type="button" onClick={() => toggle('reach')}>
                  REACH {arrow('reach')}
                </button>
              </th>
              <th aria-sort={ariaSort('outperformance')}>
                <button type="button" onClick={() => toggle('outperformance')}>
                  × USUAL {arrow('outperformance')}
                </button>
              </th>
              <th aria-sort={ariaSort('score')}>
                <span className="th-with-info">
                  <button type="button" onClick={() => toggle('score')}>
                    SCORE {arrow('score')}
                  </button>
                  <ScoreInfo />
                </span>
              </th>
              <th>RESULT</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p, i) => {
              const r = resultOf(p);
              return (
                <tr
                  key={p.post_id}
                  className="rise"
                  style={stagger(i)}
                  tabIndex={0}
                  onClick={() => onOpen(p.post_id, ids)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onOpen(p.post_id, ids);
                    }
                  }}
                >
                  <td>
                    <div className="table-post">
                      <Thumb src={p.thumbnail} label={p.competitor} />
                      <span>
                        <b>{p.caption || 'No caption'}</b>
                        <small>{p.creator ? `@${p.creator}` : `@${p.handle}`}</small>
                      </span>
                    </div>
                  </td>
                  <td>{p.competitor}</td>
                  <td>
                    {fmtShortDate(p.posted_at)} · {ageAgo(p.age_days)}
                  </td>
                  <td>
                    {fmtCompact(p.reach)} <small style={{ color: 'var(--muted)' }}>{p.media_type === 'reel' ? 'views' : 'interactions'}</small>
                  </td>
                  <td className="table-lift">{p.scored ? fmtX(p.outperformance) : '—'}</td>
                  <td>{p.score == null ? '—' : p.score.toFixed(2)}</td>
                  <td>
                    <span className={`status-tag ${TAG[r]}`} title={r === 'Not scored' ? p.not_scored_reason : undefined}>
                      {r}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {rows.length === 0 && <div className="empty-state">No posts match those filters.</div>}
      </div>
    </div>
  );
}
