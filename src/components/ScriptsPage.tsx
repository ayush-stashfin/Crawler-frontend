import { useCallback, useEffect, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import type { AuthUser, GenerateRun, Match, Post, RegenerationRequest, ScriptPart, ScriptReview, ScriptSummary, ScriptVersion, TeardownSummary } from '../types';
import { api } from '../api';
import { errorText, fmtDateTime, fmtPct, fmtX, readableError } from '../format';
import { Collapse, CollapseToggle, Icon, ScriptTag, Thumb, stagger } from './common';
import { FormDialog } from './Dialog';
import { GenerateProgress, STEP_INDEX, STEP_LABEL } from './Generate';

type Props = {
  scripts: ScriptSummary[];
  /** Open requests to regenerate an approved script. */
  requests: RegenerationRequest[];
  user: AuthUser | null;
  selectedPostId: number | null;
  onSelect: (postId: number) => void;
  onChanged: () => void;
  onToast: (msg: string, error?: boolean) => void;
  onNewScript: () => void;
  inProgress: { post: Post; run: GenerateRun }[];
  /** Hand-started runs by post, to show progress on a matched post that has no script yet. */
  runs: Record<number, GenerateRun>;
  onGenerate: (postId: number) => void;
};

/** Who to name for an approver or requester; sign-in being off leaves it empty. */
const who = (email: string | null | undefined, fallback: string) => email || fallback;

/**
 * Regenerating an approved script needs its approver's yes, unless you're the approver.
 * Mirrors approvals.needs_approval in the API.
 */
export function needsApproval(review: ScriptReview, user: AuthUser | null) {
  const active = review.versions.find((v) => v.active) ?? review.versions[0];
  if (!active || active.status !== 'approved') return false;
  return !(user && active.reviewer && user.email.toLowerCase() === active.reviewer.toLowerCase());
}

export function ScriptsPage({ scripts, requests, user, selectedPostId, onSelect, onChanged, onToast, onNewScript, inProgress, runs, onGenerate }: Props) {
  const [query, setQuery] = useState('');
  const [review, setReview] = useState<ScriptReview | null>(null);
  const [loadError, setLoadError] = useState('');
  const [versionIdx, setVersionIdx] = useState(0);
  const [dialog, setDialog] = useState<'reject' | 'regenerate' | 'decline' | null>(null);
  const [deciding, setDeciding] = useState(false);
  const [approving, setApproving] = useState(false);
  // Every section starts shut for each script, and stay as left while flipping between its versions.
  const [openParts, setOpenParts] = useState<OpenParts>({ teardown: false, product: false, concept: false, scenes: false, extras: false, versions: false });

  // Two tabs: reels broken down and waiting for a script, and the scripts themselves.
  const [teardowns, setTeardowns] = useState<TeardownSummary[]>([]);
  const [tab, setTab] = useState<'teardowns' | 'scripts'>('scripts');
  const loadTeardowns = useCallback(() => {
    api
      .teardowns()
      .then(setTeardowns)
      .catch(() => {});
  }, []);
  // Reload when scripts change or a hand-started run starts or stops.
  const runningIds = inProgress.map((x) => x.post.post_id).join(',');
  useEffect(loadTeardowns, [loadTeardowns, scripts, runningIds]);

  // A post picked from elsewhere (the post panel) opens on the tab it belongs to.
  const hasScript = selectedPostId != null && scripts.some((s) => s.post_id === selectedPostId);
  useEffect(() => {
    if (selectedPostId != null) setTab(hasScript ? 'scripts' : 'teardowns');
  }, [selectedPostId, hasScript]);

  const firstOf = (t: typeof tab) => (t === 'scripts' ? scripts[0]?.post_id : teardowns[0]?.post_id) ?? null;
  const postId = selectedPostId ?? firstOf(tab);
  const switchTab = (t: typeof tab) => {
    setTab(t);
    const first = firstOf(t);
    if (first != null) onSelect(first);
  };
  const q = query.trim().toLowerCase();
  const shown = scripts.filter((s) => !q || `${s.title} ${s.caption} ${s.competitor} ${s.creator} ${s.product_name} ${s.status}`.toLowerCase().includes(q));
  const shownTeardowns = teardowns.filter((t) => !q || `${t.logline} ${t.caption} ${t.competitor} ${t.creator} ${t.product_name}`.toLowerCase().includes(q));
  const teardownIds = new Set(teardowns.map((t) => t.post_id));
  const toReview = scripts.filter((s) => s.status === 'draft' || s.status === 'needs_fix').length;
  const requestFor = new Map(requests.map((r) => [r.post_id, r]));
  const forMe = requests.filter((r) => r.can_decide).length;

  const load = useCallback(async () => {
    if (postId == null) return;
    try {
      setReview(await api.script(postId));
      setLoadError('');
    } catch (err) {
      setLoadError(errorText(err));
    }
  }, [postId]);

  useEffect(() => {
    setReview(null);
    setVersionIdx(0);
    setOpenParts({ teardown: false, product: false, concept: false, scenes: false, extras: false, versions: false });
    load();
  }, [load]);

  // A script being written from here: reload once the run stops, to show it (or the error).
  const run = postId == null ? undefined : runs[postId];
  const wasRunning = useRef(false);
  useEffect(() => {
    if (wasRunning.current && !run?.running) load();
    wasRunning.current = !!run?.running;
  }, [run?.running, load]);

  // While a new version is being written, check back every few seconds.
  const regenerating = review?.regenerating ?? false;
  useEffect(() => {
    if (!regenerating) return;
    const t = window.setInterval(async () => {
      if (postId == null) return;
      const next = await api.script(postId).catch(() => null);
      if (!next || next.regenerating) return;
      setReview(next);
      setVersionIdx(0);
      onChanged();
      if (next.regenerate_error) onToast('The new version could not be written.', true);
      else onToast(`Version ${next.versions[0]?.version} is ready to review`);
    }, 4000);
    return () => window.clearInterval(t);
  }, [regenerating, postId, onChanged, onToast]);

  const approve = async () => {
    if (postId == null) return;
    setApproving(true);
    try {
      await api.review(postId, 'approve');
      onToast('Script approved');
      await load();
      onChanged();
    } catch (err) {
      onToast(errorText(err, 'Could not approve the script.'), true);
    } finally {
      setApproving(false);
    }
  };

  // The approver says yes (the new version is written) from the banner on the script.
  const approveRequest = async (req: RegenerationRequest) => {
    setDeciding(true);
    try {
      await api.decideRegeneration(req.id, 'approve');
      onToast(`Request approved. Writing a new version of v${req.approved_version}…`);
      await load();
      onChanged();
    } catch (err) {
      onToast(errorText(err, 'Could not approve the request.'), true);
      await load();
    } finally {
      setDeciding(false);
    }
  };

  const pending = review?.regeneration_request ?? null;
  const askFirst = review ? needsApproval(review, user) : false;
  const activeVersion = review?.versions.find((v) => v.active) ?? review?.versions[0];
  const dialogText = {
    reject: {
      title: 'Reject this script?',
      help: 'Add a note so the team understands what needs work.',
      submit: 'Reject script',
      placeholder: 'What needs work?',
      required: true,
    },
    regenerate: askFirst
      ? {
          title: 'Ask to regenerate',
          help: `v${activeVersion?.version} is approved${activeVersion?.reviewer ? ` by ${activeVersion.reviewer}` : ''}, so it can’t be changed straight away. Say why it should change. ${who(activeVersion?.reviewer, 'A reviewer')} gets your request, and the new version is written once they approve it. Until then v${activeVersion?.version} stays in use.`,
          submit: 'Send request',
          placeholder: 'Why should it change? e.g. the offer changed, make it shorter',
          required: true,
        }
      : {
          title: 'Regenerate the script',
          help: 'Tell the writer what to change. The new version takes a minute or two.',
          submit: 'Write new version',
          placeholder: 'e.g. make it shorter, add a parent character',
          required: false,
        },
    decline: {
      title: 'Decline this request?',
      help: `No new version is written and v${pending?.approved_version} stays in use. You can add a note for ${who(pending?.requested_by, 'the person who asked')}.`,
      submit: 'Decline request',
      placeholder: 'Optional: why not?',
      required: false,
    },
  };

  return (
    <div className="page-shell">
      <div className="page-intro">
        <div>
          <span className="section-index">
            CREATIVE WORKSPACE · {scripts.length} {scripts.length === 1 ? 'SCRIPT' : 'SCRIPTS'}
          </span>
          <h1>Scripts</h1>
          <p>Review each teardown, product match, and original script in one place.</p>
        </div>
        <div className="script-intro-actions">
          <label className="search-field script-search">
            <Icon name="search" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search scripts" aria-label="Search scripts" />
          </label>
          <button type="button" className="button button-primary new-script" onClick={onNewScript}>
            <Icon name="add" /> New script
          </button>
        </div>
      </div>

      <div className="script-layout">
        <section className="script-list-panel" aria-label="All scripts">
          <div className="script-tabs" role="tablist" aria-label="Teardowns and scripts">
            <button type="button" role="tab" aria-selected={tab === 'teardowns'} className={tab === 'teardowns' ? 'active' : ''} onClick={() => switchTab('teardowns')}>
              <Icon name="movie" /> Teardowns <span className="tab-count">{teardowns.length}</span>
            </button>
            <button type="button" role="tab" aria-selected={tab === 'scripts'} className={tab === 'scripts' ? 'active' : ''} onClick={() => switchTab('scripts')}>
              <Icon name="edit_note" /> Scripts <span className="tab-count">{scripts.length}</span>
            </button>
          </div>
          <div className="script-list-head">
            {tab === 'teardowns' ? (
              <span>Broken down and matched, waiting for a script</span>
            ) : (
              <span>
                {toReview} to review
                {forMe > 0 && ` · ${forMe} ${forMe === 1 ? 'request' : 'requests'}`}
              </span>
            )}
          </div>
          {tab === 'teardowns' && (
            <>
              {inProgress
                .filter(({ post }) => !teardownIds.has(post.post_id))
                .map(({ post, run }) => (
                  <div key={post.post_id} className="script-row is-generating" role="status">
                    <Thumb src={post.thumbnail} label={post.competitor} />
                    <span className="script-row-copy">
                      <b>{post.caption || `${post.competitor} post`}</b>
                      <small>
                        {post.competitor} · Step {STEP_INDEX[run.step ?? 'teardown'] + 1} of 3: {STEP_LABEL[run.step ?? 'teardown']}
                      </small>
                    </span>
                    <Icon name="progress_activity" className="spin" />
                  </div>
                ))}
              {shownTeardowns.map((t, i) => {
                const running = runs[t.post_id]?.running;
                return (
                  <button
                    key={t.post_id}
                    type="button"
                    style={stagger(i)}
                    className={`script-row rise ${t.post_id === postId ? 'selected' : ''}`}
                    aria-current={t.post_id === postId ? 'true' : undefined}
                    onClick={() => onSelect(t.post_id)}
                  >
                    <Thumb src={t.thumbnail} label={t.competitor} />
                    <span className="script-row-copy">
                      <b>{t.logline || t.caption || `${t.competitor} post`}</b>
                      <small>
                        {t.competitor}
                        {t.creator ? ` · @${t.creator}` : ''}
                      </small>
                      {t.match === 'matched' ? (
                        <span className="product-chip">
                          <Icon name="sell" />
                          {t.product_name}
                        </span>
                      ) : (
                        <small className="muted-chip">{t.match === 'no_fit' ? 'No product fits' : 'Not matched yet'}</small>
                      )}
                    </span>
                    {running ? (
                      <Icon name="progress_activity" className="spin" />
                    ) : (
                      t.confidence != null && t.match === 'matched' && <span className="script-date">{fmtPct(t.confidence)}</span>
                    )}
                  </button>
                );
              })}
              {teardowns.length === 0 && inProgress.length === 0 && (
                <div className="empty-block">
                  No teardowns waiting. Open any reel and click <b>Find a product</b>, or use <b>New script</b>.
                </div>
              )}
              {teardowns.length > 0 && shownTeardowns.length === 0 && <div className="empty-block">No teardowns match “{query}”.</div>}
            </>
          )}
          {tab === 'scripts' && (
            <>
              {inProgress.filter(({ run }) => run.step === 'script').map(({ post, run }) => (
                <div key={post.post_id} className="script-row is-generating" role="status">
                  <Thumb src={post.thumbnail} label={post.competitor} />
                  <span className="script-row-copy">
                    <b>{post.caption || `${post.competitor} post`}</b>
                    <small>
                      {post.competitor} · Step {STEP_INDEX[run.step ?? 'teardown'] + 1} of 3: {STEP_LABEL[run.step ?? 'teardown']}
                    </small>
                  </span>
                  <Icon name="progress_activity" className="spin" />
                </div>
              ))}
              {shown.map((s, i) => (
                <button
                  key={s.post_id}
                  type="button"
                  style={stagger(i)}
                  className={`script-row rise ${s.post_id === postId ? 'selected' : ''}`}
                  aria-current={s.post_id === postId ? 'true' : undefined}
                  onClick={() => onSelect(s.post_id)}
                >
                  <Thumb src={s.thumbnail} label={s.competitor} />
                  <span className="script-row-copy">
                    <b>{s.title}</b>
                    <small>
                      {s.competitor}
                      {s.creator ? ` · @${s.creator}` : ''}
                    </small>
                    {s.product_name && (
                      <span className="product-chip">
                        <Icon name="sell" />
                        {s.product_name}
                      </span>
                    )}
                    {requestFor.has(s.post_id) && (
                      <span className={`request-chip ${requestFor.get(s.post_id)?.can_decide ? 'for-me' : ''}`}>
                        <Icon name={requestFor.get(s.post_id)?.can_decide ? 'notifications_active' : 'schedule'} />
                        {requestFor.get(s.post_id)?.can_decide ? 'Regenerate request' : 'Regenerate requested'}
                      </span>
                    )}
                  </span>
                  <ScriptTag status={s.status} />
                  <span className="script-date">v{s.version}</span>
                </button>
              ))}
              {scripts.length === 0 && (
                <div className="empty-block">
                  No scripts yet. Pick a reel on the <b>Teardowns</b> tab and click <b>Generate script</b>.
                </div>
              )}
              {scripts.length > 0 && shown.length === 0 && <div className="empty-block">No scripts match “{query}”.</div>}
            </>
          )}
        </section>

        {loadError ? (
          <article className="script-detail">
            <div className="detail-empty">
              <Icon name="error" />
              Couldn't load this script: {loadError}
            </div>
          </article>
        ) : review && review.versions.length ? (
          <ScriptDetail
            key={`${review.post.post_id}-${Math.min(versionIdx, review.versions.length - 1)}`}
            review={review}
            version={review.versions[Math.min(versionIdx, review.versions.length - 1)]}
            onVersion={setVersionIdx}
            openParts={openParts}
            onToggle={(part) => setOpenParts((o) => ({ ...o, [part]: !o[part] }))}
            approving={approving}
            onApprove={approve}
            askFirst={askFirst}
            deciding={deciding}
            onApproveRequest={approveRequest}
            onDeclineRequest={() => setDialog('decline')}
            onReject={() => setDialog('reject')}
            onRegenerate={() => setDialog('regenerate')}
          />
        ) : review && review.teardown ? (
          <TeardownView review={review} run={run} onGenerate={() => onGenerate(review.post.post_id)} />
        ) : (
          <article className="script-detail">
            <div className="detail-empty">
              <Icon name="edit_note" />
              {postId == null ? (tab === 'teardowns' ? 'Pick a teardown to see it.' : 'Pick a script to review it.') : review ? 'This reel has no teardown yet.' : 'Loading…'}
            </div>
          </article>
        )}
      </div>

      {dialog && postId != null && (
        <FormDialog
          kicker={dialog === 'decline' ? 'REGENERATE REQUEST' : 'SCRIPT REVIEW'}
          title={dialogText[dialog].title}
          help={dialogText[dialog].help}
          submit={dialogText[dialog].submit}
          onClose={() => setDialog(null)}
          onSubmit={async (data) => {
            const note = String(data.get('note') ?? '').trim();
            if (dialogText[dialog].required && !note) throw new Error(dialog === 'reject' ? 'Add a note saying what needs work.' : 'Say why it should change.');
            if (dialog === 'reject') {
              await api.review(postId, 'reject', note);
              onToast('Script rejected with your note');
            } else if (dialog === 'decline') {
              if (!pending) throw new Error('This request is no longer open.');
              await api.decideRegeneration(pending.id, 'reject', note);
              onToast(`Request declined. v${pending.approved_version} stays in use.`);
            } else {
              const res = await api.regenerate(postId, note);
              onToast(
                res.approval_needed
                  ? `Request sent to ${who(res.request?.approver, 'a reviewer')}. The new version is written once they approve.`
                  : 'Writing a new version…',
              );
            }
            setDialog(null);
            await load();
            onChanged();
          }}
        >
          <label>
            {dialog === 'regenerate' && askFirst ? 'Reason' : 'Note'}
            <textarea name="note" required={dialogText[dialog].required} placeholder={dialogText[dialog].placeholder} />
          </label>
        </FormDialog>
      )}
    </div>
  );
}

/**
 * The Teardowns tab: a reel broken down by Prism with no script yet. Shows the teardown, which
 * product fits and why, and the button for the next step. Nothing goes to the script writer until
 * someone clicks Generate script.
 */
function TeardownView({ review, run, onGenerate }: { review: ScriptReview; run?: GenerateRun; onGenerate: () => void }) {
  const { post, teardown: td, match } = review;
  const fits = !!match?.product_code;
  const running = !!run?.running;
  const note = run?.error
    ? readableError(run.error)
    : !match
      ? 'Find which Stashfin product fits this reel. Nothing is written until you ask for the script.'
      : fits
        ? 'Happy with this product? The script is written only when you ask for it.'
        : `No Stashfin product fits this reel (closest was ${fmtPct(match.confidence)} match), so there’s no script to write.`;
  return (
    <article className="script-detail">
      <div className="script-detail-top">
        <div>
          <span className="section-index">TEARDOWN · NO SCRIPT YET</span>
          <h2>{td?.logline || post.caption || `${post.competitor} post`}</h2>
          <p>
            {post.competitor}'s {post.kind}
            {post.outperformance != null ? ` at ${fmtX(post.outperformance)} its usual reach` : ''} ·{' '}
            <a href={post.ig_url} target="_blank" rel="noopener noreferrer">
              original post ↗
            </a>
          </p>
        </div>
      </div>

      <div className="script-stagebar">
        <span className="done">01 Teardown</span>
        <i>→</i>
        <span className={match ? (fits ? 'done' : 'failed') : 'current'}>02 Product match</span>
        <i>→</i>
        <span className={fits ? 'current' : ''}>03 Script</span>
      </div>

      {td && (
        <>
          <SectionHead icon="movie" tone="purple" title="The original reel" meta={[td.format, td.tone].filter(Boolean).join(' · ')} />
          <section className="teardown-card">
            {td.hook && <p className="teardown-hook">Hook · {td.hook}</p>}
            {td.themes.length > 0 && (
              <div className="teardown-beats">
                {td.themes.slice(0, 6).map((t) => (
                  <span key={t}>{t}</span>
                ))}
              </div>
            )}
            {td.why_it_worked && (
              <p>
                <b>Why it worked:</b> {td.why_it_worked}
              </p>
            )}
            {td.beats.length > 0 && (
              <details>
                <summary>Beat by beat ({td.beats.length})</summary>
                <ol className="beat-list">
                  {td.beats.map((bt, i) => (
                    <li key={i}>
                      {(bt.t_start || bt.t_end) && <small>{[bt.t_start, bt.t_end].filter(Boolean).join('–')} </small>}
                      {bt.visual_action}
                      {bt.dialogue && <q>{bt.dialogue}</q>}
                    </li>
                  ))}
                </ol>
              </details>
            )}
            {td.transcript && (
              <details>
                <summary>Transcript</summary>
                <p style={{ whiteSpace: 'pre-line', maxHeight: 220, overflow: 'auto' }}>{td.transcript}</p>
              </details>
            )}
          </section>
        </>
      )}

      {match && fits && <WhyThisProduct match={match} />}

      <div className="script-review-actions">
        {running && run ? <GenerateProgress run={run} /> : <span className={run?.error ? 'error-text' : ''}>{note}</span>}
        {!running && (!match || fits) && (
          <div>
            <button type="button" className="button button-primary" onClick={onGenerate}>
              <Icon name="auto_awesome" /> {run?.error ? 'Try again' : match ? 'Generate script' : 'Find a product'}
            </button>
          </div>
        )}
      </div>
    </article>
  );
}

/** Which product fits and why, in full. */
function WhyThisProduct({ match }: { match: Match }) {
  const strength = match.confidence >= 0.75 ? 'strong' : match.confidence >= 0.5 ? '' : 'weak';
  return (
    <>
      <SectionHead icon="sell" tone="green" title="Why this product" />
      <div className={`product-hero ${strength}`}>
        <span className="ph-icon">
          <Icon name="sell" />
        </span>
        <span className="ph-copy">
          <small>Matched Stashfin product</small>
          <b>{match.product_name ?? match.product_code}</b>
        </span>
        <span className={`match-pill ${strength}`}>{fmtPct(match.confidence)} match</span>
      </div>
      {match.reason && <p className="script-why match-reason">{match.reason}</p>}
      <div className="match-facts">
        {match.customer_need && (
          <div>
            <span className="mini-label sub-head tone-green">Customer need</span>
            <p>{match.customer_need}</p>
          </div>
        )}
        {match.topic && (
          <div>
            <span className="mini-label sub-head tone-amber">What the reel is about</span>
            <p>{match.topic}</p>
          </div>
        )}
      </div>
      {match.angle && (
        <div className="angle-card">
          <span className="mini-label sub-head tone-purple">Creative angle for our version</span>
          <b>{match.angle}</b>
        </div>
      )}
      {match.alternatives.length > 0 && (
        <p className="script-why">
          Also considered: {match.alternatives.map((a) => `${a.product_name ?? a.product_code} (${fmtPct(a.confidence)} match)`).join(' · ')}
        </p>
      )}
    </>
  );
}

type OpenParts = Record<'teardown' | 'product' | 'concept' | 'scenes' | 'extras' | 'versions', boolean>;

type DetailProps = {
  review: ScriptReview;
  version: ScriptVersion;
  onVersion: (i: number) => void;
  openParts: OpenParts;
  onToggle: (part: keyof OpenParts) => void;
  approving: boolean;
  onApprove: () => void;
  onReject: () => void;
  onRegenerate: () => void;
  /** The approved version belongs to someone else: regenerating sends them a request. */
  askFirst: boolean;
  deciding: boolean;
  onApproveRequest: (req: RegenerationRequest) => void;
  onDeclineRequest: () => void;
};

function ScriptDetail(props: DetailProps) {
  const { review, version: v, onVersion, openParts, onToggle, approving, onApprove, onReject, onRegenerate, askFirst, deciding } = props;
  const { post, teardown: td, match } = review;
  const s = v.script;
  const latest = review.versions[0];
  const isLatest = v.version === latest.version;
  const reviewed = latest.status === 'approved' || latest.status === 'rejected';
  const active = review.versions.find((x) => x.active) ?? latest;
  // An approved older version stays in use while a newer one waits for review.
  const olderInUse = active.status === 'approved' && active.version !== latest.version;
  const req = review.regeneration_request;
  const strength = !match ? '' : match.confidence >= 0.75 ? 'strong' : match.confidence >= 0.5 ? '' : 'weak';
  const sceneCount = (s.scenes ?? []).length;

  return (
    <article className="script-detail">
      <div className="script-detail-top">
        <div>
          <span className="section-index">OUR VERSION · v{v.version}</span>
          <h2>{s.title || 'Untitled script'}</h2>
          <p>
            Based on {post.competitor}'s {post.kind}
            {post.outperformance != null ? ` at ${fmtX(post.outperformance)} its usual reach` : ''} ·{' '}
            <a href={post.ig_url} target="_blank" rel="noopener noreferrer">
              original post ↗
            </a>
          </p>
        </div>
        <ScriptTag status={v.status} />
      </div>

      <div className={`product-hero ${strength}`}>
        <span className="ph-icon">
          <Icon name="sell" />
        </span>
        <span className="ph-copy">
          <small>Stashfin product in this script</small>
          <b>{v.product_name ?? v.product_code}</b>
          {match?.customer_need && <span>{match.customer_need}</span>}
        </span>
        {match && <span className={`match-pill ${strength}`}>{fmtPct(match.confidence)} match</span>}
      </div>

      <div className="script-stagebar">
        <span className="done">01 Teardown</span>
        <i>→</i>
        <span className="done">02 Product match</span>
        <i>→</i>
        <span className={reviewed ? 'done' : 'current'}>03 Script</span>
        <i>→</i>
        <span className={latest.status === 'approved' ? 'done' : reviewed ? 'current' : ''}>
          04 {latest.status === 'rejected' ? 'Rejected' : latest.status === 'approved' ? 'Approved' : 'Review'}
        </span>
      </div>

      {review.regenerating && (
        <div className="regen-banner" role="status">
          <Icon name="progress_activity" className="spin" /> Writing version {latest.version + 1}. This page updates when it's ready.
        </div>
      )}
      {review.regenerate_error && !review.regenerating && (
        <div className="regen-banner error" role="alert">
          <Icon name="error" /> The new version couldn’t be written. {readableError(review.regenerate_error)}
        </div>
      )}
      {req && (
        <div className={`request-banner ${req.can_decide ? 'for-me' : ''}`} role="status">
          <span className="rb-icon">
            <Icon name={req.can_decide ? 'notifications_active' : 'schedule'} />
          </span>
          <div className="rb-copy">
            <b>
              {req.can_decide
                ? `${who(req.requested_by, 'Someone')} asked to regenerate v${req.approved_version}`
                : `Waiting for ${who(req.approver, 'a reviewer')} to approve regenerating v${req.approved_version}`}
            </b>
            <q>{req.reason}</q>
            <small>
              {req.can_decide
                ? `v${req.approved_version} is approved${req.approver ? ` by ${req.approver}` : ''}. Approve to write a new version with this reason as the note; decline to keep v${req.approved_version} as it is.`
                : `Requested${req.requested_by ? ` by ${req.requested_by}` : ''}. v${req.approved_version} stays in use until then.`}
            </small>
          </div>
          {req.can_decide && (
            <div className="rb-actions">
              <button type="button" className="button button-secondary" onClick={props.onDeclineRequest} disabled={deciding}>
                Decline
              </button>
              <button type="button" className="button button-primary" onClick={() => props.onApproveRequest(req)} disabled={deciding || review.regenerating}>
                {deciding ? 'Approving…' : 'Approve & regenerate'}
              </button>
            </div>
          )}
        </div>
      )}
      {v.review_notes && (
        <div className={`review-note ${v.status === 'approved' ? 'ok' : ''}`}>
          <b>{v.status === 'rejected' ? 'Rejected: ' : 'Review note: '}</b>
          {v.review_notes}
        </div>
      )}

      <div className="script-content-grid">
        <div>
          {td && (
            <>
              <SectionHead
                icon="movie"
                tone="purple"
                title="Teardown of the original"
                meta={[td.status === 'done' ? 'Ready' : td.status, td.format ?? ''].filter(Boolean).join(' · ')}
                toggle={{ open: openParts.teardown, onToggle: () => onToggle('teardown'), controls: 'script-teardown' }}
              />
              <Collapse open={openParts.teardown} id="script-teardown">
                <section className="teardown-card">
                  <div
                    style={{
                      display: 'flex',
                      gap: 10,
                      alignItems: 'flex-start',
                      marginTop: 9,
                    }}
                  >
                    <span
                      style={{
                        flex: '0 0 52px',
                        height: 64,
                        borderRadius: 6,
                        overflow: 'hidden',
                      }}
                    >
                      <Thumb src={post.thumbnail} label={post.competitor} />
                    </span>
                    <div style={{ minWidth: 0 }}>
                      <h3 style={{ marginTop: 0 }}>{td.logline || post.caption}</h3>
                      {td.hook && <p className="teardown-hook">Hook · {td.hook}</p>}
                    </div>
                  </div>
                  {(td.format || td.themes.length > 0) && (
                    <div className="teardown-beats">
                      {td.format && <span>Format · {td.format}</span>}
                      {td.themes.slice(0, 5).map((t) => (
                        <span key={t}>{t}</span>
                      ))}
                    </div>
                  )}
                  {td.why_it_worked && (
                    <p>
                      <b>Why it worked:</b> {td.why_it_worked}
                    </p>
                  )}
                  {td.transcript && (
                    <details>
                      <summary>Transcript of the original</summary>
                      <p
                        style={{
                          whiteSpace: 'pre-line',
                          maxHeight: 220,
                          overflow: 'auto',
                        }}
                      >
                        {td.transcript}
                      </p>
                    </details>
                  )}
                </section>
              </Collapse>
            </>
          )}

          {match && (
            <>
              <SectionHead
                icon="sell"
                tone="green"
                title="Why this product"
                meta={
                  match.alternatives.length
                    ? `Creative angle · ${match.alternatives.length} other option${match.alternatives.length === 1 ? '' : 's'}`
                    : 'Creative angle'
                }
                toggle={{ open: openParts.product, onToggle: () => onToggle('product'), controls: 'script-product' }}
              />
              <Collapse open={openParts.product} id="script-product">
                {match.reason && <p className="script-why">{match.reason}</p>}
                <div className="angle-card">
                  <span className="mini-label sub-head tone-purple">Creative angle</span>
                  <b>{match.angle || s.concept}</b>
                  {match.alternatives.length > 0 && (
                    <small>
                      Also considered: {match.alternatives.map((a) => `${a.product_name ?? a.product_code} (${fmtPct(a.confidence)} match)`).join(' · ')}
                    </small>
                  )}
                </div>
              </Collapse>
            </>
          )}

          {(s.concept || s.what_we_kept || s.what_we_changed) && (
            <>
              <SectionHead
                icon="lightbulb"
                tone="amber"
                title="Our concept"
                toggle={{
                  open: openParts.concept,
                  onToggle: () => onToggle('concept'),
                  controls: 'script-concept',
                }}
              />
              <Collapse open={openParts.concept} id="script-concept">
                {s.concept && <p className="script-concept">{s.concept}</p>}
                {(s.what_we_kept || s.what_we_changed) && (
                  <div className="kept-changed">
                    <div>
                      <span className="mini-label sub-head tone-green">What we kept</span>
                      <p>{s.what_we_kept}</p>
                    </div>
                    <div>
                      <span className="mini-label sub-head tone-amber">What we changed</span>
                      <p>{s.what_we_changed}</p>
                    </div>
                  </div>
                )}
              </Collapse>
            </>
          )}

          <SectionHead
            icon="movie_edit"
            tone="coral"
            title="Scene-by-scene script"
            meta={[
              s.hook ? 'Hook' : '',
              sceneCount ? `${sceneCount} ${sceneCount === 1 ? 'scene' : 'scenes'}` : '',
              s.duration_seconds ? `${s.duration_seconds}s` : '',
              s.language ?? '',
            ]
              .filter(Boolean)
              .join(' · ')}
            toggle={{
              open: openParts.scenes,
              onToggle: () => onToggle('scenes'),
              controls: 'script-scenes',
            }}
          />
          <Collapse open={openParts.scenes} id="script-scenes">
            <div className="scene-flow">
              {s.hook && <Scene part={s.hook} label="HOOK" hook index={0} />}
              {(s.scenes ?? []).map((sc, i) => (
                <Scene key={i} part={sc} label={`SCENE ${String(i + 1).padStart(2, '0')}`} index={i + 1} />
              ))}
              {s.cta && (
                <div className="script-cta flow-item" style={{ '--i': sceneCount + 1 } as CSSProperties}>
                  <span className="mini-label sub-head tone-coral">Call to action</span>
                  <b>{s.cta.line}</b>
                  {s.cta.on_screen_text && <small>On screen: {s.cta.on_screen_text}</small>}
                </div>
              )}
            </div>
          </Collapse>
          {(s.characters?.length || s.caption || s.music_suggestion || s.disclaimer) && (
            <>
              <SectionHead
                icon="tag"
                tone="blue"
                title="Characters, caption & music"
                meta={[
                  s.characters?.length ? `${s.characters.length} ${s.characters.length === 1 ? 'character' : 'characters'}` : '',
                  s.caption ? 'caption' : '',
                  s.music_suggestion ? 'music' : '',
                  s.disclaimer ? 'disclaimer' : '',
                ]
                  .filter(Boolean)
                  .join(' · ')}
                toggle={{ open: openParts.extras, onToggle: () => onToggle('extras'), controls: 'script-extras' }}
              />
              <Collapse open={openParts.extras} id="script-extras">
                <div className="script-extras">
                  {s.characters && s.characters.length > 0 && (
                    <span>
                      <b>Characters:</b> {s.characters.map((c) => `${c.name} (${c.description})`).join('; ')}
                    </span>
                  )}
                  {s.caption && (
                    <span>
                      <b>Caption:</b> {s.caption} {s.hashtags?.join(' ')}
                    </span>
                  )}
                  {s.music_suggestion && (
                    <span>
                      <b>Music:</b> {s.music_suggestion}
                    </span>
                  )}
                  {s.disclaimer && (
                    <span>
                      <b>Disclaimer:</b> {s.disclaimer}
                    </span>
                  )}
                </div>
              </Collapse>
            </>
          )}
          <SectionHead
            icon="history"
            tone="purple"
            title="Version history"
            meta={`${review.versions.length} ${review.versions.length === 1 ? 'version' : 'versions'}`}
            toggle={{ open: openParts.versions, onToggle: () => onToggle('versions'), controls: 'script-versions' }}
          />
          <Collapse open={openParts.versions} id="script-versions">
            <div className="version-list">
              {review.versions.map((ver, i) => (
                <div key={ver.version} style={{ display: 'block', marginTop: 6 }}>
                  <button
                    type="button"
                    className={`version-row ${ver.version === v.version ? 'current' : ''}`}
                    onClick={() => onVersion(i)}
                    style={{ display: 'flex', alignItems: 'center', gap: 8 }}
                  >
                    <b>v{ver.version}</b>
                    <span>{i === 0 ? 'Latest' : fmtDateTime(ver.created_at)}</span>
                    {ver.active && review.versions.length > 1 && <span className="in-use-chip">In use</span>}
                    <ScriptTag status={ver.status} />
                  </button>
                  {ver.request_note && <p className="version-note">“{ver.request_note}”</p>}
                </div>
              ))}
            </div>
          </Collapse>
        </div>
      </div>

      <div className="script-review-actions">
        <span>
          {!isLatest
            ? `You're viewing v${v.version}. Reviews apply to the latest version (v${latest.version}).`
            : req
              ? `A request to regenerate v${req.approved_version} is open. Nothing changes until it’s approved.`
              : latest.status === 'approved'
                ? askFirst
                  ? `Approved${latest.reviewer ? ` by ${latest.reviewer}` : ''}. To change it, ask to regenerate: ${who(latest.reviewer, 'a reviewer')} approves first.`
                  : 'Approved. Regenerate to write a new version, or reject it if something changed.'
                : (latest.status === 'rejected'
                    ? 'Rejected. Regenerate with a note, or approve it after all.'
                    : latest.status === 'needs_fix'
                      ? 'This version needs fixing. Regenerate, or approve if you have reviewed it.'
                      : 'Review this original before it moves forward.') +
                  (olderInUse ? ` v${active.version} stays in use until a newer version is approved.` : '')}
        </span>
        <div>
          <button
            type="button"
            className="button button-secondary regen-button"
            onClick={onRegenerate}
            disabled={review.regenerating || !!req}
            title={askFirst && !req ? `v${active.version} is approved, so ${who(active.reviewer, 'a reviewer')} has to say yes first` : undefined}
          >
            <Icon name={review.regenerating ? 'autorenew' : req ? 'schedule' : askFirst ? 'send' : 'autorenew'} className={review.regenerating ? 'spin' : ''} />
            {review.regenerating ? 'Regenerating…' : req ? 'Request pending' : askFirst ? 'Ask to regenerate' : 'Regenerate'}
          </button>
          {latest.status !== 'rejected' && (
            <button type="button" className="button button-secondary" onClick={onReject} disabled={!isLatest}>
              Reject
            </button>
          )}
          {latest.status !== 'approved' && (
            <button type="button" className="button button-primary" onClick={onApprove} disabled={!isLatest || approving}>
              {approving ? 'Approving…' : 'Approve script'}
            </button>
          )}
        </div>
      </div>
    </article>
  );
}

type Tone = 'purple' | 'green' | 'amber' | 'coral' | 'blue';

type HeadProps = {
  icon: string;
  tone: Tone;
  title: string;
  meta?: string;
  /** Makes the heading open and close the section below it. */
  toggle?: { open: boolean; onToggle: () => void; controls: string };
  /** An ⓘ next to the title. */
  info?: ReactNode;
};

/** A section heading in the script view: tinted icon, title, and an optional muted detail. */
function SectionHead({ icon, tone, title, meta, toggle, info }: HeadProps) {
  const body = (
    <>
      <span className="sh-icon">
        <Icon name={icon} />
      </span>
      <span className="sh-title">{title}</span>
      {meta && <small>{meta}</small>}
    </>
  );
  return (
    <h4 className={`script-section-head tone-${tone} ${toggle ? 'is-toggle' : ''} ${toggle?.open ? 'is-open' : ''}`}>
      {toggle ? (
        <CollapseToggle open={toggle.open} onToggle={toggle.onToggle} controls={toggle.controls}>
          {body}
        </CollapseToggle>
      ) : (
        body
      )}
      {info}
    </h4>
  );
}

function Scene({ part, label, index, hook = false }: { part: ScriptPart; label: string; index: number; hook?: boolean }) {
  const origin = part.from_original;
  const visual = part.visual_action || part.visual;
  return (
    <div className={`${hook ? 'script-hook' : 'script-scene'} flow-item`} style={{ '--i': index } as CSSProperties}>
      <span className="scene-tag">
        <b>{label}</b>
        {part.t_start ? `${part.t_start}–${part.t_end ?? ''}` : ''}
        {part.shot_type ? ` · ${part.shot_type.replace(/_/g, ' ')}` : ''}
      </span>
      {hook ? <b>{visual}</b> : <p>{visual}</p>}
      {part.dialogue && <p className="say">{part.dialogue}</p>}
      {part.on_screen_text && <span className="onscreen">On screen: {part.on_screen_text}</span>}
      {origin && (
        <small className={origin} title={part.original_beat ? `Follows the original at ${part.original_beat}` : 'Not in the original'}>
          {origin}
        </small>
      )}
    </div>
  );
}
