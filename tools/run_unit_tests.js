const assert = require("assert/strict");

require("../extension/normalizer.js");

const normalizer = globalThis.YTNormalizer;

function normalizeText(text, options = {}) {
  return normalizer.normalizeText(text, { formatMode: "www", ...options }).text;
}

function normalizeUrl(url, options = {}) {
  return normalizer.normalizeUrl(url, { formatMode: "www", ...options });
}

const textCases = [
  {
    name: "does not match youtube inside another hostname",
    input: "myyoutube.com/watch?v=qhH-azW3LJw&t=1m",
    expected: "myyoutube.com/watch?v=qhH-azW3LJw&t=1m"
  },
  {
    name: "does not match protocol URL glued to a word",
    input: "xhttps://www.youtube.com/watch?v=qhH-azW3LJw&t=1m",
    expected: "xhttps://www.youtube.com/watch?v=qhH-azW3LJw&t=1m"
  },
  {
    name: "keeps wiki link syntax around a valid URL",
    input: "[[src>>https://www.youtube.com/watch?v=qhH-azW3LJw&t=1m]]",
    expected: "[[src>>https://www.youtube.com/watch?v=qhH-azW3LJw&t=60]]"
  },
  {
    name: "accepts wiki colon prefix",
    input: "発言:https://youtu.be/Pl0Jlb-55wE?t=788",
    expected: "発言:https://www.youtube.com/watch?v=Pl0Jlb-55wE&t=788"
  },
  {
    name: "accepts wiki double-slash line prefix",
    input: "//https://youtu.be/XOAd3Lzao14?t=21m36s",
    expected: "//https://www.youtube.com/watch?v=XOAd3Lzao14&t=1296"
  },
  {
    name: "repairs malformed youtu.be ampersand time separator",
    input: "https://youtu.be/PWS1ftGoeb8&t=19m32s",
    expected: "https://www.youtube.com/watch?v=PWS1ftGoeb8&t=1172"
  },
  {
    name: "repairs malformed watch question time separator",
    input: "https://www.youtube.com/watch?v=_wRu4KL-in8?t=3505",
    expected: "https://www.youtube.com/watch?v=_wRu4KL-in8&t=3505"
  },
  {
    name: "repairs malformed percent time separator",
    input: "https://www.youtube.com/watch?v=fBRi6v-ZpPM%t=5m17s",
    expected: "https://www.youtube.com/watch?v=fBRi6v-ZpPM&t=317"
  },
  {
    name: "normalizes live URLs",
    input: "https://www.youtube.com/live/6mdcWcjeQcA?t=2765s",
    expected: "https://www.youtube.com/watch?v=6mdcWcjeQcA&t=2765"
  },
  {
    name: "normalizes shorts URLs",
    input: "https://www.youtube.com/shorts/qhH-azW3LJw?t=1m12s",
    expected: "https://www.youtube.com/watch?v=qhH-azW3LJw&t=72"
  },
  {
    name: "keeps trailing wiki brackets outside URLs",
    input: "[[動画>>https://youtu.be/qhH-azW3LJw?t=17m12s]]",
    expected: "[[動画>>https://www.youtube.com/watch?v=qhH-azW3LJw&t=1032]]"
  }
];

for (const testCase of textCases) {
  assert.equal(normalizeText(testCase.input), testCase.expected, testCase.name);
}

assert.equal(normalizeUrl("https://youtu.be/abc123?t=1m").reason, "not-video-url", "rejects short video IDs");
assert.equal(
  normalizeUrl("https://youtu.be/qhH-azW3LJw?t=1m").normalized,
  "https://www.youtube.com/watch?v=qhH-azW3LJw&t=60",
  "accepts 11-character video IDs"
);
assert.equal(
  normalizeUrl("https://www.youtube.com/watch?v=qhH-azW3LJw&si=tracking&t=1m", { removeSi: true }).normalized,
  "https://www.youtube.com/watch?v=qhH-azW3LJw&t=60",
  "removes si when enabled"
);
assert.equal(
  normalizeUrl("https://www.youtube.com/watch?v=qhH-azW3LJw&feature=share&t=1m", { removeFeature: false }).normalized,
  "https://www.youtube.com/watch?v=qhH-azW3LJw&feature=share&t=60",
  "preserves feature when enabled"
);
assert.equal(
  normalizeUrl("https://youtu.be/qhH-azW3LJw?list=PL123&t=1m", { preserveList: true }).normalized,
  "https://www.youtube.com/watch?v=qhH-azW3LJw&list=PL123&t=60",
  "preserves list when enabled"
);
assert.equal(
  normalizeUrl("https://www.youtube.com/watch?v=5vNh4QIR5Sc&list=LL&t=468s", { preserveList: true }).normalized,
  "https://www.youtube.com/watch?v=5vNh4QIR5Sc&t=468",
  "always removes the liked videos playlist"
);
assert.equal(
  normalizeUrl("https://youtu.be/qhH-azW3LJw?list=WL&index=10&t=1m", { preserveList: true }).normalized,
  "https://www.youtube.com/watch?v=qhH-azW3LJw&t=60",
  "always removes watch later and its index"
);
assert.deepEqual(
  {
    normalized: normalizeUrl("https://www.youtube.com/watch?v=qhH-azW3LJw&list=LL").normalized,
    reason: normalizeUrl("https://www.youtube.com/watch?v=qhH-azW3LJw&list=LL").reason
  },
  {
    normalized: "https://www.youtube.com/watch?v=qhH-azW3LJw",
    reason: "personal-list-removed"
  },
  "removes a personal playlist without a timecode"
);

console.log(`ok ${textCases.length + 8} unit tests`);
