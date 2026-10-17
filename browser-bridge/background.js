"use strict";
const allowed = new Set([
  "/api/bridge/job",
  "/api/bridge/result",
  "/api/bridge/progress",
]);
chrome.runtime.onMessage.addListener((message, sender, reply) => {
  if (!message || message.type !== "forest-bridge") return;
  let source;
  try {
    source = new URL(sender.tab?.url);
  } catch {}
  if (
    source?.origin !== "https://www.foresttrip.go.kr" ||
    source.pathname !== "/rep/or/sssn/monthRsrvtStatus.do" ||
    !allowed.has(message.path) ||
    message.method !== (message.path === "/api/bridge/job" ? "GET" : "POST") ||
    typeof message.token !== "string" ||
    message.token.length > 128
  ) {
    reply({ ok: false, error: "허용되지 않은 요청입니다." });
    return;
  }
  fetch("http://127.0.0.1:8765" + message.path, {
    method: message.method,
    headers: {
      Authorization: "Bearer " + message.token,
      "Content-Type": "application/json",
    },
    ...(message.method === "POST"
      ? { body: JSON.stringify(message.body || {}) }
      : {}),
    signal: AbortSignal.timeout(15000),
  })
    .then(async (response) => {
      const data = await response.json();
      reply({ ok: response.ok, data });
    })
    .catch(() =>
      reply({ ok: false, error: "로컬 숲자리 서버에 연결하지 못했습니다." }),
    );
  return true;
});
