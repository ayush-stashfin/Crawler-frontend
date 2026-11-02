import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api';
import type { GenerateRun, GenerateStatus, GenerateStep, Post } from '../types';
import { fmtX, readableError, typeLabel } from '../format';
import { Icon, Thumb } from './common';
import { Modal } from './Dialog';

export const STEP_LABEL: Record<GenerateStep, string> = {
  teardown: 'Tearing down the reel',
  match: 'Matching a Stashfin product',
  script: 'Writing the script',
};
export const STEP_INDEX: Record<GenerateStep, number> = { teardown: 0, match: 1, script: 2 };

export type Generations = {
  runs: Record<number, GenerateRun>;
  start: (postId: number) => Promise<void>;
  /** Picks up a run started earlier (another tab, or before a reload). */
  track: (postId: number) => void;
};

/**
 * Hand-started runs, polled while they go. Each start does the next step: teardown + match, which
 * stops so the match can be read, then (a second start) the script.
 * `onFinished` gets each run once it stops, with its error if it failed and the post's pipeline.
 */
export function useGenerations(onFinished: (postId: number, run: GenerateStatus) => void): Generations {
  const [runs, setRuns] = useState<Record<number, GenerateRun>>({});
  const finished = useRef(onFinished);
  finished.current = onFinished;

  const start = useCallback(async (postId: number) => {
    const res = await api.generate(postId); // throws with the API's reason when it can't start
    setRuns((m) => ({ ...m, [postId]: res }));
  }, []);

  const track = useCallback((postId: number) => {
    api
      .generateStatus(postId)
      .then((res) => res.running && setRuns((m) => ({ ...m, [postId]: res })))
      .catch(() => {});
  }, []);

  const running = Object.keys(runs)
    .map(Number)
    .filter((id) => runs[id].running)
    .join(',');
  useEffect(() => {
    if (!running) return;
    const ids = running.split(',').map(Number);
    const t = window.setInterval(() => {
      ids.forEach(async (id) => {
        const res = await api.generateStatus(id).catch(() => null);
        if (!res) return;
        setRuns((m) => ({ ...m, [id]: res }));
        if (!res.running) finished.current(id, res);
      });
    }, 3000);
    return () => window.clearInterval(t);
  }, [running]);

  return { runs, start, track };
}

/** A product was matched; the script is written only when someone asks for it. */
export const isMatched = (p: Post) => !!p.pipeline.match && p.pipeline.match !== 'none';

/** Why a post can't be made into a script from here, or null if it can. */
export function blockedReason(p: Post): string | null {
  if (p.pipeline.script) return null;
  if (p.pipeline.match === 'none') return 'No Stashfin product fits this post.';
  if (p.media_type !== 'reel' && p.pipeline.teardown !== 'done') return 'Teardowns need a video, so only reels can be turned into scripts.';
  return null;
}

/** "Step 2 of 3 · Matching a Stashfin product", with a spinner. */
export function GenerateProgress({ run }: { run: GenerateRun }) {
  const step = run.step ?? 'teardown';
  return (
    <span className="gen-progress" role="status">
      <Icon name="progress_activity" className="spin" />
      <span>
        <b>
          Step {STEP_INDEX[step] + 1} of 3 · {STEP_LABEL[step]}
        </b>
        <small>This takes a few minutes. You can keep working; we’ll let you know when it’s ready.</small>
      </span>
    </span>
  );
}

type PickerProps = {
  posts: Post[];
  generations: Generations;
  onGenerate: (post: Post) => void;
  onOpenScript: (postId: number) => void;
  /** Opens the post, where the match and its reasons are shown with the button to write the script. */
  onOpenPost: (postId: number) => void;
  onClose: () => void;
};

/** Pick any tracked post to tear down, match and turn into a script. */
export function NewScriptDialog({ posts, generations, onGenerate, onOpenScript, onOpenPost, onClose }: PickerProps) {
  const [query, setQuery] = useState('');
  const [onlyTrending, setOnlyTrending] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => input.current?.focus(), []);

  const q = query.trim().toLowerCase();
  const shown = posts
    .filter((p) => !onlyTrending || p.trending)
    .filter((p) => !q || `${p.competitor} ${p.caption_full} ${p.creator}`.toLowerCase().includes(q))
    .sort((a, b) => Number(!!blockedReason(a)) - Number(!!blockedReason(b)) || (b.outperformance ?? -1) - (a.outperformance ?? -1));

  return (
    <Modal onClose={onClose} label="Make a script from a post">
      <div className="dialog pick-dialog">
        <button type="button" className="dialog-close" onClick={onClose} aria-label="Close">
          ×
        </button>
        <span className="section-index">NEW SCRIPT</span>
        <h2>Pick a post to adapt</h2>
        <p>
          Any reel works, trending or not. We tear it down and match it to a Stashfin product. You read why that product fits,
          then choose to write the script. Each step takes a few minutes.
        </p>
        <div className="pick-filters">
          <label className="search-field">
            <Icon name="search" />
            <input ref={input} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search caption, brand or creator" aria-label="Search posts" />
          </label>
          <button type="button" className={`segmented ${!onlyTrending ? 'active' : ''}`} aria-pressed={!onlyTrending} onClick={() => setOnlyTrending(false)}>
            All posts
          </button>
          <button type="button" className={`segmented ${onlyTrending ? 'active' : ''}`} aria-pressed={onlyTrending} onClick={() => setOnlyTrending(true)}>
            Trending
          </button>
        </div>
        <div className="pick-list">
          {shown.map((p) => {
            const run = generations.runs[p.post_id];
            const blocked = blockedReason(p);
            return (
              <div key={p.post_id} className={`pick-row ${blocked ? 'is-blocked' : ''}`}>
                <Thumb src={p.thumbnail} label={p.competitor} kind={p.media_type} />
                <span className="pick-copy">
                  <b>
                    {p.competitor} <small>· {typeLabel(p)}</small>
                  </b>
                  <span>{p.caption || 'No caption'}</span>
                  {blocked && <small className="pick-why">{blocked}</small>}
                  {run?.error && !run.running && <small className="pick-why error">{readableError(run.error)}</small>}
                </span>
                <strong className={p.trending ? 'hot' : ''}>{p.scored ? fmtX(p.outperformance) : '–'}</strong>
                {p.pipeline.script ? (
                  <button type="button" className="button button-secondary" onClick={() => onOpenScript(p.post_id)}>
                    Open script
                  </button>
                ) : isMatched(p) && !run?.running && !run?.error ? (
                  <button type="button" className="button button-secondary" onClick={() => onOpenPost(p.post_id)}>
                    Review match
                  </button>
                ) : run?.running ? (
                  <span className="pick-running">
                    <Icon name="progress_activity" className="spin" /> {STEP_LABEL[run.step ?? 'teardown']}
                  </span>
                ) : (
                  <button type="button" className="button button-primary" disabled={!!blocked} onClick={() => onGenerate(p)}>
                    <Icon name="auto_awesome" /> {run?.error ? 'Try again' : 'Generate'}
                  </button>
                )}
              </div>
            );
          })}
          {shown.length === 0 && <div className="empty-block">No posts match.</div>}
        </div>
      </div>
    </Modal>
  );
}
