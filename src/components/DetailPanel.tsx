import { useEffect, useState } from 'react';
import { api } from '../api';
import type { GenerateRun, Match, Post } from '../types';
import { ageAdjective, fmtCompact, fmtPct, fmtShortDate, fmtX, readableError, typeLabel } from '../format';
import { BrandAvatar, CountUp, Icon, ScoreInfo, Thumb, reachSeries } from './common';
import { GenerateProgress, STEP_INDEX, blockedReason, isMatched } from './Generate';

type Props = {
  post: Post;
  onClose: () => void;
  onReviewScript: (postId: number) => void;
  onToast: (msg: string) => void;
  generation?: GenerateRun;
  /** Resolves true when the run started. */
  onGenerate: (post: Post) => Promise<boolean>;
  onTrack: (postId: number) => void;
};

export function DetailPanel({ post: p, onClose, onReviewScript, onToast, generation, onGenerate, onTrack }: Props) {
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(p.ig_url);
      onToast('Post link copied');
    } catch {
      onToast("Couldn't copy the link. It's on the Open on Instagram button.");
    }
  };

  return (
    <aside className="detail-panel" aria-label={`${p.competitor} post details`}>
      <div className="detail-head">
        <BrandAvatar name={p.competitor} />
        <div>
          <b>{p.competitor}</b> <span>· {typeLabel(p)}</span>
        </div>
        <button type="button" className="close-detail" onClick={onClose} aria-label="Close post details">
          ×
        </button>
      </div>

      <div className="detail-feature">
        <Thumb src={p.thumbnail} label={p.competitor} kind={p.media_type} />
        <div className="detail-verdict">
          <strong>{p.scored ? <CountUp value={p.outperformance} format={fmtX} duration={900} /> : 'Not scored'}</strong>
          <b>{p.scored ? `usual ${p.reach_unit}` : 'Awaiting score'}</b>
          <span>{p.scored ? `for ${ageAdjective(p.age_days)} ${p.kind}` : p.not_scored_reason}</span>
        </div>
      </div>

      <h3 className="detail-caption">{p.caption || 'No caption'}</h3>

      <div className="detail-stats">
        <div>
          <span>{p.media_type === 'reel' ? 'Views' : 'Interactions'}</span>
          <b>{fmtCompact(p.reach)}</b>
        </div>
        <div>
          <span>Likes</span>
          <b>{p.likes == null ? 'Hidden' : fmtCompact(p.likes)}</b>
        </div>
        <div>
          <span>Comments</span>
          <b>{fmtCompact(p.comments)}</b>
        </div>
        <div>
          <span>Pace</span>
          <b>{p.velocity == null ? '—' : fmtX(p.velocity)}</b>
        </div>
      </div>

      <section className="detail-section">
        <div className="detail-section-head">
          <b>{p.media_type === 'reel' ? 'Views' : 'Interactions'} over time</b>
          <span>
            Typical post <i />
          </span>
        </div>
        <GrowthChart post={p} />
      </section>

      <section className="detail-section why-section">
        <b>{p.scored ? 'Why it scored this way' : 'Why it wasn’t scored'}</b>
        {p.scored && p.reasons.length > 0 ? (
          <ul className="reason-list">
            {p.reasons.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        ) : (
          <p>{p.scored ? 'The engine gave no reasons for this post.' : `This post is ${p.not_scored_reason}.`}</p>
        )}
        {p.scored && (
          <span className="score-note">
            Engagement <strong>{p.engagement == null ? '—' : `${fmtX(p.engagement)} usual`}</strong> <i>·</i> Trend score{' '}
            <strong>{p.score?.toFixed(2)}</strong>
            <ScoreInfo /> <i>·</i> {fmtX(p.outperformance)} the usual {p.reach_unit}
          </span>
        )}
      </section>

      <div className="detail-actions">
        <a className="button button-primary" href={p.ig_url} target="_blank" rel="noopener noreferrer">
          <Icon name="open_in_new" /> Open on Instagram
        </a>
        <button type="button" className="button button-secondary" onClick={copy}>
          <Icon name="link" /> Copy link
        </button>
      </div>

      <OurVersion post={p} onReviewScript={onReviewScript} generation={generation} onGenerate={onGenerate} onTrack={onTrack} />
    </aside>
  );
}

/**
 * Where this post is in teardown → match → script. The first button finds a product; once one is
 * matched, the panel shows why, and the script is only written when someone clicks for it.
 */
function OurVersion({
  post: p,
  onReviewScript,
  generation: run,
  onGenerate,
  onTrack,
}: {
  post: Post;
  onReviewScript: (id: number) => void;
  generation?: GenerateRun;
  onGenerate: (post: Post) => Promise<boolean>;
  onTrack: (postId: number) => void;
}) {
  const { teardown, match, script } = p.pipeline;
  // A run may have been started from another tab or before a reload.
  useEffect(() => {
    if (!script) onTrack(p.post_id);
  }, [p.post_id, script, onTrack]);

  const running = !!run?.running;
  const blocked = blockedReason(p);
  const matched = isMatched(p);
  const [why, setWhy] = useState<Match | null>(null);
  useEffect(() => {
    setWhy(null);
    if (!matched || script) return;
    let live = true;
    api
      .generateStatus(p.post_id)
      .then((res) => live && setWhy(res.match))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [p.post_id, matched, script]);

  const step = (done: boolean, failed = false) => (failed ? 'failed' : done ? 'done' : '');
  const current = running ? STEP_INDEX[run.step ?? 'teardown'] : !teardown ? 0 : !match ? 1 : !script ? 2 : 3;
  const note = script
    ? `Script v${script.version} is ready to review.`
    : blocked
      ? blocked
      : run?.error
        ? readableError(run.error)
        : teardown === 'failed'
          ? 'The last teardown failed. Try again, or the daily run retries it.'
          : matched
            ? 'The script is written only when you ask for it.'
            : teardown === 'done'
              ? 'Teardown done. Find a product to see which one fits and why.'
              : p.trending
                ? 'The daily run tears this down and matches a product. Or do it now.'
                : 'Not trending, but you can still turn it into a script.';

  return (
    <section className="our-version">
      <div>
        <b>Our version</b>
        <span>Turn this insight into a post for your brand.</span>
      </div>
      <div className="workflow-steps">
        <span className={current === 0 ? 'current' : step(teardown === 'done', teardown === 'failed')}>01 Teardown</span>
        <i>→</i>
        <span className={current === 1 ? 'current' : step(!!match && match !== 'none', match === 'none')}>02 Match</span>
        <i>→</i>
        <span className={current === 2 ? 'current' : step(!!script)}>03 Script</span>
      </div>
      {running ? <GenerateProgress run={run} /> : <span className={`pipeline-note ${run?.error ? 'error' : ''}`}>{note}</span>}
      {matched && !script && why && <MatchedProduct match={why} />}
      {script ? (
        <button type="button" className="button button-primary" onClick={() => onReviewScript(p.post_id)}>
          Review script <Icon name="arrow_forward" />
        </button>
      ) : matched && !blocked && !running ? (
        // Both open the post on the Scripts page, where "Why this product" is shown in full.
        <div className="our-version-actions">
          <button type="button" className="button button-secondary" onClick={() => onReviewScript(p.post_id)}>
            <Icon name="help" /> Want to know more why?
          </button>
          <button
            type="button"
            className="button button-primary"
            onClick={async () => {
              if (await onGenerate(p)) onReviewScript(p.post_id);
            }}
          >
            <Icon name="auto_awesome" /> {run?.error ? 'Try again' : 'Generate script'}
          </button>
        </div>
      ) : (
        !blocked &&
        !running && (
          <button type="button" className="button button-primary" onClick={() => onGenerate(p)}>
            <Icon name="auto_awesome" /> {run?.error || teardown === 'failed' ? 'Try again' : 'Find a product'}
          </button>
        )
      )}
    </section>
  );
}

/** Just the matched product; the reasons are on the Scripts page ("Want to know more why?"). */
function MatchedProduct({ match: m }: { match: Match }) {
  const strength = m.confidence >= 0.75 ? 'strong' : m.confidence >= 0.5 ? '' : 'weak';
  return (
    <div className="matched-product">
      <Icon name="sell" />
      <span>
        <small>Matched product</small>
        <b>{m.product_name ?? m.product_code}</b>
      </span>
      <span className={`match-pill ${strength}`}>{fmtPct(m.confidence)} match</span>
    </div>
  );
}

/** Reach per daily snapshot against the account's usual for this kind of post (flat line). */
function GrowthChart({ post: p }: { post: Post }) {
  const [hover, setHover] = useState<number | null>(null);
  const pts = reachSeries(p.history, p.media_type === 'reel');
  const usual = p.reach != null && p.outperformance ? p.reach / p.outperformance : null;
  if (pts.length < 2) {
    return (
      <p className="chart-note">
        One snapshot so far ({fmtCompact(pts[0]?.value ?? p.reach)} {p.reach_unit}
        {pts[0] ? ` on ${fmtShortDate(pts[0].date)}` : ''}
        {usual ? `; a typical post is at ${fmtCompact(usual)}` : ''}). The line appears after the next daily run.
      </p>
    );
  }
  const values = pts.map((x) => x.value).concat(usual ?? []);
  const max = Math.max(...values);
  const min = Math.min(...values, 0);
  const x = (i: number) => (i * 100) / (pts.length - 1);
  const y = (v: number) => 95 - ((v - min) / (max - min || 1)) * 80;
  const path = pts.map((pt, i) => `${i ? 'L' : 'M'} ${x(i)} ${y(pt.value)}`).join(' ');
  const active = hover ?? pts.length - 1;

  return (
    <div className="chart-wrap">
      <svg
        className="line-chart"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        role="img"
        aria-label={`${p.reach_unit} per day compared with a typical post`}
        onMouseLeave={() => setHover(null)}
        onMouseMove={(e) => {
          const box = e.currentTarget.getBoundingClientRect();
          setHover(Math.round(((e.clientX - box.left) / box.width) * (pts.length - 1)));
        }}
      >
        <path className="chart-grid" d="M0 20H100M0 50H100M0 80H100" />
        {usual != null && <path className="chart-baseline" d={`M0 ${y(usual)} H100`} vectorEffect="non-scaling-stroke" />}
        <path className="chart-path" d={path} vectorEffect="non-scaling-stroke" />
        <circle className="chart-end" cx={x(active)} cy={y(pts[active].value)} r="2.2" />
      </svg>
      <div className="chart-x">
        <span>{fmtShortDate(pts[0].date)}</span>
        <span>
          {fmtCompact(pts[active].value)} on {fmtShortDate(pts[active].date)}
        </span>
        <span>{fmtShortDate(pts[pts.length - 1].date)}</span>
      </div>
    </div>
  );
}
