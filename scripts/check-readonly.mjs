// Read-only guard: fails if the backend uses any filesystem write API, or if a
// Tauri plugin that could touch the disk / spawn processes gets added.
// Run: npm run check:readonly
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const FORBIDDEN_RUST = [
  /File::create/, /fs::write/, /OpenOptions/, /fs::remove_/, /fs::rename/, /fs::copy/,
  /fs::create_dir/, /set_permissions/, /\.write_all\(/, /std::process::Command/,
];
const FORBIDDEN_DEPS = [/tauri-plugin-(fs|shell|dialog|opener|process|updater|sql|store)/, /@tauri-apps\/plugin-/];

const errors = [];
const walk = (dir) => readdirSync(dir).flatMap((f) => {
  const p = join(dir, f);
  return statSync(p).isDirectory() ? walk(p) : [p];
});

for (const file of walk("src-tauri/src").filter((f) => f.endsWith(".rs"))) {
  readFileSync(file, "utf8").split("\n").forEach((line, i) => {
    if (line.trim().startsWith("//")) return;
    for (const re of FORBIDDEN_RUST) if (re.test(line)) errors.push(`${file}:${i + 1}: ${line.trim()}`);
  });
}
for (const file of ["src-tauri/Cargo.toml", "package.json"]) {
  const text = readFileSync(file, "utf8");
  for (const re of FORBIDDEN_DEPS) if (re.test(text)) errors.push(`${file}: forbidden dependency ${re}`);
}
const caps = JSON.parse(readFileSync("src-tauri/capabilities/default.json", "utf8"));
const extra = caps.permissions.filter((p) => p !== "core:default");
if (extra.length) errors.push(`capabilities/default.json: only core:default allowed, found ${extra.join(", ")}`);

if (errors.length) {
  console.error("Read-only check FAILED:\n" + errors.map((e) => "  " + e).join("\n"));
  process.exit(1);
}
console.log("Read-only check passed.");
