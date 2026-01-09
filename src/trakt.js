import { TRAKT_API_KEY } from "./config.js";

const BASE = "https://api.trakt.tv";

async function fetchPopular(endpoint, page = 1, limit = 100) {
  const res = await fetch(`${BASE}/${endpoint}/popular?page=${page}&limit=${limit}`, {
    headers: {
      "Content-Type": "application/json",
      "trakt-api-version": "2",
      "trakt-api-key": TRAKT_API_KEY
    }
  });

  if (!res.ok) {
    throw new Error(`Trakt error ${res.status}: ${res.statusText}`);
  }

  return res.json();
}

// Haal populaire titles op met offset/limit support
// offset = vanaf welke positie (0 = eerste 100, 100 = volgende 100, etc.)
// limit = hoeveel per batch
export async function getPopularTitles(offset = 0, limit = 100) {
  try {
    // Trakt API werkt met pages, niet offset
    // page 1 = items 1-100, page 2 = items 101-200, etc.
    const page = Math.floor(offset / 100) + 1;

    console.log(`Fetching Trakt popular (page ${page}, offset ${offset})`);

    const movies = await fetchPopular("movies", page, 100);
    const shows = await fetchPopular("shows", page, 100);

    const normalized = [
      ...movies.map(m => ({
        trakt_id: m.ids?.trakt,
        title: m.title,
        type: 'movie',
        year: m.year || null
      })),
      ...shows.map(s => ({
        trakt_id: s.ids?.trakt,
        title: s.title,
        type: 'show',
        year: s.year || null
      }))
    ];

    // Filter out invalid entries
    const valid = normalized.filter(item => {
      if (!item.trakt_id || !item.title) {
        console.warn('Skipping invalid Trakt entry:', item);
        return false;
      }
      return true;
    });

    console.log(`Trakt: fetched ${movies.length} movies + ${shows.length} shows = ${valid.length} valid titles`);

    // Return alleen de gevraagde limit
    return valid.slice(0, limit);
  } catch (err) {
    console.error('Trakt API error:', err.message);
    throw err;
  }
}
