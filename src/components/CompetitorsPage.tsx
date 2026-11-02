import { useState } from 'react';
import type { Competitor } from '../types';
import { fmtCompact, timeAgo } from '../format';
import { api } from '../api';
import { Collapse, Icon, Thumb, stagger } from './common';
import { FormDialog } from './Dialog';

type Props = {
  competitors: Competitor[];
  onChanged: (message: string) => void;
  onError: (message: string) => void;
  onViewPosts: (competitorId: number) => void;
};

/** "@paytm", "paytm" or "instagram.com/paytm/" → "paytm". */
export const cleanHandle = (raw: string) =>
  raw
    .trim()
    .replace(/^https?:\/\//, '')
    .replace(/^(www\.|m\.)?instagram\.com\//, '')
    .replace(/^@/, '')
    .replace(/[/?#].*$/, '')
    .toLowerCase();

// Paths that are Instagram pages, not profiles: instagram.com/p/…, /reel/…
const NOT_PROFILES = new Set(['p', 'reel', 'reels', 'tv', 'stories', 'explore', 'accounts', 'direct', 'about', 'legal', 'developer']);
// Same rule as the API: 1–30 letters, digits, dots and underscores; no leading, trailing or double dots.
const USERNAME = /^(?!\.)(?!.*\.\.)(?!.*\.$)[a-z0-9._]{1,30}$/;

/** Why this brand name won't do, or '' when it's fine. The API stores it as plain text. */
export function nameProblem(raw: string) {
  const name = raw.trim();
  if (!name) return 'Enter the brand’s name.';
  if (/https?:|www\.|\.com\b|\//i.test(name)) return 'Type the brand’s name as plain text, not a link. The link goes in the box below.';
  if (name.includes('@')) return 'Type the brand’s name without @. The Instagram username goes in the box below.';
  if (!/^[\p{L}\p{N}][\p{L}\p{N} &.,'’()+-]*$/u.test(name)) return 'Use only letters, numbers and spaces in the brand name.';
  if (name.length > 60) return 'Keep the brand name under 60 characters.';
  return '';
}

/** Why this handle or link won't do, or '' when it's fine. */
export function handleProblem(raw: string) {
  if (!raw.trim()) return 'Paste the brand’s Instagram profile link or type its username.';
  const handle = cleanHandle(raw);
  if (/^(https?:|www\.)/i.test(raw.trim()) && !/instagram\.com\//i.test(raw)) return 'That isn’t an Instagram link. It should start with instagram.com/.';
  if (NOT_PROFILES.has(handle)) return 'That’s a link to a post, not a profile. Open the brand’s profile page and copy that link instead.';
  if (!USERNAME.test(handle)) return 'That isn’t an Instagram username. Usernames only have letters, numbers, dots and underscores.';
  return '';
}

export function CompetitorsPage({ competitors, onChanged, onError, onViewPosts }: Props) {
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState<number | null>(null);

  const toggle = async (c: Competitor) => {
    setBusy(c.id);
    try {
      await api.setActive(c.id, !c.active);
      onChanged(c.active ? `${c.name} scraping paused` : `${c.name} scraping resumed`);
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Could not update the competitor.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="page-shell">
      <div className="page-intro">
        <div>
          <span className="section-index">
            WATCHLIST · {competitors.length} {competitors.length === 1 ? 'ACCOUNT' : 'ACCOUNTS'}
          </span>
          <h1>Competitors</h1>
          <p>Track public accounts, their usual reach, and the posts breaking through.</p>
        </div>
        <button type="button" className="button button-primary" onClick={() => setAdding(true)}>
          <Icon name="add" /> Request to add competitor
        </button>
      </div>

      {competitors.length === 0 && <div className="empty-block">No competitors yet. Add one to start the daily scrape.</div>}

      <div className="competitor-grid">
        {competitors.map((c, i) => (
          <article key={c.id} className={`competitor-card rise spot ${c.active ? '' : 'paused'}`} style={stagger(i)}>
            <div className="competitor-card-head">
              <Thumb src={c.avatar} label={c.name} />
              <div>
                <h2>{c.name}</h2>
                <a href={`https://www.instagram.com/${c.handle}/`} target="_blank" rel="noopener noreferrer" style={{ color: 'inherit' }}>
                  <span>@{c.handle}</span>
                </a>
              </div>
              <button type="button" className="more-button" onClick={() => toggle(c)} disabled={busy === c.id}>
                {busy === c.id ? '…' : c.active ? 'Pause' : 'Resume'}
              </button>
            </div>
            <div className="competitor-status">
              <i className={c.active ? '' : 'paused-dot'} />
              {c.active ? 'Scraping active' : 'Scraping paused'} <span>· {c.last_scraped ? `scraped ${timeAgo(c.last_scraped)}` : 'not scraped yet'}</span>
            </div>
            <div className="competitor-stats">
              <div>
                <span>Followers</span>
                <b>{fmtCompact(c.followers)}</b>
              </div>
              <div>
                <span>Posts tracked</span>
                <b>{c.posts_tracked}</b>
              </div>
              <div>
                <span>Creator collabs</span>
                <b>{c.collab_posts}</b>
              </div>
              <div>
                <span>Usual reel views</span>
                <b>{fmtCompact(c.median_own_reel_views)}</b>
              </div>
            </div>
            <button type="button" className="competitor-trending" onClick={() => onViewPosts(c.id)}>
              <span>
                <b>{c.trending}</b> trending today
              </span>
              <span>
                View posts <Icon name="arrow_forward" />
              </span>
            </button>
          </article>
        ))}
      </div>

      {adding && (
        <FormDialog
          kicker="WATCHLIST"
          title="Request a competitor"
          help="Tell us which public account to track. The team reviews each request before it’s added, and its posts start arriving with the daily run after that."
          submit="Send request"
          busy="Sending…"
          onClose={() => setAdding(false)}
          onSubmit={async (data) => {
            const name = String(data.get('name') ?? '').trim();
            const raw = String(data.get('handle') ?? '');
            const problem = nameProblem(name) || handleProblem(raw);
            if (problem) throw new Error(problem);
            const { message } = await api.requestCompetitor(name, cleanHandle(raw));
            setAdding(false);
            onChanged(message);
          }}
        >
          <CompetitorFields />
        </FormDialog>
      )}
    </div>
  );
}

/** Brand name (plain text) and the Instagram profile, with a guide to finding the profile link. */
function CompetitorFields() {
  const [name, setName] = useState('');
  const [handle, setHandle] = useState('');
  const [touched, setTouched] = useState({ name: false, handle: false });
  const [guide, setGuide] = useState(false);
  const nameError = touched.name ? nameProblem(name) : '';
  const handleError = touched.handle && handle.trim() ? handleProblem(handle) : '';
  const cleaned = handle.trim() && !handleProblem(handle) ? cleanHandle(handle) : '';

  return (
    <>
      <label>
        Brand name
        <input
          name="name"
          placeholder="e.g. Jupiter"
          autoComplete="off"
          maxLength={60}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => setTouched((t) => ({ ...t, name: true }))}
          aria-invalid={!!nameError}
          aria-describedby="name-hint"
          required
        />
        <small id="name-hint" className={`field-hint ${nameError ? 'error' : ''}`}>
          {nameError || 'Just the name, as plain text. No links or @.'}
        </small>
      </label>
      <div className="field-with-help">
        <label htmlFor="handle-input">Instagram profile link</label>
        <button type="button" className="help-link" aria-expanded={guide} aria-controls="handle-guide" onClick={() => setGuide((g) => !g)}>
          <Icon name="help" /> How do I find this?
        </button>
      </div>
      <Collapse open={guide} id="handle-guide">
        <div className="handle-guide">
          <b>What’s a profile link?</b>
          <p>
            It’s the web address of the brand’s Instagram page, like <code>instagram.com/jupiter.money</code>. The part after the slash (
            <code>jupiter.money</code>) is the username. Either one works here.
          </p>
          <ol>
            <li>
              <span>On your phone:</span> open Instagram, go to the brand’s profile, tap <b>⋯</b> at the top right, then <b>Copy profile URL</b>.
            </li>
            <li>
              <span>On a computer:</span> open the brand’s page on instagram.com and copy the address from the browser bar.
            </li>
            <li>
              <span>Then:</span> paste it below. Use the profile page, not a link to one post or reel.
            </li>
          </ol>
        </div>
      </Collapse>
      <input
        id="handle-input"
        name="handle"
        className="handle-input"
        placeholder="instagram.com/brand or @brand"
        autoComplete="off"
        autoCapitalize="off"
        spellCheck={false}
        value={handle}
        onChange={(e) => setHandle(e.target.value)}
        onBlur={() => setTouched((t) => ({ ...t, handle: true }))}
        aria-invalid={!!handleError}
        aria-describedby="handle-hint"
        required
      />
      <small id="handle-hint" className={`field-hint handle-hint ${handleError ? 'error' : cleaned ? 'ok' : ''}`}>
        {handleError ||
          (cleaned ? (
            <>
              <Icon name="check_circle" /> We’ll review <b>@{cleaned}</b>
            </>
          ) : (
            'Paste the link to their profile. Just the username works too.'
          ))}
      </small>
    </>
  );
}
