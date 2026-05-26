const TOKEN_ENDPOINT = 'https://entreprise.francetravail.fr/connexion/oauth2/access_token?realm=/partenaire';
const API_BASE       = 'https://api.francetravail.io';
const SCOPE          = 'api_offresdemploiv2 o2dsoffre api_labonneboitev2';

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

async function getToken(env) {
  if (_tok && Date.now() < _tokExp) return { ok: true, token: _tok };
  const body = new URLSearchParams({
    grant_type:    'client_credentials',
    client_id:     env.FT_CLIENT_ID,
    client_secret: env.FT_CLIENT_SECRET,
    scope:         SCOPE,
  });
  const res = await fetch(TOKEN_ENDPOINT, {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    body.toString(),
  });
  const text = await res.text();
  if (!res.ok) return { ok: false, status: res.status, detail: text };
  const data = JSON.parse(text);
  _tok    = data.access_token;
  _tokExp = Date.now() + (data.expires_in - 60) * 1000;
  return { ok: true, token: _tok };
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
