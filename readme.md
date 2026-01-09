# MovieScrubber v2.0

Lokale catalogus van streaming-beschikbaarheid met intelligente 7-daagse cycle en slick search interface.

## ✨ Features

- 🔄 **7-Day Continuous Cycle**: Automatisch door Trakt lijst heen
- 🔍 **Real-time Search**: Instant zoeken met debouncing
- 📸 **On-demand Screenshots**: Puppeteer screenshots per link
- 🎨 **Beautiful UI**: Modern dark theme met smooth animations
- 🔗 **Smart Links**: Favicons + previews + click-through
- 🧹 **Self-healing**: Dode links worden automatisch verwijderd en vervangen

## Installatie

```bash
# 1. Clone repository
git clone <your-repo-url>
cd moviescrubber

# 2. Installeer dependencies (inclusief Puppeteer)
npm install

# 3. Configureer environment
cp .env.example .env
# Edit .env met je API keys

# 4. Create public directory voor frontend
mkdir -p public

# 5. Test
node src/index.js search
```

## 📁 Project Structuur

```
moviescrubber/
├── src/
│   ├── index.js       # Main entry point
│   ├── db.js          # Database (SQLite)
│   ├── config.js      # Environment config
│   ├── trakt.js       # Trakt API
│   ├── google.js      # Google Search API
│   ├── linkCheck.js   # Link availability
│   ├── screenshot.js  # Puppeteer screenshots ← NEW!
│   ├── server.js      # HTTP server met routes
│   └── logger.js      # Logging
├── public/
│   └── index.html     # Search frontend ← NEW!
├── db/
│   └── catalog.sqlite # Database (auto-created)
├── .env               # Your config
├── .env.example       # Template
├── package.json
└── README.md
```

## Configuratie (.env)

```bash
TRAKT_API_KEY=your_trakt_key_here
GOOGLE_API_KEY=your_google_key_here
GOOGLE_CSE_ID=your_cse_id_here
MAX_QUERIES=100
DOMAINS=netflix.com,primevideo.com,disneyplus.com,hbomax.com
```

## Gebruik

### Backend (Data Collection)

```bash
# Search mode (dagelijks)
node src/index.js search

# Check mode (wekelijks)
node src/index.js check

# Both mode
node src/index.js both
```

### Frontend (Search Interface)

Open http://localhost:3000

**Features:**
- 🔍 Type to search (debounced, 300ms)
- 📊 Real-time result stats
- 🖼️ Click "Load Preview" voor screenshot
- 🔗 Click screenshot om naar link te gaan
- 🎯 Favicons per domain (Google S2 API)

### Dashboard (Admin)

Open http://localhost:3000/dashboard

**Features:**
- 📊 Cycle progress (7-day visualization)
- 📈 Database statistics
- 📝 Live logs
- 🔄 Auto-refresh

## API Endpoints

```
GET  /                  → Search interface (frontend)
GET  /dashboard         → Admin dashboard
GET  /api/links         → JSON array van alle links
POST /api/screenshot    → Take screenshot van URL
GET  /stats             → Database statistics
GET  /logs              → Plain text logs
GET  /status            → Health check
```

## Screenshot API

```bash
# Request
POST /api/screenshot
Content-Type: application/json

{
  "url": "https://www.netflix.com/title/123"
}

# Response
{
  "screenshot": "data:image/jpeg;base64,...",
  "url": "https://www.netflix.com/title/123"
}
```

## Dagelijkse Cron Job

```bash
# Elke dag om 3 AM: search 100 nieuwe titles
0 3 * * * cd /path/to/moviescrubber && node src/index.js search >> logs/daily.log 2>&1

# Elke zondag om 4 AM: check bestaande links
0 4 * * 0 cd /path/to/moviescrubber && node src/index.js check >> logs/weekly.log 2>&1
```

## Hoe het werkt

### Backend Cycle

```
DAY 1 (Offset 0)
├─ Remove dead links
├─ Fetch Trakt titles 1-200
├─ Filter unqueried titles
├─ Query first 100 → Google (all domains)
└─ Update offset to 200

DAY 2 (Offset 200)
├─ Remove dead links
├─ Fetch Trakt titles 201-400
├─ Filter unqueried titles
├─ Query next 100 → Google (all domains)
└─ Update offset to 400

...

DAY 8 (Auto-reset)
└─ Cycle > 7 days → Reset to offset 0
```

### Frontend Flow

```
1. User types search query
   ↓
2. 300ms debounce
   ↓
3. Filter allLinks array (client-side)
   ↓
4. Display result cards with favicons
   ↓
5. User clicks "Load Preview"
   ↓
6. POST /api/screenshot
   ↓
7. Puppeteer takes screenshot
   ↓
8. Display as thumbnail
   ↓
9. User clicks thumbnail → open link
```

## Database Schema

```sql
-- Links
CREATE TABLE links (
  url TEXT PRIMARY KEY,
  trakt_id INTEGER,
  title TEXT,
  type TEXT,
  domain TEXT,
  available INTEGER
);

-- Queries (cleared every 7 days)
CREATE TABLE queries (
  trakt_id INTEGER PRIMARY KEY,
  queried_at INTEGER
);

-- Metadata (cycle tracking)
CREATE TABLE metadata (
  key TEXT PRIMARY KEY,
  value TEXT
);
```

## Performance

**Screenshot caching:**
- Screenshots worden on-demand gemaakt
- Niet gecached (te veel storage)
- Browser reuse voor snelheid (~1-3 seconden per screenshot)

**Search performance:**
- Client-side filtering (alle links in memory)
- 300ms debounce
- Instant results voor duizenden links

**Memory usage:**
- ~10-50MB voor Puppeteer browser
- ~1-5MB voor links array
- ~1-10MB voor database

## Troubleshooting

**"No candidates found"**
→ Normaal na paar dagen, cycle reset na 7 dagen

**Dead links stapelen op**
→ Run `check` mode, dan `search` om te verwijderen

**Google quota exceeded**
→ Wacht tot morgen of verlaag MAX_QUERIES

**Screenshot timeout**
→ Sommige sites zijn traag, timeout is 10 seconden

**Puppeteer install fails**
→ Run: `PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true npm install` (uses system Chrome)

**Frontend not loading**
→ Make sure `public/index.html` exists

## Dependencies

```json
{
  "dotenv": "^16.4.5",      // Environment variables
  "puppeteer": "^21.0.0",   // Screenshots
  "sql.js": "^1.13.0"       // SQLite in memory
}
```

## Browser Requirements

Puppeteer downloads Chromium automatically (~170MB). For production:

```bash
# Use system Chrome instead
export PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
export PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome
npm install
```

## API Keys

**Trakt:** https://trakt.tv/oauth/applications
**Google API:** https://console.cloud.google.com/
**Google CSE:** https://programmablesearchengine.google.com/

## Verwachte Groei

**Week 1:**
- Dag 1-7: ~1,500-2,000 links

**Week 2:**
- Dag 8-14: +300-500 links (refreshed + dead replaced)

**Long-term:**
- Per week: ~200-400 nieuwe links
- Na 1 maand: 5,000-10,000 links

## Production Tips

1. **Reverse proxy**: Use nginx for SSL
2. **Process manager**: Use pm2 or systemd
3. **Monitoring**: Add error tracking (Sentry)
4. **Backups**: Backup `db/catalog.sqlite` daily
5. **Rate limiting**: Add rate limits to API endpoints

## Screenshots

**Search Interface:**
```
┌──────────────────────────────────────┐
│  🎬 MovieScrubber                    │
│  Search your streaming catalog       │
│                                      │
│  ┌────────────────────────────────┐ │
│  │ Search for movies or shows...  │ │
│  └────────────────────────────────┘ │
│                                      │
│  42 results  •  12ms                │
│                                      │
│  ┌──────────────┬──────────────┐   │
│  │ 🎬 Inception │ 📺 Breaking  │   │
│  │ netflix.com  │ Bad          │   │
│  │ [Preview]    │ disneyplus   │   │
│  └──────────────┴──────────────┘   │
└──────────────────────────────────────┘
```

Veel succes! 🚀
