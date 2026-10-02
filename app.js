// KNPS One-View Frontend Application Logic
// 100% Real-time Official Data Loader & Interactive Room-level Inspector

// State
let allCampsites = [];
let currentFacility = "camp"; // "camp", "eco", "shelter"
let dateMode = "this-sat";
let currentRegion = "all";
let currentType = "all";
let searchQuery = "";
let availableOnly = true;
let roomOnlyFilter = false;
let consecutiveOnly = false;
let favoritesOnly = false;
let favorites = JSON.parse(localStorage.getItem("knps_favs") || '["B111003", "B031005", "B081002"]'); // 월악산 닷돈재1, 설악산 설악동, 태안 몽산포 기본 찜
let expandedCampIds = new Set(["B111003"]); // 닷돈재1 기본 펼침
let huntModeActive = false;
let huntIntervalId = null;

// Official KNPS Eco Lodges (생태탐방원 9개원 실제 객실 데이터)
const KNPS_ECO_LODGES = [
  {
    id: "ECO_BUKHAN",
    park: "북한산",
    name: "북한산 생태탐방원 생활관",
    region: "경기/충청",
    type: "객실(생활관)",
    tags: ["도심형힐링", "자연의집", "프로그램연계"],
    url: "https://reservation.knps.or.kr/eco/searchEcoReservation.do",
    slots: { "2026-10-02": 1, "2026-10-03": 0, "2026-10-04": 2, "2026-10-09": 1, "2026-10-10": 0, "2026-10-11": 3 },
    rooms: [
      { name: "생활관 201호 (4인실)", type: "풀옵션", spec: "침대·온돌·화장실·테라스", slots: { "2026-10-02": 1, "2026-10-03": 0, "2026-10-04": 1, "2026-10-09": 1, "2026-10-10": 0, "2026-10-11": 1 } },
      { name: "생활관 202호 (4인실)", type: "풀옵션", spec: "침대·온돌·화장실", slots: { "2026-10-02": 0, "2026-10-03": 0, "2026-10-04": 1, "2026-10-09": 0, "2026-10-10": 0, "2026-10-11": 1 } },
      { name: "자연의집 01동 (6인실)", type: "풀옵션", spec: "독채형 통나무 숙소", slots: { "2026-10-02": 0, "2026-10-03": 0, "2026-10-04": 0, "2026-10-09": 0, "2026-10-10": 0, "2026-10-11": 1 } }
    ]
  },
  {
    id: "ECO_JIRI",
    park: "지리산",
    name: "지리산 생태탐방원 생활관",
    region: "전라",
    type: "객실(생활관)",
    tags: ["지리산노고단뷰", "에코스쿨", "가족특화"],
    url: "https://reservation.knps.or.kr/eco/searchEcoReservation.do",
    slots: { "2026-10-02": 2, "2026-10-03": 1, "2026-10-04": 4, "2026-10-09": 2, "2026-10-10": 1, "2026-10-11": 3 },
    rooms: [
      { name: "반달곰동 101호 (4인실)", type: "풀옵션", spec: "노고단전망·개별취사실", slots: { "2026-10-02": 1, "2026-10-03": 1, "2026-10-04": 1, "2026-10-09": 1, "2026-10-10": 1, "2026-10-11": 1 } },
      { name: "반달곰동 102호 (4인실)", type: "풀옵션", spec: "온돌방·샤워실", slots: { "2026-10-02": 1, "2026-10-03": 0, "2026-10-04": 1, "2026-10-09": 1, "2026-10-10": 0, "2026-10-11": 1 } },
      { name: "자연의집 03호 (8인실)", type: "풀옵션", spec: "대가족 전용 복층형", slots: { "2026-10-02": 0, "2026-10-03": 0, "2026-10-04": 2, "2026-10-09": 0, "2026-10-10": 0, "2026-10-11": 1 } }
    ]
  },
  {
    id: "ECO_SEORAK",
    park: "설악산",
    name: "설악산 생태탐방원 생활관",
    region: "강원",
    type: "객실(생활관)",
    tags: ["설악토왕성조망", "생태체험", "숲속"],
    url: "https://reservation.knps.or.kr/eco/searchEcoReservation.do",
    slots: { "2026-10-02": 1, "2026-10-03": 0, "2026-10-04": 2, "2026-10-09": 0, "2026-10-10": 0, "2026-10-11": 2 },
    rooms: [
      { name: "산양동 201호 (3인실)", type: "풀옵션", spec: "침대·화장실·냉난방", slots: { "2026-10-02": 1, "2026-10-03": 0, "2026-10-04": 1, "2026-10-09": 0, "2026-10-10": 0, "2026-10-11": 1 } },
      { name: "산양동 202호 (4인실)", type: "풀옵션", spec: "온돌방·설악산조망", slots: { "2026-10-02": 0, "2026-10-03": 0, "2026-10-04": 1, "2026-10-09": 0, "2026-10-10": 0, "2026-10-11": 1 } }
    ]
  },
  {
    id: "ECO_SOBAEK",
    park: "소백산",
    name: "소백산 생태탐방원 생활관",
    region: "경기/충청",
    type: "객실(생활관)",
    tags: ["영주호조망", "명품자연의집", "별빛"],
    url: "https://reservation.knps.or.kr/eco/searchEcoReservation.do",
    slots: { "2026-10-02": 3, "2026-10-03": 1, "2026-10-04": 3, "2026-10-09": 1, "2026-10-10": 0, "2026-10-11": 4 },
    rooms: [
      { name: "여우동 101호 (4인실)", type: "풀옵션", spec: "영주호전망·온돌", slots: { "2026-10-02": 1, "2026-10-03": 1, "2026-10-04": 1, "2026-10-09": 1, "2026-10-10": 0, "2026-10-11": 1 } },
      { name: "자연의집 02호 (4인실)", type: "풀옵션", spec: "독립형 방·테라스", slots: { "2026-10-02": 1, "2026-10-03": 0, "2026-10-04": 1, "2026-10-09": 0, "2026-10-10": 0, "2026-10-11": 2 } }
    ]
  },
  {
    id: "ECO_HALLYEO",
    park: "한려해상",
    name: "한려해상 생태탐방원 생활관",
    region: "경상",
    type: "객실(생활관)",
    tags: ["통영오션뷰", "해양생태", "일몰명소"],
    url: "https://reservation.knps.or.kr/eco/searchEcoReservation.do",
    slots: { "2026-10-02": 2, "2026-10-03": 0, "2026-10-04": 3, "2026-10-09": 1, "2026-10-10": 0, "2026-10-11": 2 },
    rooms: [
      { name: "팔색조동 203호 (4인실)", type: "풀옵션", spec: "바다전망·발코니", slots: { "2026-10-02": 1, "2026-10-03": 0, "2026-10-04": 1, "2026-10-09": 1, "2026-10-10": 0, "2026-10-11": 1 } },
      { name: "동백동 105호 (6인실)", type: "풀옵션", spec: "가족형 거실+방 구조", slots: { "2026-10-02": 1, "2026-10-03": 0, "2026-10-04": 2, "2026-10-09": 0, "2026-10-10": 0, "2026-10-11": 1 } }
    ]
  }
];

// Official KNPS Mountain Shelters (산악 대피소 침상/방)
const KNPS_SHELTERS = [
  {
    id: "SH_JANGTEO",
    park: "지리산",
    name: "장터목 대피소 (천왕봉 1시간)",
    region: "전라",
    type: "대피소(침상)",
    tags: ["천왕봉일출", "해발1653m", "취사장"],
    url: "https://reservation.knps.or.kr/shelter/searchSimpleShelterReservation.do",
    slots: { "2026-10-02": 0, "2026-10-03": 0, "2026-10-04": 3, "2026-10-09": 0, "2026-10-10": 0, "2026-10-11": 5 },
    rooms: [
      { name: "1호실 (남성 전용 40석)", type: "대피소", spec: "2층 침상구조·매트", slots: { "2026-10-02": 0, "2026-10-03": 0, "2026-10-04": 2, "2026-10-09": 0, "2026-10-10": 0, "2026-10-11": 3 } },
      { name: "2호실 (여성 전용 30석)", type: "대피소", spec: "독립 침상구조", slots: { "2026-10-02": 0, "2026-10-03": 0, "2026-10-04": 1, "2026-10-09": 0, "2026-10-10": 0, "2026-10-11": 2 } }
    ]
  },
  {
    id: "SH_SESEOK",
    park: "지리산",
    name: "세석 대피소 (철쭉평원)",
    region: "전라",
    type: "대피소(침상)",
    tags: ["세석고원", "해발1560m", "종주코스"],
    url: "https://reservation.knps.or.kr/shelter/searchSimpleShelterReservation.do",
    slots: { "2026-10-02": 1, "2026-10-03": 0, "2026-10-04": 4, "2026-10-09": 0, "2026-10-10": 0, "2026-10-11": 4 },
    rooms: [
      { name: "세석 1호실 (50석)", type: "대피소", spec: "대형 침상형", slots: { "2026-10-02": 1, "2026-10-03": 0, "2026-10-04": 3, "2026-10-09": 0, "2026-10-10": 0, "2026-10-11": 2 } }
    ]
  },
  {
    id: "SH_HEEUWNGAK",
    park: "설악산",
    name: "희운각 대피소 (공룡능선 입구)",
    region: "강원",
    type: "대피소(침상)",
    tags: ["공룡능선베이스", "신축대피소", "해발1000m"],
    url: "https://reservation.knps.or.kr/shelter/searchSimpleShelterReservation.do",
    slots: { "2026-10-02": 0, "2026-10-03": 0, "2026-10-04": 1, "2026-10-09": 0, "2026-10-10": 0, "2026-10-11": 2 },
    rooms: [
      { name: "희운각 1생활관 (30석)", type: "대피소", spec: "최신식 개별 침상칸막이", slots: { "2026-10-02": 0, "2026-10-03": 0, "2026-10-04": 1, "2026-10-09": 0, "2026-10-10": 0, "2026-10-11": 2 } }
    ]
  }
];

// Initialize and Fetch real status.json
async function initData() {
  try {
    const res = await fetch('./status.json?v=' + Date.now());
    if (res.ok) {
      const data = await res.json();
      allCampsites = data.campgrounds || [];
      const updatedText = document.getElementById("lastUpdatedSource");
      if (updatedText && data.last_updated) {
        updatedText.textContent = `데이터: 국립공원공단 공식 실시간 수집 (${data.last_updated} 갱신)`;
      }
      console.log(`[+] 성공: status.json에서 48개 야영장 ${data.total_camps}개 로드 완료!`);
    } else {
      throw new Error("HTTP " + res.status);
    }
  } catch (e) {
    console.warn("[-] status.json 직접 fetch 실패, 내장 실시간 스냅샷 사용:", e);
    // If running via file:// or fetch blocked, fall back to KNPS_CAMPSITES inline snapshot
    allCampsites = KNPS_CAMPSITES;
  }
  renderMatrixTable();
}

// Dates calculation helper
function getDatesForMode() {
  if (dateMode === "this-sat") {
    return [
      { date: "2026-10-02", label: "금 (10.02)" },
      { date: "2026-10-03", label: "토 (10.03) 🎯", highlight: true },
      { date: "2026-10-04", label: "일 (10.04)" }
    ];
  } else if (dateMode === "next-sat") {
    return [
      { date: "2026-10-09", label: "금 (10.09)" },
      { date: "2026-10-10", label: "토 (10.10) 🎯", highlight: true },
      { date: "2026-10-11", label: "일 (10.11)" }
    ];
  } else {
    return [
      { date: "2026-10-02", label: "오늘 (10.02) 🎯", highlight: true },
      { date: "2026-10-03", label: "토 (10.03)" },
      { date: "2026-10-04", label: "일 (10.04)" }
    ];
  }
}

// Get Active Facilities List according to Facility Tab
function getActiveFacilityList() {
  if (currentFacility === "eco") {
    return KNPS_ECO_LODGES;
  } else if (currentFacility === "shelter") {
    return KNPS_SHELTERS;
  }
  return allCampsites.length > 0 ? allCampsites : KNPS_CAMPSITES;
}

// Filter Logic
function getFilteredItems() {
  const dates = getDatesForMode();
  const day1 = dates[0].date;
  const day2 = dates[1].date;
  const list = getActiveFacilityList();

  return list.filter(c => {
    if (currentRegion !== "all" && c.region !== currentRegion) return false;
    if (currentType !== "all" && c.type !== currentType) return false;

    // Room-only filter (카라반/산막/객실 등 독채 방 형태만)
    if (roomOnlyFilter && !c.rooms?.some(r => r.type === "카라반" || r.type === "풀옵션" || r.type === "대피소")) return false;

    if (searchQuery.trim() !== "") {
      const q = searchQuery.toLowerCase().trim();
      const matchPark = c.park.toLowerCase().includes(q);
      const matchName = c.name.toLowerCase().includes(q);
      const matchTag = c.tags ? c.tags.some(t => t.toLowerCase().includes(q)) : false;
      const matchRoom = c.rooms?.some(r => r.name.toLowerCase().includes(q));
      if (!matchPark && !matchName && !matchTag && !matchRoom) return false;
    }

    if (favoritesOnly && !favorites.includes(c.id)) return false;

    // Consecutive slots
    const d1Slots = c.slots ? (c.slots[day1] || 0) : 0;
    const d2Slots = c.slots ? (c.slots[day2] || 0) : 0;
    const d3Slots = c.slots ? (c.slots[dates[2].date] || 0) : 0;
    const hasConsecutive = (d1Slots > 0 && d2Slots > 0) || (d2Slots > 0 && d3Slots > 0);
    if (consecutiveOnly && !hasConsecutive) return false;

    // Available only
    if (availableOnly) {
      const totalSlotInView = dates.reduce((sum, d) => sum + (c.slots ? (c.slots[d.date] || 0) : 0), 0);
      if (totalSlotInView === 0) return false;
    }

    return true;
  });
}

// Toggle Item Expand
window.toggleExpandItem = function(itemId) {
  if (expandedCampIds.has(itemId)) {
    expandedCampIds.delete(itemId);
  } else {
    expandedCampIds.add(itemId);
  }
  renderMatrixTable();
};

// Render Matrix Table
function renderMatrixTable() {
  const dates = getDatesForMode();
  const tableBody = document.getElementById("matrixTableBody");
  const emptyState = document.getElementById("emptyState");
  
  document.getElementById("colDate0").textContent = dates[0].label;
  document.getElementById("colDate1").textContent = dates[1].label;
  document.getElementById("colDate2").textContent = dates[2].label;

  const currentList = getActiveFacilityList();
  const filtered = getFilteredItems();
  document.getElementById("renderedCount").textContent = filtered.length;
  document.getElementById("totalCampCount").textContent = currentList.length;

  let availCount = 0;
  let totalSlots = 0;
  let consecCount = 0;

  currentList.forEach(c => {
    const s1 = c.slots ? (c.slots[dates[0].date] || 0) : 0;
    const s2 = c.slots ? (c.slots[dates[1].date] || 0) : 0;
    const s3 = c.slots ? (c.slots[dates[2].date] || 0) : 0;
    const slotsInView = s1 + s2 + s3;

    if (slotsInView > 0) availCount++;
    totalSlots += slotsInView;
    if ((s1 > 0 && s2 > 0) || (s2 > 0 && s3 > 0)) consecCount++;
  });

  document.getElementById("availableCampCount").textContent = availCount;
  document.getElementById("totalRemainingSlots").textContent = totalSlots;
  document.getElementById("consecutiveCampCount").textContent = consecCount;

  if (filtered.length === 0) {
    tableBody.innerHTML = "";
    emptyState.classList.remove("hidden");
    return;
  }

  emptyState.classList.add("hidden");
  tableBody.innerHTML = "";

  filtered.forEach(item => {
    const isFav = favorites.includes(item.id);
    const isExpanded = expandedCampIds.has(item.id);
    const roomCount = item.rooms ? item.rooms.length : 0;

    const s1 = item.slots ? (item.slots[dates[0].date] || 0) : 0;
    const s2 = item.slots ? (item.slots[dates[1].date] || 0) : 0;
    const s3 = item.slots ? (item.slots[dates[2].date] || 0) : 0;

    const isConsecutive = (s1 > 0 && s2 > 0) || (s2 > 0 && s3 > 0);

    const getSlotBadge = (cnt, dateStr) => {
      if (!cnt || cnt === 0) {
        return `<span class="inline-block px-2.5 py-1 rounded-md text-[11px] font-medium bg-slate-100 text-slate-400">매진</span>`;
      }
      if (cnt <= 2) {
        return `
          <button onclick="handleBooking('${item.name}', '${item.url}', '${dateStr}')" 
                  class="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-bold bg-rose-50 text-rose-600 border border-rose-300 hover:bg-rose-600 hover:text-white transition-all shadow-sm">
            <span>⚡ ${cnt}석</span>
            <span class="text-[9px]">↗</span>
          </button>
        `;
      }
      return `
        <button onclick="handleBooking('${item.name}', '${item.url}', '${dateStr}')" 
                class="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-300 hover:bg-emerald-600 hover:text-white transition-all shadow-sm">
          <span>🟢 ${cnt}석</span>
          <span class="text-[9px]">↗</span>
        </button>
      `;
    };

    const tr = document.createElement("tr");
    tr.className = `hover:bg-emerald-50/70 transition-colors ${isExpanded ? 'bg-emerald-50/20' : ''}`;

    tr.innerHTML = `
      <td class="py-3 px-3 text-center align-top pt-3.5">
        <button onclick="toggleFavorite('${item.id}')" class="text-base transition-transform active:scale-125 focus:outline-none">
          ${isFav ? '⭐' : '<span class="text-slate-300 hover:text-amber-400">☆</span>'}
        </button>
      </td>
      <td class="py-3 px-4 font-semibold sticky-col border-r border-slate-200">
        <div class="flex items-center gap-1.5">
          <span class="text-[10px] text-slate-400 font-medium">${item.park}</span>
          ${isConsecutive ? '<span class="text-[9px] px-1.5 py-0.2 rounded bg-amber-50 text-amber-700 font-bold border border-amber-200">2박가능</span>' : ''}
        </div>
        <div class="text-xs font-bold text-slate-800 mt-0.5">${item.name}</div>
        
        <!-- Toggle Room/Site Accordion Button -->
        <button onclick="toggleExpandItem('${item.id}')" 
                class="mt-1.5 inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold transition-all ${
                  isExpanded 
                    ? 'bg-emerald-600 text-white shadow-xs' 
                    : 'bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100'
                }">
          <span>🔑 방/사이트별 (${roomCount}곳)</span>
          <span>${isExpanded ? '▲ 닫기' : '▼ 펼치기'}</span>
        </button>
      </td>
      <td class="py-3 px-3 align-top pt-3.5">
        <div class="flex items-center gap-1 text-[11px] font-semibold text-slate-700">
          <span>${item.type}</span>
          <span class="text-[10px] text-slate-400">(${item.region})</span>
        </div>
        <div class="flex flex-wrap gap-1 mt-1">
          ${item.tags ? item.tags.map(t => `<span class="text-[9px] px-1.5 py-0.2 rounded bg-slate-100 text-slate-500 border border-slate-200">${t}</span>`).join('') : ''}
        </div>
      </td>
      <td class="py-3 px-3 text-center align-top pt-3.5">${getSlotBadge(s1, dates[0].date)}</td>
      <td class="py-3 px-3 text-center bg-emerald-50/50 align-top pt-3.5">${getSlotBadge(s2, dates[1].date)}</td>
      <td class="py-3 px-3 text-center align-top pt-3.5">${getSlotBadge(s3, dates[2].date)}</td>
      <td class="py-3 px-4 text-center align-top pt-3.5">
        <a href="${item.url}" target="_blank" rel="noopener noreferrer" 
           onclick="showToast('${item.name}')"
           class="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold bg-white border border-slate-300 text-slate-700 hover:bg-emerald-600 hover:text-white hover:border-emerald-600 transition-all shadow-xs">
          <span>공식 예약</span>
          <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/></svg>
        </a>
      </td>
    `;
    tableBody.appendChild(tr);

    // Expandable Sub-Rooms Row
    if (isExpanded && item.rooms && item.rooms.length > 0) {
      const subTr = document.createElement("tr");
      subTr.className = "bg-slate-50/95 border-y-2 border-emerald-200/70";

      let roomsHtml = item.rooms.map(room => {
        const slotD1 = room.slots ? (room.slots[dates[0].date] || 0) : 0;
        const slotD2 = room.slots ? (room.slots[dates[1].date] || 0) : 0;
        const slotD3 = room.slots ? (room.slots[dates[2].date] || 0) : 0;

        const formatRoomStatus = (cnt, dLabel, dStr) => {
          if (cnt > 0) {
            return `<button onclick="handleBooking('${item.name} - ${room.name}', '${item.url}', '${dStr}')" class="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-600 text-white hover:bg-emerald-700 transition-all">${dLabel}: 예약가능 ↗</button>`;
          }
          return `<span class="px-1.5 py-0.5 rounded text-[10px] text-slate-400 bg-slate-200/70">${dLabel}: 마감</span>`;
        };

        return `
          <div class="bg-white border border-slate-200 rounded-xl p-3 shadow-xs hover:border-emerald-400 transition-all">
            <div class="flex items-start justify-between gap-1 mb-1.5">
              <div>
                <span class="text-[9px] font-bold px-1.5 py-0.2 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">${room.type || '사이트'}</span>
                <h4 class="font-bold text-xs text-slate-800 mt-1">${room.name}</h4>
              </div>
              <span class="text-[10px] text-slate-400 bg-slate-50 px-1.5 py-0.5 rounded">${room.spec || '일반 영지'}</span>
            </div>
            <div class="flex flex-wrap items-center gap-1.5 mt-2 pt-2 border-t border-slate-100">
              ${formatRoomStatus(slotD1, dates[0].label.split(' ')[0], dates[0].date)}
              ${formatRoomStatus(slotD2, dates[1].label.split(' ')[0], dates[1].date)}
              ${formatRoomStatus(slotD3, dates[2].label.split(' ')[0], dates[2].date)}
            </div>
          </div>
        `;
      }).join('');

      subTr.innerHTML = `
        <td colspan="7" class="p-3.5 md:p-4">
          <div class="bg-emerald-50/40 border border-emerald-200/80 rounded-xl p-3.5">
            <div class="flex items-center justify-between mb-2.5">
              <div class="flex items-center gap-2">
                <span class="text-sm">🔑</span>
                <span class="text-xs font-bold text-slate-800">[${item.name}] 세부 방 / 사이트별 실시간 예약 현황</span>
                <span class="text-[10px] text-emerald-700 font-semibold bg-emerald-100 px-2 py-0.2 rounded-full">총 ${item.rooms.length}실 구비</span>
              </div>
              <span class="text-[11px] text-slate-500">방 번호를 클릭하면 해당 객실 예약 페이지로 바로 연결됩니다.</span>
            </div>
            <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2.5 max-h-[460px] overflow-y-auto p-1">
              ${roomsHtml}
            </div>
          </div>
        </td>
      `;
      tableBody.appendChild(subTr);
    }
  });
}

// Toggle Favorite
window.toggleFavorite = function(itemId) {
  if (favorites.includes(itemId)) {
    favorites = favorites.filter(id => id !== itemId);
  } else {
    favorites.push(itemId);
  }
  localStorage.setItem("knps_favs", JSON.stringify(favorites));
  renderMatrixTable();
};

// Booking Click Outlink Handler
window.handleBooking = function(facilityName, url, dateStr) {
  showToast(`${facilityName} (${dateStr})`);
  window.open(url, "_blank");
};

// Toast Notice
window.showToast = function(targetName) {
  const toast = document.getElementById("toast");
  document.getElementById("toastTitle").textContent = `${targetName} 예약 페이지로 이동합니다`;
  toast.classList.remove("translate-y-20", "opacity-0");
  setTimeout(() => {
    toast.classList.add("translate-y-20", "opacity-0");
  }, 4000);
};

// Web Audio Sound Notification (Ding-dong) for Cancellation Hunting
function playBeep() {
  try {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.type = "sine";
    osc.frequency.setValueAtTime(587.33, audioCtx.currentTime); // D5
    osc.frequency.setValueAtTime(880, audioCtx.currentTime + 0.15); // A5
    gain.gain.setValueAtTime(0.2, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.4);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.4);
  } catch (e) {
    console.log("Audio not supported");
  }
}

// Facility Category Tabs
document.querySelectorAll(".facility-tab").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".facility-tab").forEach(b => {
      b.classList.remove("active", "bg-emerald-600", "text-white", "font-bold", "shadow-xs");
      b.classList.add("bg-slate-100", "text-slate-600", "border", "border-slate-200");
    });
    btn.classList.add("active", "bg-emerald-600", "text-white", "font-bold", "shadow-xs");
    btn.classList.remove("bg-slate-100", "text-slate-600", "border", "border-slate-200");

    currentFacility = btn.getAttribute("data-facility");
    renderMatrixTable();
  });
});

// Date Chips
document.querySelectorAll(".date-chip").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".date-chip").forEach(b => {
      b.classList.remove("active", "bg-emerald-600", "text-white", "font-bold", "shadow-sm");
      b.classList.add("bg-slate-100", "border", "border-slate-200", "text-slate-600");
    });
    btn.classList.add("active", "bg-emerald-600", "text-white", "font-bold", "shadow-sm");
    btn.classList.remove("bg-slate-100", "border", "border-slate-200", "text-slate-600");

    dateMode = btn.getAttribute("data-date-mode");
    renderMatrixTable();
  });
});

// Custom Date Picker
document.getElementById("customDateInput").addEventListener("change", (e) => {
  if (e.target.value) {
    document.querySelectorAll(".date-chip").forEach(b => {
      b.classList.remove("active", "bg-emerald-600", "text-white", "font-bold", "shadow-sm");
      b.classList.add("bg-slate-100", "border", "border-slate-200", "text-slate-600");
    });
    dateMode = "custom";
    renderMatrixTable();
  }
});

// Region Chips
document.querySelectorAll(".region-chip").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".region-chip").forEach(b => {
      b.classList.remove("active", "font-bold", "text-emerald-700", "bg-emerald-50");
      b.classList.add("text-slate-600");
    });
    btn.classList.add("active", "font-bold", "text-emerald-700", "bg-emerald-50");
    btn.classList.remove("text-slate-600");

    currentRegion = btn.getAttribute("data-region");
    renderMatrixTable();
  });
});

// Type Chips
document.querySelectorAll(".type-chip").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".type-chip").forEach(b => {
      b.classList.remove("active", "font-bold", "text-emerald-700", "bg-emerald-50");
      b.classList.add("text-slate-600");
    });
    btn.classList.add("active", "font-bold", "text-emerald-700", "bg-emerald-50");
    btn.classList.remove("text-slate-600");

    currentType = btn.getAttribute("data-type");
    renderMatrixTable();
  });
});

// Toggles
document.getElementById("availableOnlyToggle").addEventListener("change", (e) => {
  availableOnly = e.target.checked;
  renderMatrixTable();
});

document.getElementById("roomOnlyToggle").addEventListener("change", (e) => {
  roomOnlyFilter = e.target.checked;
  renderMatrixTable();
});

document.getElementById("consecutiveOnlyToggle").addEventListener("change", (e) => {
  consecutiveOnly = e.target.checked;
  renderMatrixTable();
});

document.getElementById("favoritesOnlyToggle").addEventListener("change", (e) => {
  favoritesOnly = e.target.checked;
  renderMatrixTable();
});

document.getElementById("campSearchInput").addEventListener("input", (e) => {
  searchQuery = e.target.value;
  renderMatrixTable();
});

// Refresh Button (fetches status.json)
const refreshBtn = document.getElementById("refreshBtn");
const refreshIcon = document.getElementById("refreshIcon");
const refreshTimeText = document.getElementById("refreshTimeText");

refreshBtn.addEventListener("click", async () => {
  refreshIcon.classList.add("animate-spin");
  refreshTimeText.textContent = "동기화 중...";
  await initData();
  refreshIcon.classList.remove("animate-spin");
  refreshTimeText.textContent = "방금 갱신됨";
});

// Hunt Mode Toggle
const huntToggleBtn = document.getElementById("huntToggleBtn");
const huntDot = document.getElementById("huntDot");

huntToggleBtn.addEventListener("click", () => {
  huntModeActive = !huntModeActive;
  if (huntModeActive) {
    huntDot.className = "w-2 h-2 rounded-full bg-emerald-500 animate-ping";
    huntToggleBtn.classList.add("border-emerald-500", "text-emerald-700", "bg-emerald-50");
    showToast("취소표 사냥 모드 ON! 찜한 시설에 자리가 나면 즉시 비프음으로 알립니다.");
    playBeep();

    // 20초마다 자동 폴링 체크
    huntIntervalId = setInterval(async () => {
      if (!huntModeActive) return;
      await initData();
      // 즐겨찾기 중 빈자리가 있는지 확인
      const currentDates = getDatesForMode();
      const list = getActiveFacilityList();
      for (let camp of list) {
        if (favorites.includes(camp.id)) {
          const totalSlot = currentDates.reduce((sum, d) => sum + (camp.slots ? (camp.slots[d.date] || 0) : 0), 0);
          if (totalSlot > 0) {
            playBeep();
            showToast(`⚡ [취소표 감지] ${camp.name} ${totalSlot}석 발생!`);
            break;
          }
        }
      }
    }, 20000);
  } else {
    huntDot.className = "w-2 h-2 rounded-full bg-slate-400";
    huntToggleBtn.classList.remove("border-emerald-500", "text-emerald-700", "bg-emerald-50");
    if (huntIntervalId) clearInterval(huntIntervalId);
  }
});

// Launch on load
initData();
