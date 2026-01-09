import fs from "fs";
import initSqlJs from "sql.js";
import path from "path";

const DB_PATH = path.resolve("db/catalog.sqlite");

let SQL;
let db;

export async function initDb() {
  SQL = await initSqlJs({
    locateFile: file => `node_modules/sql.js/dist/${file}`
  });

  if (fs.existsSync(DB_PATH)) {
    const filebuffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(filebuffer);
    console.log("Database loaded from file");
  } else {
    db = new SQL.Database();
    console.log("New database created");
    createSchema();
    persist();
  }

  return db;
}

function createSchema() {
  db.run(`
    -- Tabel 1: Links (gevonden URLs)
    CREATE TABLE IF NOT EXISTS links (
      url TEXT PRIMARY KEY,
      trakt_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      type TEXT NOT NULL,
      domain TEXT NOT NULL,
      page_title TEXT,
      found_at INTEGER NOT NULL,
      last_checked INTEGER DEFAULT 0,
      available INTEGER DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_links_trakt_id ON links(trakt_id);
    CREATE INDEX IF NOT EXISTS idx_links_domain ON links(domain);
    CREATE INDEX IF NOT EXISTS idx_links_last_checked ON links(last_checked);
    CREATE INDEX IF NOT EXISTS idx_links_available ON links(available);

    -- Tabel 2: Queries (welke titles zijn al gezocht)
    CREATE TABLE IF NOT EXISTS queries (
      trakt_id INTEGER PRIMARY KEY,
      title TEXT NOT NULL,
      queried_at INTEGER NOT NULL
    );

    -- Tabel 3: Metadata (tracking van cycle)
    CREATE TABLE IF NOT EXISTS metadata (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);

  console.log("Database schema created");
}

export function persist() {
  if (!db) {
    throw new Error("Database not initialised");
  }

  const dbDir = path.dirname(DB_PATH);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  const data = db.export();
  fs.writeFileSync(DB_PATH, Buffer.from(data));
}

export function query(sql, params = []) {
  if (!db) {
    throw new Error("Database not initialised");
  }
  const stmt = db.prepare(sql);
  stmt.bind(params);

  const rows = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject());
  }

  stmt.free();
  return rows;
}

// Metadata helpers
function getMetadata(key) {
  if (!db) return null;
  const stmt = db.prepare("SELECT value FROM metadata WHERE key = ?");
  stmt.bind([key]);
  const exists = stmt.step();
  const value = exists ? stmt.getAsObject().value : null;
  stmt.free();
  return value;
}

function setMetadata(key, value) {
  if (!db) return;
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO metadata (key, value, updated_at)
    VALUES (?, ?, ?)
  `);
  stmt.run([key, String(value), Date.now()]);
  stmt.free();
}

// Cycle management: track waar we zijn in de lijst
export function getCycleInfo() {
  const cycleStart = getMetadata('cycle_start');
  const lastOffset = getMetadata('last_offset');

  const now = Date.now();
  const sevenDaysAgo = now - (7 * 24 * 60 * 60 * 1000);

  // Als cycle_start niet bestaat of ouder dan 7 dagen: reset
  if (!cycleStart || parseInt(cycleStart) < sevenDaysAgo) {
    return {
      needsReset: true,
      offset: 0,
      cycleStart: now,
      daysInCycle: cycleStart ? Math.floor((now - parseInt(cycleStart)) / (24 * 60 * 60 * 1000)) : 0
    };
  }

  return {
    needsReset: false,
    offset: lastOffset ? parseInt(lastOffset) : 0,
    cycleStart: parseInt(cycleStart),
    daysInCycle: Math.floor((now - parseInt(cycleStart)) / (24 * 60 * 60 * 1000))
  };
}

export function updateCycleInfo(newOffset, reset = false) {
  const now = Date.now();

  if (reset) {
    setMetadata('cycle_start', now);
    setMetadata('last_offset', 0);
    console.log('Cycle reset: starting fresh 7-day cycle');
  } else {
    setMetadata('last_offset', newOffset);
  }

  persist();
}

// Check of URL al bestaat
export function urlExists(dbInstance, url) {
  if (!db) {
    throw new Error("Database not initialised");
  }
  const stmt = db.prepare("SELECT 1 FROM links WHERE url = ? LIMIT 1");
  stmt.bind([url]);
  const exists = stmt.step();
  stmt.free();
  return exists;
}

// Check of deze titel al eerder gezocht is (in deze cycle)
export function hasBeenQueried(trakt_id) {
  if (!db) {
    throw new Error("Database not initialised");
  }
  const stmt = db.prepare("SELECT 1 FROM queries WHERE trakt_id = ? LIMIT 1");
  stmt.bind([trakt_id]);
  const exists = stmt.step();
  stmt.free();
  return exists;
}

// Markeer titel als gezocht
export function markAsQueried(trakt_id, title = null) {
  if (!db) {
    throw new Error("Database not initialised");
  }

  const stmt = db.prepare(`
    INSERT OR REPLACE INTO queries (trakt_id, title, queried_at)
    VALUES (?, ?, ?)
  `);

  stmt.run([trakt_id, title || '', Date.now()]);
  stmt.free();
}

// Sla een link op
export function insertLink(data) {
  if (!db) {
    throw new Error("Database not initialised");
  }

  // Validatie
  if (!data.url || !data.title || !data.trakt_id) {
    console.warn('Invalid link data, skipping:', data);
    return false;
  }

  const stmt = db.prepare(`
    INSERT OR IGNORE INTO links
    (url, trakt_id, title, type, domain, page_title, found_at, last_checked, available)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  try {
    stmt.run([
      data.url,
      data.trakt_id,
      data.title,
      data.type || 'unknown',
      data.domain,
      data.page_title || null,
      Date.now(),
      0,
      0
    ]);
    stmt.free();
    return true;
  } catch (err) {
    stmt.free();
    console.error('Error inserting link:', err.message);
    return false;
  }
}

// Haal links op die gecheckt moeten worden
export function getLinksToCheck(limit = 20) {
  const oneWeekAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);

  return query(`
    SELECT url, title, domain, last_checked, available
    FROM links
    WHERE last_checked = 0 OR last_checked < ?
    ORDER BY last_checked ASC
    LIMIT ?
  `, [oneWeekAgo, limit]);
}

// Markeer link als beschikbaar
export function markLinkAvailable(url) {
  if (!db) {
    throw new Error("Database not initialised");
  }

  const stmt = db.prepare(`
    UPDATE links
    SET available = 1, last_checked = ?
    WHERE url = ?
  `);

  stmt.run([Date.now(), url]);
  stmt.free();
}

// Markeer link als niet beschikbaar
export function markLinkUnavailable(url) {
  if (!db) {
    throw new Error("Database not initialised");
  }

  const stmt = db.prepare(`
    UPDATE links
    SET available = 0, last_checked = ?
    WHERE url = ?
  `);

  stmt.run([Date.now(), url]);
  stmt.free();
}

// Verwijder dode links (available = 0 EN gecheckt)
export function removeDeadLinks() {
  if (!db) {
    throw new Error("Database not initialised");
  }

  const result = query("SELECT COUNT(*) as count FROM links WHERE available = 0 AND last_checked > 0");
  const count = result[0].count;

  if (count === 0) {
    return 0;
  }

  // Haal trakt_ids op van verwijderde links
  const deadLinks = query("SELECT DISTINCT trakt_id FROM links WHERE available = 0 AND last_checked > 0");

  // Verwijder de links
  const stmt = db.prepare("DELETE FROM links WHERE available = 0 AND last_checked > 0");
  stmt.run();
  stmt.free();

  // Verwijder ook de query entries zodat we ze opnieuw kunnen zoeken
  for (const link of deadLinks) {
    const stmt2 = db.prepare("DELETE FROM queries WHERE trakt_id = ?");
    stmt2.run([link.trakt_id]);
    stmt2.free();
  }

  persist();

  console.log(`Removed ${count} dead links and reset ${deadLinks.length} query entries`);
  return count;
}

// Haal alle links op
export function getAllLinks() {
  return query(`
    SELECT url, trakt_id, title, type, domain, page_title,
           found_at, last_checked, available
    FROM links
    ORDER BY found_at DESC
  `);
}

// Statistics
export function getStats() {
  const totalLinks = query("SELECT COUNT(*) as count FROM links")[0].count;
  const totalQueries = query("SELECT COUNT(*) as count FROM queries")[0].count;

  const availableLinks = query(
    "SELECT COUNT(*) as count FROM links WHERE available = 1"
  )[0].count;

  const checkedLinks = query(
    "SELECT COUNT(*) as count FROM links WHERE last_checked > 0"
  )[0].count;

  const uncheckedLinks = query(
    "SELECT COUNT(*) as count FROM links WHERE last_checked = 0"
  )[0].count;

  const deadLinks = query(
    "SELECT COUNT(*) as count FROM links WHERE available = 0 AND last_checked > 0"
  )[0].count;

  const linksByDomain = query(`
    SELECT domain, COUNT(*) as count
    FROM links
    GROUP BY domain
    ORDER BY count DESC
  `);

  const cycleInfo = getCycleInfo();

  return {
    links: {
      total: totalLinks,
      available: availableLinks,
      checked: checkedLinks,
      unchecked: uncheckedLinks,
      dead: deadLinks
    },
    queries: {
      total: totalQueries
    },
    cycle: {
      currentOffset: cycleInfo.offset,
      daysInCycle: cycleInfo.daysInCycle,
      needsReset: cycleInfo.needsReset
    },
    domains: linksByDomain
  };
}

// Reset cycle (na 7 dagen of handmatig)
export function resetCycle() {
  if (!db) {
    throw new Error("Database not initialised");
  }

  // Verwijder alle queries
  const count = query("SELECT COUNT(*) as count FROM queries")[0].count;
  const stmt = db.prepare("DELETE FROM queries");
  stmt.run();
  stmt.free();

  // Reset cycle info
  updateCycleInfo(0, true);

  console.log(`Cycle reset: cleared ${count} query entries`);
  return count;
}
