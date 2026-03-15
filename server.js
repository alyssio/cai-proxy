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
let jaiCache   = null;
let jaiCacheAt = 0;
const JAI_TTL  = 60 * 60 * 1000;

const JAI_BLOCK_SLUGS = ['scenario', 'rpg', 'multiplepeople', 'multiplefemales'];

app.get('/jai/discover', async (_req, res) => {
  if (jaiCache && Date.now() - jaiCacheAt < JAI_TTL) {
    return res.json({ characters: jaiCache });
  }

  try {
    const r = await fetch('https://janitorai.com/hampter/characters?page=1&mode=nsfw&sort=popular', {
      headers: {
        'User-Agent':      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept':          'application/json, text/plain, */*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer':         'https://janitorai.com/characters',
        'Origin':          'https://janitorai.com',
        'sec-ch-ua':       '"Chromium";v="122", "Not(A:Brand";v="24"',
        'sec-ch-ua-platform': '"Windows"',
        'sec-fetch-dest':  'empty',
        'sec-fetch-mode':  'cors',
        'sec-fetch-site':  'same-origin',
      },
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
  res.json({ ok: true });
});

app.listen(PORT, () => console.log(`Proxy running on port ${PORT}`));
