const path = require("path");
const { spawnSync } = require("child_process");

const expected = {
  files: 35,
  extractedLinks: 14728,
  changedLinks: 7630,
  contaminatedCount: 0,
  unsupportedTimecodeCount: 5,
  invalidUrlCount: 0
};

const analyzer = path.join(__dirname, "analyze_all_test_cases.js");
const result = spawnSync(process.execPath, [analyzer, "--summary"], {
  cwd: path.resolve(__dirname, ".."),
  encoding: "utf8"
});

if (result.status !== 0) {
  process.stderr.write(result.stderr || "実データ集計を実行できませんでした。\n");
  process.exit(result.status || 1);
}

let actual;
try {
  actual = JSON.parse(result.stdout).totals;
} catch (_error) {
  process.stderr.write("実データ集計のJSONを解析できませんでした。\n");
  process.exit(1);
}

const differences = Object.entries(expected)
  .filter(([key, value]) => actual[key] !== value)
  .map(([key, value]) => `${key}: expected ${value}, actual ${actual[key]}`);

if (differences.length) {
  console.error("FAIL real-data baseline");
  for (const difference of differences) console.error(`- ${difference}`);
  process.exit(1);
}

console.log(
  `PASS real-data baseline (${actual.files} files, ${actual.extractedLinks} links, ${actual.changedLinks} changes)`
);
