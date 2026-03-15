import express from 'express';
import cors from 'cors';

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(cors({
  origin: [
    'https://alyssio.github.io',
    'http://127.0.0.1:5500',
    'http://localhost:5500'
  ]
}));

// ── Janitor.ai auth (auto-refresh every 25 min) ──────────────────────────────
const SUPABASE = 'https://mcmzxtzommpnxkynddbo.supabase.co';
let jaiToken   = null;

async function refreshJaiToken() {
  const rt = process.env.JAI_REFRESH_TOKEN;
  if (!rt) { console.error('JAI_REFRESH_TOKEN not set'); return; }
  try {
    const r = await fetch(`${SUPABASE}/auth/v1/token?grant_type=refresh_token`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ refresh_token: rt }),
    });
    const data = await r.json();
    if (data.access_token) {
      jaiToken = data.access_token;
      if (data.refresh_token) process.env.JAI_REFRESH_TOKEN = data.refresh_token;
      console.log('JAI token refreshed OK');
    } else {
      console.error('JAI refresh failed:', JSON.stringify(data));
    }
  } catch(e) { console.error('JAI refresh error:', e.message); }
}

refreshJaiToken();
setInterval(refreshJaiToken, 25 * 60 * 1000);

function jaiHeaders() {
  return {
    'Authorization': `Bearer ${jaiToken}`,
    'User-Agent':    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  };
}

function stripHtml(html) {
  return (html || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

function mapJai(c) {
  const slugs = (c.tags || []).map(t => t.slug);
  return {
    id:          c.id,
    name:        c.name || 'Unknown',
    description: stripHtml(c.description).slice(0, 300),
    avatar:      c.avatar ? `https://ella.janitorai.com/profile-pics/${c.avatar}` : null,
    mlm:         slugs.includes('mlm'),
  };
}

// ── J.AI Discover ─────────────────────────────────────────────────────────────
let jaiCache    = null;
let jaiCacheAt  = 0;
const JAI_TTL   = 60 * 60 * 1000;

const JAI_BLOCK_SLUGS = ['scenario', 'rpg', 'multiplepeople', 'multiplefemales'];

app.get('/jai/discover', async (_req, res) => {
  if (jaiCache && Date.now() - jaiCacheAt < JAI_TTL) {
    return res.json({ characters: jaiCache });
  }
  if (!jaiToken) await refreshJaiToken();
  if (!jaiToken) return res.status(503).json({ error: 'JAI auth not available' });

  try {
    const r = await fetch('https://janitorai.com/hampter/characters?page=1&mode=nsfw&sort=popular', {
      headers: jaiHeaders(),
    });
    const data = await r.json();
    const chars = data.data || [];

    const filtered = chars.filter(c => {
      const slugs = (c.tags || []).map(t => t.slug);
      const hasMale = slugs.includes('male') || slugs.includes('mlm');
      const blocked = JAI_BLOCK_SLUGS.some(s => slugs.includes(s));
      return hasMale && !blocked && c.avatar;
    });

    // Shuffle
    for (let i = filtered.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [filtered[i], filtered[j]] = [filtered[j], filtered[i]];
    }

    jaiCache   = filtered.map(mapJai);
    jaiCacheAt = Date.now();
    res.json({ characters: jaiCache });
  } catch(e) {
    console.error('/jai/discover error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ── Health ────────────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({ ok: true, jaiAuth: !!jaiToken });
});

app.listen(PORT, () => console.log(`Proxy running on port ${PORT}`));
