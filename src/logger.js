const buffer = [];
const MAX = 300;

export function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  buffer.push(line);
  if (buffer.length > MAX) buffer.shift();
  console.log(line);
}

export function getLogs() {
  return buffer.join("\n");
}
