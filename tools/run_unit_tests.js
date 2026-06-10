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

console.log(`ok ${textCases.length + 2} unit tests`);
