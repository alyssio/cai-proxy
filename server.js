const express = require('express');
const cors    = require('cors');
const CharacterAI = require('node_characterai');

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(cors({
  origin: [
    'https://alyssio.github.io',
    'http://127.0.0.1:5500',
    'http://localhost:5500'
  ]
}));

const client = new CharacterAI();
let ready = false;

async function init() {
  await client.authenticateWithToken(process.env.CAI_TOKEN);
  ready = true;
  console.log('Authenticated with Character.AI');
}
init().catch(err => console.error('Auth failed:', err));

function checkReady(req, res, next) {
  if (!ready) return res.status(503).json({ error: 'Server warming up, try again shortly.' });
  next();
}

function mapChar(c) {
  return {
    id:          c.external_id,
    name:        c.participant__name ?? c.name ?? 'Unknown',
    description: c.description ?? c.title ?? '',
    avatar:      c.avatar_file_name
                   ? `https://characterai.io/i/200/www/avatars/${c.avatar_file_name}`
                   : null,
  };
}

// Trending/featured characters
app.get('/discover', checkReady, async (req, res) => {
  try {
    const data  = await client.fetchFeaturedCharacters();
    const chars = (data.featured_characters ?? data.characters ?? []).map(mapChar);
    res.json({ characters: chars });
  } catch (err) {
    console.error('/discover error:', err);
    res.status(500).json({ error: 'Failed to fetch characters.' });
  }
});

// Search characters
app.get('/search', checkReady, async (req, res) => {
  const q = (req.query.q ?? '').trim();
  if (!q) return res.status(400).json({ error: 'Missing ?q= parameter.' });
  try {
    const data  = await client.searchCharacters(q);
    const chars = (data.characters ?? []).map(mapChar);
    res.json({ characters: chars });
  } catch (err) {
    console.error('/search error:', err);
    res.status(500).json({ error: 'Search failed.' });
  }
});

// Health check
app.get('/health', (req, res) => res.json({ ok: true, ready }));

app.listen(PORT, () => console.log(`CAI proxy running on port ${PORT}`));
