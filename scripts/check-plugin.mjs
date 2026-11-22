import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const errors = [];

function readJson(relativePath) {
  const file = path.join(root, relativePath);
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (error) {
    errors.push(`${relativePath}: invalid or unreadable JSON (${error.message})`);
    return null;
  }
}

const manifests = ["plugin.json", ".claude-plugin/plugin.json", ".zcode-plugin/plugin.json"]
  .filter((file) => fs.existsSync(path.join(root, file)))
  .map((file) => ({ file, value: readJson(file) }))
  .filter(({ value }) => value);

if (!manifests.length) errors.push("no plugin manifest found");

const canonical = manifests[0]?.value;
for (const { file, value } of manifests) {
  for (const key of ["name", "version"]) {
    if (!value[key]) errors.push(`${file}: missing ${key}`);
    if (canonical?.[key] && value[key] !== canonical[key]) {
      errors.push(`${file}: ${key} differs from canonical manifest`);
    }
  }
}

const skillsRoot = path.join(root, "skills");
const skillDirs = fs.existsSync(skillsRoot)
  ? fs.readdirSync(skillsRoot, { withFileTypes: true }).filter((entry) => entry.isDirectory())
  : [];
const names = new Set();

function markdownFiles(directory) {
  if (!fs.existsSync(directory)) return [];
  const result = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) result.push(...markdownFiles(file));
    else if (entry.isFile() && file.endsWith(".md")) result.push(file);
  }
  return result;
}

function parseFrontmatter(text, relativePath) {
  const lines = text.split(/\r?\n/);
  if (lines[0] !== "---") {
    errors.push(`${relativePath}: missing frontmatter`);
    return {};
  }
  const end = lines.indexOf("---", 1);
  if (end < 0) {
    errors.push(`${relativePath}: unterminated frontmatter`);
    return {};
  }
  const fields = {};
  for (const line of lines.slice(1, end)) {
    const match = line.match(/^([A-Za-z][A-Za-z0-9_-]*):\s*(.*)$/);
    if (match) fields[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
  }
  return fields;
}

for (const dir of skillDirs) {
  const relativePath = path.join("skills", dir.name, "SKILL.md");
  const file = path.join(root, relativePath);
  if (!fs.existsSync(file)) {
    errors.push(`${relativePath}: missing SKILL.md`);
    continue;
  }
  const fields = parseFrontmatter(fs.readFileSync(file, "utf8"), relativePath);
  if (!fields.name) errors.push(`${relativePath}: missing frontmatter name`);
  if (!fields.description) errors.push(`${relativePath}: missing frontmatter description`);
  if (fields.name && fields.name !== dir.name) {
    errors.push(`${relativePath}: name '${fields.name}' does not match directory '${dir.name}'`);
  }
  if (fields.name && names.has(fields.name)) errors.push(`${relativePath}: duplicate skill name '${fields.name}'`);
  if (fields.name) names.add(fields.name);
}

if (!fs.existsSync(skillsRoot)) errors.push("skills/: missing directory");

for (const file of markdownFiles(skillsRoot)) {
  const text = fs.readFileSync(file, "utf8");
  const relativePath = path.relative(root, file);
  for (const match of text.matchAll(/`((?:\.\.?\/)[^`\s]+\.md)`/g)) {
    const reference = match[1];
    if (reference.includes("<") || reference.includes(">") || reference.includes("*")) continue;
    const target = path.resolve(path.dirname(file), reference);
    if (!fs.existsSync(target)) errors.push(`${relativePath}: broken local reference ${reference}`);
  }
}

if (errors.length) {
  console.error(errors.map((error) => `ERROR ${error}`).join("\n"));
  process.exitCode = 1;
} else {
  console.log(`OK plugin manifests=${manifests.length} skills=${names.size}`);
}
