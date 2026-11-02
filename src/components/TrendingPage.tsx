import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { api } from '../api';
import type { Competitor, KindFilter, MatrixPost, Post } from '../types';
import { WATCH_MIN, ageAgo, dayLabel, fmtCompact, fmtX, typeLabel } from '../format';
import { BrandAvatar, Collapse, CollapseToggle, CountUp, Icon, InfoTip, Meter, ScoreInfo, Thumb, heatLevel, roundInt, stagger, useInView } from './common';

type Props = {
  posts: Post[];
  competitors: Competitor[];
  day: string;
  kind: KindFilter;
  onKind: (k: KindFilter) => void;
  selectedId: number | null;
  onOpen: (id: number, list: number[]) => void;
  onBrand: (competitorId: number) => void;
  onAllPosts: () => void;
  onCompetitors: () => void;
};

const KINDS: { id: KindFilter; label: string }[] = [
  { id: 'all', label: 'All types' },
  { id: 'own', label: 'Own posts' },
  { id: 'collab', label: 'Creator collabs' },
];

export const matchesKind = (p: Pick<Post, 'is_collab'>, kind: KindFilter) => kind === 'all' || (kind === 'collab') === p.is_collab;

function summary(trending: Post[], strongest: Post | undefined): ReactNode {
  if (!trending.length) return 'Nothing has cleared twice its usual reach yet. Posts close to the bar are under Rising.';
  const by = new Map<string, Post[]>();
  trending.forEach((p) => by.set(p.competitor, [...(by.get(p.competitor) ?? []), p]));
  const [leader, theirs] = [...by.entries()].sort((a, b) => b[1].length - a[1].length)[0];
  const collabs = theirs.filter((p) => p.is_collab).length;
  const lead = by.size === 1 ? `All from ${leader}` : `${leader} leads with ${theirs.length} of ${trending.length}`;
  const mix = collabs === theirs.length ? ', all creator collabs' : collabs ? `, ${collabs} of them creator collabs` : '';
  return (
    <>
      {lead}
      {mix}.
      {strongest && (
        <>
          {' '}
          The strongest is <b>{fmtX(strongest.outperformance)}</b> its usual {strongest.reach_unit}.
        </>
      )}
    </>
  );
}

export function TrendingPage(props: Props) {
  const { posts, competitors, day, kind, onKind, selectedId, onOpen } = props;
  const visible = posts.filter((p) => matchesKind(p, kind));
  const trending = visible.filter((p) => p.trending).sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  const scored = visible.filter((p) => p.scored);
  const strongest = scored.slice().sort((a, b) => (b.outperformance ?? 0) - (a.outperformance ?? 0))[0];
  const rising = visible
    .filter((p) => !p.trending && p.scored && (p.outperformance ?? 0) >= WATCH_MIN)
    .sort((a, b) => (b.outperformance ?? 0) - (a.outperformance ?? 0))
    .slice(0, 6);
  const trendingIds = trending.map((p) => p.post_id);
  const breakoutsRef = useInView<HTMLElement>();
  const risingRef = useInView<HTMLElement>();
  const [risingOpen, setRisingOpen] = useState(false);

  const board = competitors
    .map((c) => {
      const mine = visible.filter((p) => p.competitor_id === c.id);
      const best = mine.filter((p) => p.scored).sort((a, b) => (b.outperformance ?? 0) - (a.outperformance ?? 0))[0];
      return {
        c,
        trending: mine.filter((p) => p.trending).length,
        best: best?.outperformance ?? null,
      };
    })
    .sort((a, b) => b.trending - a.trending || (b.best ?? 0) - (a.best ?? 0));
  // Board bars on a log scale so a 29× post doesn't flatten everyone else.
  const boardMax = Math.log1p(Math.max(1, ...board.map((b) => b.best ?? 0)));

  return (
    <div className="workspace">
      <div className="content-column">
        <section className="hero">
          <div className="hero-kicker">
            <span className="status-dot" /> {dayLabel(day).toUpperCase()} <span className="hero-divider">/</span> DAILY SNAPSHOT
          </div>
          <h1>
            <span className="hero-count">
              <CountUp value={trending.length} format={roundInt} />
            </span>{' '}
            {trending.length === 1 ? 'post is' : 'posts are'} breaking out
          </h1>
          <p>{summary(trending, strongest)}</p>
          <div className="hero-layout">
            <div className="metric-strip spot">
              <article className="metric">
                <span>
                  Posts scored
                  <InfoTip label="What posts scored means">
                    <b>Posts scored</b>
                    The posts we could judge today. We judge a post once it’s 12 hours old and stop at 14 days, when it has mostly stopped growing. We also need
                    enough of the brand’s older posts to compare it with. Every other post is still tracked, just not judged.
                  </InfoTip>
                </span>
                <strong>
                  <CountUp value={scored.length} format={roundInt} />
                </strong>
                <small>of {visible.length} tracked posts</small>
                <Meter value={visible.length ? scored.length / visible.length : 0} />
              </article>
              <article className="metric">
                <span>
                  Strongest
                  <InfoTip label="What strongest means">
                    <b>Strongest</b>
                    Today’s best post, compared with what that brand normally gets. 29× means it got 29 times the views the brand’s posts usually have at the
                    same age.
                  </InfoTip>
                </span>
                <strong className="coral">
                  <CountUp value={strongest?.outperformance ?? null} format={fmtX} />
                </strong>
                <small>usual {strongest?.reach_unit ?? 'reach'}</small>
                <Meter value={strongest?.outperformance ? 1 : 0} tone="coral" tick={strongest?.outperformance ? 2 / strongest.outperformance : undefined} />
              </article>
              <article className="metric">
                <span>
                  Bar to clear
                  <InfoTip label="What the bar to clear means">
                    <b>Bar to clear</b>
                    To count as trending, a post needs at least 2× (twice) the views its brand usually gets. It must also still be growing, and be in the day’s
                    top 5.
                  </InfoTip>
                </span>
                <strong>2×</strong>
                <small>
                  {trending.length} of {scored.length} cleared it
                </small>
                <Meter value={scored.length ? trending.length / scored.length : 0} tone="coral" />
              </article>
            </div>
            <section className="competitor-board spot">
              <div className="section-title">
                <div>
                  <span className="section-index">BRANDS</span>
                  <h2>Competitor breakout board</h2>
                </div>
                <button type="button" className="text-link" onClick={props.onCompetitors}>
                  View all <Icon name="arrow_forward" />
                </button>
              </div>
              <div className="board-list">
                {board.slice(0, 4).map(({ c, trending: n, best }, i) => (
                  <button
                    key={c.id}
                    type="button"
                    className="board-row rise"
                    style={stagger(i + 2)}
                    onClick={() => props.onBrand(c.id)}
                    title={`See ${c.name}'s posts`}
                  >
                    <BrandAvatar name={c.name} src={c.avatar} />
                    <b>{c.name}</b>
                    <span className="board-count">{n}</span>
                    <span
                      className={`board-bar ${n ? 'hot' : ''}`}
                      style={
                        {
                          '--v': best ? Math.log1p(best) / boardMax : 0,
                        } as CSSProperties
                      }
                    />
                    <strong className={n ? '' : 'muted-x'}>
                      <CountUp value={best} format={fmtX} />
                    </strong>
                  </button>
                ))}
              </div>
            </section>
          </div>
          <div className="post-filters" role="group" aria-label="Post type">
            <span>Show</span>
            {KINDS.map((k) => (
              <button
                key={k.id}
                type="button"
                className={`segmented ${kind === k.id ? 'active' : ''}`}
                aria-pressed={kind === k.id}
                onClick={() => onKind(k.id)}
              >
                {k.label}
              </button>
            ))}
          </div>
        </section>

        <section className="breakouts-section reveal" ref={breakoutsRef}>
          <div className="section-title">
            <div>
              <span className="section-index">01 · {dayLabel(day) === 'Today' ? 'TODAY’S' : 'THE DAY’S'} TOP FIVE</span>
              <h2>
                Breakouts
                <ScoreInfo />
              </h2>
            </div>
            <button type="button" className="text-link" onClick={props.onAllPosts}>
              All posts <Icon name="arrow_forward" />
            </button>
          </div>
          {trending.length ? (
            <div className="breakout-grid">
              {trending.map((p, i) => (
                <BreakoutCard
                  key={p.post_id}
                  index={i}
                  post={p}
                  rank={i + 1}
                  selected={p.post_id === selectedId}
                  onOpen={() => onOpen(p.post_id, trendingIds)}
                />
              ))}
            </div>
          ) : (
            <div className="empty-block">Nothing cleared the 2× bar for this post type. Try another type or day.</div>
          )}
        </section>

        <SignalMatrix posts={visible} competitors={competitors} day={day} kind={kind} onOpen={onOpen} />

        <section className="rising-section reveal" ref={risingRef}>
          <div className="section-title">
            <div>
              <span className="section-index">03 · POSTS CLOSE TO BREAKING OUT</span>
              <h2>
                <CollapseToggle open={risingOpen} onToggle={() => setRisingOpen((o) => !o)} controls="rising-body">
                  Rising
                  <small className="collapse-count">
                    {rising.length} {rising.length === 1 ? 'post' : 'posts'}
                  </small>
                </CollapseToggle>
                <InfoTip label="What rising means">
                  <b>What is Rising?</b>
                  Posts that are doing well but haven’t become breakouts yet.
                  <ul>
                    <li>They already have {WATCH_MIN}× or more of the views their brand usually gets.</li>
                    <li>A breakout needs 2×, so these are close but not there yet.</li>
                    <li>If they keep growing, they can show up under Breakouts in a day or two.</li>
                  </ul>
                  <p>Example: “1.8× usual views” means the post has almost twice the views that brand’s posts normally have at the same age.</p>
                </InfoTip>
              </h2>
            </div>
            <button
              type="button"
              className={`text-link fade-toggle ${risingOpen ? '' : 'is-hidden'}`}
              onClick={props.onAllPosts}
              aria-hidden={!risingOpen}
              tabIndex={risingOpen ? undefined : -1}
            >
              See all posts <Icon name="arrow_forward" />
            </button>
          </div>
          <Collapse open={risingOpen} id="rising-body">
            {rising.length ? (
              <div className="rising-list">
                {rising.map((p, i) => (
                  <button
                    key={p.post_id}
                    type="button"
                    className="rising-row rise spot"
                    style={stagger(i)}
                    onClick={() =>
                      onOpen(
                        p.post_id,
                        rising.map((r) => r.post_id),
                      )
                    }
                  >
                    <BrandAvatar name={p.competitor} />
                    <b>{p.competitor}</b>
                    <strong>{fmtX(p.outperformance)}</strong>
                    <span className="usual-label">usual {p.reach_unit}</span>
                    <span className="badge badge-purple">Worth watching</span>
                    <span className="rising-caption">{p.caption || 'No caption'}</span>
                    <Icon name="arrow_forward" />
                  </button>
                ))}
              </div>
            ) : (
              <div className="empty-block">No other post is above {WATCH_MIN}× its usual reach.</div>
            )}
          </Collapse>
        </section>
      </div>
    </div>
  );
}

function BreakoutCard({ post: p, index, rank, selected, onOpen }: { post: Post; index: number; rank: number; selected: boolean; onOpen: () => void }) {
  const [details, setDetails] = useState(false);
  const cardRef = useRef<HTMLElement>(null);
  const isReel = p.media_type === 'reel';
  const toggleDetails = () => {
    if (!details) scrollToFit(cardRef.current);
    setDetails(!details);
  };
  return (
    <article ref={cardRef} className={`breakout-card rise spot tilt ${selected ? 'selected' : ''}`} style={stagger(index + 1)}>
      <button type="button" className="card-open" onClick={onOpen} aria-label={`Open ${p.competitor} post, ${fmtX(p.outperformance)} usual`}>
        <div className="card-top">
          <span className="rank">{String(rank).padStart(2, '0')}</span>
          <span className="brand-pill">
            <BrandAvatar name={p.competitor} />
            <b>{p.competitor}</b>
          </span>
        </div>
        <div className="card-media">
          <Thumb src={p.thumbnail} label={p.competitor} kind={p.media_type} />
          <span className="media-type-tag">{p.is_collab ? 'Creator collab' : 'Own post'}</span>
          {isReel && <span className="media-play">▶</span>}
        </div>
        <div className="post-caption">{p.caption || 'No caption'}</div>
        <div className="lift-row">
          <strong>
            <CountUp value={p.outperformance} format={fmtX} duration={900} />
          </strong>
          <span>usual {isReel ? 'views' : 'reach'}</span>
        </div>
        <div className="badge-row">
          <span className="badge badge-coral">
            <i className="live-dot" />
            Trending {Math.max(1, p.trending_days)}d
          </span>
          {p.paid_partnership && (
            <span className="badge badge-purple" title="Paid partnership">
              Paid
            </span>
          )}
        </div>
      </button>
      <button type="button" className="card-details-toggle" aria-expanded={details} aria-controls={`card-details-${p.post_id}`} onClick={toggleDetails}>
        Details <Icon name="expand_more" />
      </button>
      <Collapse open={details} id={`card-details-${p.post_id}`}>
        <dl className="card-details">
          <div>
            <dt>{isReel ? 'Views' : 'Interactions'}</dt>
            <dd>{fmtCompact(p.reach)}</dd>
          </div>
          <div>
            <dt>Posted</dt>
            <dd>{ageAgo(p.age_days)}</dd>
          </div>
          <div>
            <dt>
              Trend score
              <InfoTip label="What the trend score means">
                <b>Trend score</b>
                One number for how well this post is doing. It mixes how far above the brand’s usual it is (this counts most), how fast it’s still growing, and
                how much people like and comment on it.
                <p>0 is an ordinary post. The higher, the better. The five highest-scoring posts of the day are the breakouts.</p>
              </InfoTip>
            </dt>
            <dd>{p.score?.toFixed(2) ?? '–'}</dd>
          </div>
          <div>
            <dt>
              Pace
              <InfoTip label="What pace means">
                <b>Pace</b>
                How fast the post is still growing. We compare the views it gained since our last check with what the brand’s posts usually gain at the same
                age.
                <p>
                  1× is normal speed, 2× is twice as fast. A post needs at least 1× to count as trending. “–” means we’ve only checked it once, so there’s
                  nothing to compare yet.
                </p>
              </InfoTip>
            </dt>
            <dd>{p.velocity == null ? '–' : fmtX(p.velocity)}</dd>
          </div>
          <div>
            <dt>Likes</dt>
            <dd>{p.likes == null ? 'Hidden' : fmtCompact(p.likes)}</dd>
          </div>
          <div>
            <dt>Comments</dt>
            <dd>{fmtCompact(p.comments)}</dd>
          </div>
          <div>
            <dt>Type</dt>
            <dd>{p.paid_partnership ? `${typeLabel(p)} · paid` : typeLabel(p)}</dd>
          </div>
        </dl>
      </Collapse>
    </article>
  );
}

type Range = '1m' | '3m' | '6m' | '12m' | 'custom';
const RANGES: { id: Range; label: string; months: number }[] = [
  { id: '1m', label: '1M', months: 1 },
  { id: '3m', label: '3M', months: 3 },
  { id: '6m', label: '6M', months: 6 },
  { id: '12m', label: '12M', months: 12 },
];
const DAY_MS = 86_400_000;
const MAX_SPAN = 400; // days; the API refuses longer ranges
const RANGE_KEY = 'outlier-matrix-range';

const toTime = (d: string) => new Date(`${d}T00:00:00Z`).getTime();
const isoDay = (t: number) => new Date(t).toISOString().slice(0, 10);
const shortDate = (d: string) =>
  new Date(`${d}T00:00:00Z`).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });

/** The day after the same date `months` back, so one month before 26 Oct starts on 27 Sep. */
function monthsBack(end: string, months: number) {
  const d = new Date(`${end}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() - months);
  return isoDay(d.getTime() + DAY_MS);
}

function readRange(): { range: Range; from: string; to: string } {
  try {
    const saved = JSON.parse(localStorage.getItem(RANGE_KEY) ?? '{}');
    if (saved.range === 'custom' && saved.from && saved.to) return saved;
    if (RANGES.some((r) => r.id === saved.range)) return { range: saved.range, from: '', to: '' };
  } catch {
    // private window or bad JSON: fall back to a month
  }
  return { range: '1m', from: '', to: '' };
}

type MatrixProps = {
  posts: Post[];
  competitors: Competitor[];
  day: string;
  kind: KindFilter;
  onOpen: Props['onOpen'];
};

/** One cell per competitor per day (or week, for longer ranges), shaded by the best post's lift over that brand's usual. */
function SignalMatrix({ posts, competitors, day, kind, onOpen }: MatrixProps) {
  const [open, setOpen] = useState(false);
  const [saved] = useState(readRange);
  const [range, setRange] = useState<Range>(saved.range);
  const [custom, setCustom] = useState({ from: saved.from, to: saved.to });
  const preset = RANGES.find((r) => r.id === range);
  const start = preset ? monthsBack(day, preset.months) : custom.from;
  const end = preset ? day : custom.to;
  const span = start && end ? (toTime(end) - toTime(start)) / DAY_MS + 1 : 0;
  const invalid = span < 1 ? 'Pick a start date on or before the end date.' : span > MAX_SPAN ? 'Pick a range of 13 months or less.' : '';

  const key = `${start}|${end}|${day}`;
  const [data, setData] = useState<{ key: string; items: MatrixPost[] } | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    if (invalid) return;
    let live = true;
    setError('');
    api
      .matrix(start, end, day)
      .then((res) => live && setData({ key: `${start}|${end}|${day}`, items: res.items }))
      .catch((err) => live && setError(err instanceof Error ? err.message : String(err)));
    return () => {
      live = false;
    };
  }, [start, end, day, invalid]);

  const pick = (next: Range) => {
    // Custom starts from whatever range is showing, so it's a tweak rather than a blank form.
    const dates = next === 'custom' ? { from: start || monthsBack(day, 1), to: end || day } : { from: '', to: '' };
    setRange(next);
    setCustom(dates);
    try {
      localStorage.setItem(RANGE_KEY, JSON.stringify({ range: next, ...dates }));
    } catch {
      // not remembered; fine
    }
  };
  const setDate = (field: 'from' | 'to', value: string) => {
    const dates = { ...custom, [field]: value };
    setCustom(dates);
    try {
      localStorage.setItem(RANGE_KEY, JSON.stringify({ range: 'custom', ...dates }));
    } catch {
      // not remembered; fine
    }
  };

  // Up to six weeks shows days; anything longer shows weeks, counted back from the end date.
  const step = span <= 45 ? 1 : 7;
  const count = invalid ? 0 : Math.ceil(span / step);
  const columns = Array.from({ length: count }, (_, i) => {
    const last = toTime(end) - (count - 1 - i) * step * DAY_MS;
    return {
      from: isoDay(Math.max(toTime(start), last - (step - 1) * DAY_MS)),
      to: isoDay(last),
    };
  });
  const ready = data?.key === key && !invalid;
  const cells = new Map<string, MatrixPost[]>();
  if (ready) {
    data.items
      .filter((p) => matchesKind(p, kind))
      .forEach((p) => {
        const col = count - 1 - Math.floor((toTime(end) - toTime(p.day)) / DAY_MS / step);
        if (col < 0 || col >= count) return;
        const k = `${p.competitor_id}|${col}`;
        cells.set(k, [...(cells.get(k) ?? []), p]);
      });
  }
  const inPanel = new Set(posts.map((p) => p.post_id));
  const heading = preset
    ? `LAST ${preset.months === 1 ? 'MONTH' : `${preset.months} MONTHS`}`
    : start && end
      ? `${shortDate(start)} – ${shortDate(end)}`.toUpperCase()
      : 'CUSTOM RANGE';
  // Days: every fourth date. Weeks: the month name where a new month starts, unless the last name is too close.
  let named = -3;
  const labels = columns.map((c, i) => {
    if (step === 1) return (i % 4 === 0 && count - 1 - i > 2) || i === count - 1 ? String(Number(c.to.slice(8))) : ''; // skip a date that would crowd the last one
    if ((i && c.to.slice(5, 7) === columns[i - 1].to.slice(5, 7)) || i - named < 3) return '';
    if (i === 0 && count > 1 && c.to.slice(5, 7) !== columns[1].to.slice(5, 7)) return ''; // a stub of the previous month
    named = i;
    return new Date(`${c.to}T00:00:00Z`).toLocaleDateString('en-IN', {
      month: 'short',
      timeZone: 'UTC',
    });
  });

  const ref = useInView<HTMLElement>();
  return (
    <section className="heatmap-section reveal" ref={ref}>
      <div className="section-title">
        <div>
          <span className="section-index">
            02 · BEST POST OF EACH BRAND, BY {step === 7 ? 'WEEK' : 'DAY'} · {heading}
          </span>
          <h2>
            <CollapseToggle open={open} onToggle={() => setOpen((o) => !o)} controls="matrix-body">
              Signal matrix
            </CollapseToggle>
            <InfoTip label="How to read the signal matrix">
              <b>What is the signal matrix?</b>A calendar of every brand’s hits. Each row is one brand and each box is one {step === 7 ? 'week' : 'day'}. We
              take the brand’s best post from that {step === 7 ? 'week' : 'day'} and compare it with what that brand’s posts normally get.
              <ul>
                <li>
                  <b>Pale or empty box:</b> an ordinary {step === 7 ? 'week' : 'day'}, or no post at all.
                </li>
                <li>
                  <b>Purple box:</b> a post did better than usual, but under 2×.
                </li>
                <li>
                  <b>Red box:</b> a post got 2× or more its usual views. The darker the red, the bigger the hit.
                </li>
                <li>
                  <b>Red ring:</b> that post made the trending list.
                </li>
              </ul>
              <p>
                Example: a red box on Paytm’s row means Paytm posted something then that got at least twice its normal views. Click any box to see the post.
              </p>
            </InfoTip>
          </h2>
        </div>
        <div className={`range-picker ${open ? '' : 'is-hidden'}`} role="group" aria-label="Date range" aria-hidden={!open}>
          {RANGES.map((r) => (
            <button key={r.id} type="button" className={`segmented ${range === r.id ? 'active' : ''}`} aria-pressed={range === r.id} onClick={() => pick(r.id)}>
              {r.label}
            </button>
          ))}
          <button type="button" className={`segmented ${range === 'custom' ? 'active' : ''}`} aria-pressed={range === 'custom'} onClick={() => pick('custom')}>
            <Icon name="calendar_month" /> Custom
          </button>
        </div>
      </div>
      <Collapse open={open} id="matrix-body">
        {range === 'custom' && (
          <div className="range-custom">
            <label>
              From
              <input type="date" value={custom.from} max={custom.to || day} onChange={(e) => setDate('from', e.target.value)} />
            </label>
            <label>
              To
              <input type="date" value={custom.to} min={custom.from} max={day} onChange={(e) => setDate('to', e.target.value)} />
            </label>
            {invalid && (
              <span className="range-error" role="alert">
                {invalid}
              </span>
            )}
          </div>
        )}
        {error && !invalid && (
          <div className="range-error" role="alert">
            Couldn’t load this range ({error}).
          </div>
        )}
        <div
          className={`heatmap ${step === 7 ? 'by-week' : ''} ${count > 34 ? 'dense' : ''} ${ready || error ? '' : 'is-loading'}`}
          style={{ '--cols': Math.max(count, 1) } as CSSProperties}
          role="group"
          aria-label={`Best post per competitor per ${step === 7 ? 'week' : 'day'} posted`}
          aria-busy={!ready && !error}
        >
          <div className="heat-label" />
          {columns.map((c, i) => (
            <span key={c.to} className={`heat-day ${i === count - 1 && c.to === day ? 'is-today' : ''}`}>
              {labels[i]}
            </span>
          ))}
          {competitors.map((comp, row) => (
            <Row key={comp.id} name={comp.name}>
              {columns.map((c, col) => {
                const wave = {
                  '--d': Math.min(col, 30) + row * 2,
                } as CSSProperties;
                const here = (cells.get(`${comp.id}|${col}`) ?? []).slice().sort((a, b) => (b.lift ?? -1) - (a.lift ?? -1));
                const label = step === 1 || c.from === c.to ? shortDate(c.to) : `${shortDate(c.from)} – ${shortDate(c.to)}`;
                if (!here.length) return <span key={c.to} style={wave} className="heat-cell is-empty" aria-label={`${comp.name}, ${label}: no posts`} />;
                const best = here[0];
                const hot = here.some((p) => p.trending);
                const opens = inPanel.has(best.post_id);
                const summary = `${here.length} ${here.length === 1 ? 'post' : 'posts'}, best ${best.lift != null ? `${fmtX(best.lift)} usual` : 'not enough history'}${hot ? ', trending' : ''}`;
                return (
                  <button
                    key={c.to}
                    type="button"
                    style={wave}
                    className={`heat-cell heat-${heatLevel(best.lift)} ${hot ? 'is-trending' : ''}`}
                    aria-label={`${comp.name}, ${label}: ${summary}${opens ? '' : '. Opens on Instagram'}`}
                    title={`${comp.name} · ${label} · ${summary}${opens ? '' : ' · opens on Instagram'}`}
                    onClick={() =>
                      opens
                        ? onOpen(
                            best.post_id,
                            here.filter((p) => inPanel.has(p.post_id)).map((p) => p.post_id),
                          )
                        : window.open(best.ig_url, '_blank', 'noopener,noreferrer')
                    }
                  />
                );
              })}
            </Row>
          ))}
        </div>
        <ul className="heat-key" aria-label="What the colours mean">
          {HEAT_KEY.map(([cls, text]) => (
            <li key={cls}>
              <i className={cls} />
              {text}
            </li>
          ))}
        </ul>
      </Collapse>
    </section>
  );
}

/** Smoothly scrolls just enough that the card, with its details opened, ends on screen. */
function scrollToFit(card: HTMLElement | null) {
  const inner = card?.querySelector<HTMLElement>('.collapse-inner');
  if (!card || !inner) return;
  const bottomNav = window.innerWidth <= 560 ? 58 : 0; // the phone tab bar covers the bottom of the page
  const below = card.getBoundingClientRect().bottom + inner.scrollHeight + 16 - (window.innerHeight - bottomNav);
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  if (below > 0) window.scrollBy({ top: below, behavior: reduce ? 'auto' : 'smooth' });
}

/** The matrix key, in the same shades as the cells (see heatLevel). */
const HEAT_KEY: [string, string][] = [
  ['is-empty', 'No post'],
  ['heat-1', 'Below usual'],
  ['heat-5', 'Up to 2×'],
  ['heat-6', '2–3×'],
  ['heat-7', '3–8×'],
  ['heat-8', '8× or more'],
  ['is-trending', 'Trended'],
];

function Row({ name, children }: { name: string; children: ReactNode }) {
  return (
    <>
      <span className="heat-brand">{name}</span>
      {children}
    </>
  );
}
