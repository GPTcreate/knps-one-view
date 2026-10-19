"use strict";
const $ = (id) => document.getElementById(id);
async function send(action, body) {
  const result = await chrome.runtime.sendMessage({
    type: "operator-ui",
    action,
    body,
  });
  if (!result?.ok) throw Error(result?.error || "연결 실패");
  return result.data;
}
async function refresh() {
  try {
    const state = await send("status");
    $("destination").textContent = "관측 결과 전송 대상: " + state.server;
    $("status").textContent = !state.configured
      ? "연결 설정 파일을 선택해 주세요."
      : !state.enabled
        ? "수집 중지 상태"
        : state.connected
          ? "공식 탭과 연결됨 · 웹 갱신 요청을 처리합니다."
          : "공식 탭과 로그인 연결을 기다립니다.";
    $("counts").textContent =
      `성공 업로드 ${state.uploads}회 · 조회 실패 ${state.failures}회${state.facility ? " · " + state.facility + " 확인 중" : ""}`;
    $("error").textContent = state.error;
  } catch {
    $("error").textContent =
      "확장 연결을 확인하지 못했습니다. 화면을 다시 열어 주세요.";
  }
}
$("settingsFile").addEventListener("change", async (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    if (file.size > 4096) throw Error("연결 설정 파일 크기를 확인해 주세요.");
    await send("configure", JSON.parse(await file.text()));
    await refresh();
  } catch (error) {
    $("error").textContent = error.message;
  } finally {
    event.target.value = "";
  }
});
$("start").addEventListener("click", async () => {
  try {
    await send("start", { confirmSharing: $("sharingConsent").checked });
    await refresh();
  } catch (error) {
    $("error").textContent = error.message;
  }
});
$("stop").addEventListener("click", async () => {
  try {
    await send("stop");
    await refresh();
  } catch (error) {
    $("error").textContent = error.message;
  }
});
refresh();
setInterval(() => {
  if (!document.hidden) refresh();
}, 5000);
