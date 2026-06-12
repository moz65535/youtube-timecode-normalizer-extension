const fs = require("fs");
const path = require("path");

function resolveRealDataDir(explicitPath) {
  const candidates = [
    explicitPath,
    process.env.REAL_TEST_DATA_DIR,
    "test/cases/real",
    "../work/private-test-data/real"
  ].filter(Boolean);

  for (const candidate of candidates) {
    const resolved = path.resolve(candidate);
    if (fs.existsSync(resolved) && fs.statSync(resolved).isDirectory()) {
      return { path: resolved, candidates };
    }
  }

  return { path: null, candidates };
}

module.exports = { resolveRealDataDir };
