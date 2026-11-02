import { useEffect, useRef, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { errorText } from '../format';

/** Centered modal over a dimmed backdrop. Escape or a backdrop click closes it. */
export function Modal({ onClose, children, label }: { onClose: () => void; children: ReactNode; label: string }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()} role="presentation">
      <div role="dialog" aria-modal="true" aria-label={label} style={{ display: 'contents' }}>
        {children}
      </div>
    </div>
  );
}

/** A small form dialog that stays open (with the error) when submitting fails. */
export function FormDialog(props: {
  kicker: string;
  title: string;
  help: string;
  submit: string;
  /** Button text while submitting (default "Working…"). */
  busy?: string;
  onClose: () => void;
  onSubmit: (data: FormData) => Promise<void>;
  children: ReactNode;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => ref.current?.querySelector<HTMLElement>('input, textarea')?.focus(), []);

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await props.onSubmit(new FormData(e.currentTarget));
    } catch (err) {
      setError(errorText(err));
      setBusy(false);
    }
  };

  return (
    <Modal onClose={props.onClose} label={props.title}>
      <form className="dialog" ref={ref} onSubmit={submit}>
        <button type="button" className="dialog-close" onClick={props.onClose} aria-label="Close">
          ×
        </button>
        <span className="section-index">{props.kicker}</span>
        <h2>{props.title}</h2>
        <p>{props.help}</p>
        {props.children}
        {error && <span className="form-error">{error}</span>}
        <div className="dialog-actions">
          <button type="button" className="button button-secondary" onClick={props.onClose}>
            Cancel
          </button>
          <button className="button button-primary" disabled={busy}>
            {busy ? (props.busy ?? 'Working…') : props.submit}
          </button>
        </div>
      </form>
    </Modal>
  );
}
