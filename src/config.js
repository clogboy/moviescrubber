import "dotenv/config";

export const TRAKT_API_KEY = process.env.TRAKT_API_KEY;
export const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;
export const GOOGLE_CSE_ID = process.env.GOOGLE_CSE_ID;

// Standaard 100 = max dagelijkse queries
export const MAX_QUERIES = Number(process.env.MAX_QUERIES || 100);

export const DOMAINS = (process.env.DOMAINS || "netflix.com,primevideo.com,disneyplus.com,hbomax.com")
  .split(",")
  .map(d => d.trim())
  .filter(Boolean);

// Validatie
if (!TRAKT_API_KEY) {
  throw new Error("Missing TRAKT_API_KEY in .env file");
}

if (!GOOGLE_API_KEY) {
  console.warn("Warning: Missing GOOGLE_API_KEY - searches will fail");
}

if (!GOOGLE_CSE_ID) {
  console.warn("Warning: Missing GOOGLE_CSE_ID - searches will fail");
}

console.log("Config loaded:");
console.log(`- Max queries: ${MAX_QUERIES} (per run)`);
console.log(`- Domains: ${DOMAINS.join(", ")}`);
console.log(`- Strategy: 1 query per title checks ALL domains`);
