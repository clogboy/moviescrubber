import { GOOGLE_API_KEY, GOOGLE_CSE_ID } from "./config.js";

// ÉÉN query voor ALLE domains
// Google syntax: "title" (site:netflix.com OR site:primevideo.com OR ...)
export async function googleSearchMultiDomain(title, domains) {
  if (!domains || domains.length === 0) {
    throw new Error("No domains provided");
  }

  // Bouw de query: "title" (site:domain1 OR site:domain2 OR ...)
  const sitePart = domains.map(d => `site:${d}`).join(" OR ");
  const q = `"${title}" (${sitePart})`;

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
      throw new Error(`Google API error: ${data.error.message}`);
    }

    if (!data.items || data.items.length === 0) {
      return [];
    }

    // Parse resultaten en bepaal welk domain
    const results = data.items.map(item => {
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

      return {
        url: url,
        page_title: item.title,
        domain: matchedDomain
      };
    });

    return results;

  } catch (err) {
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
    console.error("✗ Google API test failed:", err.message);
    return false;
  }
}
