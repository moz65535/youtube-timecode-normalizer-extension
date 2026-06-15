import { describe, expect, it } from "vitest";
import "../extension/normalizer.js";

const normalizer = globalThis.YTNormalizer;

function normalizeText(text, options = {}) {
  return normalizer.normalizeText(text, { formatMode: "www", ...options }).text;
}

function normalizeUrl(url, options = {}) {
  return normalizer.normalizeUrl(url, { formatMode: "www", ...options });
}

describe("text normalization", () => {
  it.each([
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
    },
    {
      name: "keeps trailing wiki parentheses outside live URLs",
      input: "https://www.youtube.com/live/sPixWMcu9Vo?t=1860))(((",
      expected: "https://www.youtube.com/watch?v=sPixWMcu9Vo&t=1860))((("
    },
    {
      name: "keeps trailing wiki strike markup outside live URLs",
      input: "https://www.youtube.com/live/5T1Fu7s5hOc?t=8m30s))~~",
      expected: "https://www.youtube.com/watch?v=5T1Fu7s5hOc&t=510))~~"
    }
  ])("$name", ({ input, expected }) => {
    expect(normalizeText(input)).toBe(expected);
  });

  it("keeps repeated URL occurrences as separate results", () => {
    const url = "https://youtu.be/qhH-azW3LJw?t=1m";
    const result = normalizer.normalizeText(`${url}\n${url}`, { formatMode: "www" });

    expect(result.results).toHaveLength(2);
    expect(result.results.every((item) => item.changed)).toBe(true);
  });
});

describe("URL normalization", () => {
  it("rejects short video IDs", () => {
    expect(normalizeUrl("https://youtu.be/abc123?t=1m").reason).toBe("not-video-url");
  });

  it("accepts 11-character video IDs", () => {
    expect(normalizeUrl("https://youtu.be/qhH-azW3LJw?t=1m").normalized)
      .toBe("https://www.youtube.com/watch?v=qhH-azW3LJw&t=60");
  });

  it("floors non-negative decimal seconds", () => {
    expect(normalizeUrl("https://youtu.be/qhH-azW3LJw?t=123.9").normalized)
      .toBe("https://www.youtube.com/watch?v=qhH-azW3LJw&t=123");
    expect(normalizeUrl("https://youtu.be/qhH-azW3LJw?t=259.5s").normalized)
      .toBe("https://www.youtube.com/watch?v=qhH-azW3LJw&t=259");
  });

  it("rejects decimals without an integer part", () => {
    expect(normalizeUrl("https://youtu.be/qhH-azW3LJw?t=.5").reason)
      .toBe("unsupported-timecode");
  });

  it("repairs uniquely reorderable time units", () => {
    const result = normalizeUrl("https://youtu.be/qhH-azW3LJw?t=1m4h45s");
    expect(result).toMatchObject({
      normalized: "https://www.youtube.com/watch?v=qhH-azW3LJw&t=14505",
      hasMalformedTime: true
    });
  });

  it("does not repair reordered units when repair is disabled", () => {
    expect(normalizeUrl(
      "https://youtu.be/qhH-azW3LJw?t=1h34s43m",
      { repairMalformedTime: false }
    ).reason).toBe("malformed-timecode");
  });

  it("does not guess time units with missing numbers", () => {
    expect(normalizeUrl("https://youtu.be/qhH-azW3LJw?t=hm12s").reason)
      .toBe("unsupported-timecode");
  });

  it("flags www.youtu.be as a mistyped host without changing it", () => {
    expect(normalizeUrl("https://www.youtu.be/7fA3Ze1MeW8")).toMatchObject({
      changed: false,
      reason: "mistyped-youtube-host",
      suspicious: true
    });
  });

  it("removes si when enabled", () => {
    expect(normalizeUrl(
      "https://www.youtube.com/watch?v=qhH-azW3LJw&si=tracking&t=1m",
      { removeSi: true }
    ).normalized).toBe("https://www.youtube.com/watch?v=qhH-azW3LJw&t=60");
  });

  it("preserves feature when removal is disabled", () => {
    expect(normalizeUrl(
      "https://www.youtube.com/watch?v=qhH-azW3LJw&feature=share&t=1m",
      { removeFeature: false }
    ).normalized).toBe("https://www.youtube.com/watch?v=qhH-azW3LJw&feature=share&t=60");
  });

  it("preserves a regular playlist when enabled", () => {
    expect(normalizeUrl(
      "https://youtu.be/qhH-azW3LJw?list=PL123&t=1m",
      { preserveList: true }
    ).normalized).toBe("https://www.youtube.com/watch?v=qhH-azW3LJw&list=PL123&t=60");
  });

  it("always removes the liked videos playlist", () => {
    expect(normalizeUrl(
      "https://www.youtube.com/watch?v=5vNh4QIR5Sc&list=LL&t=468s",
      { preserveList: true }
    ).normalized).toBe("https://www.youtube.com/watch?v=5vNh4QIR5Sc&t=468");
  });

  it("always removes watch later and its index", () => {
    expect(normalizeUrl(
      "https://youtu.be/qhH-azW3LJw?list=WL&index=10&t=1m",
      { preserveList: true }
    ).normalized).toBe("https://www.youtube.com/watch?v=qhH-azW3LJw&t=60");
  });

  it("removes a personal playlist without a timecode", () => {
    const result = normalizeUrl("https://www.youtube.com/watch?v=qhH-azW3LJw&list=LL");

    expect(result).toMatchObject({
      normalized: "https://www.youtube.com/watch?v=qhH-azW3LJw",
      reason: "personal-list-removed"
    });
  });
});
