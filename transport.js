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
      const query = new URLSearchParams({ service });
      if (service === "forest" && options.conditions) {
        const input = options.conditions;
        for (const key of ["date", "region", "operator"])
          if (input[key]) query.set(key, input[key]);
        if (input.ids?.length) query.set("ids", input.ids.join(","));
      }
      let response = await fetch("/api/status?" + query, {
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
    async start(conditions) {
      if (extension) return message("start", conditions);
      const response = await fetch("/api/forest/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(conditions),
        signal: AbortSignal.timeout(10000),
      });
      const data = await response.json();
      if (!response.ok)
        throw Error(
          data.error ||
            "갱신 요청을 접수하지 못했습니다. 저장된 자료는 계속 볼 수 있습니다.",
        );
      return data;
    },
    connect: () => message("connect"),
    cancel: () => message("cancel"),
    clear: () => message("clear"),
  };
})();
