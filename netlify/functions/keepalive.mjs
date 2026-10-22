// Free Supabase projects pause after a week without traffic, which would
// break the public demo link. Netlify runs this once a day to keep it awake.
export const config = { schedule: '@daily' };

export default async () => {
  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return new Response('Supabase env vars not set', { status: 500 });

  const res = await fetch(`${url}/rest/v1/profiles?select=id&limit=1`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  console.log(`keepalive: Supabase responded ${res.status}`);
  return new Response(null, { status: res.ok ? 204 : 502 });
};
