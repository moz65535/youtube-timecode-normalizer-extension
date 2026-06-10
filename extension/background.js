importScripts("normalizer.js");

const MENU_COPY_LINK = "copy-normalized-link";
const MENU_NORMALIZE_SELECTION = "normalize-selection";
const MENU_OPEN_LINK = "open-normalized-link";
const MENU_UNDO_LAST_CHANGE = "undo-last-change";

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
  chrome.contextMenus.create({
    id: MENU_COPY_LINK,
    title: "リンクをタイムコード正規化URLにしてコピー",
    contexts: ["link"]
  });

  chrome.contextMenus.create({
    id: MENU_OPEN_LINK,
    title: "正規化したリンクを開く",
    contexts: ["link"]
  });

  chrome.contextMenus.create({
    id: MENU_NORMALIZE_SELECTION,
    title: "選択範囲のタイムコード付きURLを正規化",
    contexts: ["selection", "editable"]
  });

  chrome.contextMenus.create({
    id: MENU_UNDO_LAST_CHANGE,
    title: "直前の変更を元に戻す",
    contexts: ["editable", "selection", "page"]
  });
  });
});

async function getOptions() {
  return chrome.storage.sync.get(YTNormalizer.DEFAULT_OPTIONS);
}

async function copyInActiveTab(tabId, text) {
  try {
    await chrome.scripting.executeScript({
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
    await chrome.tabs.sendMessage(tabId, { type: "yt-normalizer-toast", message });
  } catch (_error) {
    // Some restricted pages do not accept content scripts. The context menu action still completes when possible.
  }
}

async function sendTabMessage(tabId, message) {
  try {
    return await chrome.tabs.sendMessage(tabId, message);
  } catch (_error) {
    return null;
  }
}

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!tab || !tab.id) return;

  const options = await getOptions();

  if (info.menuItemId === MENU_COPY_LINK || info.menuItemId === MENU_OPEN_LINK) {
    const result = YTNormalizer.normalizeUrl(info.linkUrl || "", options);
    if (!result.changed && result.reason !== "already-normalized") {
      await notifyTab(tab.id, "YouTubeのタイムコード付き動画URLではありません。");
      return;
    }

    if (info.menuItemId === MENU_OPEN_LINK) {
      await chrome.tabs.create({ url: result.normalized, active: true });
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

    await notifyTab(tab.id, response && response.restored ? "直前の変更を元に戻しました。" : "元に戻せる変更がありません。");
  }
});
