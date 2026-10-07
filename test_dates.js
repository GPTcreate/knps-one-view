/**
 * 날짜 계산 검증 스크립트 (test_dates.js)
 * 
 * 검증 대상:
 * 1. 2026-10-07(수요일, 평일) 기준 이번 주말/다음 주말 계산
 * 2. 2026-10-09(금요일 경계) 기준 오늘 표시 및 주말 계산
 * 3. 2026-10-10(토요일 경계) 기준 오늘 표시 및 과거(금요일) 배제 검증
 * 4. 2026-10-11(일요일 경계) 기준 오늘 표시 및 과거(금/토) 배제 검증
 * 5. 2026-10-12(월요일) 기준 다음 주말로 자동 진입 검증
 * 6. 과거 날짜를 오늘로 잘못 표시하지 않는지 검증
 */

// Node.js 환경에서 브라우저 전역 객체 모킹
global.window = global;
global.document = {
  getElementById: () => null,
  querySelector: () => null,
  querySelectorAll: () => [],
};

const assert = require('assert');
const { getDatesForMode, getKstTodayInfo } = require('./app.js');

console.log('=== [1] 평일 검증: 2026-10-07 (수요일) ===');
{
  const kst = getKstTodayInfo('2026-10-07');
  assert.strictEqual(kst.ymd, '2026-10-07');
  assert.strictEqual(kst.dayOfWeek, 3, '수요일이어야 함');

  // 이번 주말 (this-sat) -> 다가오는 금(10.09), 토(10.10), 일(10.11)
  const thisSat = getDatesForMode('this-sat', '2026-10-07');
  assert.strictEqual(thisSat.length, 3);
  assert.strictEqual(thisSat[0].date, '2026-10-09');
  assert.strictEqual(thisSat[1].date, '2026-10-10');
  assert.strictEqual(thisSat[2].date, '2026-10-11');
  assert.strictEqual(thisSat[1].highlight, true, '토요일 하이라이트');

  // 레이블 검증: 오늘은 10-07이므로 10-09~11에는 '오늘'이 없어야 함
  assert.strictEqual(thisSat[0].label.includes('오늘'), false);
  assert.strictEqual(thisSat[1].label.includes('오늘'), false);
  assert.strictEqual(thisSat[2].label.includes('오늘'), false);
  assert.strictEqual(thisSat[0].label, '금 (10.09)');
  assert.strictEqual(thisSat[1].label, '토 (10.10) 🎯');
  assert.strictEqual(thisSat[2].label, '일 (10.11)');

  // 다음 주말 (next-sat) -> 10.16(금), 10.17(토), 10.18(일)
  const nextSat = getDatesForMode('next-sat', '2026-10-07');
  assert.strictEqual(nextSat[0].date, '2026-10-16');
  assert.strictEqual(nextSat[1].date, '2026-10-17');
  assert.strictEqual(nextSat[2].date, '2026-10-18');
  assert.strictEqual(nextSat[1].highlight, true);

  console.log('✓ 2026-10-07 평일: 이번 주말(10.09~11), 다음 주말(10.16~18) 정상 계산');
}

console.log('\n=== [2] 금요일 경계 검증: 2026-10-09 (금요일 당일) ===');
{
  const thisSat = getDatesForMode('this-sat', '2026-10-09');
  assert.strictEqual(thisSat[0].date, '2026-10-09');
  assert.strictEqual(thisSat[1].date, '2026-10-10');
  assert.strictEqual(thisSat[2].date, '2026-10-11');

  // 금요일이 당일이므로 첫 번째 날짜에 '오늘' 표시
  assert.strictEqual(thisSat[0].label, '오늘 금 (10.09)');
  assert.strictEqual(thisSat[1].label, '토 (10.10) 🎯');
  assert.strictEqual(thisSat[2].label, '일 (10.11)');

  // 다음 주말
  const nextSat = getDatesForMode('next-sat', '2026-10-09');
  assert.strictEqual(nextSat[0].date, '2026-10-16');
  assert.strictEqual(nextSat[1].date, '2026-10-17');
  assert.strictEqual(nextSat[2].date, '2026-10-18');

  console.log('✓ 2026-10-09 금요일: 오늘 금(10.09) 정상 표시 및 주말 연결 확인');
}

console.log('\n=== [3] 토요일 경계 검증: 2026-10-10 (토요일 당일) ===');
{
  const thisSat = getDatesForMode('this-sat', '2026-10-10');
  // 토요일 당일에는 전날인 금요일(10.09)은 과거이므로 배제하고 토(오늘), 일, 월 표시
  assert.strictEqual(thisSat[0].date, '2026-10-10');
  assert.strictEqual(thisSat[1].date, '2026-10-11');
  assert.strictEqual(thisSat[2].date, '2026-10-12');

  assert.strictEqual(thisSat[0].label, '오늘 토 (10.10) 🎯');
  assert.strictEqual(thisSat[1].label, '일 (10.11)');
  assert.strictEqual(thisSat[2].label, '월 (10.12)');
  assert.strictEqual(thisSat[0].highlight, true);

  // 과거 날짜(10.09) 없음 확인
  assert.strictEqual(thisSat.some(d => d.date === '2026-10-09'), false);

  // 다음 주말
  const nextSat = getDatesForMode('next-sat', '2026-10-10');
  assert.strictEqual(nextSat[0].date, '2026-10-16');
  assert.strictEqual(nextSat[1].date, '2026-10-17');
  assert.strictEqual(nextSat[2].date, '2026-10-18');

  console.log('✓ 2026-10-10 토요일: 전날(금) 배제, 오늘 토(10.10 🎯)부터 3일 정상 반환');
}

console.log('\n=== [4] 일요일 경계 검증: 2026-10-11 (일요일 당일) ===');
{
  const thisSat = getDatesForMode('this-sat', '2026-10-11');
  // 일요일 당일에는 과거 금/토 배제하고 일(오늘), 월, 화 표시
  assert.strictEqual(thisSat[0].date, '2026-10-11');
  assert.strictEqual(thisSat[1].date, '2026-10-12');
  assert.strictEqual(thisSat[2].date, '2026-10-13');

  assert.strictEqual(thisSat[0].label, '오늘 일 (10.11) 🎯');
  assert.strictEqual(thisSat[1].label, '월 (10.12)');
  assert.strictEqual(thisSat[2].label, '화 (10.13)');

  // 다음 주말
  const nextSat = getDatesForMode('next-sat', '2026-10-11');
  assert.strictEqual(nextSat[0].date, '2026-10-16');
  assert.strictEqual(nextSat[1].date, '2026-10-17');
  assert.strictEqual(nextSat[2].date, '2026-10-18');

  console.log('✓ 2026-10-11 일요일: 과거(금/토) 배제, 오늘 일(10.11 🎯)부터 3일 정상 반환');
}

console.log('\n=== [5] 월요일 자동 진입 검증: 2026-10-12 (월요일) ===');
{
  const thisSat = getDatesForMode('this-sat', '2026-10-12');
  // 월요일이 되면 이번 주말은 다가오는 10.16~18로 자동 전이
  assert.strictEqual(thisSat[0].date, '2026-10-16');
  assert.strictEqual(thisSat[1].date, '2026-10-17');
  assert.strictEqual(thisSat[2].date, '2026-10-18');

  assert.strictEqual(thisSat[0].label, '금 (10.16)');
  assert.strictEqual(thisSat[1].label, '토 (10.17) 🎯');
  assert.strictEqual(thisSat[2].label, '일 (10.18)');

  // 다음 주말은 10.23~25
  const nextSat = getDatesForMode('next-sat', '2026-10-12');
  assert.strictEqual(nextSat[0].date, '2026-10-23');
  assert.strictEqual(nextSat[1].date, '2026-10-24');
  assert.strictEqual(nextSat[2].date, '2026-10-25');

  console.log('✓ 2026-10-12 월요일: 이번 주말이 10.16~18로 자동 전이 확인');
}

console.log('\n=== [6] 과거 날짜를 오늘로 오표시하지 않는 안전성 검증 ===');
{
  // 10-07 시점에서 10-03 등 과거 날짜를 절대 오늘로 표기하지 않는지 확인
  const dates = getDatesForMode('this-sat', '2026-10-07');
  for (const d of dates) {
    if (d.date !== '2026-10-07') {
      assert.strictEqual(d.label.startsWith('오늘'), false, `${d.date}는 오늘이 아니므로 '오늘' 접두사가 없어야 함`);
    }
  }
  console.log('✓ 과거 및 미래 날짜에 허위 오늘 라벨 없음 확인');
}

console.log('\n=======================================');
console.log('ALL DATE CALCULATION VERIFICATIONS PASSED!');
console.log('=======================================');
