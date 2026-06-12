const fs = require("fs");
const path = require("path");

const rootDir = path.resolve(__dirname, "..");
const sourceDir = path.join(rootDir, "extension");
const outputDir = path.join(rootDir, "dist", "firefox");
const firefoxManifest = path.join(sourceDir, "manifest.firefox.json");

fs.rmSync(outputDir, { recursive: true, force: true });
fs.cpSync(sourceDir, outputDir, {
  recursive: true,
  filter(source) {
    return path.basename(source) !== "manifest.firefox.json";
  }
});
fs.copyFileSync(firefoxManifest, path.join(outputDir, "manifest.json"));

console.log(`Firefox extension built at ${outputDir}`);
