const fs = require("fs");
const path = require("path");

require(path.resolve("extension/normalizer.js"));

const filePath = process.argv[2];
if (!filePath) {
  console.error("Usage: node tools/analyze_test_case.js <file>");
  process.exit(1);
}

const input = fs.readFileSync(filePath, "utf8");
const options = { formatMode: "www", removeSi: true };
const normalized = globalThis.YTNormalizer.normalizeText(input, options);
const counts = {};

for (const item of normalized.results) {
  counts[item.reason] = (counts[item.reason] || 0) + 1;
}

const changed = normalized.results.filter((item) => item.changed);
const contaminated = normalized.results.filter((item) => /[\]\u3000-\u30ff\u3400-\u9fff]/u.test(item.original));
const liveChanged = changed.filter((item) => item.original.includes("youtube.com/live/"));

const report = {
  inputCharacters: input.length,
  extractedLinks: normalized.results.length,
  changedLinks: changed.length,
  counts,
  contaminatedCount: contaminated.length,
  liveChangedCount: liveChanged.length,
  changedSamples: changed.slice(0, 10).map((item) => ({
    original: item.original,
    normalized: item.normalized
  })),
  contaminatedSamples: contaminated.slice(0, 10).map((item) => item.original),
  liveSamples: liveChanged.slice(0, 10).map((item) => ({
    original: item.original,
    normalized: item.normalized
  })),
  reasonSamples: Object.fromEntries(
    Object.keys(counts).map((reason) => [
      reason,
      normalized.results
        .filter((item) => item.reason === reason)
        .slice(0, 10)
        .map((item) => ({
          original: item.original,
          normalized: item.normalized
        }))
    ])
  )
};

console.log(JSON.stringify(report, null, 2));
