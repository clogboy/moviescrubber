process.on('unhandledRejection', (reason, promise) => {
  console.error('UNHANDLED REJECTION');
  console.error(reason);
});

import "dotenv/config";
import { initDb, urlExists, insertResult } from "./db.js";
import { MAX_QUERIES,DOMAINS } from "./config.js";
import { startServer } from "./server.js";
import { log } from "./logger.js";
import { getPopularTitles } from "./popular.js";
import { query } from "./db.js";
import { persist } from "./db.js";
import { googleSearch } from "./google.js";

var db = null;

process.on("SIGINT", () => {
  log("Shutting down...");
  persist();
  process.exit(0);
});

async function decide() {
  const titles = await getPopularTitles(20);
  log(`Popular titles loaded: ${titles.length}`);

  let candidates = 0;

  for (const t of titles) {
    for (const domain of ["netflix.com", "primevideo.com"]) {
      const exists =
        query(
          `SELECT 1 FROM titles WHERE name = ? AND domain = ? LIMIT 1`,
          [t.title, domain]
        ).length > 0;

      if (exists) {
        log(`SKIP  ${t.title} @ ${domain}`);
      } else {
        log(`CAND  ${t.title} @ ${domain}`);
        candidates++;
      }

      if (candidates >= 5) {
        log("Candidate limit reached");
        return;
      }
    }
  }
}

(async () => {
  log("Starting MovieScrubber");

  //loadConfig();
  //log("Config loaded");

  db = await initDb();              // ← dit is de sleutel
  log("Database ready");

  startServer(3000);
  log("Server started");

  await decide();              // ← pas NU query’s doen
})();

async function runSearch() {
  const titles = await getPopularTitles();
  let queries = 0;

  for (const t of titles) {
    for (const domain of DOMAINS) {
      if (queries >= MAX_QUERIES) {
        console.log("Google limit reached");
        return;
      }

      const results = await googleSearch(t.title, domain);
      queries++;

      for (const r of results) {
        if (urlExists(db, r.url)) continue;

        insertResult(db, {
          id: t.trakt_id,
          name: t.title,
          domain,
          url: r.url,
        });

        console.log("Added:", r.url);
      }
    }
  }
}

runSearch();
