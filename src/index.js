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
import { googleSearchMultiDomain, QuotaExceededError } from "./google.js";
import { isLinkAvailable, shouldCheckLink } from "./linkCheck.js";
import * as db from "./db.js";

let database = null;

process.on("SIGINT", () => {
  log("Shutting down...");
  persist();
  process.exit(0);
});

// STAP 0: Cleanup - verwijder dode links EN filter unwanted links
async function cleanupDeadLinks() {
  log("=== PHASE 0: Cleanup dead links & apply filters ===");

  // First remove dead links
  const removedDead = db.removeDeadLinks();

  if (removedDead > 0) {
    log(`✓ Removed ${removedDead} dead links`);
  }

  // Then remove filtered links (Netflix blacklist)
  const allLinks = db.getAllLinks();
  let removedFiltered = 0;

  for (const link of allLinks) {
    if (!shouldCheckLink(link.url, link.domain)) {
      // Remove from database
      db.query('DELETE FROM links WHERE url = ?', [link.url]);

      // Also remove query entry so it can be re-queried
      db.query('DELETE FROM queries WHERE trakt_id = ?', [link.trakt_id]);

      removedFiltered++;
      log(`Filtered out: ${link.url}`);
    }
  }

  if (removedFiltered > 0) {
    log(`✓ Removed ${removedFiltered} filtered links (blacklist/whitelist)`);
    persist();
  }

  if (removedDead === 0 && removedFiltered === 0) {
    log("No links to remove");
  }

  return removedDead + removedFiltered;
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
  let quotaExceeded = false;

  for (const title of candidates) {
    executed++;
    log(`[${executed}/${candidates.length}] Searching: "${title.title}"`);

    try {
      // ÉÉN query voor alle domeinen tegelijk (met filters)
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
      if (err instanceof QuotaExceededError) {
        log(`\n❌ QUOTA EXCEEDED: ${err.message}`);
        log(`Stopping search after ${executed} queries.`);
        log(`${candidates.length - executed} candidates remain for next run.`);
        quotaExceeded = true;

        // Still mark this one as queried to avoid repeating it
        db.markAsQueried(title.trakt_id, title.title);
        persist();

        break; // Stop searching
      } else {
        log(`  ERROR: ${err.message}`);
        // Markeer toch als gezocht, anders blijven we vastlopen op foutieve queries
        db.markAsQueried(title.trakt_id, title.title);
        persist();
      }
    }
  }

  if (quotaExceeded) {
    log(`\n⚠️  Google API quota exceeded. Results so far will be saved.`);
    log(`Tomorrow's run will continue from where we left off.`);
  }

  log(`\n✓ Executed ${executed} queries, found ${totalLinksFound} links total`);
  return { results: allResults, quotaExceeded };
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

// STAP 4: Link checker (voor bestaande links, met filters)
async function checkLinks(limit = 50) {
  log("\n=== PHASE 4: Check link availability ===");

  const links = db.getLinksToCheck(limit);

  if (links.length === 0) {
    log("No links to check");
    return { checked: 0, available: 0, dead: 0, filtered: 0 };
  }

  log(`Checking ${links.length} links...`);

  let checked = 0;
  let available = 0;
  let dead = 0;
  let filtered = 0;

  for (const link of links) {
    log(`[${checked + 1}/${links.length}] ${link.url}`);

    // First check if link passes filters
    if (!shouldCheckLink(link.url, link.domain)) {
      db.markLinkUnavailable(link.url);
      log(`  ⊘ Filtered (blacklist/whitelist)`);
      filtered++;
      checked++;
      continue;
    }

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
  log(`\n✓ Checked ${checked} links: ${available} available, ${dead} dead, ${filtered} filtered`);

  return { checked, available, dead, filtered };
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

    // Stap 0: Verwijder dode links + apply filters
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
      const { results, quotaExceeded } = await executeQueries(candidates);
      const stats = saveResults(results);

      log("\n========================================");
      log("=== SUMMARY ===");
      log(`Candidates found: ${candidates.length}`);
      log(`Queries executed: ${results.length > 0 ? 'Partial' : candidates.length}`);
      log(`Links found: ${results.length}`);
      log(`Links saved: ${stats.saved}`);
      log(`Duplicates skipped: ${stats.skipped}`);

      if (quotaExceeded) {
        log(`\n⚠️  QUOTA EXCEEDED - Stopped early`);
        log(`Run again tomorrow to continue.`);
      }

      log("========================================");
    }

  } else if (mode === 'check') {
    // CHECK MODE: controleer bestaande links (met filters)
    const result = await checkLinks(100);

    log("\n========================================");
    log("=== SUMMARY ===");
    log(`Links checked: ${result.checked}`);
    log(`Still available: ${result.available}`);
    log(`Dead links found: ${result.dead}`);
    log(`Filtered out: ${result.filtered}`);
    log("\nTip: Run 'search' mode to remove dead links and re-query");
    log("========================================");

  } else if (mode === 'both') {
    // BOTH MODE: search + check

    await cleanupDeadLinks();
    const candidates = await collectCandidates();

    if (candidates.length > 0) {
      const { results, quotaExceeded } = await executeQueries(candidates);
      const stats = saveResults(results);

      log("\n--- Search phase completed ---");
      log(`Queries: ${candidates.length}, Links saved: ${stats.saved}`);

      if (quotaExceeded) {
        log(`⚠️  Quota exceeded during search phase`);
        log(`Skipping check phase to preserve data.`);
        return;
      }
    } else {
      log("\n✓ No new titles to query at current offset");
    }

    log("");
    const checkResult = await checkLinks(50);

    log("\n========================================");
    log("=== SUMMARY ===");
    log(`Search: ${candidates.length} queries`);
    log(`Check: ${checkResult.checked} links verified`);
    log(`Filtered: ${checkResult.filtered} links`);
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
