import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, setSignedOutHandler } from './api';
import type { AuthSession, AuthUser, Competitor, KindFilter, Post, RegenerationRequest, Run, ScriptSummary } from './types';
import type { Page } from './components/Shell';
import { Sidebar, Topbar } from './components/Shell';
import { TrendingPage } from './components/TrendingPage';
import { PostsPage } from './components/PostsPage';
import { CompetitorsPage } from './components/CompetitorsPage';
import { ScriptsPage } from './components/ScriptsPage';
import { DetailPanel } from './components/DetailPanel';
import { SearchModal } from './components/SearchModal';
import { Modal } from './components/Dialog';
import { NewScriptDialog, isMatched, useGenerations } from './components/Generate';
import { errorText, readableError } from './format';
import { Landing } from './components/Landing';
import { Icon, usePointerGlow } from './components/common';

const PAGES: Page[] = ['trending', 'posts', 'competitors', 'scripts'];
const pageFromHash = (): Page => {
  const p = window.location.hash.replace('#', '') as Page;
  return PAGES.includes(p) ? p : 'trending';
};

const readNavCollapsed = () => {
  try {
    return localStorage.getItem('outlier-nav') === 'collapsed';
  } catch {
    return false;
  }
};

type Theme = 'light' | 'dark';
const readTheme = (): Theme => {
  try {
    // `prism-theme` is the key from before the rename.
    return (localStorage.getItem('outlier-theme') ?? localStorage.getItem('prism-theme')) === 'dark' ? 'dark' : 'light';
  } catch {
    return 'light';
  }
};

/**
 * Signed out: the landing page with Google sign-in. Signed in: the dashboard.
 * While the API has sign-in off (no GOOGLE_CLIENT_ID), the landing page has an "Open the workspace" button instead,
 * and a link straight to a page (e.g. #trending) skips it.
 */
export default function App() {
  const [theme, setTheme] = useState<Theme>(readTheme);
  const [session, setSession] = useState<AuthSession | null>(null);
  const [apiError, setApiError] = useState('');
  const [notice, setNotice] = useState('');
  const [entered, setEntered] = useState(() => PAGES.includes(window.location.hash.replace('#', '') as Page));

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') root.dataset.theme = 'dark';
    else delete root.dataset.theme;
    try {
      localStorage.setItem('outlier-theme', theme);
    } catch {
      // storage blocked: the choice lasts for this visit only
    }
  }, [theme]);
  const toggleTheme = useCallback(() => setTheme((t) => (t === 'light' ? 'dark' : 'light')), []);

  const loadSession = useCallback(async () => {
    try {
      setSession(await api.session());
      setApiError('');
    } catch (err) {
      setApiError(errorText(err));
    }
  }, []);
  useEffect(() => {
    loadSession();
  }, [loadSession]);

  useEffect(() => {
    setSignedOutHandler(() => {
      setSession((s) => (s?.user ? { ...s, user: null } : s));
      setNotice('Your session ended. Sign in again to continue.');
    });
    return () => setSignedOutHandler(null);
  }, []);

  const goToWorkspace = () => {
    if (!PAGES.includes(window.location.hash.replace('#', '') as Page)) window.history.replaceState(null, '', '#trending');
    setEntered(true);
    setNotice('');
    window.scrollTo({ top: 0 });
  };
  const signedIn = (user: AuthUser) => {
    setSession((s) => s && { ...s, user });
    goToWorkspace();
  };
  const signOut = async () => {
    await api.signOut().catch(() => undefined);
    setSession((s) => s && { ...s, user: null });
    setEntered(false);
    setNotice('');
    window.history.replaceState(null, '', window.location.pathname);
  };

  if (!session && !apiError) return <div className="boot-screen" aria-busy="true" />;
  const inside = session?.enabled ? !!session.user : entered && !!session;
  if (!inside) {
    return (
      <Landing
        session={session}
        apiError={apiError}
        notice={notice}
        onRetry={loadSession}
        onSignedIn={signedIn}
        onEnter={goToWorkspace}
        theme={theme}
        onTheme={toggleTheme}
      />
    );
  }
  return <Dashboard user={session?.user ?? null} onSignOut={signOut} theme={theme} onTheme={toggleTheme} />;
}

type Toast = { id: number; text: string; error: boolean };

type DashboardProps = { user: AuthUser | null; onSignOut: () => void; theme: Theme; onTheme: () => void };

function Dashboard({ user, onSignOut, theme, onTheme }: DashboardProps) {
  const [page, setPageState] = useState<Page>(pageFromHash);
  const [days, setDays] = useState<string[]>([]);
  const [day, setDay] = useState<string | null>(null);
  const dayRef = useRef<string | null>(null);
  const [posts, setPosts] = useState<Post[] | null>(null);
  const [competitors, setCompetitors] = useState<Competitor[]>([]);
  const [runs, setRuns] = useState<Run[]>([]);
  const [scripts, setScripts] = useState<ScriptSummary[]>([]);
  const [requests, setRequests] = useState<RegenerationRequest[]>([]);
  const [error, setError] = useState('');
  const [reloading, setReloading] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);

  const [kind, setKind] = useState<KindFilter>('all');
  const [competitorId, setCompetitorId] = useState<number | null>(null);
  const [open, setOpen] = useState<{ id: number; list: number[] } | null>(null);
  const [scriptPostId, setScriptPostId] = useState<number | null>(null);
  const [searching, setSearching] = useState(false);
  const [picking, setPicking] = useState(false);
  const [navCollapsed, setNavCollapsed] = useState(readNavCollapsed);
  const toggleNav = () =>
    setNavCollapsed((c) => {
      try {
        localStorage.setItem('outlier-nav', c ? 'open' : 'collapsed');
      } catch {
        // storage blocked: the choice lasts for this visit only
      }
      return !c;
    });
  usePointerGlow();

  const setPage = useCallback((p: Page) => {
    setPageState(p);
    setOpen(null);
    window.history.replaceState(null, '', `#${p}`);
    window.scrollTo({ top: 0 });
  }, []);

  useEffect(() => {
    const onHash = () => setPageState(pageFromHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const toast = useCallback((text: string, isError = false) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, text, error: isError }]);
    window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3200);
  }, []);

  const loadDay = useCallback(async (d: string | null) => {
    const [p, c] = await Promise.all([api.posts(d ?? undefined), api.competitors(d ?? undefined)]);
    setPosts(p.items);
    setCompetitors(c);
    dayRef.current = p.date ?? d;
    setDay(dayRef.current);
  }, []);

  const loadScripts = useCallback(async () => {
    try {
      const [list, open] = await Promise.all([api.scripts(), api.regenerationRequests().catch(() => [])]);
      setScripts(list);
      setRequests(open);
    } catch {
      // the error banner covers an unreachable API
    }
  }, []);

  const loadAll = useCallback(async () => {
    setReloading(true);
    try {
      const [d, r] = await Promise.all([api.days(), api.runs()]);
      setDays(d);
      setRuns(r);
      const current = dayRef.current;
      await Promise.all([loadDay(current && d.includes(current) ? current : (d[0] ?? null)), loadScripts()]);
      setError('');
      return true;
    } catch (err) {
      setError(errorText(err));
      return false;
    } finally {
      setReloading(false);
    }
  }, [loadDay, loadScripts]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  // Pick up new pipeline runs without a manual reload.
  const lastRun = useRef<string>('');
  useEffect(() => {
    lastRun.current = `${runs[0]?.run_id}-${runs[0]?.status}`;
  }, [runs]);
  useEffect(() => {
    const t = window.setInterval(async () => {
      const r = await api.runs().catch(() => null);
      if (!r) return;
      const key = `${r[0]?.run_id}-${r[0]?.status}`;
      if (key === lastRun.current) return;
      setRuns(r);
      if (r[0]?.status === 'succeeded') {
        toast('A pipeline run finished. Loading the new data…');
        loadAll();
      }
    }, 60_000);
    return () => window.clearInterval(t);
  }, [toast, loadAll]);

  const changeDay = async (d: string) => {
    setDay(d);
    setOpen(null);
    try {
      await loadDay(d);
    } catch (err) {
      setError(errorText(err));
    }
  };

  const all = useMemo(() => posts ?? [], [posts]);
  const byId = useMemo(() => new Map(all.map((p) => [p.post_id, p])), [all]);
  const trendingList = useMemo(() => all.filter((p) => p.trending).sort((a, b) => (b.score ?? 0) - (a.score ?? 0)), [all]);

  // The opened post shows in a popup; ↑ and ↓ step through the list it was opened from.
  const panelPost = (open && byId.get(open.id)) || null;
  const panelList = open?.list ?? [];

  const openPost = useCallback((id: number, list: number[]) => setOpen({ id, list }), []);
  const closeDetail = useCallback(() => setOpen(null), []);
  const reviewScript = (postId: number) => {
    setScriptPostId(postId);
    setPage('scripts');
  };
  // Hand-started scripts for any post, polled until done: teardown + match first, the script on a second click.
  const postsById = useRef(byId);
  postsById.current = byId;
  const generations = useGenerations(
    useCallback(
      (postId, run) => {
        const name = postsById.current.get(postId)?.competitor ?? 'the';
        if (run.error) toast(readableError(run.error), true);
        else if (run.pipeline.script) toast(`Script ready for the ${name} post. It’s on the Scripts page.`);
        else toast(`Product matched for the ${name} post. Open it to see why, then generate the script.`);
        loadAll();
      },
      [toast, loadAll],
    ),
  );
  const generate = useCallback(
    async (p: Post): Promise<boolean> => {
      try {
        await generations.start(p.post_id);
        toast(
          isMatched(p)
            ? `Writing the script for the ${p.competitor} post. This takes a few minutes.`
            : `Finding a product for the ${p.competitor} post. This takes a few minutes.`,
        );
      } catch (err) {
        toast(errorText(err), true);
        return false;
      }
      return true;
    },
    [generations, toast],
  );

  const showBrand = (id: number) => {
    setCompetitorId(id);
    setPage('posts');
  };

  // ⌘K / Ctrl+K opens search; ↑ and ↓ step through the posts behind the open detail.
  const keys = useRef({ panelPost, panelList, searching });
  keys.current = { panelPost, panelList, searching };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearching((s) => !s);
        return;
      }
      const k = keys.current;
      if (k.searching || !k.panelPost || (e.key !== 'ArrowDown' && e.key !== 'ArrowUp')) return;
      if ((e.target as HTMLElement).closest('input, select, textarea, .dialog')) return;
      if (k.panelList.length < 2) return;
      e.preventDefault();
      const i = k.panelList.indexOf(k.panelPost.post_id);
      const next = k.panelList[(i + (e.key === 'ArrowDown' ? 1 : -1) + k.panelList.length) % k.panelList.length];
      setOpen({ id: next, list: k.panelList });
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  // Scripts waiting for review, plus requests to regenerate an approved script that wait for you.
  const toReview = scripts.filter((s) => s.status === 'draft' || s.status === 'needs_fix').length + requests.filter((r) => r.can_decide).length;
  const detail = panelPost ? (
    <DetailPanel
      key={panelPost.post_id}
      post={panelPost}
      onClose={closeDetail}
      onReviewScript={reviewScript}
      onToast={toast}
      generation={generations.runs[panelPost.post_id]}
      onGenerate={generate}
      onTrack={generations.track}
    />
  ) : null;

  return (
    <div className={`app-shell ${navCollapsed ? 'nav-collapsed' : ''}`}>
      <Sidebar page={page} onPage={setPage} toReview={toReview} user={user} onSignOut={onSignOut} collapsed={navCollapsed} onToggle={toggleNav} />
      <main className="main-area">
        <Topbar
          page={page}
          onPage={setPage}
          counts={{ trending: trendingList.length, posts: all.length, competitors: competitors.length }}
          days={days}
          day={day}
          onDay={changeDay}
          runs={runs}
          onReload={async () => (await loadAll()) && toast('Data refreshed')}
          reloading={reloading}
          onSearch={() => setSearching(true)}
          theme={theme}
          onTheme={onTheme}
          onSignOut={user ? onSignOut : undefined}
        />

        {error && (
          <div className="banner" role="alert">
            <Icon name="cloud_off" />
            <span>
              <b>Can't reach the API.</b> {error}. Check that it's running (<code>uvicorn app.main:app --port 8000</code>).
            </span>
            <button type="button" className="button button-secondary" onClick={loadAll}>
              Try again
            </button>
          </div>
        )}

        {posts === null && !error && <Loading />}

        {posts !== null && page === 'trending' && day && (
          <TrendingPage
            posts={all}
            competitors={competitors}
            day={day}
            kind={kind}
            onKind={setKind}
            selectedId={panelPost?.post_id ?? null}
            onOpen={openPost}
            onBrand={showBrand}
            onAllPosts={() => setPage('posts')}
            onCompetitors={() => setPage('competitors')}
          />
        )}
        {posts !== null && page === 'trending' && !day && (
          <div className="page-shell">
            <div className="empty-block">
              No snapshots yet. Add competitors, then run <code>python -m jobs.daily_pipeline</code>.
            </div>
          </div>
        )}
        {posts !== null && page === 'posts' && (
          <PostsPage
            posts={all}
            competitors={competitors}
            day={day ?? ''}
            competitorId={competitorId}
            onCompetitor={setCompetitorId}
            kind={kind}
            onKind={setKind}
            onOpen={openPost}
            onToast={toast}
          />
        )}
        {posts !== null && page === 'competitors' && (
          <CompetitorsPage
            competitors={competitors}
            onChanged={(msg) => {
              toast(msg);
              loadAll();
            }}
            onError={(msg) => toast(msg, true)}
            onViewPosts={showBrand}
          />
        )}
        {posts !== null && page === 'scripts' && (
          <ScriptsPage
            scripts={scripts}
            requests={requests}
            user={user}
            selectedPostId={scriptPostId}
            onSelect={setScriptPostId}
            onChanged={loadScripts}
            onToast={toast}
            onNewScript={() => setPicking(true)}
            inProgress={all.filter((p) => generations.runs[p.post_id]?.running).map((p) => ({ post: p, run: generations.runs[p.post_id] }))}
            runs={generations.runs}
            onGenerate={(postId) => {
              const p = byId.get(postId);
              if (p) generate(p);
            }}
          />
        )}
      </main>

      {panelPost && (
        <Modal onClose={closeDetail} label="Post details">
          <div className="post-modal">{detail}</div>
        </Modal>
      )}

      {picking && (
        <NewScriptDialog
          posts={all}
          generations={generations}
          onGenerate={generate}
          onOpenScript={(id) => {
            setPicking(false);
            reviewScript(id);
          }}
          onOpenPost={(id) => {
            setPicking(false);
            openPost(id, [id]);
          }}
          onClose={() => setPicking(false)}
        />
      )}

      {searching && (
        <SearchModal
          onClose={() => setSearching(false)}
          posts={all}
          competitors={competitors}
          scripts={scripts}
          days={days}
          onPage={setPage}
          onDay={changeDay}
          onBrand={showBrand}
          onOpenPost={(id, list) => {
            setPage('trending');
            openPost(id, list);
          }}
          onScript={reviewScript}
        />
      )}

      <div className="toast-stack" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.error ? 'toast-error' : ''}`}>
            {t.text}
          </div>
        ))}
      </div>
    </div>
  );
}

function Loading() {
  return (
    <div className="loading-shell" aria-busy="true" aria-label="Loading the latest snapshot">
      <div className="skel" style={{ height: 14, width: 180 }} />
      <div className="skel" style={{ height: 36, width: '46%' }} />
      <div className="skel" style={{ height: 84 }} />
      <div className="skel" style={{ height: 230 }} />
      <div className="skel" style={{ height: 140 }} />
    </div>
  );
}
