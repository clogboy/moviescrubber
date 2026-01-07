import { GOOGLE_API_KEY, GOOGLE_CSE_ID } from "./config.js";

export async function googleSearch(title, domain) {
  const q = `"${title}" site:${domain}`;
  const url =
    `https://www.googleapis.com/customsearch/v1` +
    `?key=${GOOGLE_API_KEY}` +
    `&cx=${GOOGLE_CSE_ID}` +
    `&q=${encodeURIComponent(q)}`;

  const res = await fetch(url);
  const data = await res.json();

  if (!data.items) return [];

  return data.items.map(item => ({
    url: item.link,
    page_title: item.title
  }));
}
