"use strict";
(() => {
  const extension = location.protocol === "chrome-extension:";
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
    mode: extension ? "extension" : "web",
    async status(service, options = {}) {
      if (extension) return message("status");
      let response = await fetch("/api/status?service=" + service, {
        cache: "no-store",
        signal: options.signal || AbortSignal.timeout(20000),
      });
      if (response.status === 404)
        response = await fetch("availability.json", {
          cache: "no-store",
          signal: options.signal || AbortSignal.timeout(20000),
        });
      if (!response.ok) throw new Error("현황 응답 오류");
      return response.json();
    },
    start: (conditions) => message("start", conditions),
    connect: () => message("connect"),
    cancel: () => message("cancel"),
    clear: () => message("clear"),
  };
})();
