/**
 * Print the paths of compiled stylesheets from the last production build, one
 * per line, largest first. Used by the workspace scrolling test to assert
 * against the real cascade rather than against the source Tailwind classes.
 */
import { readdirSync, statSync } from "node:fs";
import path from "node:path";

const roots = [path.join(".next", "static"), path.join(".next", "dev", "static")];
const found = [];

function walk(dir) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (entry.name.endsWith(".css")) found.push({ full, size: statSync(full).size });
  }
}

for (const root of roots) walk(root);
found.sort((a, b) => b.size - a.size);
for (const entry of found) console.log(entry.full);
