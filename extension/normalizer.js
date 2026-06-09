(function () {
  "use strict";

  const MODE_PRESERVE = "preserve";
  const MODE_WWW = "www";
  const MODE_SHORT = "short";
  const DEFAULT_OPTIONS = {
    formatMode: MODE_PRESERVE,
    removeSi: false,
    removeSiWithoutTime: false,
    removeFeature: true,
    copyBackupBeforeEdit: false,
    preserveList: false,
    flagListUrls: true,
    repairMalformedTime: true
  };

  const URL_SAFE_CHARS = "A-Za-z0-9\\-._~:/?#@!$&()*+,;=%";
  const URL_PATTERN = new RegExp(
    `(?:https?:\\/\\/[${URL_SAFE_CHARS}]+|(?:www\\.|m\\.)?youtube\\.com\\/[${URL_SAFE_CHARS}]+|youtu\\.be\\/[${URL_SAFE_CHARS}]+)`,
    "gi"
  );
  const TRAILING_PUNCTUATION = /[.,;:!?、。）」』】\]\)]+$/u;

  function trimCandidate(candidate) {
    return candidate.replace(TRAILING_PUNCTUATION, "");
  }

  function withScheme(raw) {
    return /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  }

  function isYoutubeHost(hostname) {
    const host = hostname.toLowerCase();
    return host === "youtube.com" || host === "www.youtube.com" || host === "m.youtube.com" || host === "youtu.be";
  }

  function isShortHost(hostname) {
    return hostname.toLowerCase() === "youtu.be";
  }

  function toOptions(optionsOrMode) {
    if (typeof optionsOrMode === "string") {
      return { ...DEFAULT_OPTIONS, formatMode: optionsOrMode };
    }

    return { ...DEFAULT_OPTIONS, ...(optionsOrMode || {}) };
  }

  function parseSeconds(value) {
    if (!value) return null;
    const decoded = String(value).trim().toLowerCase();
    if (/^\d+$/.test(decoded)) return Number(decoded);

    const clock = decoded.match(/^(?:(\d+):)?(\d{1,2}):(\d{2})$/);
    if (clock) {
      const hours = Number(clock[1] || 0);
      const minutes = Number(clock[2]);
      const seconds = Number(clock[3]);
      return hours * 3600 + minutes * 60 + seconds;
    }

    const unit = decoded.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s?)?$/);
    if (unit && (unit[1] || unit[2] || unit[3])) {
      return Number(unit[1] || 0) * 3600 + Number(unit[2] || 0) * 60 + Number(unit[3] || 0);
    }

    return null;
  }

  function getRawTimeValue(raw, url, options) {
    const t = url.searchParams.get("t");
    if (t) return { key: "t", value: t };

    const malformedPathTime = raw.match(/[?&#%]t=([0-9hms:]+)/i);
    if (malformedPathTime) {
      return {
        key: "t",
        value: malformedPathTime[1],
        malformed: true,
        disabled: !options.repairMalformedTime
      };
    }

    const start = url.searchParams.get("start");
    if (start) return { key: "start", value: start };

    const timeContinue = url.searchParams.get("time_continue");
    if (timeContinue) return { key: "time_continue", value: timeContinue };

    return null;
  }

  function getVideoId(raw, url) {
    if (isShortHost(url.hostname)) {
      const path = url.pathname.replace(/^\/+/, "");
      const match = path.match(/^([A-Za-z0-9_-]{6,})/);
      return match ? match[1] : null;
    }

    const liveMatch = url.pathname.match(/^\/live\/([A-Za-z0-9_-]{6,})(?:[/?&#].*)?$/i);
    if (liveMatch) return liveMatch[1];

    const shortsMatch = url.pathname.match(/^\/shorts\/([A-Za-z0-9_-]{6,})(?:[/?&#].*)?$/i);
    if (shortsMatch) return shortsMatch[1];

    if (!/\/watch\/?$/i.test(url.pathname)) return null;
    const videoId = url.searchParams.get("v");
    const match = String(videoId || "").match(/^([A-Za-z0-9_-]{6,})/);
    return match ? match[1] : null;
  }

  function copyAllowedParams(sourceUrl, targetUrl, options) {
    if (!options.removeSi && sourceUrl.searchParams.has("si")) {
      targetUrl.searchParams.set("si", sourceUrl.searchParams.get("si"));
    }
    if (!options.removeFeature && sourceUrl.searchParams.has("feature")) {
      targetUrl.searchParams.set("feature", sourceUrl.searchParams.get("feature"));
    }
    if (options.preserveList && sourceUrl.searchParams.has("list")) {
      targetUrl.searchParams.set("list", sourceUrl.searchParams.get("list"));
    }
    if (options.preserveList && sourceUrl.searchParams.has("index")) {
      targetUrl.searchParams.set("index", sourceUrl.searchParams.get("index"));
    }
  }

  function buildNormalizedUrl(url, videoId, seconds, options, originalWasShort) {
    const outputMode = options.formatMode || MODE_PRESERVE;
    const useShort = outputMode === MODE_SHORT || (outputMode === MODE_PRESERVE && originalWasShort);

    if (useShort) {
      const shortUrl = new URL(`https://youtu.be/${videoId}`);
      copyAllowedParams(url, shortUrl, options);
      shortUrl.searchParams.set("t", String(seconds));
      return shortUrl.toString();
    }

    const longUrl = new URL("https://www.youtube.com/watch");
    longUrl.searchParams.set("v", videoId);
    copyAllowedParams(url, longUrl, options);
    longUrl.searchParams.set("t", String(seconds));
    return longUrl.toString();
  }

  function removeMetadataOnlyUrl(url, candidate, options) {
    const cleanedUrl = new URL(url.toString());
    const hadSi = cleanedUrl.searchParams.has("si");
    const hadFeature = cleanedUrl.searchParams.has("feature");
    if (options.removeSiWithoutTime) cleanedUrl.searchParams.delete("si");
    if (options.removeFeature) cleanedUrl.searchParams.delete("feature");
    const cleaned = cleanedUrl.toString();
    const normalized = /^https?:\/\//i.test(candidate) ? cleaned : cleaned.replace(/^https?:\/\//i, "");
    const removedSi = hadSi && !cleanedUrl.searchParams.has("si");
    const removedFeature = hadFeature && !cleanedUrl.searchParams.has("feature");
    return { normalized, removedSi, removedFeature };
  }

  function normalizeUrl(raw, optionsOrMode) {
    const options = toOptions(optionsOrMode);
    const candidate = trimCandidate(String(raw || ""));
    if (!candidate) return { changed: false, normalized: raw, reason: "empty" };

    let url;
    try {
      url = new URL(withScheme(candidate));
    } catch (_error) {
      return { changed: false, normalized: raw, reason: "invalid-url" };
    }

    if (!isYoutubeHost(url.hostname)) {
      return { changed: false, normalized: candidate, reason: "not-youtube" };
    }

    const hasList = url.searchParams.has("list");
    const videoId = getVideoId(candidate, url);
    if (!videoId) {
      return { changed: false, normalized: candidate, reason: "not-video-url" };
    }

    const time = getRawTimeValue(candidate, url, options);
    if (!time) {
      if ((options.removeSiWithoutTime && url.searchParams.has("si")) || (options.removeFeature && url.searchParams.has("feature"))) {
        const result = removeMetadataOnlyUrl(url, candidate, options);
        const reason = result.removedFeature ? "feature-removed" : "si-removed";
        return {
          changed: result.normalized !== candidate,
          normalized: result.normalized,
          reason: result.normalized !== candidate ? reason : "no-timecode",
          hasList
        };
      }
      return { changed: false, normalized: candidate, reason: "no-timecode", suspicious: true, hasList };
    }
    if (time.disabled) {
      return {
        changed: false,
        normalized: candidate,
        reason: "malformed-timecode",
        suspicious: true,
        hasList,
        hasMalformedTime: true
      };
    }

    const seconds = parseSeconds(time.value);
    if (seconds === null || Number.isNaN(seconds)) {
      return { changed: false, normalized: candidate, reason: "unsupported-timecode", suspicious: true, hasList };
    }

    const originalWasShort = isShortHost(url.hostname);
    const normalized = buildNormalizedUrl(url, videoId, seconds, options, originalWasShort);
    const alreadyNormalized = time.key === "t" && /^\d+$/.test(String(time.value)) && normalized === candidate;
    return {
      changed: !alreadyNormalized,
      normalized,
      seconds,
      reason: alreadyNormalized ? "already-normalized" : "normalized",
      hasList,
      hasMalformedTime: Boolean(time.malformed)
    };
  }

  function extractLinks(text) {
    const source = String(text || "");
    const links = [];
    for (const match of source.matchAll(URL_PATTERN)) {
      const original = trimCandidate(match[0]);
      if (!original) continue;
      links.push({ original, index: match.index || 0 });
    }
    return links;
  }

  function normalizeText(text, optionsOrMode) {
    const options = toOptions(optionsOrMode);
    const links = extractLinks(text);
    let output = String(text || "");
    const results = [];

    for (let index = links.length - 1; index >= 0; index -= 1) {
      const link = links[index];
      const result = normalizeUrl(link.original, options);
      results.unshift({ original: link.original, ...result });
      if (result.changed) {
        output = `${output.slice(0, link.index)}${result.normalized}${output.slice(link.index + link.original.length)}`;
      }
    }

    return { text: output, results };
  }

  function suspiciousLinks(text) {
    return extractLinks(text)
      .map((link) => ({ original: link.original, ...normalizeUrl(link.original, MODE_PRESERVE) }))
      .filter((result) => result.suspicious || result.hasList || result.hasMalformedTime || result.reason !== "normalized" && result.reason !== "already-normalized");
  }

  globalThis.YTNormalizer = {
    MODE_PRESERVE,
    MODE_WWW,
    MODE_SHORT,
    DEFAULT_OPTIONS,
    extractLinks,
    normalizeText,
    normalizeUrl,
    parseSeconds,
    suspiciousLinks
  };
})();
