'use client';

import { useActionState, useEffect, useState } from 'react';
import type { ActionState } from '@/app/actions/auth';
import { deriveAndStoreKey, isCryptoAvailable } from '@/lib/browser-crypto';

interface Props {
  mode: 'setup' | 'login';
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
}

const initial: ActionState = { error: null };

export function AuthForm({ mode, action }: Props) {
  const [secure, setSecure] = useState(true);

  const [state, formAction, pending] = useActionState(
    async (prev: ActionState, formData: FormData): Promise<ActionState> => {
      const password = String(formData.get('password') ?? '');
      if (password) {
        try {
          await deriveAndStoreKey(password);
        } catch {
          setSecure(false);
        }
      }
      return action(prev, formData);
    },
    initial,
  );

  useEffect(() => {
    setSecure(isCryptoAvailable());
  }, []);

  return (
    <div className="center-screen">
      <div className="card auth-card">
        <div className="brand">Sovra</div>
        <h1 className="page-title">
          {mode === 'setup' ? 'Create your admin account' : 'Sign in'}
        </h1>

        {!secure && (
          <div className="card notice" style={{ marginBottom: '1rem' }}>
            <strong>Insecure connection</strong>
            <p className="muted" style={{ margin: '0.4rem 0 0', fontSize: '0.82rem' }}>
              You are on plain HTTP, so the browser disables encryption. You can still sign in, but
              client-side file encryption stays off until you set a domain and switch to HTTPS.
            </p>
          </div>
        )}

        <form action={formAction}>
          {mode === 'setup' && <input type="hidden" name="authMode" value="password" />}
          <div className="field">
            <label htmlFor="username">Username</label>
            <input id="username" name="username" autoComplete="username" required />
          </div>
          <div className="field">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete={mode === 'setup' ? 'new-password' : 'current-password'}
              minLength={8}
              required
            />
          </div>
          {mode === 'setup' && secure && (
            <p className="muted" style={{ fontSize: '0.82rem', marginTop: '-0.4rem' }}>
              Your password also derives the key that encrypts your private files. Keep it safe; it
              cannot be recovered.
            </p>
          )}
          <button
            className="primary"
            type="submit"
            disabled={pending}
            style={{ width: '100%', marginTop: '0.6rem' }}
          >
            {pending ? 'Please wait…' : mode === 'setup' ? 'Create account' : 'Sign in'}
          </button>
          {state.error && <div className="error">{state.error}</div>}
        </form>
      </div>
    </div>
  );
}
