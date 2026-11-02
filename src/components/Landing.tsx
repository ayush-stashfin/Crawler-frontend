import { useEffect, useRef, useState } from 'react';
import { api } from '../api';
import { errorText } from '../format';
import type { AuthSession, AuthUser } from '../types';
import { BrandMark, Icon } from './common';

type Props = {
  session: AuthSession | null;
  apiError: string;
  notice: string;
  onRetry: () => void;
  onSignedIn: (user: AuthUser) => void;
  onEnter: () => void;
  theme: 'light' | 'dark';
  onTheme: () => void;
};

/** Public front page: the StashCrawl mark on the left half; what it does and how to sign in on the right. */
export function Landing(props: Props) {
  return (
    <div className="welcome-shell split-landing">
      <aside className="split-brand" aria-label="StashCrawl">
        <span className="split-logo">
          <BrandMark />
          StashCrawl
        </span>
      </aside>

      <div className="split-main">
        <header className="split-top">
          <button type="button" className="theme-toggle" onClick={props.onTheme} aria-label={`Switch to ${props.theme === 'light' ? 'dark' : 'light'} theme`}>
            <Icon name={props.theme === 'light' ? 'light_mode' : 'dark_mode'} />
          </button>
        </header>

        <main className="split-content">
          <div className="welcome-copy">
            <span className="welcome-eyebrow">
              <i /> CREATOR INTELLIGENCE, MADE CLEAR
            </span>
            <h1>
              Catch the posts <em>taking off.</em> Make your next one count.
            </h1>
            <p>StashCrawl finds breakout content across your category, explains why it worked, and helps your team turn the signal into an original idea.</p>
            <SignIn {...props} />
          </div>

          <div className="welcome-visual" aria-hidden="true">
            <div className="welcome-image-wrap">
              <img src="/landing/creator.jpg" alt="" />
              <div className="image-caption">
                <Icon name="play_circle" />
                <span>
                  <b>One tiny habit that changed how I pay</b>
                  <small>Example breakout · Creator collab</small>
                </span>
              </div>
            </div>
            <div className="lift-card">
              <Icon name="north_east" className="lift-icon" />
              <span className="lift-label">OUTPERFORMING USUAL VIEWS</span>
              <strong>8.2×</strong>
              <small>and still climbing</small>
              <div className="lift-spark">
                {Array.from({ length: 7 }, (_, i) => (
                  <i key={i} />
                ))}
              </div>
            </div>
            <div className="floating-note">
              <Icon name="auto_awesome" />
              <span>
                <b>Signal spotted</b>
                <small>Strong creator momentum</small>
              </span>
            </div>
          </div>
        </main>

        <footer className="split-footer">
          <span>Clear signals for better creative.</span>
          <span>Built for the Stashfin marketing team</span>
        </footer>
      </div>
    </div>
  );
}

/** The sign-in controls, sitting under the intro copy: Google when it's switched on, otherwise a way straight in. */
function SignIn({ session, apiError, notice, onRetry, onSignedIn, onEnter, theme }: Props) {
  const [remember, setRemember] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const domain = session?.domain ?? 'stashfin.com';

  const signIn = async (credential: string) => {
    setBusy(true);
    setError('');
    try {
      onSignedIn(await api.signIn(credential, remember));
    } catch (err) {
      setError(errorText(err));
      setBusy(false);
    }
  };

  return (
    <section className="signin-inline" id="login" aria-label="Sign in">
      {notice && !apiError && (
        <div className="login-alert" role="status">
          <Icon name="schedule" /> {notice}
        </div>
      )}

      {apiError ? (
        <div className="login-alert error" role="alert">
          <Icon name="cloud_off" />
          <span>
            Can’t reach the StashCrawl API ({apiError}). Check that it’s running, then{' '}
            <button type="button" className="text-button" onClick={onRetry}>
              try again
            </button>
            .
          </span>
        </div>
      ) : session?.enabled && session.client_id ? (
        <>
          <GoogleButton clientId={session.client_id} domain={domain} theme={theme} onCredential={signIn} />
          <label className="remember-row">
            <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
            <span>Keep me signed in for 30 days</span>
          </label>
          {busy && (
            <p className="login-progress">
              <Icon name="progress_activity" className="spin" /> Signing you in…
            </p>
          )}
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
        </>
      ) : (
        <button type="button" className="button button-primary login-submit" onClick={onEnter}>
          Open the workspace <span>→</span>
        </button>
      )}
    </section>
  );
}

type GoogleId = {
  initialize(options: Record<string, unknown>): void;
  renderButton(el: HTMLElement, options: Record<string, unknown>): void;
};
declare global {
  interface Window {
    google?: { accounts: { id: GoogleId } };
  }
}

let gisLoading: Promise<void> | null = null;
/** Google Identity Services, loaded only when the sign-in card needs it. */
function loadGoogle(): Promise<void> {
  if (window.google?.accounts?.id) return Promise.resolve();
  gisLoading ??= new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      gisLoading = null;
      reject(new Error('Google sign-in did not load'));
    };
    document.head.appendChild(script);
  });
  return gisLoading;
}

function GoogleButton({
  clientId,
  domain,
  theme,
  onCredential,
}: {
  clientId: string;
  domain: string;
  theme: 'light' | 'dark';
  onCredential: (credential: string) => void;
}) {
  const slot = useRef<HTMLDivElement>(null);
  const callback = useRef(onCredential);
  callback.current = onCredential;
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>('loading');

  useEffect(() => {
    let live = true;
    loadGoogle()
      .then(() => {
        const el = slot.current;
        const id = window.google?.accounts.id;
        if (!live || !el || !id) return;
        id.initialize({
          client_id: clientId,
          callback: (res: { credential: string }) => callback.current(res.credential),
          hd: domain, // Google's account chooser only offers accounts on this domain
          auto_select: false,
          context: 'signin',
          ux_mode: 'popup',
        });
        el.innerHTML = '';
        id.renderButton(el, {
          type: 'standard',
          theme: theme === 'dark' ? 'filled_black' : 'outline',
          size: 'large',
          text: 'signin_with',
          shape: 'rectangular',
          logo_alignment: 'center',
          width: Math.round(Math.min(400, Math.max(220, el.getBoundingClientRect().width))),
        });
        setState('ready');
      })
      .catch(() => live && setState('failed'));
    return () => {
      live = false;
    };
  }, [clientId, domain, theme]);

  return (
    <div className="google-slot">
      {state === 'loading' && <div className="skel google-skel" />}
      <div ref={slot} className="google-button" />
      {state === 'failed' && <p className="form-error">Couldn’t load Google sign-in. Check your connection, then reload the page.</p>}
    </div>
  );
}
