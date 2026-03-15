import express from 'express';
import cors from 'cors';

const app  = express();
const PORT = process.env.PORT || 3000;
const TOKEN = process.env.CAI_TOKEN; // just the hex, no "Token " prefix

app.use(cors({
  origin: [
    'https://alyssio.github.io',
    'http://127.0.0.1:5500',
    'http://localhost:5500'
  ]
}));

const HEADERS = {
  'Authorization': `Token ${TOKEN}`,
  'Content-Type': 'application/json',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  'Referer': 'https://character.ai/',
  'Origin': 'https://character.ai',
};

function mapChar(c) {
  return {
    id:          c.external_id ?? c.id ?? '',
    name:        c.participant__name ?? c.name ?? 'Unknown',
    description: c.description ?? c.tagline ?? c.title ?? '',
    greeting:    c.greeting ?? '',
    avatar:      c.avatar_file_name
                   ? `https://characterai.io/i/400/static/avatars/${c.avatar_file_name}?webp=true&anim=0`
                   : null,
  };
}

// Discover — search popular terms and combine results
app.get('/discover', async (_req, res) => {
  const terms = ['anime', 'fantasy', 'romance', 'adventure', 'villain', 'mentor'];
  try {
    const results = await Promise.all(terms.map(async term => {
      const input = encodeURIComponent(JSON.stringify({ "0": { json: { searchQuery: term, sortedBy: 'relevance' } } }));
      const r    = await fetch(`https://character.ai/api/trpc/search.search?batch=1&input=${input}`, { headers: HEADERS });
      const text = await r.text();
      console.log(`search "${term}" → ${r.status}: ${text.slice(0, 200)}`);
      const data = JSON.parse(text);
      const inner = Array.isArray(data) ? data[0] : data;
      return inner?.result?.data?.json?.characters ?? inner?.characters ?? [];
    }));
    // Flatten, dedupe by id, shuffle
    const seen = new Set();
    const all  = results.flat().filter(c => {
      const id = c.external_id ?? c.id;
      if (!id || seen.has(id)) return false;
      if (!c.avatar_file_name) return false;
      seen.add(id);
      return true;
    });
    // Shuffle
    for (let i = all.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [all[i], all[j]] = [all[j], all[i]];
    }
    res.json({ characters: all.map(mapChar) });
  } catch (err) {
    console.error('/discover error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Search characters
app.get('/search', async (req, res) => {
  const q = (req.query.q ?? '').trim();
  if (!q) return res.status(400).json({ error: 'Missing ?q= parameter.' });
  try {
    const input = encodeURIComponent(JSON.stringify({ "0": { json: { searchQuery: q, sortedBy: 'relevance' } } }));
    const r    = await fetch(`https://character.ai/api/trpc/search.search?batch=1&input=${input}`, { headers: HEADERS });
    const text = await r.text();
    const data = JSON.parse(text);
    const inner = Array.isArray(data) ? data[0] : data;
    const list = inner?.result?.data?.json?.characters ?? inner?.characters ?? [];
    res.json({ characters: list.map(mapChar) });
  } catch (err) {
    console.error('/search error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Character detail (for getting greeting/opening message)
app.get('/character/:id', async (req, res) => {
  const id = req.params.id;
  try {
    const r    = await fetch(`https://character.ai/api/trpc/character.getCharacter?input=${encodeURIComponent(JSON.stringify({ external_id: id }))}`, { headers: HEADERS });
    const text = await r.text();
    const data = JSON.parse(text);
    const char = data?.result?.data?.json?.character ?? data?.character ?? data;
    res.json({
      id:          char.external_id ?? id,
      name:        char.participant__name ?? char.name ?? '',
      description: char.description ?? '',
      greeting:    char.greeting ?? char.starter ?? '',
      avatar:      char.avatar_file_name
                     ? `https://characterai.io/i/400/www/avatars/${char.avatar_file_name}`
                     : null,
    });
  } catch (err) {
    console.error('/character error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Avatar proxy — fetch characterai.io images server-side to bypass CDN blocking
app.get('/avatar', async (req, res) => {
  const url = req.query.url;
  if (!url || !url.startsWith('https://characterai.io/')) {
    return res.status(400).json({ error: 'Invalid URL' });
  }
  try {
    const r = await fetch(url, { headers: {
      'Referer': 'https://character.ai/',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    } });
    const ct = r.headers.get('content-type') || '';
    console.log(`/avatar ${r.status} ${ct} ${url.slice(0, 80)}`);
    if (!r.ok) {
      const body = await r.text();
      console.log('/avatar error body:', body.slice(0, 200));
      return res.status(r.status).json({ error: body.slice(0, 200) });
    }
    const buf = await r.arrayBuffer();
    res.set('Content-Type', ct || 'image/jpeg');
    res.set('Cache-Control', 'public, max-age=86400');
    res.send(Buffer.from(buf));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// Health + token check
app.get('/health', async (_req, res) => {
  try {
    const r = await fetch('https://character.ai/api/trpc/user.get', { headers: HEADERS });
    const ok = r.ok;
    res.json({ ok: true, auth: ok, status: r.status });
  } catch (e) {
    res.json({ ok: true, auth: false, error: e.message });
  }
});

app.listen(PORT, () => console.log(`CAI proxy running on port ${PORT}`));
