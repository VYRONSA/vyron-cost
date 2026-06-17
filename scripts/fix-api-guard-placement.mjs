import { readFileSync, writeFileSync } from "fs";
import { globSync } from "glob";

const files = globSync("src/app/api/**/route.ts");
let fixed = 0;

for (const file of files) {
  let content = readFileSync(file, "utf8");
  const original = content;

  // Move orphaned top-level await guards into the next handler's try block
  content = content.replace(
    /(\n)( {4}await requireWorkspacePermission\([^)]+\);)\n(export async function \w+)/g,
    (match, nl, guard, fnStart) => {
      return `${nl}${fnStart}`;
    }
  );

  // Inject guard at start of try blocks that don't have one yet (per handler)
  const handlers = [...content.matchAll(/export async function (\w+)[^{]+\{([\s\S]*?)(?=export async function |\nexport const |\Z)/g)];
  for (const handlerMatch of handlers) {
    const handlerName = handlerMatch[1];
    let body = handlerMatch[0];
    const permissionMatch = original.match(
      new RegExp(`await requireWorkspacePermission\\("([^"]+)"\\);\\nexport async function ${handlerName}`)
    );
    if (!permissionMatch) continue;
    const permission = permissionMatch[1];
    if (body.includes(`requireWorkspacePermission("${permission}")`)) continue;
    const tryIdx = body.indexOf("  try {");
    if (tryIdx === -1) continue;
    const insertAt = tryIdx + "  try {\n".length;
    body =
      body.slice(0, insertAt) +
      `    await requireWorkspacePermission("${permission}");\n` +
      body.slice(insertAt);
    content = content.replace(handlerMatch[0], body);
  }

  if (content !== original) {
    writeFileSync(file, content);
    fixed++;
    console.log("fixed", file);
  }
}

console.log(`Fixed ${fixed} files.`);
