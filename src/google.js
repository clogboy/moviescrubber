import { GOOGLE_API_KEY, GOOGLE_CSE_ID } from "./config.js";
import { buildFilteredSearchQuery, shouldCheckLink } from "./filters.js";

// Custom error class for quota exceeded
export class QuotaExceededError extends Error {
  constructor(message) {
    super(message);
    this.name = 'QuotaExceededError';
  }
}

// ÉÉN query voor ALLE domains met filters
export async function googleSearchMultiDomain(title, domains) {
  if (!domains || domains.length === 0) {
    throw new Error("No domains provided");
  }

  // Build query using filter system
  const q = buildFilteredSearchQuery(title, domains);

  console.log(`Google query: ${q}`);

  const url =
    `https://www.googleapis.com/customsearch/v1` +
    `?key=${GOOGLE_API_KEY}` +
    `&cx=${GOOGLE_CSE_ID}` +
    `&q=${encodeURIComponent(q)}` +
    `&num=10`; // Max 10 results per query

  try {
    const res = await fetch(url);
    const data = await res.json();

    // Check voor API errors
    if (data.error) {
      const errorMessage = data.error.message;
      const errorCode = data.error.code;

      // Check for quota exceeded errors
      if (errorCode === 429 ||
          errorMessage.includes('quota') ||
          errorMessage.includes('Quota') ||
          errorMessage.includes('limit exceeded') ||
          errorMessage.includes('rateLimitExceeded')) {

        console.error('❌ Google API Quota Exceeded!');
        console.error('Daily limit of 100 queries reached.');
        throw new QuotaExceededError('Google API quota exceeded. Daily limit: 100 queries. Try again tomorrow.');
      }

      // Other API errors
      throw new Error(`Google API error (${errorCode}): ${errorMessage}`);
    }

    if (!data.items || data.items.length === 0) {
      return [];
    }

    // Parse resultaten en apply filters
    const results = data.items
      .map(item => {
        const url = item.link;

        // Bepaal welk domain dit resultaat is
        let matchedDomain = null;
        for (const domain of domains) {
          if (url.includes(domain)) {
            matchedDomain = domain;
            break;
          }
        }

        // Fallback: extract domain uit URL
        if (!matchedDomain) {
          try {
            const urlObj = new URL(url);
            matchedDomain = urlObj.hostname;
          } catch (err) {
            matchedDomain = 'unknown';
          }
        }

        // Apply filters (double-check, in case Google returned something we don't want)
        if (!shouldCheckLink(url, matchedDomain)) {
          return null;
        }

        return {
          url: url,
          page_title: item.title,
          domain: matchedDomain
        };
      })
      .filter(r => r !== null); // Remove filtered items

    console.log(`Found ${results.length} results after filtering`);
    return results;

  } catch (err) {
    // Re-throw QuotaExceededError as-is
    if (err instanceof QuotaExceededError) {
      throw err;
    }

    console.error('Google search error:', err.message);
    throw err;
  }
}

// Helper functie: test of Google API werkt
export async function testGoogleAPI() {
  try {
    const results = await googleSearchMultiDomain("Inception", ["netflix.com", "primevideo.com"]);
    console.log("✓ Google API test successful");
    console.log(`Found ${results.length} results`);
    return true;
  } catch (err) {
    if (err instanceof QuotaExceededError) {
      console.error("✗ Google API quota exceeded");
    } else {
      console.error("✗ Google API test failed:", err.message);
    }
    return false;
  }
}
