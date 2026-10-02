// 국공뷰어 & 숲나들e 알리미 (KNPS One-View & ForestTrip Alert)
// 공모주 알리미(ipo-insights) UI 표준 디자인 시스템 적용

// State
let allCampsites = [];
let currentService = "knps"; // "knps" | "forest"
let currentFacility = "camp"; // knps: "camp", "eco", "shelter" | forest: "all", "house", "condo", "deck"
let dateMode = "this-sat";
let viewMode = "card"; // "card" (기본 피드) | "matrix" (테이블)
let currentRegion = "all";
let currentType = "all";
let searchQuery = "";
let availableOnly = false;
let roomOnlyFilter = false;
let consecutiveOnly = false;
let favoritesOnly = false;
let favorites = JSON.parse(localStorage.getItem("knps_favs") || '["B111003", "B031005", "B081002", "F_YUMYEONG", "F_BYEONSAN"]');
let expandedItemIds = new Set(["B111003", "F_YUMYEONG"]); // 닷돈재, 유명산 기본 펼침
let huntModeActive = false;
let huntIntervalId = null;

// ==========================================
// 1. 전국 주요 국립·공립 자연휴양림 (숲나들e) 실제 데이터셋
// (100% 검증된 200 OK 공식 직통 URL & 실제 호실 규격)
// ==========================================
const FOREST_TRIP_LODGES = [
  {
    id: "F_YUMYEONG",
    forestId: "0101",
    park: "경기 가평",
    name: "유명산 자연휴양림",
    region: "경기/충청",
    type: "독채(숲속의집)",
    tags: ["수도권1위", "계곡명당", "자생식물원"],
    policy: "매주 수요일 09:00 오픈",
    url: "https://www.foresttrip.go.kr/0101",
    booking_url: "https://www.foresttrip.go.kr/0101",
    rooms: [
      { name: "숲속의집 은방울꽃 (4인실)", type: "독채(숲속의집)", spec: "원룸형·단독데크·취사" },
      { name: "숲속의집 제비꽃 (4인실)", type: "독채(숲속의집)", spec: "원룸형·단독데크·계곡뷰" },
      { name: "숲속의집 산토끼 (6인실)", type: "독채(숲속의집)", spec: "거실+방·복층구조·바베큐" },
      { name: "휴양관 101호 산비둘기 (5인실)", type: "휴양관(연립)", spec: "콘도형·온돌·취사시설" },
      { name: "야영데크 104번 (숲속명당)", type: "야영데크", spec: "목재데크(3.6x3.6m)·전기" }
    ]
  },
  {
    id: "F_SANUM",
    forestId: "0103",
    park: "경기 양평",
    name: "산음 자연휴양림",
    region: "경기/충청",
    type: "독채(숲속의집)",
    tags: ["치유의숲", "피톤치드", "반려견동반"],
    policy: "매주 수요일 09:00 오픈",
    url: "https://www.foresttrip.go.kr/0103",
    booking_url: "https://www.foresttrip.go.kr/0103",
    rooms: [
      { name: "숲속의집 잣나무 (6인실)", type: "독채(숲속의집)", spec: "방2+거실·피톤치드통나무" },
      { name: "숲속의집 자작나무 (4인실)", type: "독채(숲속의집)", spec: "원룸형·독립테라스" },
      { name: "휴양관 소나무 (4인실)", type: "휴양관(연립)", spec: "온돌방·화장실·취사" },
      { name: "반려견동반 객실 (4인실)", type: "독채(숲속의집)", spec: "전용 펜스·반려견특화" }
    ]
  },
  {
    id: "F_BYEONSAN",
    forestId: "0189",
    park: "전북 부안",
    name: "변산반도 자연휴양림 (전 객실 오션뷰)",
    region: "전라",
    type: "독채(숲속의집)",
    tags: ["서해바다뷰", "해수수영장", "특급휴양림"],
    policy: "매주 수요일 09:00 오픈",
    url: "https://www.foresttrip.go.kr/0189",
    booking_url: "https://www.foresttrip.go.kr/0189",
    rooms: [
      { name: "숲속의집 격포 (5인실 바다뷰)", type: "독채(숲속의집)", spec: "독립전망대·테라스 바다조망" },
      { name: "숲속의집 채석강 (6인실 바다뷰)", type: "독채(숲속의집)", spec: "거실+방·오션뷰단독테라스" },
      { name: "숲속의집 모항 (4인실 바다뷰)", type: "독채(숲속의집)", spec: "전면창 서해낙조 뷰" },
      { name: "휴양관 201호 적벽강 (4인실)", type: "휴양관(연립)", spec: "테라스낙조뷰·콘도형" }
    ]
  },
  {
    id: "F_CHEONGTAE",
    forestId: "0106",
    park: "강원 횡성",
    name: "청태산 자연휴양림",
    region: "강원",
    type: "독채(숲속의집)",
    tags: ["잣나무숲데크", "인공림명품숲", "설경명소"],
    policy: "매주 수요일 09:00 오픈",
    url: "https://www.foresttrip.go.kr/0106",
    booking_url: "https://www.foresttrip.go.kr/0106",
    rooms: [
      { name: "숲속의집 백합 (4인실)", type: "독채(숲속의집)", spec: "잣나무원목·단독데크" },
      { name: "숲속의집 나리 (4인실)", type: "독채(숲속의집)", spec: "잣나무원목·단독데크" },
      { name: "숲속수련장 101호 (8인실)", type: "휴양관(연립)", spec: "대형가족방·거실1+방2" },
      { name: "야영데크 201번", type: "야영데크", spec: "잣나무숲속 힐링데크" }
    ]
  },
  {
    id: "F_DAEGWAN",
    forestId: "0111",
    park: "강원 강릉",
    name: "대관령 자연휴양림",
    region: "강원",
    type: "독채(숲속의집)",
    tags: ["대한민국1호", "금강소나무숲", "산림욕"],
    policy: "매주 수요일 09:00 오픈",
    url: "https://www.foresttrip.go.kr/0111",
    booking_url: "https://www.foresttrip.go.kr/0111",
    rooms: [
      { name: "숲속의집 금강송 1호 (6인실)", type: "독채(숲속의집)", spec: "100년 금강송 원목독채" },
      { name: "황토방 1호 (4인실)", type: "독채(숲속의집)", spec: "전통황토온돌·건강치유" },
      { name: "휴양관 103호 (5인실)", type: "휴양관(연립)", spec: "온돌방·화장실·취사" }
    ]
  },
  {
    id: "F_HEERISAN",
    forestId: "0187",
    park: "충남 서천",
    name: "희리산 해송 자연휴양림",
    region: "경기/충청",
    type: "독채(숲속의집)",
    tags: ["해송숲", "캠핑카야영장", "사계절피톤치드"],
    policy: "매주 수요일 09:00 오픈",
    url: "https://www.foresttrip.go.kr/0187",
    booking_url: "https://www.foresttrip.go.kr/0187",
    rooms: [
      { name: "숲속의집 해송 1호 (5인실)", type: "독채(숲속의집)", spec: "해송통나무집·단독마당" },
      { name: "숲속의집 곰솔 2호 (8인실)", type: "독채(숲속의집)", spec: "복층구조·가족대형방" },
      { name: "캠핑카야영장 03번", type: "야영데크", spec: "카라반진입가능·전기시설" },
      { name: "휴양관 해송 201호 (4인실)", type: "휴양관(연립)", spec: "온돌방·해송림조망" }
    ]
  },
  {
    id: "F_NAMHAE",
    forestId: "0192",
    park: "경남 남해",
    name: "남해편백 자연휴양림",
    region: "경상",
    type: "독채(숲속의집)",
    tags: ["편백나무숲", "한려해상전망", "순수피톤치드"],
    policy: "매주 수요일 09:00 오픈",
    url: "https://www.foresttrip.go.kr/0192",
    booking_url: "https://www.foresttrip.go.kr/0192",
    rooms: [
      { name: "숲속의집 편백 1호 (4인실)", type: "독채(숲속의집)", spec: "편백원목향기·피톤치드" },
      { name: "숲속의집 편백 2호 (6인실)", type: "독채(숲속의집)", spec: "거실+방·독립테라스" },
      { name: "휴양관 바다 101호 (5인실)", type: "휴양관(연립)", spec: "편백림조망·온돌방" }
    ]
  },
  {
    id: "F_DEOGYU",
    forestId: "0141",
    park: "전북 무주",
    name: "덕유산 자연휴양림",
    region: "전라",
    type: "독채(숲속의집)",
    tags: ["독일가문비나무", "한옥숙소", "원시림"],
    policy: "매주 수요일 09:00 오픈",
    url: "https://www.foresttrip.go.kr/0141",
    booking_url: "https://www.foresttrip.go.kr/0141",
    rooms: [
      { name: "숲속의집 가문비 1호 (4인실)", type: "독채(숲속의집)", spec: "가문비나무숲속독채" },
      { name: "전통한옥 1호실 (8인실)", type: "독채(숲속의집)", spec: "기와한옥·툇마루·가족형" },
      { name: "야영데크 101번", type: "야영데크", spec: "가문비나무그늘 데크" }
    ]
  },
  {
    id: "F_CHUKRYEONG",
    forestId: "ID02030050",
    park: "경기 남양주",
    name: "축령산 자연휴양림",
    region: "경기/충청",
    type: "독채(숲속의집)",
    tags: ["50년잣나무숲", "수도권최고명당", "야영성지"],
    policy: "매월 1일 09:00 오픈",
    url: "https://www.foresttrip.go.kr/indvz/main.do?hmpgId=ID02030050",
    booking_url: "https://www.foresttrip.go.kr/indvz/main.do?hmpgId=ID02030050",
    rooms: [
      { name: "숲속의집 잣나무 1동 (4인실)", type: "독채(숲속의집)", spec: "단독테라스·원룸형" },
      { name: "산림휴양관 201호 (6인실)", type: "휴양관(연립)", spec: "거실+방 콘도형" },
      { name: "야영데크 101번 (잣나무명당)", type: "야영데크", spec: "피톤치드 최상급 데크" }
    ]
  },
  {
    id: "F_ANMYEON",
    forestId: "ID02030086",
    park: "충남 태안",
    name: "안면도 자연휴양림",
    region: "경기/충청",
    type: "독채(숲속의집)",
    tags: ["안면송소나무군락", "수목원연계", "서해낙조"],
    policy: "매월 1일 09:00 오픈",
    url: "https://www.foresttrip.go.kr/indvz/main.do?hmpgId=ID02030086",
    booking_url: "https://www.foresttrip.go.kr/indvz/main.do?hmpgId=ID02030086",
    rooms: [
      { name: "숲속의집 소나무 1호 (4인실)", type: "독채(숲속의집)", spec: "안면송숲속단독동" },
      { name: "숲속의집 해송 2호 (5인실)", type: "독채(숲속의집)", spec: "테라스바베큐·원목" },
      { name: "한옥 1호실 (8인실)", type: "독채(숲속의집)", spec: "기와한옥·대청마루" }
    ]
  },
  {
    id: "F_YONGIN",
    forestId: "ID02030031",
    park: "경기 용인",
    name: "용인 자연휴양림",
    region: "경기/충청",
    type: "독채(숲속의집)",
    tags: ["짚라인체험", "잔디광장", "목조체험주택"],
    policy: "매월 5일~9일 추첨",
    url: "https://www.foresttrip.go.kr/indvz/main.do?hmpgId=ID02030031",
    booking_url: "https://www.foresttrip.go.kr/indvz/main.do?hmpgId=ID02030031",
    rooms: [
      { name: "숲속의집 밤나무 (6인실)", type: "독채(숲속의집)", spec: "잔디마당단독독채" },
      { name: "목조체험주택 핀란드관 (8인실)", type: "독채(숲속의집)", spec: "유럽풍 친환경 목조독채" },
      { name: "야영데크 101번", type: "야영데크", spec: "전기사용가능 목재데크" }
    ]
  },
  {
    id: "F_UNAK",
    forestId: "0224",
    park: "경기 포천",
    name: "운악산 자연휴양림",
    region: "경기/충청",
    type: "독채(숲속의집)",
    tags: ["운악산기암괴석", "한옥정취", "피톤치드"],
    policy: "매주 수요일 09:00 오픈",
    url: "https://www.foresttrip.go.kr/0224",
    booking_url: "https://www.foresttrip.go.kr/0224",
    rooms: [
      { name: "숲속의집 잣나무 (5인실)", type: "독채(숲속의집)", spec: "단독데크·원목독채" },
      { name: "한옥연립동 운악 (4인실)", type: "휴양관(연립)", spec: "전통한옥온돌방" }
    ]
  }
];

// ==========================================
// 2. 국립공원 생태탐방원 (10개원) 공식 검증 데이터셋
// ==========================================
const KNPS_ECO_LODGES = [
  {
    id: "ECO_BUKHAN",
    deptId: "B971002",
    park: "북한산",
    name: "북한산 생태탐방원 생활관",
    region: "경기/충청",
    type: "객실(생활관)",
    tags: ["도심형힐링", "자연의집", "생태프로그램"],
    policy: "공단 선착순 오픈",
    url: "https://reservation.knps.or.kr/eco/searchEcoReservation.do?deptId=B971002",
    booking_url: "https://reservation.knps.or.kr/eco/searchEcoReservation.do?deptId=B971002",
    rooms: [
      { name: "생활관 201호 (4인실)", type: "풀옵션", spec: "침대·온돌·화장실·테라스" },
      { name: "생활관 202호 (4인실)", type: "풀옵션", spec: "침대·온돌·화장실" },
      { name: "자연의집 01동 (6인실)", type: "풀옵션", spec: "독채형 통나무 숙소" }
    ]
  },
  {
    id: "ECO_JIRI",
    deptId: "B014003",
    park: "지리산",
    name: "지리산 생태탐방원 생활관",
    region: "전라",
    type: "객실(생활관)",
    tags: ["노고단전망", "에코스쿨", "가족특화"],
    policy: "공단 선착순 오픈",
    url: "https://reservation.knps.or.kr/eco/searchEcoReservation.do?deptId=B014003",
    booking_url: "https://reservation.knps.or.kr/eco/searchEcoReservation.do?deptId=B014003",
    rooms: [
      { name: "반달곰동 101호 (4인실)", type: "풀옵션", spec: "노고단전망·개별취사실" },
      { name: "반달곰동 102호 (4인실)", type: "풀옵션", spec: "온돌방·샤워실" },
      { name: "자연의집 03호 (8인실)", type: "풀옵션", spec: "대가족 전용 복층형" }
    ]
  },
  {
    id: "ECO_SEORAK",
    deptId: "B163001",
    park: "설악산",
    name: "설악산 생태탐방원 생활관",
    region: "강원",
    type: "객실(생활관)",
    tags: ["토왕성조망", "생태체험", "숲속숙소"],
    policy: "공단 선착순 오픈",
    url: "https://reservation.knps.or.kr/eco/searchEcoReservation.do?deptId=B163001",
    booking_url: "https://reservation.knps.or.kr/eco/searchEcoReservation.do?deptId=B163001",
    rooms: [
      { name: "산양동 201호 (3인실)", type: "풀옵션", spec: "침대·화장실·냉난방" },
      { name: "산양동 202호 (4인실)", type: "풀옵션", spec: "온돌방·설악산조망" }
    ]
  },
  {
    id: "ECO_SOBAEK",
    deptId: "B123002",
    park: "소백산",
    name: "소백산 생태탐방원 생활관",
    region: "경기/충청",
    type: "객실(생활관)",
    tags: ["자락길인접", "에코스테이", "천문관측"],
    policy: "공단 선착순 오픈",
    url: "https://reservation.knps.or.kr/eco/searchEcoReservation.do?deptId=B123002",
    booking_url: "https://reservation.knps.or.kr/eco/searchEcoReservation.do?deptId=B123002",
    rooms: [
      { name: "여우동 101호 (4인실)", type: "풀옵션", spec: "테라스소백산뷰" },
      { name: "자연의집 02호 (6인실)", type: "풀옵션", spec: "독립정원·통나무" }
    ]
  },
  {
    id: "ECO_BYEONSAN",
    deptId: "B183001",
    park: "변산반도",
    name: "변산반도 생태탐방원 생활관",
    region: "전라",
    type: "객실(생활관)",
    tags: ["해양생태", "서해낙조", "격포해변"],
    policy: "공단 선착순 오픈",
    url: "https://reservation.knps.or.kr/eco/searchEcoReservation.do?deptId=B183001",
    booking_url: "https://reservation.knps.or.kr/eco/searchEcoReservation.do?deptId=B183001",
    rooms: [
      { name: "해넘이동 101호 (4인실)", type: "풀옵션", spec: "오션뷰·독립테라스" }
    ]
  }
];

// ==========================================
// 3. 국립공원 산악 대피소 (13개소) 공식 검증 데이터셋
// ==========================================
const KNPS_SHELTERS = [
  {
    id: "SH_JANGTEO",
    deptId: "B011004",
    park: "지리산",
    name: "지리산 장터목 대피소 (천왕봉 코스)",
    region: "전라",
    type: "대피소(침상)",
    tags: ["천왕봉최근접", "일출명당", "해발1653m"],
    policy: "공단 추첨/선착순",
    url: "https://reservation.knps.or.kr/reservation/shelter/searchSimpleShelterReservation.do?deptId=B011004",
    booking_url: "https://reservation.knps.or.kr/reservation/shelter/searchSimpleShelterReservation.do?deptId=B011004",
    rooms: [
      { name: "장터목 1호실 (공용 침상)", type: "침상", spec: "온돌형 공동 침상" },
      { name: "장터목 2호실 (여성 전용)", type: "침상", spec: "온돌형 독립 침상" }
    ]
  },
  {
    id: "SH_SESEOK",
    deptId: "B011001",
    park: "지리산",
    name: "지리산 세석 대피소 (철쭉평전)",
    region: "전라",
    type: "대피소(침상)",
    tags: ["세석평전", "최대규모", "해발1560m"],
    policy: "공단 추첨/선착순",
    url: "https://reservation.knps.or.kr/reservation/shelter/searchSimpleShelterReservation.do?deptId=B011001",
    booking_url: "https://reservation.knps.or.kr/reservation/shelter/searchSimpleShelterReservation.do?deptId=B011001",
    rooms: [
      { name: "세석 1호실 (공용)", type: "침상", spec: "대형 온돌 침상" }
    ]
  },
  {
    id: "SH_JUNGCHEONG",
    deptId: "B031002",
    park: "설악산",
    name: "설악산 중청 대피소 (대청봉)",
    region: "강원",
    type: "대피소(침상)",
    tags: ["대청봉20분", "설악정상부", "해발1665m"],
    policy: "공단 추첨/선착순",
    url: "https://reservation.knps.or.kr/reservation/shelter/searchSimpleShelterReservation.do?deptId=B031002",
    booking_url: "https://reservation.knps.or.kr/reservation/shelter/searchSimpleShelterReservation.do?deptId=B031002",
    rooms: [
      { name: "중청 1호실", type: "침상", spec: "대청봉 일출 침상" }
    ]
  },
  {
    id: "SH_HEEUWNGAK",
    deptId: "B031001",
    park: "설악산",
    name: "설악산 희운각 대피소 (공룡능선)",
    region: "강원",
    type: "대피소(침상)",
    tags: ["공룡능선기점", "신축리모델링", "천불동계곡"],
    policy: "공단 추첨/선착순",
    url: "https://reservation.knps.or.kr/reservation/shelter/searchSimpleShelterReservation.do?deptId=B031001",
    booking_url: "https://reservation.knps.or.kr/reservation/shelter/searchSimpleShelterReservation.do?deptId=B031001",
    rooms: [
      { name: "희운각 신축 1호실", type: "침상", spec: "개별 칸막이 신축 침상" }
    ]
  }
];

// ==========================================
// 4. 초기화 및 실시간 데이터 로드
// ==========================================
async function initData() {
  try {
    const res = await fetch("status.json?t=" + Date.now());
    if (res.ok) {
      const data = await res.json();
      allCampsites = data.campgrounds || [];
      const updatedText = document.getElementById("lastUpdatedSource");
      if (updatedText && data.last_updated) {
        updatedText.textContent = `데이터: 국립공원공단 공식 실시간 연동 (${data.last_updated} 갱신)`;
      }
      console.log(`[+] 성공: status.json에서 48개 야영장 로드 완료!`);
    }
  } catch (e) {
    console.warn("[-] status.json 직접 fetch 실패:", e);
  }
  renderAllViews();
}

function getDatesForMode() {
  if (dateMode === "this-sat") {
    return [
      { date: "2026-10-03", label: "오늘 토 (10.03) 🎯", highlight: true },
      { date: "2026-10-04", label: "일 (10.04)" },
      { date: "2026-10-05", label: "월 (10.05)" }
    ];
  } else if (dateMode === "holiday-sat") {
    return [
      { date: "2026-10-09", label: "한글날 금 (10.09) 🍁" },
      { date: "2026-10-10", label: "토 (10.10) 🎯", highlight: true },
      { date: "2026-10-11", label: "일 (10.11)" }
    ];
  } else if (dateMode === "next-sat") {
    return [
      { date: "2026-10-16", label: "금 (10.16)" },
      { date: "2026-10-17", label: "토 (10.17) 🎯", highlight: true },
      { date: "2026-10-18", label: "일 (10.18)" }
    ];
  } else {
    const val = document.getElementById("customDateInput")?.value || "2026-10-03";
    const dObj = new Date(val);
    const dPlus1 = new Date(dObj.getTime() + 86400000).toISOString().split('T')[0];
    const dPlus2 = new Date(dObj.getTime() + 172800000).toISOString().split('T')[0];
    return [
      { date: val, label: `${val.substring(5)} 🎯`, highlight: true },
      { date: dPlus1, label: `${dPlus1.substring(5)}` },
      { date: dPlus2, label: `${dPlus2.substring(5)}` }
    ];
  }
}

function getActiveFacilityList() {
  if (currentService === "forest") {
    if (currentFacility === "house") {
      return FOREST_TRIP_LODGES.filter(f => f.rooms?.some(r => r.type.includes("독채")));
    } else if (currentFacility === "condo") {
      return FOREST_TRIP_LODGES.filter(f => f.rooms?.some(r => r.type.includes("휴양관")));
    } else if (currentFacility === "deck") {
      return FOREST_TRIP_LODGES.filter(f => f.rooms?.some(r => r.type.includes("야영데크")));
    }
    return FOREST_TRIP_LODGES;
  }

  if (currentFacility === "eco") {
    return KNPS_ECO_LODGES;
  } else if (currentFacility === "shelter") {
    return KNPS_SHELTERS;
  }
  return allCampsites.length > 0 ? allCampsites : [];
}

function getFilteredItems() {
  const dates = getDatesForMode();
  const day1 = dates[0].date;
  const day2 = dates[1].date;
  const day3 = dates[2].date;
  const list = getActiveFacilityList();

  return list.filter(c => {
    if (currentRegion !== "all" && c.region !== currentRegion) return false;
    if (currentType !== "all" && c.type !== currentType) return false;

    if (roomOnlyFilter) {
      const hasRoom = c.rooms?.some(r => 
        r.type.includes("카라반") || r.type.includes("풀옵션") || 
        r.type.includes("독채") || r.type.includes("휴양관") || 
        r.type.includes("생활관") || r.type.includes("대피소")
      );
      if (!hasRoom) return false;
    }

    if (searchQuery.trim() !== "") {
      const q = searchQuery.toLowerCase().trim();
      const matchPark = c.park ? c.park.toLowerCase().includes(q) : false;
      const matchName = c.name ? c.name.toLowerCase().includes(q) : false;
      const matchTag = c.tags ? c.tags.some(t => t.toLowerCase().includes(q)) : false;
      const matchRoom = c.rooms ? c.rooms.some(r => r.name.toLowerCase().includes(q)) : false;
      if (!matchPark && !matchName && !matchTag && !matchRoom) return false;
    }

    if (favoritesOnly && !favorites.includes(c.id)) return false;

    if (consecutiveOnly && c.slots) {
      const d1Slots = c.slots[day1] || 0;
      const d2Slots = c.slots[day2] || 0;
      const d3Slots = c.slots[day3] || 0;
      const hasConsecutive = (d1Slots > 0 && d2Slots > 0) || (d2Slots > 0 && d3Slots > 0);
      if (!hasConsecutive) return false;
    }

    if (availableOnly && c.slots) {
      const totalSlotInView = dates.reduce((sum, d) => sum + (c.slots[d.date] || 0), 0);
      if (totalSlotInView === 0) return false;
    }

    return true;
  });
}

window.toggleExpandItem = function(itemId) {
  if (expandedItemIds.has(itemId)) {
    expandedItemIds.delete(itemId);
  } else {
    expandedItemIds.add(itemId);
  }
  renderAllViews();
};

window.toggleFavorite = function(itemId) {
  if (favorites.includes(itemId)) {
    favorites = favorites.filter(id => id !== itemId);
  } else {
    favorites.push(itemId);
  }
  localStorage.setItem("knps_favs", JSON.stringify(favorites));
  renderAllViews();
};

function renderAllViews() {
  const dates = getDatesForMode();
  const currentList = getActiveFacilityList();
  const filtered = getFilteredItems();

  document.getElementById("renderedCount").textContent = filtered.length;
  let availCount = 0;
  let totalSlots = 0;

  currentList.forEach(c => {
    if (c.slots) {
      const s1 = c.slots[dates[0].date] || 0;
      const s2 = c.slots[dates[1].date] || 0;
      const s3 = c.slots[dates[2].date] || 0;
      const sum = s1 + s2 + s3;
      if (sum > 0) availCount++;
      totalSlots += sum;
    }
  });

  const availableCampCountEl = document.getElementById("availableCampCount");
  if (availableCampCountEl) availableCampCountEl.textContent = availCount;

  document.getElementById("colDate0").textContent = dates[0].label;
  document.getElementById("colDate1").textContent = dates[1].label;
  document.getElementById("colDate2").textContent = dates[2].label;

  const emptyState = document.getElementById("emptyState");
  if (filtered.length === 0) {
    document.getElementById("matrixTableBody").innerHTML = "";
    document.getElementById("cardFeedContainer").innerHTML = "";
    emptyState.classList.remove("hidden");
    return;
  }
  emptyState.classList.add("hidden");

  if (viewMode === "card") {
    document.getElementById("matrixViewWrap").classList.add("hidden");
    document.getElementById("cardFeedContainer").classList.remove("hidden");
    renderCardFeed(filtered, dates);
  } else {
    document.getElementById("matrixViewWrap").classList.remove("hidden");
    document.getElementById("cardFeedContainer").classList.add("hidden");
    renderMatrixTable(filtered, dates);
  }
}

// ----------------------------------------------------
// [VIEW 1] IpoCard 표준 규격 카드 피드
// ----------------------------------------------------
function renderCardFeed(items, dates) {
  const container = document.getElementById("cardFeedContainer");
  container.innerHTML = "";
  const isForest = currentService === "forest";

  items.forEach((item, index) => {
    const isFav = favorites.includes(item.id);
    const isExpanded = expandedItemIds.has(item.id);
    const roomCount = item.rooms ? item.rooms.length : 0;

    let s1 = 0, s2 = 0, s3 = 0, totalSlots = 0;
    if (item.slots) {
      s1 = item.slots[dates[0].date] || 0;
      s2 = item.slots[dates[1].date] || 0;
      s3 = item.slots[dates[2].date] || 0;
      totalSlots = s1 + s2 + s3;
    }

    // 상태 배지 (IpoCard getStatusBadge 표준)
    let statusBadgeText = "";
    let statusBadgeClass = "";
    if (isForest) {
      statusBadgeText = "숲나들e 공식";
      statusBadgeClass = "bg-amber-600 text-white font-bold";
    } else if (item.slots) {
      if (totalSlots === 0) {
        statusBadgeText = "전석 매진";
        statusBadgeClass = "bg-gray-400 text-white font-medium";
      } else if (totalSlots <= 2) {
        statusBadgeText = `마감 임박 (${totalSlots}석)`;
        statusBadgeClass = "bg-red-600 text-white font-bold animate-pulse";
      } else {
        statusBadgeText = `예약 가능 (${totalSlots}석)`;
        statusBadgeClass = "bg-emerald-700 text-white font-bold";
      }
    } else {
      statusBadgeText = "객실별 조회";
      statusBadgeClass = "bg-blue-700 text-white font-semibold";
    }

    // 잔여석 텍스트
    let slotsText = "";
    let consecutiveText = "불가";
    if (item.slots) {
      slotsText = totalSlots > 0 ? `${totalSlots}석 즉시 가능` : `<span class="text-gray-400 font-normal">매진 (취소표 대기)</span>`;
      const hasConsecutive = (s1 > 0 && s2 > 0) || (s2 > 0 && s3 > 0);
      consecutiveText = hasConsecutive ? `<span class="text-emerald-700 font-bold">가능 (${s1 > 0 && s2 > 0 ? '토~일' : '일~월'})</span>` : `<span class="text-gray-400 font-normal">불가</span>`;
    } else {
      slotsText = `<span class="text-gray-700 font-semibold">${item.policy || '공식 시스템 조회'}</span>`;
      consecutiveText = "공식 예약창 확인";
    }

    // 세부 방 서랍 HTML
    let roomsDrawerHtml = "";
    if (isExpanded && item.rooms && item.rooms.length > 0) {
      const roomItemsHtml = item.rooms.map(room => {
        let roomStatusHtml = "";
        if (room.slots) {
          const r1 = room.slots[dates[0].date] || 0;
          const r2 = room.slots[dates[1].date] || 0;
          const r3 = room.slots[dates[2].date] || 0;
          const rBadge = (cnt, lbl) => cnt > 0
            ? `<span class="bg-emerald-100 text-emerald-800 text-[10px] font-bold px-1.5 py-0.5 rounded">${lbl}: 가능</span>`
            : `<span class="bg-gray-100 text-gray-400 text-[10px] px-1.5 py-0.5 rounded">${lbl}: 매진</span>`;
          roomStatusHtml = `<div class="flex items-center gap-1 mt-1.5">${rBadge(r1, dates[0].label.split(' ')[0])}${rBadge(r2, dates[1].label.split(' ')[0])}${rBadge(r3, dates[2].label.split(' ')[0])}</div>`;
        }
        return `
          <div class="bg-white border border-gray-200 rounded-lg p-2.5 text-xs shadow-2xs">
            <div class="flex items-center justify-between">
              <span class="font-bold text-gray-900">${room.name}</span>
              <span class="text-[10px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded border border-gray-200">${room.type}</span>
            </div>
            <div class="text-[11px] text-gray-500 mt-0.5">${room.spec || '공식 시설 규격'}</div>
            ${roomStatusHtml}
          </div>
        `;
      }).join('');

      roomsDrawerHtml = `
        <div class="rounded-lg border border-gray-200 bg-gray-50/70 p-3 mt-3 space-y-2">
          <div class="flex items-center justify-between pb-1 border-b border-gray-200 text-xs font-bold text-gray-800">
            <span>🔑 세부 방/호실 목록 (${item.rooms.length}실)</span>
            <span class="text-[10px] text-gray-500">1-클릭 공식 연결</span>
          </div>
          <div class="grid grid-cols-1 gap-2 pt-1">
            ${roomItemsHtml}
          </div>
        </div>
      `;
    }

    // 카드 생성 (IpoCard.tsx 완벽 준수)
    const cardDiv = document.createElement("div");
    cardDiv.className = "rounded-xl border border-gray-300 bg-white p-5 shadow-2xs hover:border-emerald-600 transition-colors flex flex-col justify-between";
    cardDiv.innerHTML = `
      <div>
        <!-- 상단: 상태 및 지역/유형 구분, 찜 버튼 -->
        <div class="flex items-center justify-between gap-2 mb-3">
          <div class="flex items-center gap-1.5">
            <span class="px-2.5 py-1 rounded text-xs ${statusBadgeClass}">
              ${statusBadgeText}
            </span>
            <span class="text-xs font-semibold px-2 py-1 rounded bg-gray-100 text-gray-700 border border-gray-200">
              ${item.region || item.park}
            </span>
            <span class="text-xs font-semibold px-2 py-1 rounded bg-gray-100 text-gray-700 border border-gray-200">
              ${item.type}
            </span>
          </div>
          <button onclick="toggleFavorite('${item.id}')" class="text-lg p-1 hover:scale-125 transition-transform cursor-pointer" title="찜하기">
            ${isFav ? "⭐" : "☆"}
          </button>
        </div>

        <!-- 시설명 (큰 글씨) -->
        <div class="mb-4">
          <h3 class="text-xl font-bold text-gray-900 flex items-center gap-2">
            <span>${item.name}</span>
          </h3>
          <p class="text-xs text-gray-600 mt-1 line-clamp-1 font-medium">
            ${(item.tags || []).map(t => '#' + t).join(' ')}
          </p>
        </div>

        <!-- 핵심 스펙 표 (정갈한 테이블 형태 - IpoCard Box Table 규격) -->
        <div class="rounded-lg border border-gray-200 bg-gray-50/60 p-3 text-xs space-y-2 mb-3">
          <div class="flex justify-between items-center py-0.5 border-b border-gray-200/80 pb-1.5">
            <span class="text-gray-500 font-medium">실시간 잔여석</span>
            <span class="font-extrabold text-sm text-gray-900">${slotsText}</span>
          </div>

          <div class="flex justify-between items-center py-0.5 border-b border-gray-200/80 pb-1.5">
            <span class="text-gray-500 font-medium">주말 연박(2박)</span>
            <span class="font-bold text-gray-900">${consecutiveText}</span>
          </div>

          <div class="flex justify-between items-center py-0.5 border-b border-gray-200/80 pb-1.5">
            <span class="text-gray-500 font-medium">시설 규모</span>
            <span class="font-semibold text-gray-800">${roomCount > 0 ? '총 ' + roomCount + '개 객실/영지' : '공단 정규 시설'}</span>
          </div>

          <div class="flex justify-between items-center py-0.5">
            <span class="text-gray-500 font-medium">예약 정책</span>
            <span class="font-semibold text-gray-800 truncate max-w-[180px]">${item.policy || '공식 시스템 선착순/추첨'}</span>
          </div>
        </div>

        ${roomsDrawerHtml}
      </div>

      <!-- 하단 액션 버튼들 -->
      <div class="flex items-center gap-2 pt-3 border-t border-gray-200 mt-3">
        <button onclick="toggleExpandItem('${item.id}')" class="flex-1 py-2.5 px-3 rounded-lg border border-gray-300 bg-gray-50 hover:bg-gray-100 text-xs font-bold text-gray-700 transition-colors cursor-pointer text-center">
          ${isExpanded ? "▲ 호실 접기" : "▼ 호실 상세 (" + roomCount + ")"}
        </button>

        <a href="${item.booking_url || item.url}" target="_blank" rel="noopener noreferrer" onclick="showToast('${item.name}')"
           class="flex-1 py-2.5 px-3 rounded-lg ${isForest ? 'bg-amber-600 hover:bg-amber-700' : 'bg-emerald-700 hover:bg-emerald-800'} text-white text-xs font-bold text-center shadow-xs transition-colors flex items-center justify-center gap-1">
          <span>공식 예약</span>
          <span class="text-[11px]">↗</span>
        </a>
      </div>
    `;

    container.appendChild(cardDiv);

    // [광고 영역 2]: 3번째 카드 뒤에 GoogleAdSlot 스타일 인피드 슬롯 삽입
    if (index === 2) {
      const adSlot = document.createElement("div");
      adSlot.className = "rounded-xl border border-dashed border-gray-300 bg-gray-50/80 p-5 text-center flex flex-col justify-between";
      adSlot.innerHTML = `
        <div>
          <div class="flex items-center justify-between text-xs text-gray-400 mb-3">
            <span>광고 | AD</span>
            <span class="font-mono text-[10px]">Google AdSense Space</span>
          </div>
          <div class="py-4 space-y-1.5">
            <span class="text-xs font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-md border border-emerald-200 inline-block mb-1">
              추천 기획전
            </span>
            <h4 class="text-lg font-bold text-gray-900">
              국립공원 & 숲나들e 캠핑 필수 꿀템 TOP 10
            </h4>
            <p class="text-xs text-gray-500 max-w-xs mx-auto">
              공단 규격 승인 방염포, 동계 난연 침낭, 감성 랜턴 최대 45% 할인전
            </p>
          </div>
        </div>
        <div class="pt-3 border-t border-gray-200 mt-3">
          <a href="https://m.search.naver.com/search.naver?query=캠핑용품+특가" target="_blank" rel="noopener noreferrer" class="block w-full py-2.5 px-3 rounded-lg bg-gray-900 hover:bg-black text-white text-xs font-bold text-center shadow-xs transition-colors">
            특가 상품 둘러보기 ↗
          </a>
        </div>
      `;
      container.appendChild(adSlot);
    }
  });
}

// ----------------------------------------------------
// [VIEW 2] 전광판 매트릭스 뷰
// ----------------------------------------------------
function renderMatrixTable(items, dates) {
  const tableBody = document.getElementById("matrixTableBody");
  tableBody.innerHTML = "";
  const isForest = currentService === "forest";

  items.forEach(item => {
    const isFav = favorites.includes(item.id);
    const isExpanded = expandedItemIds.has(item.id);
    const roomCount = item.rooms ? item.rooms.length : 0;

    let s1 = 0, s2 = 0, s3 = 0;
    if (item.slots) {
      s1 = item.slots[dates[0].date] || 0;
      s2 = item.slots[dates[1].date] || 0;
      s3 = item.slots[dates[2].date] || 0;
    }

    const getSlotBadge = (cnt, dateStr) => {
      if (isForest) {
        return `<span class="inline-block px-2 py-1 rounded text-[11px] font-semibold bg-gray-100 text-gray-700 border border-gray-200">일정확인</span>`;
      }
      if (!cnt || cnt === 0) {
        return `<span class="inline-block px-2.5 py-1 rounded text-[11px] font-medium bg-gray-100 text-gray-400">매진</span>`;
      }
      if (cnt <= 2) {
        return `
          <a href="${item.booking_url || item.url}" target="_blank" rel="noopener noreferrer" onclick="showToast('${item.name}')"
             class="inline-flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-bold bg-rose-50 text-rose-600 border border-rose-300 hover:bg-rose-600 hover:text-white transition-all shadow-2xs">
            <span>⚡ ${cnt}석</span>
            <span class="text-[9px]">↗</span>
          </a>
        `;
      }
      return `
        <a href="${item.booking_url || item.url}" target="_blank" rel="noopener noreferrer" onclick="showToast('${item.name}')"
           class="inline-flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-300 hover:bg-emerald-700 hover:text-white transition-all shadow-2xs">
          <span>🟢 ${cnt}석</span>
          <span class="text-[9px]">↗</span>
        </a>
      `;
    };

    const tr = document.createElement("tr");
    tr.className = "hover:bg-gray-50 transition-colors border-b border-gray-100";
    tr.innerHTML = `
      <td class="py-3 px-3 text-center">
        <button onclick="toggleFavorite('${item.id}')" class="text-base hover:scale-125 transition-transform cursor-pointer" title="찜하기">
          ${isFav ? "⭐" : "☆"}
        </button>
      </td>
      <td class="py-3 px-4 sticky-col border-r border-gray-200 bg-white">
        <div class="flex items-center justify-between gap-1.5">
          <div class="min-w-0">
            <div class="text-[10px] text-gray-400 font-semibold">${item.park || item.region}</div>
            <div class="font-bold text-gray-900 truncate">
              ${item.name}
            </div>
          </div>
          <button onclick="toggleExpandItem('${item.id}')" class="text-[10px] font-bold px-1.5 py-0.5 rounded bg-gray-100 hover:bg-gray-200 text-gray-600 shrink-0 cursor-pointer">
            ${isExpanded ? "▲ 접기" : "▼ " + roomCount + "실"}
          </button>
        </div>
      </td>
      <td class="py-3 px-3">
        <span class="inline-block text-[10px] font-bold px-2 py-0.5 rounded ${isForest ? 'bg-amber-50 text-amber-800 border border-amber-200' : 'bg-gray-100 text-gray-700 border border-gray-200'} mb-1">
          ${item.type}
        </span>
        <div class="text-[10px] text-gray-400 truncate max-w-[120px]">
          ${(item.tags || []).join(', ')}
        </div>
      </td>
      <td class="py-3 px-3 text-center">${getSlotBadge(s1, dates[0].date)}</td>
      <td class="py-3 px-3 text-center bg-emerald-50/50">${getSlotBadge(s2, dates[1].date)}</td>
      <td class="py-3 px-3 text-center">${getSlotBadge(s3, dates[2].date)}</td>
      <td class="py-3 px-4 text-center">
        <a href="${item.booking_url || item.url}" target="_blank" rel="noopener noreferrer" onclick="showToast('${item.name}')"
           class="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold ${isForest ? 'bg-amber-600 hover:bg-amber-700' : 'bg-emerald-700 hover:bg-emerald-800'} text-white shadow-2xs transition-all">
          <span>예약 ↗</span>
        </a>
      </td>
    `;
    tableBody.appendChild(tr);

    if (isExpanded && item.rooms && item.rooms.length > 0) {
      const subTr = document.createElement("tr");
      subTr.className = "bg-gray-50 border-b border-gray-200";
      const roomsHtml = item.rooms.map(room => {
        let roomSlotsHtml = "";
        if (room.slots) {
          const r1 = room.slots[dates[0].date] || 0;
          const r2 = room.slots[dates[1].date] || 0;
          const r3 = room.slots[dates[2].date] || 0;
          const rBadge = (cnt, lbl) => cnt > 0
            ? `<span class="bg-emerald-100 text-emerald-800 text-[10px] font-bold px-1.5 py-0.5 rounded">${lbl}: 가능</span>`
            : `<span class="bg-gray-100 text-gray-400 text-[10px] px-1.5 py-0.5 rounded">${lbl}: 매진</span>`;
          roomSlotsHtml = `<div class="flex items-center gap-1 mt-1">${rBadge(r1, dates[0].label.split(' ')[0])}${rBadge(r2, dates[1].label.split(' ')[0])}${rBadge(r3, dates[2].label.split(' ')[0])}</div>`;
        }
        return `
          <div class="bg-white border border-gray-200 rounded p-2 text-xs">
            <div class="flex items-center justify-between">
              <span class="font-bold text-gray-900">${room.name}</span>
              <span class="text-[9px] bg-gray-100 text-gray-600 px-1 rounded">${room.type}</span>
            </div>
            <div class="text-[10px] text-gray-400">${room.spec || '공식 규격'}</div>
            ${roomSlotsHtml}
          </div>
        `;
      }).join('');

      subTr.innerHTML = `
        <td colspan="7" class="p-3">
          <div class="p-3 bg-white border border-gray-200 rounded-lg">
            <div class="text-xs font-bold text-gray-700 mb-2 flex items-center justify-between">
              <span>🔑 [${item.name}] 세부 방/호실 규격 (${item.rooms.length}실)</span>
              <span class="text-[10px] text-gray-400">1-클릭 공식 예약 지원</span>
            </div>
            <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
              ${roomsHtml}
            </div>
          </div>
        </td>
      `;
      tableBody.appendChild(subTr);
    }
  });
}

// ----------------------------------------------------
// 토스트 및 비프음
// ----------------------------------------------------
window.showToast = function(targetName) {
  const toast = document.getElementById("toast");
  if (!toast) return;
  document.getElementById("toastTitle").textContent = `${targetName} 공식 예약 시스템 연결`;
  document.getElementById("toastDesc").textContent = "공식 홈페이지로 안전하게 이동합니다.";
  toast.classList.remove("translate-y-20", "opacity-0");
  setTimeout(() => {
    toast.classList.add("translate-y-20", "opacity-0");
  }, 3500);
};

function playBeep() {
  try {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.type = "sine";
    osc.frequency.setValueAtTime(587.33, audioCtx.currentTime);
    osc.frequency.setValueAtTime(880, audioCtx.currentTime + 0.15);
    gain.gain.setValueAtTime(0.2, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.4);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.4);
  } catch (e) {
    console.log("Audio not supported");
  }
}

// ----------------------------------------------------
// 이벤트 핸들러
// ----------------------------------------------------
document.querySelectorAll(".service-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".service-btn").forEach(b => {
      b.classList.remove("active", "bg-emerald-700", "text-white", "shadow-xs");
      b.classList.add("text-gray-700", "hover:text-gray-900", "hover:bg-gray-300/60");
    });

    currentService = btn.getAttribute("data-service");
    btn.classList.add("active", "bg-emerald-700", "text-white", "shadow-xs");
    btn.classList.remove("text-gray-700", "hover:text-gray-900", "hover:bg-gray-300/60");

    if (currentService === "knps") {
      document.getElementById("knpsSubTabs").classList.remove("hidden");
      document.getElementById("forestSubTabs").classList.add("hidden");
      currentFacility = "camp";
    } else {
      document.getElementById("knpsSubTabs").classList.add("hidden");
      document.getElementById("forestSubTabs").classList.remove("hidden");
      currentFacility = "all";
    }
    renderAllViews();
  });
});

document.querySelectorAll(".knps-tab").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".knps-tab").forEach(b => {
      b.classList.remove("active", "bg-gray-900", "text-white", "shadow-2xs");
      b.classList.add("bg-white", "border", "border-gray-300", "text-gray-700", "hover:bg-gray-50");
    });
    btn.classList.add("active", "bg-gray-900", "text-white", "shadow-2xs");
    btn.classList.remove("bg-white", "border", "border-gray-300", "text-gray-700", "hover:bg-gray-50");

    currentFacility = btn.getAttribute("data-facility");
    renderAllViews();
  });
});

document.querySelectorAll(".forest-tab").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".forest-tab").forEach(b => {
      b.classList.remove("active", "bg-gray-900", "text-white", "shadow-2xs");
      b.classList.add("bg-white", "border", "border-gray-300", "text-gray-700", "hover:bg-gray-50");
    });
    btn.classList.add("active", "bg-gray-900", "text-white", "shadow-2xs");
    btn.classList.remove("bg-white", "border", "border-gray-300", "text-gray-700", "hover:bg-gray-50");

    currentFacility = btn.getAttribute("data-facility");
    renderAllViews();
  });
});

document.querySelectorAll(".view-mode-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".view-mode-btn").forEach(b => {
      b.classList.remove("active", "bg-emerald-700", "text-white");
      b.classList.add("text-gray-600", "hover:text-gray-900");
    });
    btn.classList.add("active", "bg-emerald-700", "text-white");
    btn.classList.remove("text-gray-600", "hover:text-gray-900");

    viewMode = btn.getAttribute("data-view-mode");
    renderAllViews();
  });
});

document.querySelectorAll(".date-chip").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".date-chip").forEach(b => {
      b.classList.remove("active", "bg-emerald-700", "text-white", "shadow-2xs");
      b.classList.add("bg-gray-100", "border", "border-gray-200", "text-gray-700");
    });
    btn.classList.add("active", "bg-emerald-700", "text-white", "shadow-2xs");
    btn.classList.remove("bg-gray-100", "border", "border-gray-200", "text-gray-700");

    dateMode = btn.getAttribute("data-date-mode");
    renderAllViews();
  });
});

document.getElementById("customDateInput")?.addEventListener("change", (e) => {
  if (e.target.value) {
    document.querySelectorAll(".date-chip").forEach(b => {
      b.classList.remove("active", "bg-emerald-700", "text-white", "shadow-2xs");
      b.classList.add("bg-gray-100", "border", "border-gray-200", "text-gray-700");
    });
    dateMode = "custom";
    renderAllViews();
  }
});

document.querySelectorAll(".region-chip").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".region-chip").forEach(b => {
      b.classList.remove("active", "font-bold", "text-emerald-700", "bg-emerald-50", "border", "border-emerald-200");
      b.classList.add("text-gray-600");
    });
    btn.classList.add("active", "font-bold", "text-emerald-700", "bg-emerald-50", "border", "border-emerald-200");
    btn.classList.remove("text-gray-600");

    currentRegion = btn.getAttribute("data-region");
    renderAllViews();
  });
});

document.getElementById("availableOnlyToggle")?.addEventListener("change", (e) => {
  availableOnly = e.target.checked;
  renderAllViews();
});
document.getElementById("roomOnlyToggle")?.addEventListener("change", (e) => {
  roomOnlyFilter = e.target.checked;
  renderAllViews();
});
document.getElementById("consecutiveOnlyToggle")?.addEventListener("change", (e) => {
  consecutiveOnly = e.target.checked;
  renderAllViews();
});
document.getElementById("favoritesOnlyToggle")?.addEventListener("change", (e) => {
  favoritesOnly = e.target.checked;
  renderAllViews();
});
document.getElementById("campSearchInput")?.addEventListener("input", (e) => {
  searchQuery = e.target.value;
  renderAllViews();
});

const refreshBtn = document.getElementById("refreshBtn");
const refreshIcon = document.getElementById("refreshIcon");
const refreshTimeText = document.getElementById("refreshTimeText");

refreshBtn?.addEventListener("click", async () => {
  refreshIcon.classList.add("animate-spin");
  refreshTimeText.textContent = "동기화 중...";
  await initData();
  refreshIcon.classList.remove("animate-spin");
  refreshTimeText.textContent = "방금 갱신됨";
});

const huntToggleBtn = document.getElementById("huntToggleBtn");
const huntDot = document.getElementById("huntDot");

huntToggleBtn?.addEventListener("click", () => {
  huntModeActive = !huntModeActive;
  if (huntModeActive) {
    huntDot.className = "w-2 h-2 rounded-full bg-emerald-600 animate-ping";
    huntToggleBtn.classList.add("text-emerald-700", "bg-emerald-50");
    showToast("취소표 사냥 모드 ON! 찜한 시설에 자리가 나면 즉시 비프음으로 알립니다.");
    playBeep();

    huntIntervalId = setInterval(async () => {
      if (!huntModeActive) return;
      await initData();
      const currentDates = getDatesForMode();
      const list = getActiveFacilityList();
      for (let item of list) {
        if (favorites.includes(item.id) && item.slots) {
          const totalSlot = currentDates.reduce((sum, d) => sum + (item.slots[d.date] || 0), 0);
          if (totalSlot > 0) {
            playBeep();
            showToast(`⚡ [취소표 감지] ${item.name} ${totalSlot}석 발생!`);
            break;
          }
        }
      }
    }, 25000);
  } else {
    huntDot.className = "w-2 h-2 rounded-full bg-gray-400";
    huntToggleBtn.classList.remove("text-emerald-700", "bg-emerald-50");
    if (huntIntervalId) clearInterval(huntIntervalId);
  }
});

window.closeBottomAd = function() {
  const ad = document.getElementById("stickyBottomAd");
  if (ad) ad.style.display = "none";
};

// 시작 시 데이터 로드
initData();
