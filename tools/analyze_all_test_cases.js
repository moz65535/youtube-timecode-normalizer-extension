const fs = require("fs");
const path = require("path");

require(path.resolve("extension/normalizer.js"));

const targetDir = process.argv[2] || "test/cases/real";
const options = { formatMode: "www", removeSi: true, removeSiWithoutTime: false, preserveList: false };

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
    malformedSamples: malformed.slice(0, 5).map((item) => ({ original: item.original, normalized: item.normalized }))
  };
}

const files = walk(targetDir).filter((file) => /\.txt$/i.test(file)).sort((a, b) => a.localeCompare(b, "ja"));
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
  counts: {}
};

for (const result of results) {
  for (const key of ["bytes", "inputCharacters", "extractedLinks", "changedLinks", "contaminatedCount", "liveChangedCount", "listCount", "malformedPercentTCount"]) {
    totals[key] += result[key];
  }
  for (const [reason, count] of Object.entries(result.counts)) {
    totals.counts[reason] = (totals.counts[reason] || 0) + count;
  }
}

console.log(JSON.stringify({ totals, results }, null, 2));
