#!/usr/bin/env node
/**
 * Enforces the five hard invariants from AGENTS.md as an executable contract.
 *
 * Why a script and not a review checklist: four of the five invariants fail *silently*
 * and late — two audio sources produce a bug report saying "sometimes I hear two songs",
 * a missing Range header produces a 403 only on real googlevideo hosts, a server-side
 * resolve works on the developer's laptop and fails on Vercel. A rule that is only
 * written down is a rule that gets broken by the contributor who never read it.
 *
 * Deliberately coarse. This is a tripwire, not a type system: it should never block
 * legitimate work for more than the seconds it takes to read the failure and add an
 * allowlist entry with a reason. False negatives are acceptable; false positives that
 * cannot be resolved are not.
 *
 * Usage:
 *   node .claude/skills/invariant-check/scripts/check-invariants.mjs
 *   node .claude/skills/invariant-check/scripts/check-invariants.mjs --diff origin/master
 */

import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, relative, sep } from "node:path";

const ROOT = process.cwd();
const violations = [];
const notes = [];

function fail(file, line, invariant, message) {
  violations.push({ file, line, invariant, message });
}

/* ------------------------------------------------------------------ */
/* File walking                                                        */
/* ------------------------------------------------------------------ */

const SKIP_DIRS = new Set([
  // This directory holds the rules themselves — every pattern below appears here
  // verbatim, so scanning it would make the checker report itself.
  ".claude",
  "node_modules",
  ".git",
  ".next",
  "dist",
  "build",
  "target",
  ".expo",
  ".vercel",
  ".shots",
]);

/**
 * Skipped by path, not by directory name. `mobile/android/` is generated output, but
 * `mobile/modules/vong-audio/android/` is the hand-written native module — skipping
 * every directory called "android" would silently exclude the Kotlin engine, which is
 * exactly where two of these five invariants are implemented.
 */
const SKIP_PATHS = new Set(["mobile/android", "mobile/ios"]);

const CODE_EXT = /\.(ts|tsx|js|jsx|mjs|cjs|kt|java|rs)$/;

/** Repo-relative path with forward slashes, so patterns read the same on Windows. */
function rel(file) {
  return relative(ROOT, file).split(sep).join("/");
}

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    if (SKIP_PATHS.has(rel(full))) continue;
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else if (CODE_EXT.test(entry)) out.push(full);
  }
  return out;
}

/**
 * Blank out comments before matching.
 *
 * This codebase documents its invariants in long comments that quote the very things
 * being banned — "URL của googlevideo hết hạn sau ~6 giờ", "Dựng item cho
 * `VongAudio.setQueue`". Matching raw text turns the best-documented files into the
 * loudest false positives, which is the fastest way to get a check ignored.
 *
 * Line-level and approximate: block comments are caught by their leading `*`, and a
 * trailing `//` inside a string literal is rare enough in this repo to accept.
 */
function stripComments(lines) {
  let inBlock = false;
  return lines.map((raw) => {
    const trimmed = raw.trim();
    if (inBlock) {
      if (trimmed.includes("*/")) inBlock = false;
      return "";
    }
    if (trimmed.startsWith("/*")) {
      if (!trimmed.includes("*/")) inBlock = true;
      return "";
    }
    if (trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("#")) {
      return "";
    }
    return raw.replace(/\/\/.*$/, "");
  });
}

const files = walk(ROOT)
  .map((f) => rel(f))
  // Ambient type declarations describe an API, they do not call it.
  .filter((path) => !path.endsWith(".d.ts"))
  .map((path) => ({
    path,
    get lines() {
      this._lines ??= stripComments(
        readFileSync(join(ROOT, path), "utf8").split(/\r?\n/),
      );
      return this._lines;
    },
    get text() {
      return this.lines.join("\n");
    },
  }));

function scan(predicate, handler) {
  for (const file of files) {
    if (!predicate(file.path)) continue;
    file.lines.forEach((line, i) => handler(file, line, i + 1));
  }
}

/* ------------------------------------------------------------------ */
/* 1. At most one audio source audible at any time                     */
/* ------------------------------------------------------------------ */

/**
 * Only these files may construct an audio output. Everything else must go through the
 * player store, which is what serialises playback down to a single source.
 */
const AUDIO_OWNERS = [
  "src/components/player/",
  "mobile/src/components/player/",
  "mobile/modules/vong-audio/",
  "src-tauri/src/",
];

const AUDIO_CONSTRUCTORS = [
  { re: /\bnew Audio\s*\(/, what: "new Audio()" },
  { re: /createElement\(\s*["'`]audio["'`]/, what: 'createElement("audio")' },
  { re: /\bnew YT\.Player\s*\(/, what: "new YT.Player()" },
  { re: /youtube\.com\/iframe_api/, what: "YouTube IFrame API" },
  { re: /\bVongAudio\.\w+/, what: "VongAudio native module" },
  { re: /\bExoPlayer\.Builder\s*\(/, what: "ExoPlayer.Builder()" },
];

scan(
  (path) => !AUDIO_OWNERS.some((owner) => path.startsWith(owner)),
  (file, line, no) => {
    for (const { re, what } of AUDIO_CONSTRUCTORS) {
      if (re.test(line)) {
        fail(
          file.path,
          no,
          "one-audio-source",
          `${what} outside the player directories. Audio output must be created only in ${AUDIO_OWNERS.join(", ")} so the store stays the single arbiter of what is audible.`,
        );
      }
    }
  },
);

/* ------------------------------------------------------------------ */
/* 2. googlevideo requests always carry a bounded Range header          */
/* ------------------------------------------------------------------ */

const RANGE_EVIDENCE =
  /audioRangeHeaders|Range|RangeForcing|setRequestProperty|CHUNK_BYTES/i;

for (const file of files) {
  if (!/googlevideo/i.test(file.text)) continue;
  if (RANGE_EVIDENCE.test(file.text)) continue;
  fail(
    file.path,
    file.lines.findIndex((l) => /googlevideo/i.test(l)) + 1,
    "range-header",
    "Touches googlevideo but shows no sign of a Range header. googlevideo answers 403 unless every request spans <= 1 MiB — use audioRangeHeaders() or the shell's range-forcing data source.",
  );
}

// The two range-forcing implementations are load-bearing; losing one is silent until a
// user hits a 403, so assert they still exist. Matched by name, not by full path — the
// Kotlin package can be renamed without weakening the invariant.
if (!existsSync(join(ROOT, "src-tauri/src/audio.rs"))) {
  notes.push("src-tauri/src/audio.rs not found — where does the Windows shell force ranges now?");
}
if (!files.some((f) => f.path.endsWith("RangeForcingDataSource.kt"))) {
  notes.push("RangeForcingDataSource.kt not found — where does the Android shell force ranges now?");
}

/* ------------------------------------------------------------------ */
/* 3. YouTube audio URLs resolve on the user's device only              */
/* ------------------------------------------------------------------ */

const SERVER_ONLY = ["src/app/api/", "src/lib/youtube/"];
const CLIENT_RESOLVERS = /\b(resolveAudio|createYoutubeResolver)\b/;

scan(
  (path) => SERVER_ONLY.some((p) => path.startsWith(p)),
  (file, line, no) => {
    if (!CLIENT_RESOLVERS.test(line)) return;
    // The player-request module defines them; only *calls* from server code are wrong.
    if (file.path.startsWith("packages/shared/")) return;
    fail(
      file.path,
      no,
      "on-device-resolve",
      "Resolving YouTube audio from server code. Server IPs get LOGIN_REQUIRED — server-side InnerTube is metadata-only; resolution belongs in the client shells.",
    );
  },
);

/* ------------------------------------------------------------------ */
/* 4. Library streaming from native shells carries Authorization        */
/* ------------------------------------------------------------------ */

for (const file of files) {
  const native =
    file.path.startsWith("mobile/") || file.path.startsWith("src-tauri/");
  if (!native) continue;
  if (!/\/api\/stream/.test(file.text)) continue;
  // `authHeaderPairs()` / `authHeader()` count: the shells wrap token handling in one
  // helper each, so the literal string "Bearer" lives there and nowhere else.
  if (/bearer|authoriz|authHeader/i.test(file.text)) continue;
  fail(
    file.path,
    file.lines.findIndex((l) => /\/api\/stream/.test(l)) + 1,
    "bearer-auth",
    "Hits /api/stream from a native shell without any sign of an Authorization header. Native shells have no cookies — the request will 401.",
  );
}

/* ------------------------------------------------------------------ */
/* 5. mobile/android/ is generated                                      */
/* ------------------------------------------------------------------ */

const diffArg = process.argv.indexOf("--diff");
const base = diffArg !== -1 ? process.argv[diffArg + 1] : "HEAD";

try {
  const changed = execFileSync("git", ["diff", "--name-only", base], {
    cwd: ROOT,
    encoding: "utf8",
  })
    .split("\n")
    .filter(Boolean);

  const touchedAndroid = changed.filter((f) => f.startsWith("mobile/android/"));
  const touchedPlugins = changed.some((f) => f.startsWith("mobile/plugins/"));
  if (touchedAndroid.length > 0 && !touchedPlugins) {
    fail(
      touchedAndroid[0],
      0,
      "generated-android",
      `${touchedAndroid.length} file(s) under mobile/android/ changed with no matching change in mobile/plugins/. That directory is regenerated by \`npx expo prebuild\` — edits there are lost on the next prebuild. Change the config plugin instead.`,
    );
  }
} catch {
  notes.push(`Could not diff against '${base}' — skipped the generated-android check.`);
}

/* ------------------------------------------------------------------ */
/* Report                                                              */
/* ------------------------------------------------------------------ */

for (const note of notes) console.warn(`note: ${note}`);

if (violations.length === 0) {
  console.log(`invariant-check: OK (${files.length} files scanned)`);
  process.exit(0);
}

console.error(`\ninvariant-check: ${violations.length} violation(s)\n`);
for (const v of violations) {
  console.error(`  ${v.file}:${v.line}  [${v.invariant}]`);
  console.error(`    ${v.message}\n`);
}
console.error("These rules are documented in AGENTS.md under 'Hard invariants'.");
console.error(
  "If a violation is a false positive, add the file to the allowlist in this script with a comment explaining why.\n",
);
process.exit(1);
