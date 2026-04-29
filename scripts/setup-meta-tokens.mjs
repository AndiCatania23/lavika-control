#!/usr/bin/env node
/**
 * setup-meta-tokens.mjs
 * ─────────────────────────────────────────────────────────────────
 * Converte un User Access Token short-lived (2h) ottenuto dal Graph
 * API Explorer in:
 *   • Long-lived User Access Token (60 giorni)
 *   • Page Access Token (NON scade mai)
 *   • Instagram Business Account ID linkato alla Page
 *
 * Uso:
 *   export META_APP_ID='xxx'
 *   export META_APP_SECRET='yyy'
 *   export META_USER_TOKEN='zzz'  # short-lived da Graph API Explorer
 *   node scripts/setup-meta-tokens.mjs
 *
 * Output: stampa le env vars da copiare in:
 *   • ~/LAVIKA-SPORT/repos/control/.env.local  (per dev locale)
 *   • Vercel project env vars (per prod)
 * ─────────────────────────────────────────────────────────────────
 */

const APP_ID     = process.env.META_APP_ID;
const APP_SECRET = process.env.META_APP_SECRET;
const USER_TOKEN = process.env.META_USER_TOKEN;
const API        = 'https://graph.facebook.com/v25.0';

function bail(msg) { console.error(`\n❌ ${msg}\n`); process.exit(1); }

if (!APP_ID || !APP_SECRET || !USER_TOKEN) {
  bail('Mancano variabili: META_APP_ID, META_APP_SECRET, META_USER_TOKEN.\n   Esempio:\n   export META_APP_ID=\'1234567890\'\n   export META_APP_SECRET=\'abc123...\'\n   export META_USER_TOKEN=\'EAA...\'  # da https://developers.facebook.com/tools/explorer/');
}

async function call(url) {
  const r = await fetch(url);
  const text = await r.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { error: { message: text } }; }
  if (!r.ok || json.error) {
    console.error('\n❌ API error:', JSON.stringify(json.error || json, null, 2));
    process.exit(1);
  }
  return json;
}

(async () => {
  console.log('\n🔄 Step 1/3 — Scambio short-lived → long-lived user token...');
  const longLived = await call(
    `${API}/oauth/access_token?` +
    `grant_type=fb_exchange_token&` +
    `client_id=${APP_ID}&` +
    `client_secret=${APP_SECRET}&` +
    `fb_exchange_token=${USER_TOKEN}`
  );
  const userTokenLong = longLived.access_token;
  const expiresInDays = longLived.expires_in ? Math.round(longLived.expires_in / 86400) : 'never';
  console.log(`   ✅ Long-lived user token ottenuto (scade in ${expiresInDays} giorni)`);

  console.log('\n🔄 Step 2/3 — Recupero Page Access Token (mai scade)...');
  const pages = await call(
    `${API}/me/accounts?fields=id,name,access_token,instagram_business_account&access_token=${userTokenLong}`
  );

  if (!pages.data || pages.data.length === 0) {
    bail('Nessuna Page trovata. Verifica che il tuo profilo FB sia admin di almeno una Page e che l\'app abbia il permission pages_show_list.');
  }

  console.log(`   ✅ Trovate ${pages.data.length} Page${pages.data.length === 1 ? '' : 's'}:`);
  pages.data.forEach((p, i) => {
    const ig = p.instagram_business_account ? `IG: ${p.instagram_business_account.id}` : 'no IG linked';
    console.log(`      ${i + 1}. ${p.name} (id: ${p.id}, ${ig})`);
  });

  // Auto-pick LAVIKA Page if found, else first
  const lavika = pages.data.find(p => /lavika/i.test(p.name));
  const page = lavika || pages.data[0];
  if (!lavika && pages.data.length > 1) {
    console.log(`\n   ⚠️  Più di una Page trovata — uso la prima (${page.name}). Se vuoi un'altra, modifica lo script.`);
  } else if (lavika) {
    console.log(`\n   ✅ Selezionata Page LAVIKA: ${page.name}`);
  }

  if (!page.instagram_business_account) {
    console.log(`\n   ⚠️  La Page "${page.name}" non ha un Instagram Business Account collegato!`);
    console.log('      Vai su business.facebook.com → Account Instagram → collegalo a questa Page.');
  }

  console.log('\n🔄 Step 3/3 — Verifica IG Business Account...');
  const igId = page.instagram_business_account?.id;
  if (igId) {
    const igInfo = await call(
      `${API}/${igId}?fields=id,username,name,profile_picture_url&access_token=${page.access_token}`
    );
    console.log(`   ✅ IG Business: @${igInfo.username} (id: ${igInfo.id})`);
  }

  // ────────────────────────────────────────────────────────────────
  // Output finale: env vars da copiare
  // ────────────────────────────────────────────────────────────────
  console.log('\n' + '═'.repeat(70));
  console.log('✅ TUTTO PRONTO. Copia queste env vars in:');
  console.log('   • ~/LAVIKA-SPORT/repos/control/.env.local  (dev locale)');
  console.log('   • Vercel: Settings → Environment Variables (prod)');
  console.log('═'.repeat(70));
  console.log(`\nMETA_APP_ID=${APP_ID}`);
  console.log(`META_APP_SECRET=${APP_SECRET}`);
  console.log(`META_PAGE_ID=${page.id}`);
  console.log(`META_PAGE_ACCESS_TOKEN=${page.access_token}`);
  if (igId) console.log(`META_IG_BUSINESS_ID=${igId}`);
  console.log(`META_PAGE_NAME='${page.name}'`);
  console.log('\n' + '═'.repeat(70));
  console.log('ℹ️  Page Access Token NON scade mai (se app in Live mode mantiene Standard Access).');
  console.log('   In Development mode, il token vive ~60gg ma puoi sempre rigenerarlo.\n');
})();
