import { describe, it, expect, vi, afterEach } from 'vitest';
import handler, { config } from './functions/keepalive.mjs';

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe('keepalive', () => {
  it('runs once a day', () => {
    expect(config.schedule).toBe('@daily');
  });

  it('makes one cheap read against Supabase with the public key', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co');
    vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', 'sb_publishable_test');
    const fetch = vi.fn().mockResolvedValue(new Response('[]', { status: 200 }));
    vi.stubGlobal('fetch', fetch);
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const res = await handler();
    expect(res.status).toBe(204);
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe('https://example.supabase.co/rest/v1/profiles?select=id&limit=1');
    expect(init.headers.apikey).toBe('sb_publishable_test');
  });

  it('reports a failure when Supabase is down', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co');
    vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', 'k');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 503 })));
    vi.spyOn(console, 'log').mockImplementation(() => {});
    expect((await handler()).status).toBe(502);
  });

  it('fails clearly when it is not configured', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', '');
    expect((await handler()).status).toBe(500);
  });
});
