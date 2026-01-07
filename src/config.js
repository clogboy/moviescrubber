import "dotenv/config";

export const TRAKT_API_KEY = process.env.TRAKT_API_KEY;
export const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;
export const GOOGLE_CSE_ID = process.env.GOOGLE_CSE_ID;

export const MAX_QUERIES = Number(process.env.MAX_QUERIES || 5);

export const DOMAINS = (process.env.DOMAINS || "")
  .split(",")
  .map(d => d.trim())
  .filter(Boolean);

if (!TRAKT_API_KEY) {
  throw new Error("Missing TRAKT_API_KEY");
}
