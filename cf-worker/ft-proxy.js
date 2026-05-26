const TOKEN_ENDPOINT = 'https://entreprise.francetravail.fr/connexion/oauth2/access_token?realm=/partenaire';
const API_BASE       = 'https://api.francetravail.io';

// Try full scope (including LBB v2) first; fall back to minimal if LBB not authorized
const SCOPE_FULL = 'api_offresdemploiv2 o2dsoffre api_labonneboitev2 labonneboiteio api_romeov2 nomenclatureRome';
const SCOPE_MIN  = 'api_offresdemploiv2 o2dsoffre';

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

let _tok = null;
let _tokExp = 0;

async function tryFetchToken(env, scope) {
  const body = new URLSearchParams({
    grant_type:    'client_credentials',
    client_id:     env.FT_CLIENT_ID,
    client_secret: env.FT_CLIENT_SECRET,
    scope:         scope,
  });
  const res = await fetch(TOKEN_ENDPOINT, {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    body.toString(),
  });
  const text = await res.text();
  if (!res.ok) return { ok: false, status: res.status, detail: text };
  const data = JSON.parse(text);
  return { ok: true, data };
}

async function getToken(env) {
  if (_tok && Date.now() < _tokExp) return { ok: true, token: _tok };

  // Try full scope first (LBB included), fall back to minimal so FT always works
  let lastErr = null;
  for (const scope of [SCOPE_FULL, SCOPE_MIN]) {
    const r = await tryFetchToken(env, scope);
    if (r.ok) {
      _tok    = r.data.access_token;
      _tokExp = Date.now() + (r.data.expires_in - 60) * 1000;
      return { ok: true, token: _tok };
    }
    lastErr = r;
  }
  return { ok: false, status: lastErr?.status, detail: lastErr?.detail };
}

async function handleRequest(request, env) {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (request.method !== 'POST')    return json({ error: 'Method not allowed' }, 405);
  if (!env.FT_CLIENT_ID || !env.FT_CLIENT_SECRET)
    return json({ error: 'Secrets manquants — configure FT_CLIENT_ID et FT_CLIENT_SECRET' }, 503);

  const tok = await getToken(env);
  if (!tok.ok) return json({ error: 'Échec token FT', ftStatus: tok.status, ftDetail: tok.detail }, 502);

  let reqBody = {};
  try {
    const txt = await request.text();
    if (txt && txt.trim().startsWith('{')) reqBody = JSON.parse(txt);
  } catch (_) {}

  if (reqBody.endpoint) {
    if (!reqBody.endpoint.startsWith('/partenaire/'))
      return json({ error: 'Endpoint interdit' }, 403);
    const url = API_BASE + reqBody.endpoint;
    const ftHeaders = { Authorization: 'Bearer ' + tok.token, Accept: 'application/json' };
    if (reqBody.body) ftHeaders['Content-Type'] = 'application/json';
    const ftRes = await fetch(url, {
      method:  reqBody.method || 'GET',
      headers: ftHeaders,
      body:    reqBody.body ? JSON.stringify(reqBody.body) : undefined,
    });
    const data = await ftRes.json().catch(() => ({}));
    return json(data, ftRes.status);
  }

  return json({ access_token: tok.token, expires_in: Math.round((_tokExp - Date.now()) / 1000) });
}

export default {
  async fetch(request, env) {
    try {
      return await handleRequest(request, env);
    } catch (err) {
      return json({ error: 'Erreur Worker', message: err.message }, 502);
    }
  },
};
