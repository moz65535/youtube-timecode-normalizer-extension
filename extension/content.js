(function () {
  "use strict";

  let lastUndo = null;

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

  async function copyBackupIfEnabled(text, options) {
    if (options && options.copyBackupBeforeEdit) {
      await navigator.clipboard.writeText(text);
    }
  }

  async function normalizeTextAreaSelection(element, options) {
    const start = element.selectionStart;
    const end = element.selectionEnd;
    const selected = element.value.slice(start, end);
    const result = YTNormalizer.normalizeText(selected, options);
    const changedCount = result.results.filter((item) => item.changed).length;
    if (!changedCount) return { changed: false, count: 0 };

    await copyBackupIfEnabled(selected, options);
    element.setRangeText(result.text, start, end, "select");
    element.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: result.text }));
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
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
      return { changed: false, count: 0 };
    }

    const selectedText = selection.toString();
    const result = YTNormalizer.normalizeText(selectedText, options);
    const changedCount = result.results.filter((item) => item.changed).length;
    if (!changedCount) return { changed: false, count: 0 };

    await copyBackupIfEnabled(selectedText, options);
    const range = selection.getRangeAt(0);
    const replacement = document.createTextNode(result.text);
    range.deleteContents();
    range.insertNode(replacement);
    selection.removeAllRanges();
    lastUndo = {
      type: "contenteditable",
      node: replacement,
      beforeText: selectedText,
      afterText: result.text,
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
      await navigator.clipboard.writeText(result.text);
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

  async function undoLastChange() {
    if (!lastUndo) return { restored: false };

    if (lastUndo.type === "text-control") {
      const { element, start, beforeText, afterText } = lastUndo;
      if (!element || !element.isConnected) return { restored: false };
      const currentText = element.value.slice(start, start + afterText.length);
      if (currentText !== afterText) return { restored: false };

      element.setRangeText(beforeText, start, start + afterText.length, "select");
      element.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: beforeText }));
      lastUndo = null;
      return { restored: true };
    }

    if (lastUndo.type === "contenteditable") {
      const { node, beforeText } = lastUndo;
      if (!node || !node.isConnected || !node.parentNode) return { restored: false };
      const replacement = document.createTextNode(beforeText);
      node.parentNode.replaceChild(replacement, node);
      lastUndo = null;
      return { restored: true };
    }

    if (lastUndo.type === "clipboard") {
      await navigator.clipboard.writeText(lastUndo.beforeText);
      lastUndo = null;
      return { restored: true, copied: true };
    }

    return { restored: false };
  }

  function collectPageLinks(options) {
    const textLinks = YTNormalizer.extractLinks(document.body ? document.body.innerText : "");
    const anchorLinks = Array.from(document.links || []).map((link) => ({ original: link.href, index: 0 }));
    const selection = window.getSelection() ? window.getSelection().toString() : "";
    const selectionLinks = YTNormalizer.extractLinks(selection);
    const byOriginal = new Map();

    for (const source of [selectionLinks, textLinks, anchorLinks]) {
      for (const link of source) {
        if (!byOriginal.has(link.original)) byOriginal.set(link.original, link);
      }
    }

    const results = Array.from(byOriginal.values()).map((link) => ({
      original: link.original,
      ...YTNormalizer.normalizeUrl(link.original, options)
    }));

    return {
      pageTitle: document.title,
      selectionText: selection,
      results
    };
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.type === "yt-normalizer-toast") {
      showToast(message.message);
      sendResponse({ ok: true });
      return false;
    }

    if (message.type === "yt-normalizer-normalize-selection") {
      normalizeSelection(message.options).then(sendResponse);
      return true;
    }

    if (message.type === "yt-normalizer-collect-links") {
      sendResponse(collectPageLinks(message.options));
      return false;
    }

    if (message.type === "yt-normalizer-undo-last-change") {
      undoLastChange().then(sendResponse);
      return true;
    }

    return false;
  });
})();
