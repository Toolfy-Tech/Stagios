/**
 * Stagios — Cloudflare Worker : proxy OAuth2 France Travail
 *
 * Déploiement :
 *   cd cf-worker
 *   wrangler secret put FT_CLIENT_ID     ← colle ton Client ID
 *   wrangler secret put FT_CLIENT_SECRET ← colle ton Client Secret
 *   wrangler deploy
 *
 * L'URL affichée après "wrangler deploy" est à ajouter dans les GitHub Secrets
 * sous le nom  FT_PROXY_URL  (ex: https://stagios-ft-proxy.moncompte.workers.dev)
 */

const ALLOWED_ORIGIN = 'https://toolfy-tech.github.io';
const TOKEN_ENDPOINT = 'https://entreprise.francetravail.fr/connexion/oauth2/access_token?realm=/partenaire';
const SCOPE          = 'api_offresdemploiv2 o2dsoffre';

const CORS = {
  'Access-Control-Allow-Origin':  ALLOWED_ORIGIN,
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS });
    }

    if (request.method !== 'POST') {
      return json({ error: 'Method not allowed' }, 405);
    }

    if (!env.FT_CLIENT_ID || !env.FT_CLIENT_SECRET) {
      return json({ error: 'Worker non configuré — ajoute FT_CLIENT_ID et FT_CLIENT_SECRET via wrangler secret put' }, 503);
    }

    const body = new URLSearchParams({
      grant_type:    'client_credentials',
      client_id:     env.FT_CLIENT_ID,
      client_secret: env.FT_CLIENT_SECRET,
      scope:         SCOPE,
    });

    try {
      const ftRes = await fetch(TOKEN_ENDPOINT, {
        method:  'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body:    body.toString(),
      });

      if (!ftRes.ok) {
        return json({ error: 'FT auth failed', status: ftRes.status }, ftRes.status);
      }

      const { access_token, expires_in } = await ftRes.json();
      return json({ access_token, expires_in });

    } catch (err) {
      return json({ error: 'Erreur Worker', message: err.message }, 502);
    }
  },
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}
