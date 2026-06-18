(function () {
  "use strict";

  const extensionApi = globalThis.browser || globalThis.chrome;
  const BACKUP_STORAGE_KEY = "lastTextBackup";
  let lastUndo = null;
  let lastLinkCollection = null;
  let linkCollectionSequence = 0;

  function showToast(message) {
    const previous = document.getElementById("yt-timecode-normalizer-toast");
    if (previous) previous.remove();

    const toast = document.createElement("div");
    toast.id = "yt-timecode-normalizer-toast";
    toast.textContent = message;
    Object.assign(toast.style, {
      position: "fixed",
      right: "16px",
      bottom: "16px",
      zIndex: "2147483647",
      maxWidth: "360px",
      padding: "10px 12px",
      borderRadius: "8px",
      background: "#202124",
      color: "#fff",
      font: "13px/1.4 system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      boxShadow: "0 8px 24px rgba(0, 0, 0, .22)"
    });
    document.documentElement.appendChild(toast);
    window.setTimeout(() => toast.remove(), 2600);
  }

  async function writeClipboard(text, failureMessage) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (_error) {
      if (failureMessage) showToast(failureMessage);
      return false;
    }
  }

  async function saveBackupIfEnabled(text, options) {
    if (!options || !options.copyBackupBeforeEdit) return true;
    try {
      await extensionApi.storage.local.set({
        [BACKUP_STORAGE_KEY]: {
          text,
          savedAt: Date.now(),
          pageTitle: document.title,
          pageUrl: location.href
        }
      });
      return true;
    } catch (_error) {
      showToast("変更前テキストをローカルへ保存できなかったため、編集を中止しました。");
      return false;
    }
  }

  function dispatchInput(element, text) {
    if (!element) return;
    element.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: text }));
  }

  async function normalizeTextAreaSelection(element, options) {
    const start = element.selectionStart;
    const end = element.selectionEnd;
    const selected = element.value.slice(start, end);
    const result = YTNormalizer.normalizeText(selected, options);
    const changedCount = result.results.filter((item) => item.changed).length;
    if (!changedCount) return { changed: false, count: 0 };

    const backupSaved = await saveBackupIfEnabled(selected, options);
    if (!backupSaved) return { changed: false, count: 0, error: "backup-save-failed" };

    element.setRangeText(result.text, start, end, "select");
    dispatchInput(element, result.text);
    lastUndo = {
      type: "text-control",
      element,
      start,
      beforeText: selected,
      afterText: result.text,
      count: changedCount
    };
    return { changed: true, count: changedCount };
  }

  async function normalizeContentEditableSelection(options) {
    const active = document.activeElement;
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
      return { changed: false, count: 0 };
    }

    const selectedText = selection.toString();
    const result = YTNormalizer.normalizeText(selectedText, options);
    const changedCount = result.results.filter((item) => item.changed).length;
    if (!changedCount) return { changed: false, count: 0 };

    const backupSaved = await saveBackupIfEnabled(selectedText, options);
    if (!backupSaved) return { changed: false, count: 0, error: "backup-save-failed" };

    const beforeElementText = active.textContent;
    active.focus();
    try {
      if (typeof document.execCommand === "function") {
        document.execCommand("insertText", false, result.text);
      }
    } catch (_error) {
      // The unchanged-text check below selects the clipboard fallback.
    }
    const afterElementText = active.textContent;
    if (afterElementText === beforeElementText) {
      const copied = await writeClipboard(
        result.text,
        "編集欄を安全に書き換えられず、クリップボードへのコピーにも失敗しました。"
      );
      return copied
        ? { changed: true, count: changedCount, copiedOnly: true }
        : { changed: false, count: changedCount, error: "clipboard-copy-failed" };
    }

    lastUndo = {
      type: "contenteditable-native",
      element: active,
      beforeElementText,
      afterElementText,
      count: changedCount
    };
    return { changed: true, count: changedCount };
  }

  async function normalizeSelection(options) {
    const active = document.activeElement;
    if (active && (active.tagName === "TEXTAREA" || (active.tagName === "INPUT" && active.type === "text"))) {
      return normalizeTextAreaSelection(active, options);
    }

    if (active && active.isContentEditable) {
      return normalizeContentEditableSelection(options);
    }

    const selectedText = window.getSelection() ? window.getSelection().toString() : "";
    const result = YTNormalizer.normalizeText(selectedText, options);
    const changedCount = result.results.filter((item) => item.changed).length;
    if (changedCount) {
      const copied = await writeClipboard(result.text, "クリップボードへコピーできませんでした。");
      if (!copied) return { changed: false, count: changedCount, error: "clipboard-copy-failed" };

      lastUndo = {
        type: "clipboard",
        beforeText: selectedText,
        afterText: result.text,
        count: changedCount
      };
      return { changed: true, count: changedCount, copied: true };
    }

    return { changed: false, count: 0 };
  }

  function getSelectionSource() {
    const active = document.activeElement;
    if (active && (active.tagName === "TEXTAREA" || (active.tagName === "INPUT" && active.type === "text"))) {
      return {
        text: active.value.slice(active.selectionStart, active.selectionEnd),
        element: active,
        start: active.selectionStart
      };
    }

    return {
      text: window.getSelection() ? window.getSelection().toString() : "",
      element: null,
      start: 0
    };
  }

  function linksWithContext(text) {
    const sourceText = String(text || "");
    return YTNormalizer.extractLinks(sourceText).map((link) => ({
      ...link,
      contextBefore: sourceText.slice(Math.max(0, link.index - 40), link.index),
      contextAfter: sourceText.slice(link.index + link.original.length, link.index + link.original.length + 40)
    }));
  }

  function compactText(text) {
    return String(text || "").replace(/\s+/g, " ").trim();
  }

  function clipContextText(text, maxLength) {
    const compacted = compactText(text);
    return compacted.length > maxLength ? `${compacted.slice(0, maxLength - 3)}...` : compacted;
  }

  function linkElementWithContext(link) {
    const anchorText = compactText(link.textContent || link.getAttribute("aria-label") || link.title);
    const anchorLabel = clipContextText(anchorText, 80);
    const parentText = compactText(link.parentElement ? link.parentElement.textContent : "");
    const anchorIndex = anchorText ? parentText.indexOf(anchorText) : -1;
    if (anchorIndex >= 0) {
      return {
        original: link.href,
        index: 0,
        contextBefore: `${parentText.slice(Math.max(0, anchorIndex - 40), anchorIndex)}${anchorLabel}`,
        contextAfter: parentText.slice(anchorIndex + anchorText.length, anchorIndex + anchorText.length + 40)
      };
    }

    return {
      original: link.href,
      index: 0,
      contextBefore: anchorLabel,
      contextAfter: ""
    };
  }

  async function undoLastChange() {
    if (!lastUndo) return { restored: false };

    if (lastUndo.type === "text-control") {
      const { element, start, beforeText, afterText } = lastUndo;
      if (!element || !element.isConnected) return { restored: false };
      const currentText = element.value.slice(start, start + afterText.length);
      if (currentText !== afterText) return { restored: false };

      element.setRangeText(beforeText, start, start + afterText.length, "select");
      dispatchInput(element, beforeText);
      lastUndo = null;
      return { restored: true };
    }

    if (lastUndo.type === "contenteditable-native") {
      const { element, beforeElementText, afterElementText } = lastUndo;
      if (!element || !element.isConnected || element.textContent !== afterElementText) {
        return { restored: false };
      }

      element.focus();
      try {
        if (typeof document.execCommand === "function") document.execCommand("undo");
      } catch (_error) {
        return { restored: false };
      }
      if (element.textContent !== beforeElementText) return { restored: false };
      lastUndo = null;
      return { restored: true };
    }

    if (lastUndo.type === "clipboard") {
      const copied = await writeClipboard(lastUndo.beforeText, "クリップボードへコピーできませんでした。");
      if (!copied) return { restored: false, error: "clipboard-copy-failed" };

      lastUndo = null;
      return { restored: true, copied: true };
    }

    return { restored: false };
  }

  function collectPageLinks(options) {
    const scope = options && options.extractionScope === "page" ? "page" : "selection";
    const selectionSource = getSelectionSource();
    const selection = selectionSource.text;
    const collectionId = ++linkCollectionSequence;
    lastLinkCollection = selectionSource.element
      ? { id: collectionId, element: selectionSource.element }
      : null;
    const selectionLinks = linksWithContext(selection).map((link) => ({
      ...link,
      jumpTarget: selectionSource.element
        ? {
            collectionId,
            start: selectionSource.start + link.index,
            end: selectionSource.start + link.index + link.original.length
          }
        : null
    }));
    let links = selectionLinks;

    if (scope === "page") {
      lastLinkCollection = null;
      const byOriginal = new Map();
      const sources = [
        linksWithContext(document.body ? document.body.textContent : ""),
        Array.from(document.links || []).map(linkElementWithContext)
      ];
      for (const source of sources) {
        for (const link of source) {
          if (!byOriginal.has(link.original)) byOriginal.set(link.original, link);
        }
      }
      links = Array.from(byOriginal.values());
    }

    const results = links.map((link) => ({
      original: link.original,
      index: link.index,
      contextBefore: link.contextBefore || "",
      contextAfter: link.contextAfter || "",
      jumpTarget: link.jumpTarget || null,
      ...YTNormalizer.normalizeUrl(link.original, options)
    }));

    return {
      pageTitle: document.title,
      scope,
      selectionText: selection,
      results
    };
  }

  function jumpToCollectedLink(target, original) {
    if (!target || !lastLinkCollection || target.collectionId !== lastLinkCollection.id) {
      return { jumped: false, error: "stale-collection" };
    }

    const element = lastLinkCollection.element;
    if (!element || !element.isConnected || typeof element.setSelectionRange !== "function") {
      return { jumped: false, error: "target-unavailable" };
    }

    let start = target.start;
    let end = target.end;
    if (element.value.slice(start, end) !== original) {
      const recovered = findClosestTextControlMatch(original, target);
      if (!recovered) return { jumped: false, error: "text-changed" };
      start = recovered.start;
      end = recovered.end;
      lastLinkCollection = { id: target.collectionId, element: recovered.element };
    }

    const targetElement = lastLinkCollection.element;
    targetElement.focus({ preventScroll: true });
    targetElement.setSelectionRange(start, end);
    targetElement.scrollIntoView({ block: "center", inline: "nearest" });
    scrollTextControlToSelection(targetElement, start);
    return { jumped: true };
  }

  function scrollTextControlToSelection(element, start) {
    if (typeof element.scrollTop !== "number" || typeof element.value !== "string") return;

    const style = getComputedStyle(element);
    const fontSize = parseFloat(style.fontSize) || 16;
    const lineHeight = parseFloat(style.lineHeight) || fontSize * 1.2;
    const paddingTop = parseFloat(style.paddingTop) || 0;
    const lineIndex = visualLineIndex(element, style, start);
    const selectionTop = paddingTop + lineIndex * lineHeight;
    const centeredTop = selectionTop - element.clientHeight / 2 + lineHeight;

    element.scrollTop = Math.max(0, centeredTop);
  }

  function visualLineIndex(element, style, start) {
    const textBeforeSelection = element.value.slice(0, start);
    const lines = textBeforeSelection.split("\n");
    const contentWidth = element.clientWidth
      - (parseFloat(style.paddingLeft) || 0)
      - (parseFloat(style.paddingRight) || 0);
    if (contentWidth <= 0 || style.whiteSpace === "pre") return lines.length - 1;

    const canvas = visualLineIndex.canvas || (visualLineIndex.canvas = document.createElement("canvas"));
    const context = canvas.getContext("2d");
    if (!context) return lines.length - 1;

    context.font = style.font;
    let visualLines = 0;
    for (const line of lines.slice(0, -1)) {
      visualLines += wrappedLineCount(context, contentWidth, line);
    }
    visualLines += wrappedLineCount(context, contentWidth, lines[lines.length - 1]) - 1;
    return Math.max(0, visualLines);
  }

  function wrappedLineCount(context, contentWidth, line) {
    if (!line) return 1;
    return Math.max(1, Math.ceil(context.measureText(line).width / contentWidth));
  }

  function textControlCandidates(preferredElement) {
    const controls = Array.from(document.querySelectorAll("textarea, input[type='text']"))
      .filter((element) => element.isConnected && typeof element.value === "string");
    if (!preferredElement || !controls.includes(preferredElement)) return controls;
    return [preferredElement, ...controls.filter((element) => element !== preferredElement)];
  }

  function findClosestTextControlMatch(original, target) {
    const matches = [];
    for (const element of textControlCandidates(lastLinkCollection && lastLinkCollection.element)) {
      let index = element.value.indexOf(original);
      while (index >= 0) {
        matches.push({
          element,
          start: index,
          end: index + original.length,
          distance: Math.abs(index - target.start)
        });
        index = element.value.indexOf(original, index + Math.max(1, original.length));
      }
    }

    matches.sort((a, b) => a.distance - b.distance);
    return matches[0] || null;
  }

  extensionApi.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.type === "yt-normalizer-toast") {
      showToast(message.message);
      sendResponse({ ok: true });
      return false;
    }

    if (message.type === "yt-normalizer-normalize-selection") {
      normalizeSelection(message.options).then(sendResponse).catch(() => {
        sendResponse({ changed: false, count: 0, error: "normalize-failed" });
      });
      return true;
    }

    if (message.type === "yt-normalizer-collect-links") {
      sendResponse(collectPageLinks(message.options));
      return false;
    }

    if (message.type === "yt-normalizer-jump-to-link") {
      sendResponse(jumpToCollectedLink(message.target, message.original));
      return false;
    }

    if (message.type === "yt-normalizer-undo-last-change") {
      undoLastChange().then(sendResponse).catch(() => {
        sendResponse({ restored: false, error: "undo-failed" });
      });
      return true;
    }

    return false;
  });
})();
