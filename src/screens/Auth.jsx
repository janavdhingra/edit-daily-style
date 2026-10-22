import { useState } from 'react';
import { signIn, signUp } from '../lib/closetApi';

/* ============================================================
   AUTH — sign in or create an account. Visitors can also open
   the public demo closet without an account.
============================================================ */
const MESSAGES = {
  'Invalid login credentials': 'That email and password don’t match.',
  'User already registered': 'There’s already an account with that email. Try signing in.',
};

export function AuthScreen({ demoHandle, onViewDemo }) {
  const [mode, setMode] = useState('signin');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const signingUp = mode === 'signup';
  const canSubmit = email.trim() && password.length >= 8 && (!signingUp || name.trim());

  async function submit(e) {
    e.preventDefault();
    if (!canSubmit || busy) return;
    setBusy(true); setError('');
    try {
      if (signingUp) await signUp(email.trim(), password, name.trim());
      else await signIn(email.trim(), password);
      // The session listener in Root takes it from here.
    } catch (err) {
      setError(MESSAGES[err.message] || err.message || 'Something went wrong. Try again.');
      setBusy(false);
    }
  }

  return (
    <div className="auth">
      <div className="auth-brand">edit</div>
      <h1 className="auth-title">Your closet, styled for the day.</h1>
      <p className="auth-lede">
        Photograph the clothes you own. Each morning EDIT puts together an outfit from them,
        based on the weather where you are and what’s on your calendar.
      </p>

      <form className="auth-form" onSubmit={submit}>
        <div className="auth-tabs" role="tablist">
          <button type="button" role="tab" aria-selected={!signingUp} data-on={!signingUp} onClick={() => { setMode('signin'); setError(''); }}>Sign in</button>
          <button type="button" role="tab" aria-selected={signingUp} data-on={signingUp} onClick={() => { setMode('signup'); setError(''); }}>Create account</button>
        </div>

        {signingUp && (
          <label className="form-row">
            <span className="form-label">Your name</span>
            <input className="form-input" autoComplete="name" value={name} onChange={e => setName(e.target.value)} maxLength={60}/>
          </label>
        )}
        <label className="form-row">
          <span className="form-label">Email</span>
          <input className="form-input" type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)}/>
        </label>
        <label className="form-row">
          <span className="form-label">Password</span>
          <input className="form-input" type="password" autoComplete={signingUp ? 'new-password' : 'current-password'}
            value={password} onChange={e => setPassword(e.target.value)} minLength={8}/>
          {signingUp && <span className="form-help">At least 8 characters.</span>}
        </label>

        {error && <div className="form-error" role="alert">{error}</div>}

        <button className="btn btn-primary auth-submit" type="submit" disabled={!canSubmit || busy}>
          {busy ? 'One moment…' : signingUp ? 'Create account' : 'Sign in'}
        </button>
      </form>

      {demoHandle && (
        <button className="auth-demo" onClick={onViewDemo}>
          Just looking? <span>See a demo closet →</span>
        </button>
      )}
    </div>
  );
}
