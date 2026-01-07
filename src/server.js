import http from "http";
import { getLogs } from "./logger.js";

export function startServer(port = 3000) {
  const server = http.createServer((req, res) => {

    if (req.url === "/") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(`
<!doctype html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>MovieScrubber</title>
  <style>
    body { font-family: monospace; padding: 1em; background: #111; color: #eee; }
    button { padding: 0.5em 1em; margin-bottom: 1em; }
    pre { white-space: pre-wrap; word-break: break-word; }
  </style>
</head>
<body>
  <h1>MovieScrubber</h1>
  <button id="copy">Copy logs</button>
  <pre id="output">loading…</pre>

  <script>
    async function load() {
      const text = await fetch('/logs').then(r => r.text());
      document.getElementById('output').textContent = text;
    }

    document.getElementById('copy').onclick = async () => {
      const text = document.getElementById('output').textContent;
      await navigator.clipboard.writeText(text);
    };

    load();
    setInterval(load, 3000);
  </script>
</body>
</html>
      `);
      return;
    }

    if (req.url === "/status") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        status: "ok",
        time: Date.now()
      }));
      return;
    }

    if (req.url === "/logs") {
      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end(getLogs());
      return;
    }

    res.writeHead(404);
    res.end("not found");
  });

  server.listen(port, () => {
    console.log(`HTTP server listening on ${port}`);
  });
}
