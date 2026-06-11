const fs = require("fs");
const path = require("path");

require(path.resolve("extension/normalizer.js"));

const args = process.argv.slice(2);
const mode = args.includes("--problems") ? "problems" : args.includes("--summary") ? "summary" : "full";
const targetDir = args.find((arg) => !arg.startsWith("--")) || "test/cases/real";
const options = { formatMode: "www", removeSi: true, removeSiWithoutTime: false, removeFeature: true, preserveList: false };

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(full);
    return full;
  });
}

function analyze(filePath) {
  const input = fs.readFileSync(filePath, "utf8");
  const normalized = globalThis.YTNormalizer.normalizeText(input, options);
  const counts = {};
  for (const item of normalized.results) {
    counts[item.reason] = (counts[item.reason] || 0) + 1;
  }

  const changed = normalized.results.filter((item) => item.changed);
  const contaminated = normalized.results.filter((item) => /[\]\u3000-\u30ff\u3400-\u9fff]/u.test(item.original));
  const listItems = normalized.results.filter((item) => item.hasList);
  const malformed = normalized.results.filter((item) => /[?&#%]t=/i.test(item.original) && /%t=/i.test(item.original));
  const unsupported = normalized.results.filter((item) => item.reason === "unsupported-timecode");
  const invalid = normalized.results.filter((item) => item.reason === "invalid-url");

  return {
    file: path.basename(filePath),
    bytes: fs.statSync(filePath).size,
    inputCharacters: input.length,
    extractedLinks: normalized.results.length,
    changedLinks: changed.length,
    counts,
    contaminatedCount: contaminated.length,
    liveChangedCount: changed.filter((item) => item.original.includes("youtube.com/live/")).length,
    listCount: listItems.length,
    malformedPercentTCount: malformed.length,
    contaminatedSamples: contaminated.slice(0, 5).map((item) => item.original),
    listSamples: listItems.slice(0, 5).map((item) => ({ reason: item.reason, original: item.original, normalized: item.normalized })),
    malformedSamples: malformed.slice(0, 5).map((item) => ({ original: item.original, normalized: item.normalized })),
    unsupportedTimecodeCount: unsupported.length,
    unsupportedSamples: unsupported.slice(0, 5).map((item) => item.original),
    invalidUrlCount: invalid.length,
    invalidSamples: invalid.slice(0, 5).map((item) => item.original)
  };
}

function problemEntries(result) {
  const entries = [];
  if (result.contaminatedCount) {
    entries.push({ file: result.file, type: "contaminated-url", count: result.contaminatedCount, samples: result.contaminatedSamples });
  }
  if (result.malformedPercentTCount) {
    entries.push({ file: result.file, type: "malformed-percent-t", count: result.malformedPercentTCount, samples: result.malformedSamples });
  }
  if (result.unsupportedTimecodeCount) {
    entries.push({ file: result.file, type: "unsupported-timecode", count: result.unsupportedTimecodeCount, samples: result.unsupportedSamples });
  }
  if (result.invalidUrlCount) {
    entries.push({ file: result.file, type: "invalid-url", count: result.invalidUrlCount, samples: result.invalidSamples });
  }
  if (result.listCount) {
    entries.push({ file: result.file, type: "list-parameter", count: result.listCount, samples: result.listSamples });
  }
  return entries;
}

const files = walk(targetDir).filter((file) => /\.(?:txt|html?)$/i.test(file)).sort((a, b) => a.localeCompare(b, "ja"));
const results = files.map(analyze);
const totals = {
  files: results.length,
  bytes: 0,
  inputCharacters: 0,
  extractedLinks: 0,
  changedLinks: 0,
  contaminatedCount: 0,
  liveChangedCount: 0,
  listCount: 0,
  malformedPercentTCount: 0,
  unsupportedTimecodeCount: 0,
  invalidUrlCount: 0,
  counts: {}
};

for (const result of results) {
  for (const key of ["bytes", "inputCharacters", "extractedLinks", "changedLinks", "contaminatedCount", "liveChangedCount", "listCount", "malformedPercentTCount", "unsupportedTimecodeCount", "invalidUrlCount"]) {
    totals[key] += result[key];
  }
  for (const [reason, count] of Object.entries(result.counts)) {
    totals.counts[reason] = (totals.counts[reason] || 0) + count;
  }
}

if (mode === "summary") {
  console.log(JSON.stringify({ totals }, null, 2));
} else if (mode === "problems") {
  console.log(JSON.stringify({ totals, problems: results.flatMap(problemEntries) }, null, 2));
} else {
  console.log(JSON.stringify({ totals, results }, null, 2));
}
