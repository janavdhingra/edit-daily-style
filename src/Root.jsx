import { useState, useEffect, useMemo } from 'react';
import { supabase } from './lib/supabase';
import * as api from './lib/closetApi';
import { KEYS, userStorage, memoryStorage } from './lib/storage';
import { App } from './App';
import { parseWeather } from './lib/weather';
import { AuthScreen } from './screens/Auth';
import { ProfileSetup } from './screens/ProfileSetup';

/* ============================================================
   ROOT — decides what to show:
     ?closet=<handle>  → that public closet, read-only (the demo)
     signed out        → sign in / create account
     new account       → one-screen profile setup
     otherwise         → your closet
============================================================ */
const DEMO_HANDLE = import.meta.env.VITE_DEMO_HANDLE || '';

function closetParam() {
  return new URLSearchParams(window.location.search).get('closet');
}
function setClosetParam(handle) {
  const url = new URL(window.location.href);
  if (handle) url.searchParams.set('closet', handle);
  else url.searchParams.delete('closet');
  window.history.pushState({}, '', url);
}

export function Root() {
  const [demoHandle, setDemoHandle] = useState(closetParam);
  const [session, setSession] = useState(undefined); // undefined = still checking
  const [account, setAccount] = useState(null);      // { profile, items }
  const [demo, setDemo] = useState(null);            // { profile, items } | 'missing'
  const [error, setError] = useState('');

  useEffect(() => {
    const onPop = () => setDemoHandle(closetParam());
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  // Session: read the stored one, then follow sign-in / sign-out.
  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  const userId = session?.user?.id || null;

  // Load the signed-in user's profile and closet.
  useEffect(() => {
    if (!userId) { setAccount(null); return; }
    let cancelled = false;
    setError('');
    Promise.all([api.loadProfile(userId), api.listItems(userId)])
      .then(([profile, items]) => { if (!cancelled) setAccount({ profile, items }); })
      .catch(err => { if (!cancelled) setError(err.message || 'Could not load your closet.'); });
    return () => { cancelled = true; };
  }, [userId]);

  // Load a public closet for the demo link.
  useEffect(() => {
    if (!demoHandle || !supabase) { setDemo(null); return; }
    let cancelled = false;
    setDemo(null);
    api.loadPublicCloset(demoHandle)
      .then(data => { if (!cancelled) setDemo(data || 'missing'); })
      .catch(() => { if (!cancelled) setDemo('missing'); });
    return () => { cancelled = true; };
  }, [demoHandle]);

  const store = useMemo(() => (userId ? userStorage(userId) : null), [userId]);
  const demoStore = useMemo(() => memoryStorage(), [demo]); // fresh each visit

  const openDemo = () => { setClosetParam(DEMO_HANDLE); setDemoHandle(DEMO_HANDLE); };
  const exitDemo = () => { setClosetParam(null); setDemoHandle(null); };

  async function saveProfile(next) {
    const saved = await api.saveProfile(userId, account.profile, next);
    setAccount(a => ({ ...a, profile: saved }));
    return saved;
  }

  // Development only: ?preview shows the app with a sample closet, signed out.
  // Vite strips this branch from production builds.
  if (import.meta.env.DEV && new URLSearchParams(window.location.search).has('preview')) {
    return <DevPreview/>;
  }

  if (!supabase) {
    return <Shell><Message title="Not configured">Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY, then rebuild.</Message></Shell>;
  }

  if (demoHandle) {
    if (demo === null) return <Shell><Loading/></Shell>;
    if (demo === 'missing') {
      return (
        <Shell>
          <Message title="Closet not found">
            That closet doesn’t exist or isn’t public any more.
            <button className="btn btn-primary" style={{ marginTop: 20 }} onClick={exitDemo}>Go to EDIT</button>
          </Message>
        </Shell>
      );
    }
    return (
      <App key={`demo:${demoHandle}`} readOnly userId={null} store={demoStore}
        initialProfile={demo.profile} initialItems={demo.items} onExitDemo={exitDemo}/>
    );
  }

  if (session === undefined) return <Shell><Loading/></Shell>;
  if (!session) {
    return <Shell scroll><AuthScreen demoHandle={DEMO_HANDLE} onViewDemo={openDemo}/></Shell>;
  }
  if (error) {
    return (
      <Shell>
        <Message title="Couldn’t load your closet">
          {error}
          <button className="btn btn-secondary" style={{ marginTop: 20 }} onClick={() => window.location.reload()}>Try again</button>
        </Message>
      </Shell>
    );
  }
  if (!account) return <Shell><Loading/></Shell>;
  if (!account.profile?.setupDone) {
    return <Shell scroll><ProfileSetup profile={account.profile} onDone={saveProfile}/></Shell>;
  }
  return (
    <App key={userId} userId={userId} store={store}
      initialProfile={account.profile} initialItems={account.items}
      onSaveProfile={saveProfile} onSignOut={() => api.signOut()}/>
  );
}

function Shell({ children, scroll }) {
  return <div className="phone">{scroll ? <div className="scroll">{children}</div> : children}</div>;
}
function Loading() {
  return <div className="center-message"><div className="spinner" aria-label="Loading"/></div>;
}
function Message({ title, children }) {
  return (
    <div className="center-message">
      <h2>{title}</h2>
      <div>{children}</div>
    </div>
  );
}

function DevPreview() {
  const [data, setData] = useState(null);
  const store = useMemo(() => memoryStorage(), []);
  useEffect(() => {
    // ?preview=portfolio loads a scene from the git-ignored portfolio-shots/
    // folder (closet photos, an event, a location); plain ?preview uses the
    // sample closet from the tests.
    const scene = new URLSearchParams(window.location.search).get('preview');
    if (scene === 'portfolio') {
      fetch('/portfolio-shots/closet.json').then(r => r.json()).then(d => {
        const now = new Date();
        const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
        store.set(KEYS.events, { [today]: [{ id: 'ev_preview', ...d.event }] });
        store.set(KEYS.location, d.location);
        if (d.feedback) store.set(KEYS.feedback, d.feedback); // e.g. pieces the user has hearted
        // Optional saved forecast, so a scene can be replayed on another day.
        const weather = d.weatherFile
          ? fetch(d.weatherFile).then(r => r.json()).then(w => store.set(KEYS.weather, { ...parseWeather(w), fetchedAt: Date.now() }))
          : Promise.resolve();
        weather.then(() => setData({ profile: { ...api.PREF_DEFAULTS, ...d.profile, setupDone: true }, items: d.items }));
      });
      return;
    }
    import('./test/sampleCloset').then(m => setData({
      profile: { ...api.PREF_DEFAULTS, ...m.sampleProfile, name: 'Preview', handle: 'preview', isPublic: false, setupDone: true },
      items: m.sampleCloset(),
    }));
  }, [store]);
  if (!data) return <Shell><Loading/></Shell>;
  return <App userId="preview" store={store} initialProfile={data.profile} initialItems={data.items}
    onSaveProfile={async p => p} onSignOut={() => {}}/>;
}
