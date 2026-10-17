"use strict";
importScripts("operator-config.js", "observation.js");
const OFFICIAL = "https://www.foresttrip.go.kr/rep/or/sssn/monthRsrvtStatus.do";
const KEY = "forestOperatorV1";
let queue = Promise.resolve();
async function read() {
  return (
    (await chrome.storage.local.get(KEY))[KEY] || {
      enabled: false,
      tabId: null,
      collector_id: crypto.randomUUID(),
      uploads: 0,
      failures: 0,
    }
  );
}
async function save(state) {
  await chrome.storage.local.set({ [KEY]: state });
}
function trusted(sender, official = false) {
  if (sender.id !== chrome.runtime.id) return false;
  try {
    const url = new URL(sender.url || sender.tab?.url);
    return official
      ? url.origin === "https://www.foresttrip.go.kr" &&
          url.pathname === "/rep/or/sssn/monthRsrvtStatus.do" &&
          Number.isInteger(sender.tab?.id)
      : sender.url?.split("#")[0] === chrome.runtime.getURL("index.html");
  } catch {
    return false;
  }
}
async function api(state, path, body) {
  if (!state.token) throw Error("운영자 연결 설정 파일을 먼저 선택해 주세요.");
  const response = await fetch(
    FOREST_OPERATOR_ORIGIN + "/api/operator/" + path,
    {
      method: body ? "POST" : "GET",
      credentials: "omit",
      redirect: "error",
      headers: {
        Authorization: "Bearer " + state.token,
        "X-Collector-ID": state.collector_id,
        "Content-Type": "application/json",
        ...(state.currentJob?.id
          ? { "X-Active-Lease": state.currentJob.id }
          : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(15000),
    },
  );
  if (!response.ok)
    throw Error(
      response.status === 409
        ? "Job is no longer active"
        : response.status === 403
          ? "운영자 인증이 만료됐습니다. 연결 설정 파일을 다시 선택해 주세요."
          : "공유 서버 요청을 처리하지 못했습니다.",
    );
  return response.json();
}
async function stop(state) {
  state.enabled = false;
  state.connectedAt = 0;
  try {
    if (state.token) await api(state, "pause", {});
  } catch {
    /* Server leases expire even when offline. */
  }
  state.currentJob = null;
  await save(state);
}
async function handle(message, sender) {
  const state = await read();
  if (message.type === "operator-ui") {
    if (!trusted(sender)) throw Error("허용되지 않은 화면입니다.");
    if (message.action === "status")
      return {
        server: FOREST_OPERATOR_ORIGIN,
        configured: !!state.token,
        enabled: state.enabled,
        connected:
          !!state.connectedAt && Date.now() - state.connectedAt < 20000,
        uploads: state.uploads,
        failures: state.failures,
        error: state.error || "",
        facility: state.currentJob?.facilities?.[0]?.name || "",
      };
    if (message.action === "configure") {
      const settings = message.body;
      if (
        settings?.server_url !== FOREST_OPERATOR_ORIGIN ||
        typeof settings.token !== "string" ||
        !/^[a-zA-Z0-9_-]{32,200}$/.test(settings.token)
      )
        throw Error("이 수집기의 서버와 연결 설정 파일이 맞지 않습니다.");
      await stop(state);
      state.token = settings.token;
      state.error = "";
      await api(state, "health");
      await save(state);
      return { ok: true };
    }
    if (message.action === "stop") {
      await stop(state);
      return { ok: true };
    }
    if (message.action === "start") {
      if (!state.token || message.body?.confirmSharing !== true)
        throw Error("연결 설정과 관측 결과 공유 동의를 확인해 주세요.");
      await api(state, "health");
      const tabs = await chrome.tabs.query({ url: OFFICIAL + "*" });
      let tab = tabs.find((t) => t.id === state.tabId) || tabs[0];
      if (tab) {
        await chrome.tabs.update(tab.id, { active: true });
        await chrome.tabs.reload(tab.id);
      } else
        tab = await chrome.tabs.create({
          url: OFFICIAL + "?hmpgId=FRIP&menuId=001004",
          active: true,
        });
      state.tabId = tab.id;
      state.enabled = true;
      state.connectedAt = 0;
      state.error = "";
      await save(state);
      return { ok: true };
    }
    throw Error("지원하지 않는 요청입니다.");
  }
  if (message.type !== "forest-operator" || !trusted(sender, true))
    throw Error("허용되지 않은 요청입니다.");
  if (!state.enabled || sender.tab.id !== state.tabId)
    return { active: false, job: null };
  if (message.path === "/api/bridge/job") {
    try {
      const data = await api(state, "job");
      state.connectedAt = Date.now();
      state.error = "";
      state.currentJob = data.job;
      await save(state);
      return data;
    } catch (error) {
      state.error =
        error.message === "Job is no longer active"
          ? "이전 작업이 만료됐습니다. 다음 요청에서 재확인합니다."
          : "공유 서버에 연결하지 못했습니다. 기존 자료는 서버에 보존됩니다.";
      await save(state);
      throw error;
    }
  }
  const body = message.body;
  if (!body?.job_id) throw Error("Job is no longer active");
  if (message.path === "/api/bridge/result") {
    if (!state.currentJob || body.job_id !== state.currentJob.id)
      throw Error("Job is no longer active");
    const facility = state.currentJob.facilities.find(
      (f) => f.id === body.facility_id,
    );
    if (!facility) throw Error("조회 대상 시설이 아닙니다.");
    const normalized = { job_id: body.job_id, facility_id: facility.id };
    if (body.item)
      normalized.item = ForestObservation.normalize(
        body.item,
        facility,
        state.currentJob.date,
      );
    const result = await api(state, "result", normalized);
    if (!result.duplicate) {
      if (body.item) state.uploads++;
      else state.failures++;
    }
    await save(state);
    return result;
  }
  if (message.path === "/api/bridge/progress") {
    const result = await api(state, "progress", {
      job_id: body.job_id,
      ...(body.paused ? { paused: true } : { complete: true }),
    });
    if (state.currentJob?.id === body.job_id) state.currentJob = null;
    if (body.paused) {
      state.enabled = false;
      state.connectedAt = 0;
      state.error =
        "공식 조회가 중단됐습니다. 로그인 상태를 확인하고 수집을 다시 시작해 주세요.";
    }
    await save(state);
    return result;
  }
  throw Error("허용되지 않은 경로입니다.");
}
chrome.runtime.onMessage.addListener((message, sender, reply) => {
  if (!["operator-ui", "forest-operator"].includes(message?.type)) return;
  const task = queue.then(() => handle(message, sender));
  queue = task.catch(() => {});
  task.then(
    (data) => reply({ ok: true, data }),
    (error) =>
      reply({
        ok: false,
        error: String(error.message || "연결을 확인하지 못했습니다.").slice(
          0,
          180,
        ),
      }),
  );
  return true;
});
chrome.action.onClicked.addListener(async () => {
  const url = chrome.runtime.getURL("index.html");
  const contexts = await chrome.runtime.getContexts({ contextTypes: ["TAB"] });
  const current = contexts.find((c) => c.documentUrl?.split("#")[0] === url);
  if (current) await chrome.tabs.update(current.tabId, { active: true });
  else await chrome.tabs.create({ url, active: true });
});
chrome.tabs.onRemoved.addListener((id) => {
  const task = queue.then(async () => {
    const state = await read();
    if (state.tabId === id) await stop(state);
  });
  queue = task.catch(() => {});
});
chrome.runtime.onInstalled.addListener(() =>
  chrome.storage.local.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" }),
);
