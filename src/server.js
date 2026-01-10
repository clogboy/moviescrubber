import http from "http";
import fs from "fs";
import path from "path";
import { getLogs } from "./logger.js";
import { getStats, getAllLinks } from "./db.js";

export function startServer(port = 3000) {
  const server = http.createServer(async (req, res) => {

    // Enable CORS for all requests
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(200);
      res.end();
      return;
    }

    // Frontend search interface
    if (req.url === "/" || req.url === "/search") {
      const htmlPath = path.resolve("public/index.html");
      if (fs.existsSync(htmlPath)) {
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(fs.readFileSync(htmlPath));
      } else {
        res.writeHead(404, { "Content-Type": "text/plain" });
        res.end("Frontend not found. Make sure public/index.html exists.");
      }
      return;
    }

    // Dashboard (old interface)
    if (req.url === "/dashboard") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(getDashboardHTML());
      return;
    }

    // API: Get all links (with Netflix filters)
    if (req.url === "/api/links") {
      try {
        let links = getAllLinks();

        // Filter out Netflix tudun newsletter
        links = links.filter(link => {
          if (link.domain === 'netflix.com') {
            // Blacklist tudun newsletter
            if (link.url.includes('tudum.com') || link.url.includes('newsletter')) {
              console.log(`Filtering out: ${link.url}`);
              return false;
            }
            // Only allow actual title pages
            if (!link.url.includes('/title/') && !link.url.includes('/nl/')) {
              console.log(`Filtering out non-title: ${link.url}`);
              return false;
            }
          }
          return true;
        });

        console.log(`API: Returning ${links.length} links (filtered)`);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(links));
      } catch (err) {
        console.error('Error fetching links:', err);
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: err.message }));
      }
      return;
    }

    // Status
    if (req.url === "/status") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        status: "ok",
        time: Date.now()
      }));
      return;
    }

    // Logs
    if (req.url === "/logs") {
      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end(getLogs());
      return;
    }

    // Stats
    if (req.url === "/stats") {
      try {
        const stats = getStats();
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(stats));
      } catch (err) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: err.message }));
      }
      return;
    }

    // Links (legacy endpoint)
    if (req.url === "/links") {
      try {
        const links = getAllLinks();
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(links));
      } catch (err) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: err.message }));
      }
      return;
    }

    res.writeHead(404);
    res.end("not found");
  });

  server.listen(port, () => {
    console.log(`HTTP server listening on http://localhost:${port}`);
    console.log(`- Search interface: http://localhost:${port}/`);
    console.log(`- Dashboard: http://localhost:${port}/dashboard`);
  });
}

// Dashboard HTML with database viewer (removed screenshot routes)
function getDashboardHTML() {
  return `<!doctype html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>MovieScrubber Dashboard</title>
  <style>
    * { box-sizing: border-box; }
    body {
      font-family: monospace;
      padding: 0;
      margin: 0;
      background: #111;
      color: #eee;
    }
    .container {
      max-width: 1600px;
      margin: 0 auto;
      padding: 1em;
    }
    h1 {
      margin: 0 0 0.5em 0;
      font-size: 1.5em;
    }
    .subtitle {
      color: #888;
      margin-bottom: 1em;
      font-size: 0.9em;
    }
    .nav {
      margin-bottom: 1em;
    }
    .nav a {
      color: #4a9eff;
      text-decoration: none;
      margin-right: 1em;
    }
    button {
      padding: 0.5em 1em;
      margin-right: 0.5em;
      cursor: pointer;
      background: #333;
      color: #eee;
      border: none;
      border-radius: 4px;
    }
    button:hover {
      background: #444;
    }
    pre {
      white-space: pre-wrap;
      word-break: break-word;
      background: #222;
      padding: 1em;
      border-radius: 4px;
      max-height: 500px;
      overflow-y: auto;
      font-size: 0.85em;
      line-height: 1.4;
    }
    .tabs {
      display: flex;
      gap: 0.5em;
      margin-bottom: 1em;
      border-bottom: 2px solid #333;
    }
    .tab {
      padding: 0.75em 1.5em;
      background: transparent;
      border: none;
      color: #888;
      cursor: pointer;
      border-radius: 4px 4px 0 0;
      transition: all 0.2s;
    }
    .tab:hover {
      color: #eee;
      background: #222;
    }
    .tab.active {
      color: #eee;
      background: #333;
    }
    .tab-content {
      display: none;
    }
    .tab-content.active {
      display: block;
    }
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 1em;
      margin-bottom: 2em;
    }
    .stat-card {
      background: #222;
      padding: 1.5em;
      border-radius: 4px;
      border-left: 4px solid #555;
    }
    .stat-card.primary {
      border-left-color: #4a9eff;
    }
    .stat-card.success {
      border-left-color: #4caf50;
    }
    .stat-card.warning {
      border-left-color: #ff9800;
    }
    .stat-card.danger {
      border-left-color: #f44336;
    }
    .stat-card.info {
      border-left-color: #9c27b0;
    }
    .stat-card h3 {
      margin: 0 0 0.5em 0;
      color: #888;
      font-size: 0.85em;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    .stat-card .value {
      font-size: 2.5em;
      font-weight: bold;
      line-height: 1;
    }
    .stat-card .subtext {
      margin-top: 0.5em;
      color: #888;
      font-size: 0.85em;
    }
    .section {
      margin-bottom: 2em;
    }
    .section-title {
      font-size: 1.2em;
      margin-bottom: 1em;
      color: #4a9eff;
    }
    .domain-list {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
      gap: 0.5em;
    }
    .domain-item {
      background: #222;
      padding: 0.75em 1em;
      border-radius: 4px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .domain-name {
      color: #4a9eff;
    }
    .domain-count {
      font-weight: bold;
      font-size: 1.2em;
    }
    .actions {
      margin-bottom: 1em;
    }
    .highlight {
      background: #2a2a2a;
      padding: 1em;
      border-radius: 4px;
      margin-bottom: 1em;
      border-left: 4px solid #4a9eff;
    }
    .highlight strong {
      color: #4a9eff;
    }
    .cycle-progress {
      background: #222;
      padding: 1em;
      border-radius: 4px;
      margin-bottom: 1em;
      border-left: 4px solid #9c27b0;
    }
    .progress-bar {
      width: 100%;
      height: 20px;
      background: #333;
      border-radius: 10px;
      overflow: hidden;
      margin-top: 0.5em;
    }
    .progress-fill {
      height: 100%;
      background: linear-gradient(90deg, #9c27b0, #4a9eff);
      transition: width 0.3s;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      background: #222;
      border-radius: 4px;
      overflow: hidden;
    }
    th {
      background: #333;
      padding: 0.75em;
      text-align: left;
      color: #4a9eff;
      font-weight: bold;
    }
    td {
      padding: 0.75em;
      border-top: 1px solid #333;
    }
    tr:hover {
      background: #2a2a2a;
    }
    .link-url {
      color: #888;
      font-size: 0.85em;
      word-break: break-all;
    }
    .filter-box {
      margin-bottom: 1em;
    }
    .filter-box input {
      width: 100%;
      padding: 0.75em;
      background: #222;
      border: 1px solid #333;
      border-radius: 4px;
      color: #eee;
      font-size: 1em;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>🎬 MovieScrubber Dashboard</h1>
    <div class="subtitle">v2.0 - Continuous 7-day cycle with smart filters</div>

    <div class="nav">
      <a href="/">← Back to Search</a>
    </div>

    <div class="tabs">
      <button class="tab active" onclick="showTab('overview')">Overview</button>
      <button class="tab" onclick="showTab('database')">Database</button>
      <button class="tab" onclick="showTab('logs')">Logs</button>
    </div>

    <div id="overview-tab" class="tab-content active">
      <div id="stats-content">
        <p>Loading statistics...</p>
      </div>
    </div>

    <div id="database-tab" class="tab-content">
      <div class="filter-box">
        <input type="text" id="dbFilter" placeholder="Filter by title or domain..." oninput="filterDatabase()">
      </div>
      <div class="actions">
        <button onclick="loadDatabase()">🔄 Refresh</button>
        <button onclick="exportDatabase()">💾 Export JSON</button>
      </div>
      <div id="database-content">
        <p>Loading database...</p>
      </div>
    </div>

    <div id="logs-tab" class="tab-content">
      <div class="actions">
        <button id="copy">📋 Copy logs</button>
        <button onclick="loadLogs()">🔄 Refresh</button>
      </div>
      <pre id="output">loading…</pre>
    </div>
  </div>

  <script>
    let currentTab = 'overview';
    let allDatabaseLinks = [];

    function showTab(tab) {
      currentTab = tab;
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));

      document.querySelector(\`button[onclick="showTab('\${tab}')"]\`).classList.add('active');
      document.getElementById(\`\${tab}-tab\`).classList.add('active');

      if (tab === 'overview') {
        loadStats();
      } else if (tab === 'database') {
        loadDatabase();
      } else if (tab === 'logs') {
        loadLogs();
      }
    }

    async function loadLogs() {
      if (currentTab !== 'logs') return;
      try {
        const text = await fetch('/logs').then(r => r.text());
        document.getElementById('output').textContent = text;
      } catch (err) {
        document.getElementById('output').textContent = 'Error loading logs';
      }
    }

    async function loadDatabase() {
      try {
        const links = await fetch('/api/links').then(r => r.json());
        allDatabaseLinks = links;
        renderDatabase(links);
      } catch (err) {
        document.getElementById('database-content').innerHTML =
          '<p style="color: #f44336;">Error loading database: ' + err.message + '</p>';
      }
    }

    function renderDatabase(links) {
      const container = document.getElementById('database-content');

      if (links.length === 0) {
        container.innerHTML = '<p>No links in database</p>';
        return;
      }

      const html = \`
        <p style="color: #888; margin-bottom: 1em;">Showing \${links.length} links</p>
        <table>
          <thead>
            <tr>
              <th>Search Title</th>
              <th>Page Title</th>
              <th>Type</th>
              <th>Domain</th>
              <th>Status</th>
              <th>URL</th>
            </tr>
          </thead>
          <tbody>
            \${links.map(link => \`
              <tr>
                <td><strong>\${escapeHtml(link.title)}</strong></td>
                <td>\${link.page_title ? escapeHtml(link.page_title) : '<em style="color: #666;">n/a</em>'}</td>
                <td>\${link.type === 'movie' ? '🎬' : '📺'} \${link.type}</td>
                <td>\${link.domain}</td>
                <td>\${getStatusBadge(link)}</td>
                <td><a href="\${link.url}" target="_blank" class="link-url">\${link.url}</a></td>
              </tr>
            \`).join('')}
          </tbody>
        </table>
      \`;

      container.innerHTML = html;
    }

    function getStatusBadge(link) {
      if (link.last_checked === 0) {
        return '<span style="color: #888;">⏳ Unchecked</span>';
      } else if (link.available === 1) {
        return '<span style="color: #4caf50;">✓ Available</span>';
      } else {
        return '<span style="color: #f44336;">✗ Dead</span>';
      }
    }

    function filterDatabase() {
      const query = document.getElementById('dbFilter').value.toLowerCase();
      if (!query) {
        renderDatabase(allDatabaseLinks);
        return;
      }

      const filtered = allDatabaseLinks.filter(link =>
        link.title.toLowerCase().includes(query) ||
        (link.page_title && link.page_title.toLowerCase().includes(query)) ||
        link.domain.toLowerCase().includes(query) ||
        link.url.toLowerCase().includes(query)
      );

      renderDatabase(filtered);
    }

    function exportDatabase() {
      const dataStr = JSON.stringify(allDatabaseLinks, null, 2);
      const dataBlob = new Blob([dataStr], { type: 'application/json' });
      const url = URL.createObjectURL(dataBlob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'moviescrubber-export-' + Date.now() + '.json';
      link.click();
      URL.revokeObjectURL(url);
    }

    function escapeHtml(text) {
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    }

    async function loadStats() {
      try {
        const stats = await fetch('/stats').then(r => r.json());

        const cyclePercent = Math.round((stats.cycle.daysInCycle / 7) * 100);
        const offsetDisplay = stats.cycle.currentOffset || 0;

        const html = \`
          <div class="cycle-progress">
            <strong>📅 7-Day Cycle:</strong> Day \${stats.cycle.daysInCycle + 1} of 7
            <div class="progress-bar">
              <div class="progress-fill" style="width: \${cyclePercent}%"></div>
            </div>
            <div style="margin-top: 0.5em; color: #888; font-size: 0.9em;">
              Current offset: \${offsetDisplay} | Next run will continue from here
            </div>
          </div>

          <div class="highlight">
            <strong>How it works:</strong> Each run queries 100 new titles from Trakt's popular list.
            After 7 days, the cycle resets and starts over. Dead links are removed before each search.
            Page titles from Google are saved for better search accuracy.
          </div>

          <div class="section">
            <div class="section-title">Cycle Progress</div>
            <div class="stats-grid">
              <div class="stat-card info">
                <h3>Queries This Cycle</h3>
                <div class="value">\${stats.queries.total}</div>
                <div class="subtext">Titles searched</div>
              </div>
              <div class="stat-card primary">
                <h3>Current Offset</h3>
                <div class="value">\${offsetDisplay}</div>
                <div class="subtext">Position in Trakt list</div>
              </div>
              <div class="stat-card">
                <h3>Days in Cycle</h3>
                <div class="value">\${stats.cycle.daysInCycle + 1}</div>
                <div class="subtext">of 7 days</div>
              </div>
              <div class="stat-card \${stats.cycle.needsReset ? 'warning' : 'success'}">
                <h3>Status</h3>
                <div class="value" style="font-size: 1.5em;">\${stats.cycle.needsReset ? 'Reset Due' : 'Active'}</div>
              </div>
            </div>
          </div>

          <div class="section">
            <div class="section-title">Links Database</div>
            <div class="stats-grid">
              <div class="stat-card primary">
                <h3>Total Links</h3>
                <div class="value">\${stats.links.total}</div>
              </div>
              <div class="stat-card success">
                <h3>Available</h3>
                <div class="value">\${stats.links.available}</div>
              </div>
              <div class="stat-card warning">
                <h3>Unchecked</h3>
                <div class="value">\${stats.links.unchecked}</div>
              </div>
              <div class="stat-card danger">
                <h3>Dead Links</h3>
                <div class="value">\${stats.links.dead}</div>
                <div class="subtext">Will be removed next run</div>
              </div>
            </div>
          </div>

          <div class="section">
            <div class="section-title">Links per Domain</div>
            <div class="domain-list">
              \${stats.domains.map(d => \`
                <div class="domain-item">
                  <span class="domain-name">\${d.domain}</span>
                  <span class="domain-count">\${d.count}</span>
                </div>
              \`).join('')}
            </div>
          </div>
        \`;

        document.getElementById('stats-content').innerHTML = html;
      } catch (err) {
        document.getElementById('stats-content').innerHTML =
          '<div class="stat-card"><h3>Error</h3><div>Could not load statistics</div></div>';
      }
    }

    document.getElementById('copy').onclick = async () => {
      const text = document.getElementById('output').textContent;
      await navigator.clipboard.writeText(text);
      alert('✓ Logs copied to clipboard');
    };

    // Auto-refresh
    loadStats();
    setInterval(() => {
      if (currentTab === 'overview') loadStats();
      if (currentTab === 'logs') loadLogs();
    }, 5000);
  </script>
</body>
</html>`;
}
