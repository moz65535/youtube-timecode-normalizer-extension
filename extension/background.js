if (!globalThis.YTNormalizer && typeof importScripts === "function") {
  importScripts("normalizer.js");
}

const extensionApi = globalThis.browser || globalThis.chrome;

const MENU_COPY_LINK = "copy-normalized-link";
const MENU_NORMALIZE_SELECTION = "normalize-selection";
const MENU_OPEN_LINK = "open-normalized-link";
const MENU_UNDO_LAST_CHANGE = "undo-last-change";

extensionApi.runtime.onInstalled.addListener(async () => {
  if (globalThis.browser) {
    await extensionApi.contextMenus.removeAll();
  } else {
    await new Promise((resolve) => extensionApi.contextMenus.removeAll(resolve));
  }

  extensionApi.contextMenus.create({
    id: MENU_COPY_LINK,
    title: "リンクをタイムコード正規化URLにしてコピー",
    contexts: ["link"]
  });

  extensionApi.contextMenus.create({
    id: MENU_OPEN_LINK,
    title: "正規化したリンクを開く",
    contexts: ["link"]
  });

  extensionApi.contextMenus.create({
    id: MENU_NORMALIZE_SELECTION,
    title: "選択範囲のタイムコード付きURLを正規化",
    contexts: ["selection", "editable"]
  });

  extensionApi.contextMenus.create({
    id: MENU_UNDO_LAST_CHANGE,
    title: "直前の変更を元に戻す",
    contexts: ["editable", "selection", "page"]
  });
});

async function getOptions() {
  try {
    return await extensionApi.storage.sync.get(YTNormalizer.DEFAULT_OPTIONS);
  } catch (_error) {
    return extensionApi.storage.local.get(YTNormalizer.DEFAULT_OPTIONS);
  }
}

async function copyInActiveTab(tabId, text) {
  try {
    await extensionApi.scripting.executeScript({
      target: { tabId },
      func: async (value) => {
        await navigator.clipboard.writeText(value);
      },
      args: [text]
    });
    return true;
  } catch (_error) {
    return false;
  }
}

async function notifyTab(tabId, message) {
  try {
    await extensionApi.tabs.sendMessage(tabId, { type: "yt-normalizer-toast", message });
  } catch (_error) {
    // Some restricted pages do not accept content scripts. The context menu action still completes when possible.
  }
}

async function sendTabMessage(tabId, message) {
  try {
    return await extensionApi.tabs.sendMessage(tabId, message);
  } catch (_error) {
    return null;
  }
}

function responseErrorMessage(response) {
  if (!response || !response.error) return null;
  const messages = {
    "backup-save-failed": "変更前テキストをローカルへ保存できなかったため、編集を中止しました。",
    "clipboard-copy-failed": "クリップボードへコピーできませんでした。",
    "normalize-failed": "選択範囲の正規化に失敗しました。",
    "undo-failed": "元に戻す処理に失敗しました。"
  };
  return messages[response.error] || "処理に失敗しました。";
}

extensionApi.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!tab || !tab.id) return;

  const options = await getOptions();

  if (info.menuItemId === MENU_COPY_LINK || info.menuItemId === MENU_OPEN_LINK) {
    const result = YTNormalizer.normalizeUrl(info.linkUrl || "", options);
    if (!result.changed && result.reason !== "already-normalized") {
      await notifyTab(tab.id, "YouTubeのタイムコード付き動画URLではありません。");
      return;
    }

    if (info.menuItemId === MENU_OPEN_LINK) {
      await extensionApi.tabs.create({ url: result.normalized, active: true });
      return;
    }

    const copied = await copyInActiveTab(tab.id, result.normalized);
    await notifyTab(tab.id, copied ? "正規化URLをコピーしました。" : "このページではクリップボードへコピーできません。");
    return;
  }

  if (info.menuItemId === MENU_NORMALIZE_SELECTION) {
    const response = await sendTabMessage(tab.id, {
      type: "yt-normalizer-normalize-selection",
      options
    });

    const errorMessage = responseErrorMessage(response);
    if (errorMessage) {
      await notifyTab(tab.id, errorMessage);
      return;
    }

    if (response && response.changed) {
      await notifyTab(tab.id, `${response.count}件のURLを正規化しました。`);
      return;
    }

    await notifyTab(tab.id, "選択範囲に正規化できるURLがありません。");
    return;
  }

  if (info.menuItemId === MENU_UNDO_LAST_CHANGE) {
    const response = await sendTabMessage(tab.id, {
      type: "yt-normalizer-undo-last-change"
    });

    const errorMessage = responseErrorMessage(response);
    if (errorMessage) {
      await notifyTab(tab.id, errorMessage);
      return;
    }

    await notifyTab(tab.id, response && response.restored ? "直前の変更を元に戻しました。" : "元に戻せる変更がありません。");
  }
});
