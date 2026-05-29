'use client';

import { useActionState } from 'react';
import type { ActionState } from '@/app/actions/auth';
import { deriveAndStoreKey } from '@/lib/browser-crypto';

interface Props {
  mode: 'setup' | 'login';
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
}

const initial: ActionState = { error: null };

export function AuthForm({ mode, action }: Props) {
  const [state, formAction, pending] = useActionState(action, initial);

  async function clientAction(formData: FormData) {
    const password = String(formData.get('password') ?? '');
    if (password) {
      await deriveAndStoreKey(password);
    }
    return formAction(formData);
  }

  return (
    <div className="center-screen">
      <div className="card auth-card">
        <div className="brand">Sovra</div>
        <h1 className="page-title">
          {mode === 'setup' ? 'Create your admin account' : 'Sign in'}
        </h1>
        <form action={clientAction}>
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
          {mode === 'setup' && (
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
