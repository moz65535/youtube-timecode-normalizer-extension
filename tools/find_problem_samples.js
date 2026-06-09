const fs = require("fs");
const path = require("path");

require(path.resolve("extension/normalizer.js"));

const targetDir = process.argv[2] || "test/cases/real";
const reasons = new Set((process.argv[3] || "unsupported-timecode,not-video-url").split(","));

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(full);
    return full;
  });
}

const files = walk(targetDir).filter((file) => /\.txt$/i.test(file)).sort((a, b) => a.localeCompare(b, "ja"));
const samples = [];
for (const file of files) {
  const input = fs.readFileSync(file, "utf8");
  const result = globalThis.YTNormalizer.normalizeText(input, { formatMode: "www" });
  for (const item of result.results) {
    if (reasons.has(item.reason)) {
      samples.push({
        file: path.basename(file),
        reason: item.reason,
        original: item.original,
        normalized: item.normalized
      });
    }
  }
}

console.log(JSON.stringify(samples, null, 2));
