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
    avatar:      c.avatar_file_name
                   ? `https://characterai.io/i/200/www/avatars/${c.avatar_file_name}`
                   : null,
  };
}

// Featured/recommended characters
app.get('/discover', async (_req, res) => {
  try {
    const r    = await fetch('https://feed.api.character.ai/api/feed/recommended', { headers: HEADERS });
    const text = await r.text();
    console.log(`recommended → ${r.status}: ${text.slice(0, 300)}`);
    const data = JSON.parse(text);
    // Dig through possible response shapes
    const list = data?.characters
              ?? data?.results
              ?? data?.data?.characters
              ?? data?.feed?.map(item => item.character ?? item).filter(Boolean)
              ?? [];
    res.json({ characters: list.map(mapChar) });
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
    const r    = await fetch(`https://character.ai/api/trpc/character.search?input=${encodeURIComponent(JSON.stringify({ query: q }))}`, { headers: HEADERS });
    const text = await r.text();
    const data = JSON.parse(text);
    const list = data?.result?.data?.json?.characters ?? data?.characters ?? [];
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
