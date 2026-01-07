import { TRAKT_API_KEY } from "./config.js";

const BASE = "https://api.trakt.tv";

async function fetchPopular(endpoint, limit = 50) {
  const res = await fetch(`${BASE}/${endpoint}/popular?limit=${limit}`, {
    headers: {
      "Content-Type": "application/json",
      "trakt-api-version": "2",
      "trakt-api-key": TRAKT_API_KEY
    }
  });

  if (!res.ok) {
    throw new Error(`Trakt error ${res.status}`);
  }

  return res.json();
}

export async function getPopularTitles() {
  const movies = await fetchPopular("movies", 50);
  const shows  = await fetchPopular("shows", 50);

  return [
    ...movies.map(m => ({
      trakt_id: m.ids.trakt,
      title: m.title
    })),
    ...shows.map(s => ({
      trakt_id: s.ids.trakt,
      title: s.title
    }))
  ];
}
