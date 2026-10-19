"use strict";
(() => {
  async function message(action, body = {}) {
    const result = await chrome.runtime.sendMessage({
      type: "forest-ui",
      action,
      body,
    });
    if (!result?.ok)
      throw new Error(result?.error || "연결을 확인하지 못했습니다.");
    return result.data;
  }
  window.ForestTransport = {
    mode: "extension",
    status: () => message("status"),
    start: (conditions) => message("start", conditions),
    connect: () => message("connect"),
    cancel: () => message("cancel"),
    clear: () => message("clear"),
  };
})();
