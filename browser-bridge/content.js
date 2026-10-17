"use strict";
(() => {
  const params = new URLSearchParams(location.hash.slice(1));
  let token;
  try {
    token =
      params.get("forest-seat-connect") ||
      sessionStorage.getItem("forest-seat-bridge");
    if (token) sessionStorage.setItem("forest-seat-bridge", token);
  } catch {
    token = params.get("forest-seat-connect");
  }
  if (!token) return;
  if (params.has("forest-seat-connect")) {
    params.delete("forest-seat-connect");
    history.replaceState(
      null,
      "",
      location.pathname + location.search + (params.size ? "#" + params : ""),
    );
  }
  const panel = document.createElement("div");
  panel.id = "forest-seat-bridge-panel";
  panel.style.cssText =
    "position:fixed;bottom:20px;right:20px;z-index:2147483647;background:#173f32;color:white;padding:16px 20px;border-radius:10px;font:12px/1.7 sans-serif;max-width:310px;box-shadow:0 5px 30px #0003";
  const title = document.createElement("strong");
  title.textContent = "숲자리 공식현황 연결";
  const text = document.createElement("p");
  text.style.margin = "6px 0 0";
  text.textContent = "숲자리의 조회 요청을 기다립니다. 이 탭을 열어 두세요.";
  panel.append(title, text);
  document.body.append(panel);
  let running = false,
    lastJob = null,
    activeId = null,
    latest = null,
    heartbeatBusy = false,
    manualChange = false;
  const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  async function api(path, body) {
    const response = await chrome.runtime.sendMessage({
      type: "forest-bridge",
      path,
      method: body ? "POST" : "GET",
      token,
      body,
    });
    if (!response?.ok) {
      if (response?.data?.error === "Job is no longer active")
        throw new Error(
          "조회가 중단됐어요. 숲자리에서 다시 검색할 수 있습니다.",
        );
      throw new Error(
        response?.error ||
          "로컬 연결이 만료됐습니다. 숲자리에서 다시 연결해 주세요.",
      );
    }
    return response.data;
  }
  function assertActive() {
    if (manualChange)
      throw new Error("공식 화면의 검색 조건이 변경되어 조회를 중단했습니다.");
    if (!latest || latest.id !== activeId || latest.state !== "pending")
      throw new Error("조회가 중단되었습니다.");
  }
  async function until(check, ms = 30000) {
    const start = Date.now();
    while (Date.now() - start < ms) {
      assertActive();
      const value = check();
      if (value) return value;
      await pause(250);
    }
    throw new Error(
      "공식 조회가 지연되거나 이 시설의 숙소 조회를 지원하지 않습니다.",
    );
  }
  function loading() {
    return [...document.querySelectorAll(".blockUI.blockOverlay")].some(
      (e) => getComputedStyle(e).display !== "none",
    );
  }
  async function select(id, value) {
    const element = await until(() => {
      const el = document.getElementById(id);
      return el && [...el.options].some((o) => o.value === value) ? el : null;
    });
    element.value = value;
    element.dispatchEvent(new Event("change", { bubbles: true }));
    await pause(350);
  }
  function signedIn() {
    return (
      !document.querySelector("#mmberId") &&
      !!document.querySelector("#searchBtn")
    );
  }
  async function collect(facility, job) {
    if (!signedIn()) throw new Error("숲나들e 로그인이 필요합니다.");
    await select("srchSido", facility.region_id);
    await select("srchInstt", facility.id);
    await select("srchForest", "01");
    const monthly = document.getElementById("inqurSctin01");
    if (monthly && !monthly.checked) monthly.click();
    await select("monthSelectBox", job.date.replaceAll("-", "").slice(0, 6));
    await until(() => !loading());
    // This is the official search control. Booking / waitlist application buttons are never used.
    document.getElementById("searchBtn").click();
    await pause(1200);
    let previousCount = -1,
      stable = 0;
    await until(() => {
      if (!signedIn()) throw new Error("숲나들e 로그인이 만료되었습니다.");
      if (loading()) return false;
      const count = document.querySelectorAll(
        "#monthRsrvtList .list_left li",
      ).length;
      stable = count > 0 && count === previousCount ? stable + 1 : 0;
      previousCount = count;
      return stable >= 3;
    }, 90000);
    return ForestExtractor.extract(document, {
      id: facility.id,
      month: job.date.slice(0, 7),
    });
  }
  for (const id of ["srchSido", "srchInstt", "srchForest", "monthSelectBox"]) {
    document.getElementById(id)?.addEventListener("change", (event) => {
      if (running && event.isTrusted) manualChange = true;
    });
  }
  async function runJob(job) {
    running = true;
    activeId = job.id;
    lastJob = job.id;
    manualChange = false;
    try {
      if (!signedIn())
        throw new Error(
          "이 탭에서 숲나들e 로그인을 완료한 뒤 다시 조회해 주세요.",
        );
      for (let index = 0; index < job.facilities.length; index++) {
        assertActive();
        const facility = job.facilities[index];
        text.textContent = `${index + 1}/${job.facilities.length} · ${facility.name} 확인 중. 조회 중에는 검색 조건을 바꾸지 마세요.`;
        try {
          const item = await collect(facility, job);
          assertActive();
          await api("/api/bridge/result", {
            job_id: job.id,
            item,
            facility_id: facility.id,
          });
        } catch (error) {
          assertActive();
          await api("/api/bridge/result", {
            job_id: job.id,
            facility_id: facility.id,
            error: "조회 실패",
          });
          if (!signedIn()) throw error;
        }
        await pause(1500);
      }
      await api("/api/bridge/progress", { job_id: job.id, complete: true });
      text.textContent =
        "공식 조회를 마쳤습니다. 숲자리에서 성공·미확인 결과를 확인하세요.";
    } catch (error) {
      text.textContent = error.message;
      try {
        await api("/api/bridge/progress", { job_id: job.id, paused: true });
      } catch {
        /* Cancellation or expired pairing already stops the server job. */
      }
    } finally {
      running = false;
      activeId = null;
    }
  }
  async function heartbeat() {
    if (heartbeatBusy) return;
    heartbeatBusy = true;
    try {
      latest = (await api("/api/bridge/job")).job;
      if (!running && latest?.state === "pending" && latest.id !== lastJob)
        runJob(latest);
    } catch (error) {
      text.textContent = error.message;
      latest = null;
    } finally {
      heartbeatBusy = false;
    }
  }
  heartbeat();
  setInterval(heartbeat, 3000);
})();
