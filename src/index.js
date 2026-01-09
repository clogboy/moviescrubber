process.on('unhandledRejection', (reason, promise) => {
  console.error('UNHANDLED REJECTION');
  console.error(reason);
});

import "dotenv/config";
import { initDb, persist } from "./db.js";
import { MAX_QUERIES, DOMAINS } from "./config.js";
import { startServer } from "./server.js";
import { log } from "./logger.js";
import { getPopularTitles } from "./trakt.js";
import { googleSearchMultiDomain } from "./google.js";
import { isLinkAvailable } from "./linkCheck.js";
import * as db from "./db.js";

let database = null;

process.on("SIGINT", () => {
  log("Shutting down...");
  persist();
  process.exit(0);
});

// STAP 0: Cleanup - verwijder dode links
async function cleanupDeadLinks() {
  log("=== PHASE 0: Cleanup dead links ===");

  const removed = db.removeDeadLinks();

  if (removed > 0) {
    log(`✓ Removed ${removed} dead links (will be re-queried if still popular)`);
  } else {
    log("No dead links to remove");
  }

  return removed;
}

// STAP 1: Bepaal waar we zijn in de cycle en verzamel candidates
async function collectCandidates() {
  log("\n=== PHASE 1: Collect candidates ===");

  // Check cycle status
  const cycleInfo = db.getCycleInfo();

  if (cycleInfo.needsReset) {
    log("🔄 7-day cycle completed - resetting to start");
    db.resetCycle();
    cycleInfo.offset = 0;
  }

  log(`Cycle status: Day ${cycleInfo.daysInCycle + 1}/7, Offset: ${cycleInfo.offset}`);

  // Haal titles op vanaf huidige offset
  const allTitles = await getPopularTitles(cycleInfo.offset, MAX_QUERIES * 2);
  log(`Loaded ${allTitles.length} titles from Trakt (starting at offset ${cycleInfo.offset})`);

  // Filter: welke hebben we nog NIET gezocht in deze cycle?
  const candidates = [];

  for (const title of allTitles) {
    const alreadyQueried = db.hasBeenQueried(title.trakt_id);

    if (!alreadyQueried) {
      candidates.push(title);
      log(`CANDIDATE: "${title.title}" (${title.type}) [trakt:${title.trakt_id}]`);
    } else {
      log(`SKIP: "${title.title}" (already queried in this cycle)`);
    }

    // Stop bij MAX_QUERIES kandidaten
    if (candidates.length >= MAX_QUERIES) {
      log(`✓ Found ${MAX_QUERIES} candidates`);
      break;
    }
  }

  log(`\n✓ Selected ${candidates.length} candidates for querying`);

  // Update offset voor volgende run
  const newOffset = cycleInfo.offset + allTitles.length;
  db.updateCycleInfo(newOffset);
  log(`Next run will start at offset ${newOffset}`);

  return candidates;
}

// STAP 2: Voer queries uit - ÉÉN query per titel voor ALLE domeinen
async function executeQueries(candidates) {
  log("\n=== PHASE 2: Execute Google searches ===");
  log(`Will execute ${candidates.length} queries (1 per title, all domains)`);
  log(`Domains: ${DOMAINS.join(", ")}`);
  log("");

  let executed = 0;
  let totalLinksFound = 0;
  const allResults = [];

  for (const title of candidates) {
    executed++;
    log(`[${executed}/${candidates.length}] Searching: "${title.title}"`);

    try {
      // ÉÉN query voor alle domeinen tegelijk
      const results = await googleSearchMultiDomain(title.title, DOMAINS);

      // Markeer deze title als gezocht (ongeacht resultaat)
      db.markAsQueried(title.trakt_id, title.title);

      if (results.length === 0) {
        log(`  → No results found`);
        continue;
      }

      log(`  → Found ${results.length} results across all domains`);

      // Voeg trakt metadata toe aan elk resultaat
      for (const result of results) {
        allResults.push({
          trakt_id: title.trakt_id,
          title: title.title,
          type: title.type,
          domain: result.domain,
          url: result.url,
          page_title: result.page_title
        });
        totalLinksFound++;

        log(`    • ${result.domain}: ${result.url}`);
      }

      // Persist na elke query om data niet te verliezen
      persist();

    } catch (err) {
      log(`  ERROR: ${err.message}`);
      // Markeer toch als gezocht, anders blijven we vastlopen op foutieve queries
      db.markAsQueried(title.trakt_id, title.title);
      persist();
    }
  }

  log(`\n✓ Executed ${executed} queries, found ${totalLinksFound} links total`);
  return allResults;
}

// STAP 3: Sla resultaten op (deduplicate op URL)
function saveResults(results) {
  log("\n=== PHASE 3: Save results ===");

  let saved = 0;
  let skipped = 0;

  for (const result of results) {
    // Check of deze URL al bestaat
    if (db.urlExists(database, result.url)) {
      skipped++;
      continue;
    }

    // Sla op
    const success = db.insertLink({
      trakt_id: result.trakt_id,
      title: result.title,
      type: result.type,
      domain: result.domain,
      url: result.url,
      page_title: result.page_title
    });

    if (success) {
      saved++;
    }
  }

  persist();

  log(`✓ Saved ${saved} new links, skipped ${skipped} duplicates`);
  return { saved, skipped };
}

// STAP 4: Link checker (voor bestaande links)
async function checkLinks(limit = 50) {
  log("\n=== PHASE 4: Check link availability ===");

  const links = db.getLinksToCheck(limit);

  if (links.length === 0) {
    log("No links to check");
    return { checked: 0, available: 0, dead: 0 };
  }

  log(`Checking ${links.length} links...`);

  let checked = 0;
  let available = 0;
  let dead = 0;

  for (const link of links) {
    log(`[${checked + 1}/${links.length}] ${link.url}`);

    try {
      const isAvailable = await isLinkAvailable(link.url);

      if (isAvailable) {
        db.markLinkAvailable(link.url);
        log(`  ✓ Available`);
        available++;
      } else {
        db.markLinkUnavailable(link.url);
        log(`  ✗ Dead (will be removed on next search run)`);
        dead++;
      }

      checked++;

      // Persist elke 10 checks
      if (checked % 10 === 0) {
        persist();
      }
    } catch (err) {
      log(`  ERROR: ${err.message}`);
    }
  }

  persist();
  log(`\n✓ Checked ${checked} links: ${available} available, ${dead} dead`);

  return { checked, available, dead };
}

// Hoofdprogramma
async function run(mode = 'search') {
  log("========================================");
  log("MovieScrubber v2.0 - Continuous Cycle");
  log(`Mode: ${mode}`);
  log(`Max queries per run: ${MAX_QUERIES}`);
  log("========================================\n");

  database = await initDb();
  log("✓ Database ready\n");

  startServer(3000);
  log("✓ Server started on http://localhost:3000\n");

  if (mode === 'search') {
    // SEARCH MODE: cleanup → find candidates → query → save

    // Stap 0: Verwijder dode links
    await cleanupDeadLinks();

    // Stap 1-3: Verzamel en query
    const candidates = await collectCandidates();

    if (candidates.length === 0) {
      log("\n🎉 No new candidates found at current offset");
      log("This might mean:");
      log("  - All titles at this offset have been queried");
      log("  - The cycle will auto-reset after 7 days");
      log("\nTip: Run 'check' mode to verify existing links");
    } else {
      const results = await executeQueries(candidates);
      const stats = saveResults(results);

      log("\n========================================");
      log("=== SUMMARY ===");
      log(`Candidates found: ${candidates.length}`);
      log(`Queries executed: ${candidates.length}`);
      log(`Links found: ${results.length}`);
      log(`Links saved: ${stats.saved}`);
      log(`Duplicates skipped: ${stats.skipped}`);
      log("========================================");
    }

  } else if (mode === 'check') {
    // CHECK MODE: controleer bestaande links
    const result = await checkLinks(100);

    log("\n========================================");
    log("=== SUMMARY ===");
    log(`Links checked: ${result.checked}`);
    log(`Still available: ${result.available}`);
    log(`Dead links found: ${result.dead}`);
    log("\nTip: Run 'search' mode to remove dead links and re-query");
    log("========================================");

  } else if (mode === 'both') {
    // BOTH MODE: search + check

    await cleanupDeadLinks();
    const candidates = await collectCandidates();

    if (candidates.length > 0) {
      const results = await executeQueries(candidates);
      const stats = saveResults(results);

      log("\n--- Search phase completed ---");
      log(`Queries: ${candidates.length}, Links saved: ${stats.saved}`);
    } else {
      log("\n✓ No new titles to query at current offset");
    }

    log("");
    const checkResult = await checkLinks(50);

    log("\n========================================");
    log("=== SUMMARY ===");
    log(`Search: ${candidates.length} queries`);
    log(`Check: ${checkResult.checked} links verified`);
    log("========================================");
  }

  log("\n✓ MovieScrubber completed");
}

// Start
const mode = process.argv[2] || 'search';
run(mode).catch(err => {
  log(`FATAL ERROR: ${err.message}`);
  console.error(err);
  process.exit(1);
});
