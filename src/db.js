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
  } else {
    db = new SQL.Database();
    createSchema();
    persist();
  }

  return db;
}

function createSchema() {
  db.run(`
    CREATE TABLE IF NOT EXISTS titles (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      domain TEXT NOT NULL,
      url TEXT NOT NULL,
      last_checked INTEGER,
      available INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_name ON titles(name);
    CREATE INDEX IF NOT EXISTS idx_domain ON titles(domain);
  `);
}

export function persist() {
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

export function urlExists(db, url) {
  const stmt = db.prepare(
    "SELECT 1 FROM titles WHERE url = ? LIMIT 1"
  );
  stmt.bind([url]);
  const exists = stmt.step();
  stmt.free();
  return exists;
}

export function insertResult(db, row) {
  const stmt = db.prepare(`
    INSERT INTO titles
    (id, name, domain, url, last_checked, available)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  if(!row?.url || !row?.name){
    console.log('SKIP invalid result', row);
    return;
  }

  console.log('DB insert', {
    id: row.id,
    title: row.name,
    link: row.url,
    domain: row.domain
  })
  const now = Date.now();
  stmt.run([
    row.id,
    row.name ?? null,
    row.domain ?? null,
    row.url ?? null,
    now
  ]);

  stmt.free();
}
