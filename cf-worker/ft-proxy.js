const TOKEN_ENDPOINT = 'https://entreprise.francetravail.fr/connexion/oauth2/access_token?realm=/partenaire';
const API_BASE       = 'https://api.francetravail.io';

// Each API gets its own token so a failing LBB scope doesn't break FT offres
const API_SCOPES = [
  { prefix: '/partenaire/labonneboite/', scopes: ['api_labonneboitev2 labonneboiteio', 'api_labonneboitev2'] },
  { prefix: '/partenaire/romeo/',        scopes: ['api_romeov2'] },
  { prefix: '/partenaire/',              scopes: ['api_offresdemploiv2 o2dsoffre'] },
];

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

// Per-scope token cache
const tokenCache = {};

async function tryFetchToken(env, scope) {
  const body = new URLSearchParams({
    grant_type:    'client_credentials',
    client_id:     env.FT_CLIENT_ID,
    client_secret: env.FT_CLIENT_SECRET,
    scope,
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

async function getTokenForEndpoint(env, endpoint) {
  // Find which scope list applies to this endpoint
  const entry = API_SCOPES.find(e => endpoint.startsWith(e.prefix));
  const scopeList = entry ? entry.scopes : ['api_offresdemploiv2 o2dsoffre'];

  for (const scope of scopeList) {
    const cached = tokenCache[scope];
    if (cached && Date.now() < cached.exp) {
      return { ok: true, token: cached.tok, scope };
    }
    const r = await tryFetchToken(env, scope);
    if (r.ok) {
      tokenCache[scope] = {
        tok: r.data.access_token,
        exp: Date.now() + (r.data.expires_in - 60) * 1000,
      };
      return { ok: true, token: tokenCache[scope].tok, scope };
    }
  }
  return { ok: false, detail: `Aucun scope fonctionnel pour ${endpoint}` };
}

async function handleRequest(request, env) {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (request.method !== 'POST')    return json({ error: 'Method not allowed' }, 405);
  if (!env.FT_CLIENT_ID || !env.FT_CLIENT_SECRET)
    return json({ error: 'Secrets manquants — configure FT_CLIENT_ID et FT_CLIENT_SECRET' }, 503);

  let reqBody = {};
  try {
    const txt = await request.text();
    if (txt && txt.trim().startsWith('{')) reqBody = JSON.parse(txt);
  } catch (_) {}

  if (reqBody.endpoint) {
    if (!reqBody.endpoint.startsWith('/partenaire/'))
      return json({ error: 'Endpoint interdit' }, 403);

    const tok = await getTokenForEndpoint(env, reqBody.endpoint);
    if (!tok.ok) return json({ error: 'Échec token FT', detail: tok.detail }, 502);

    const url = API_BASE + reqBody.endpoint;
    const ftHeaders = { Authorization: 'Bearer ' + tok.token, Accept: 'application/json' };
    if (reqBody.body) ftHeaders['Content-Type'] = 'application/json';

    const ftRes = await fetch(url, {
      method:  reqBody.method || 'GET',
      headers: ftHeaders,
      body:    reqBody.body ? JSON.stringify(reqBody.body) : undefined,
    });
    const text = await ftRes.text();
    let data = {};
    try { data = JSON.parse(text); } catch (_) { data = { raw: text.slice(0, 1000) }; }
    if (!ftRes.ok) data._scope = tok.scope;
    return json(data, ftRes.status);
  }

  // Health / token check (no endpoint provided)
  const tok = await getTokenForEndpoint(env, '/partenaire/');
  if (!tok.ok) return json({ error: 'Échec token FT', detail: tok.detail }, 502);
  return json({ ok: true, scope: tok.scope, expires_in: Math.round((tokenCache[tok.scope]?.exp - Date.now()) / 1000) });
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
