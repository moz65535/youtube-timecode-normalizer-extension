(function () {
  "use strict";

  const extensionApi = globalThis.browser || globalThis.chrome;
  const BACKUP_STORAGE_KEY = "lastTextBackup";
  const DEFAULT_VISIBLE_SUSPICIOUS_CATEGORIES = new Set([
    "list",
    "malformed",
    "unsupported-timecode",
    "mistyped-youtube-host",
    "invalid-url",
    "other"
  ]);
  const elements = {
    versionLabel: document.getElementById("versionLabel"),
    formatMode: document.getElementById("formatMode"),
    resetSettings: document.getElementById("resetSettings"),
    removeSi: document.getElementById("removeSi"),
    removeSiWithoutTime: document.getElementById("removeSiWithoutTime"),
    removeFeature: document.getElementById("removeFeature"),
    copyBackupBeforeEdit: document.getElementById("copyBackupBeforeEdit"),
    preserveList: document.getElementById("preserveList"),
    flagListUrls: document.getElementById("flagListUrls"),
    repairMalformedTime: document.getElementById("repairMalformedTime"),
    extractionScope: document.getElementById("extractionScope"),
    manualInput: document.getElementById("manualInput"),
    previewManual: document.getElementById("previewManual"),
    copyConvertedText: document.getElementById("copyConvertedText"),
    refreshLinks: document.getElementById("refreshLinks"),
    copyNormalizedLinks: document.getElementById("copyNormalizedLinks"),
    undoLastChange: document.getElementById("undoLastChange"),
    copySavedBackup: document.getElementById("copySavedBackup"),
    backupInfo: document.getElementById("backupInfo"),
    copyDiff: document.getElementById("copyDiff"),
    copySuspiciousLinks: document.getElementById("copySuspiciousLinks"),
    suspiciousCount: document.getElementById("suspiciousCount"),
    status: document.getElementById("status"),
    filters: document.getElementById("filters"),
    suspiciousFilters: document.getElementById("suspiciousFilters"),
    results: document.getElementById("results"),
    diff: document.getElementById("diff"),
    suspicious: document.getElementById("suspicious")
  };

  let currentResults = [];
  let currentConvertedText = "";
  let currentSource = "page";
  let refreshSequence = 0;
  let settingsWriteQueue = Promise.resolve();
  let backupFeedbackTimer = null;

  function renderVersion() {
    if (!elements.versionLabel || !extensionApi.runtime || !extensionApi.runtime.getManifest) return;
    elements.versionLabel.textContent = `v${extensionApi.runtime.getManifest().version}`;
  }

  function status(message) {
    elements.status.textContent = message;
  }

  function resultSummary(results, verb) {
    const changed = results.filter((item) => item.changed).length;
    const alreadyNormalized = results.filter((item) => item.reason === "already-normalized").length;
    return `${results.length}件${verb}、${changed}件を変換可能、正規化済み${alreadyNormalized}件です。`;
  }

  async function getActiveTab() {
    const [tab] = await extensionApi.tabs.query({ active: true, currentWindow: true });
    return tab;
  }

  function currentOptions() {
    return {
      formatMode: elements.formatMode.value,
      removeSi: elements.removeSi.checked,
      removeSiWithoutTime: elements.removeSiWithoutTime.checked,
      removeFeature: elements.removeFeature.checked,
      copyBackupBeforeEdit: elements.copyBackupBeforeEdit.checked,
      extractionScope: elements.extractionScope.value,
      preserveList: elements.preserveList.checked,
      flagListUrls: elements.flagListUrls.checked,
      repairMalformedTime: elements.repairMalformedTime.checked
    };
  }

  async function getStoredOptions() {
    try {
      return await extensionApi.storage.sync.get(YTNormalizer.DEFAULT_OPTIONS);
    } catch (_error) {
      return extensionApi.storage.local.get(YTNormalizer.DEFAULT_OPTIONS);
    }
  }

  async function setStoredOptions(options) {
    try {
      await extensionApi.storage.sync.set(options);
    } catch (_error) {
      await extensionApi.storage.local.set(options);
    }
  }

  function queueStoredOptions(options) {
    settingsWriteQueue = settingsWriteQueue
      .catch(() => {})
      .then(() => setStoredOptions(options));
    return settingsWriteQueue;
  }

  function applyOptions(options) {
    elements.formatMode.value = options.formatMode;
    elements.removeSi.checked = Boolean(options.removeSi);
    elements.removeSiWithoutTime.checked = Boolean(options.removeSiWithoutTime);
    elements.removeFeature.checked = options.removeFeature !== false;
    elements.copyBackupBeforeEdit.checked = Boolean(options.copyBackupBeforeEdit);
    elements.extractionScope.value = options.extractionScope || "selection";
    elements.preserveList.checked = Boolean(options.preserveList);
    elements.flagListUrls.checked = options.flagListUrls !== false;
    elements.repairMalformedTime.checked = options.repairMalformedTime !== false;
  }

  async function loadSettings() {
    applyOptions(await getStoredOptions());
  }

  async function resetSettings() {
    const defaults = { ...YTNormalizer.DEFAULT_OPTIONS };
    await queueStoredOptions(defaults);
    applyOptions(defaults);
    for (const input of elements.filters.querySelectorAll("input[type='checkbox']")) {
      input.checked = true;
    }
    resetSuspiciousFilters();

    if (currentSource === "manual") {
      previewManualText();
    } else {
      await refreshLinks();
    }
    status("初期設定に戻しました。");
  }

  function resetSuspiciousFilters() {
    for (const input of elements.suspiciousFilters.querySelectorAll("input[type='checkbox']")) {
      input.checked = DEFAULT_VISIBLE_SUSPICIOUS_CATEGORIES.has(input.value);
    }
  }

  function formatBackupDate(savedAt) {
    const date = new Date(savedAt);
    if (!Number.isFinite(date.getTime())) return "保存日時不明";
    return new Intl.DateTimeFormat("ja-JP", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit"
    }).format(date);
  }

  function renderBackupInfo(backup) {
    if (backupFeedbackTimer) {
      clearTimeout(backupFeedbackTimer);
      backupFeedbackTimer = null;
    }

    if (!backup || typeof backup.text !== "string") {
      elements.backupInfo.textContent = "保存済みバックアップはありません。";
      elements.backupInfo.removeAttribute("title");
      elements.copySavedBackup.disabled = true;
      return;
    }

    const pageLabel = backup.pageTitle || backup.pageUrl || "ページ名不明";
    elements.backupInfo.textContent =
      `${formatBackupDate(backup.savedAt)} / ${pageLabel} / ${backup.text.length}文字`;
    if (backup.pageUrl) {
      elements.backupInfo.title = backup.pageUrl;
    } else {
      elements.backupInfo.removeAttribute("title");
    }
    elements.copySavedBackup.disabled = false;
  }

  function showBackupCopyFeedback(backup) {
    if (backupFeedbackTimer) clearTimeout(backupFeedbackTimer);
    elements.backupInfo.textContent = `バックアップをコピーしました（${backup.text.length}文字）。`;
    elements.backupInfo.removeAttribute("title");
    backupFeedbackTimer = setTimeout(() => {
      backupFeedbackTimer = null;
      renderBackupInfo(backup);
    }, 2500);
  }

  async function refreshBackupInfo() {
    try {
      const stored = await extensionApi.storage.local.get(BACKUP_STORAGE_KEY);
      renderBackupInfo(stored[BACKUP_STORAGE_KEY]);
    } catch (_error) {
      elements.backupInfo.textContent = "バックアップ情報を読み込めませんでした。";
      elements.copySavedBackup.disabled = true;
    }
  }

  async function saveSettings(event) {
    await queueStoredOptions(currentOptions());
    const settingId = event && event.target ? event.target.id : "";

    if (settingId === "copyBackupBeforeEdit") {
      status("設定を保存しました。");
      return;
    }

    if (settingId === "flagListUrls") {
      rerenderCurrentResults();
      return;
    }

    if (currentSource === "manual") {
      previewManualText();
      return;
    }

    await refreshLinks();
  }

  function reasonLabel(reason) {
    const labels = {
      "already-normalized": "正規化済み",
      normalized: "変換可能",
      "si-removed": "si除去",
      "feature-removed": "feature除去",
      "personal-list-removed": "個人用list除去",
      "no-timecode": "タイムコードなし",
      "not-video-url": "動画URL以外",
      "unsupported-timecode": "未対応の時刻",
      "malformed-timecode": "崩れた時刻指定",
      "mistyped-youtube-host": "ホスト名誤り",
      "not-youtube": "YouTube以外",
      "invalid-url": "URL不正"
    };
    return labels[reason] || reason;
  }

  function activeReasons() {
    return new Set(
      Array.from(elements.filters.querySelectorAll("input[type='checkbox']:checked")).map((input) => input.value)
    );
  }

  function filteredResults(results) {
    const reasons = activeReasons();
    return results.filter((item) => reasons.has(item.reason));
  }

  function suspiciousResults(results) {
    const showListUrls = elements.flagListUrls.checked;
    return results.filter((item) => item.suspicious || item.hasMalformedTime || (showListUrls && item.hasList) || (item.reason !== "normalized" && item.reason !== "already-normalized"));
  }

  function activeSuspiciousCategories() {
    return new Set(
      Array.from(elements.suspiciousFilters.querySelectorAll("input[type='checkbox']:checked"))
        .map((input) => input.value)
    );
  }

  function suspiciousCategories(item) {
    const categories = [];
    if (item.hasList) categories.push("list");
    if (item.hasMalformedTime) categories.push("malformed");

    const reasonCategories = new Set([
      "unsupported-timecode",
      "not-video-url",
      "no-timecode",
      "mistyped-youtube-host",
      "not-youtube",
      "invalid-url"
    ]);
    if (reasonCategories.has(item.reason)) {
      categories.push(item.reason);
    }

    if (!categories.length) categories.push("other");
    return categories;
  }

  function filteredSuspiciousResults(results) {
    const categories = activeSuspiciousCategories();
    return suspiciousResults(results).filter((item) =>
      suspiciousCategories(item).some((category) => categories.has(category))
    );
  }

  function updateSuspiciousCount(results) {
    const total = suspiciousResults(results).length;
    const shown = filteredSuspiciousResults(results).length;
    elements.suspiciousCount.textContent = shown === total ? `${shown}件` : `${shown} / ${total}件`;
    elements.copySuspiciousLinks.disabled = shown === 0;
  }

  function changedResults(results) {
    return results.filter((item) => item.changed && item.normalized && item.normalized !== item.original);
  }

  function compactContext(text) {
    return String(text || "").replace(/\s+/g, " ").trim();
  }

  function contextText(item) {
    const before = compactContext(item.contextBefore);
    const after = compactContext(item.contextAfter);
    if (!before && !after) return "";
    return `...${before}[URL]${after}...`;
  }

  function createContextNode(item, markerText = "置換URL") {
    const before = compactContext(item.contextBefore);
    const after = compactContext(item.contextAfter);
    if (!before && !after) return null;

    const contextNode = document.createElement("div");
    contextNode.className = "context";

    const beforeNode = document.createElement("span");
    beforeNode.textContent = `...${before}`;

    const marker = document.createElement("span");
    marker.className = "context-marker";
    marker.textContent = markerText;

    const afterNode = document.createElement("span");
    afterNode.textContent = `${after}...`;

    contextNode.append(beforeNode, marker, afterNode);
    return contextNode;
  }

  async function jumpToLink(item, button) {
    const showJumpError = (message, error) => {
      status(message);
      button.textContent = error === "text-changed" ? "再抽出してください" : "移動できません";
      button.disabled = true;
    };

    try {
      const tab = await getActiveTab();
      if (!tab || !tab.id) {
        showJumpError("編集画面を取得できません。");
        return;
      }

      const response = await extensionApi.tabs.sendMessage(tab.id, {
        type: "yt-normalizer-jump-to-link",
        target: item.jumpTarget,
        original: item.original
      });
      if (response && response.jumped) {
        window.close();
        return;
      }

      showJumpError(jumpErrorMessage(response && response.error), response && response.error);
    } catch (_error) {
      showJumpError("該当位置へ移動できません。もう一度抽出してください。");
    }
  }

  function jumpErrorMessage(error) {
    const messages = {
      "stale-collection": "抽出情報が古くなっています。もう一度抽出してください。",
      "target-unavailable": "抽出元の編集欄が見つかりません。もう一度抽出してください。",
      "text-changed": "編集内容が変わったため移動できません。もう一度抽出してください。"
    };
    return messages[error] || "該当位置へ移動できません。もう一度抽出してください。";
  }

  function diffText(results) {
    return changedResults(results)
      .map((item) => {
        const context = contextText(item);
        return `${reasonLabel(item.reason)}${context ? `\n${context}` : ""}\n- ${item.original}\n+ ${item.normalized}`;
      })
      .join("\n\n");
  }

  function renderDiff(container, results) {
    const items = changedResults(results);
    elements.copyDiff.disabled = items.length === 0;
    container.textContent = "";
    if (!items.length) {
      const empty = document.createElement("p");
      empty.className = "meta";
      empty.textContent = "表示できる差分はありません。";
      container.appendChild(empty);
      return;
    }

    for (const item of items) {
      const wrapper = document.createElement("article");
      wrapper.className = "item";

      const meta = document.createElement("div");
      meta.className = "meta";
      const badge = document.createElement("span");
      badge.className = "badge";
      badge.textContent = reasonLabel(item.reason);
      meta.appendChild(badge);

      const contextNode = createContextNode(item);
      if (contextNode) {
        wrapper.append(meta, contextNode);
      } else {
        wrapper.appendChild(meta);
      }

      const before = document.createElement("div");
      before.className = "url diff-line diff-old";
      before.textContent = `変更前: ${item.original}`;

      const after = document.createElement("div");
      after.className = "url diff-line diff-new";
      after.textContent = `変更後: ${item.normalized}`;

      wrapper.append(before, after);
      container.appendChild(wrapper);
    }
  }

  function renderList(container, results, includeOnlySuspicious) {
    const items = includeOnlySuspicious
      ? filteredSuspiciousResults(results)
      : filteredResults(results);

    container.textContent = "";
    if (includeOnlySuspicious) updateSuspiciousCount(results);
    container.classList.toggle("empty", items.length === 0);
    if (!items.length) {
      const empty = document.createElement("p");
      empty.className = "meta";
      empty.textContent = "表示できるリンクはありません。";
      container.appendChild(empty);
      return;
    }

    for (const item of items) {
      const wrapper = document.createElement("article");
      wrapper.className = "item";

      const meta = document.createElement("div");
      meta.className = "meta";
      const badge = document.createElement("span");
      badge.className = `badge${item.changed ? "" : " warn"}`;
      badge.textContent = reasonLabel(item.reason);
      meta.appendChild(badge);
      if (item.hasList) {
        const listBadge = document.createElement("span");
        listBadge.className = "badge warn";
        listBadge.textContent = "list付き";
        meta.appendChild(listBadge);
      }
      if (item.hasMalformedTime && item.reason !== "malformed-timecode") {
        const malformedBadge = document.createElement("span");
        malformedBadge.className = "badge warn";
        malformedBadge.textContent = "崩れ時刻";
        meta.appendChild(malformedBadge);
      }
      if (includeOnlySuspicious && item.jumpTarget) {
        const jumpButton = document.createElement("button");
        jumpButton.type = "button";
        jumpButton.className = "jump-button";
        jumpButton.textContent = "位置へ移動";
        jumpButton.addEventListener("click", () => jumpToLink(item, jumpButton));
        meta.appendChild(jumpButton);
      }

      const original = document.createElement("div");
      original.className = "url";
      original.textContent = item.original;
      wrapper.appendChild(meta);
      if (includeOnlySuspicious) {
        const contextNode = createContextNode(item, "対象URL");
        if (contextNode) wrapper.appendChild(contextNode);
      }
      wrapper.appendChild(original);

      if (item.normalized && (item.changed || item.reason === "already-normalized")) {
        const normalized = document.createElement("div");
        normalized.className = "url";
        normalized.textContent = item.normalized;
        wrapper.appendChild(normalized);
      }

      container.appendChild(wrapper);
    }
  }

  async function refreshLinks() {
    const requestSequence = ++refreshSequence;
    try {
      const tab = await getActiveTab();
      if (!tab || !tab.id) {
        if (requestSequence !== refreshSequence) return;
        status("アクティブなタブを取得できません。");
        return;
      }

      const response = await extensionApi.tabs.sendMessage(tab.id, {
        type: "yt-normalizer-collect-links",
        options: currentOptions()
      });

      if (requestSequence !== refreshSequence) return;
      currentSource = "page";
      currentResults = response.results || [];
      renderList(elements.results, currentResults, false);
      renderDiff(elements.diff, currentResults);
      renderList(elements.suspicious, currentResults, true);
      if (response.scope === "selection" && !response.selectionText) {
        status("選択範囲がありません。抽出対象をページ全体に切り替えることもできます。");
      } else {
        status(resultSummary(currentResults, "抽出"));
      }
    } catch (_error) {
      if (requestSequence !== refreshSequence) return;
      status("このページでは抽出できないか、読み込み中です。再度抽出するか、入力欄のプレビューを使ってください。");
      currentResults = [];
      renderList(elements.results, [], false);
      renderDiff(elements.diff, []);
      renderList(elements.suspicious, [], true);
    }
  }

  function previewManualText() {
    refreshSequence += 1;
    const result = YTNormalizer.normalizeText(elements.manualInput.value, currentOptions());
    currentConvertedText = result.text;
    currentSource = "manual";
    currentResults = result.results;
    renderList(elements.results, currentResults, false);
    renderDiff(elements.diff, currentResults);
    renderList(elements.suspicious, currentResults, true);
    status(resultSummary(currentResults, "検出"));
  }

  function rerenderCurrentResults() {
    renderList(elements.results, currentResults, false);
    renderDiff(elements.diff, currentResults);
    renderList(elements.suspicious, currentResults, true);
    const shown = filteredResults(currentResults).length;
    status(`${shown}件を表示中です。`);
  }

  function rerenderSuspiciousResults() {
    renderList(elements.suspicious, currentResults, true);
    status(`疑わしい対象外を${filteredSuspiciousResults(currentResults).length}件表示中です。`);
  }

  async function copyText(text, doneMessage) {
    try {
      await navigator.clipboard.writeText(text);
      status(doneMessage);
      return true;
    } catch (_error) {
      status("クリップボードへコピーできませんでした。");
      return false;
    }
  }

  elements.formatMode.addEventListener("change", saveSettings);
  elements.resetSettings.addEventListener("click", resetSettings);
  elements.removeSi.addEventListener("change", saveSettings);
  elements.removeSiWithoutTime.addEventListener("change", saveSettings);
  elements.removeFeature.addEventListener("change", saveSettings);
  elements.copyBackupBeforeEdit.addEventListener("change", saveSettings);
  elements.extractionScope.addEventListener("change", saveSettings);
  elements.preserveList.addEventListener("change", saveSettings);
  elements.flagListUrls.addEventListener("change", saveSettings);
  elements.repairMalformedTime.addEventListener("change", saveSettings);
  elements.filters.addEventListener("change", rerenderCurrentResults);
  elements.suspiciousFilters.addEventListener("change", rerenderSuspiciousResults);
  elements.refreshLinks.addEventListener("click", refreshLinks);
  elements.undoLastChange.addEventListener("click", async () => {
    const tab = await getActiveTab();
    if (!tab || !tab.id) {
      status("アクティブなタブを取得できません。");
      return;
    }

    try {
      const response = await extensionApi.tabs.sendMessage(tab.id, { type: "yt-normalizer-undo-last-change" });
      status(response && response.restored ? "直前の変更を元に戻しました。" : "元に戻せる変更がありません。");
    } catch (_error) {
      status("このページでは元に戻せません。");
    }
  });
  elements.copySavedBackup.addEventListener("click", async () => {
    try {
      const stored = await extensionApi.storage.local.get(BACKUP_STORAGE_KEY);
      const backup = stored[BACKUP_STORAGE_KEY];
      if (!backup || typeof backup.text !== "string") {
        status("保存済みバックアップはありません。");
        renderBackupInfo(null);
        return;
      }

      if (await copyText(backup.text, `保存済みバックアップをコピーしました（${backup.text.length}文字）。`)) {
        showBackupCopyFeedback(backup);
      }
    } catch (_error) {
      status("保存済みバックアップを読み込めませんでした。");
    }
  });
  elements.previewManual.addEventListener("click", previewManualText);
  elements.copyConvertedText.addEventListener("click", () => {
    if (!currentConvertedText) previewManualText();
    copyText(currentConvertedText || "", "変換後テキストをコピーしました。");
  });
  elements.copyNormalizedLinks.addEventListener("click", () => {
    const text = filteredResults(currentResults)
      .filter((item) => item.changed || item.reason === "already-normalized")
      .map((item) => item.normalized)
      .join("\n");
    copyText(text, "正規化URLをコピーしました。");
  });
  elements.copyDiff.addEventListener("click", () => {
    copyText(diffText(currentResults), "変更差分をコピーしました。");
  });
  elements.copySuspiciousLinks.addEventListener("click", () => {
    const text = filteredSuspiciousResults(currentResults)
      .map((item) => `${item.hasMalformedTime && item.reason !== "malformed-timecode" ? "崩れ時刻/" : ""}${item.hasList ? "list付き/" : ""}${reasonLabel(item.reason)}\t${item.original}`)
      .join("\n");
    copyText(text, "表示中の疑わしい対象外をコピーしました。");
  });

  extensionApi.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === "local" && changes[BACKUP_STORAGE_KEY]) {
      renderBackupInfo(changes[BACKUP_STORAGE_KEY].newValue);
    }
  });

  renderVersion();
  Promise.all([loadSettings(), refreshBackupInfo()]).then(refreshLinks);
})();
