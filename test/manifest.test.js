import fs from "node:fs";
import { describe, expect, it } from "vitest";

const chromeManifest = JSON.parse(fs.readFileSync("extension/manifest.json", "utf8"));
const firefoxManifest = JSON.parse(fs.readFileSync("extension/manifest.firefox.json", "utf8"));

describe("browser manifests", () => {
  it("uses only a service worker in the Chrome manifest", () => {
    expect(chromeManifest.background).toEqual({
      service_worker: "background.js"
    });
    expect(chromeManifest.browser_specific_settings).toBeUndefined();
  });

  it("uses only background scripts in the Firefox manifest", () => {
    expect(firefoxManifest.background).toEqual({
      scripts: ["normalizer.js", "background.js"]
    });
    expect(firefoxManifest.browser_specific_settings.gecko.id)
      .toBe("youtube-timecode-normalizer@moz65535");
  });

  it("keeps shared metadata and permissions aligned", () => {
    for (const key of [
      "manifest_version",
      "name",
      "version",
      "description",
      "permissions",
      "host_permissions",
      "icons",
      "action",
      "content_scripts",
      "options_ui"
    ]) {
      expect(firefoxManifest[key]).toEqual(chromeManifest[key]);
    }
  });
});
