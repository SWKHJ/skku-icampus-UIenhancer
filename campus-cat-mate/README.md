# Campus Cat Mate 🐾  
### iCampus Dashboard & Calendar Enhancer + Study Timer + Cat Mascot

**Campus Cat Mate**는 성균관대학교 iCampus 환경을 더 편하게 만들어주는 크롬 확장 프로그램입니다.  
대시보드·캘린더 UI 개선과 더불어, 귀여운 고양이 마스코트와 포인트 시스템, 공부 타이머를 제공합니다.

---

## ✨ 주요 기능

### 📌 1. iCampus 대시보드 개선
- 완료된 항목 **자동/수동 펼치기**
- **D-Day 배지 표시** (오늘 / 임박 / 주의)
- 항목이 많은 날짜는 **과목별 자동 그룹핑(Accordion)**
- 전체 UI 가독성 향상

### 📅 2. 캘린더 UI 개선
- 과목별 아코디언 자동 생성
- Proxy 이벤트 카드 기반으로 클릭 충돌 제거
- 월 이동/데이터 로딩에도 안정적으로 재빌드
- “접힌 항목 펼치기” 전체 버튼 제공

### 🎮 3. 고양이 마스코트 (Cat Mascot)
- 화면 위를 자유롭게 돌아다니는 고양이
- 드래그하면 집어 들고 던질 수 있음
- 앉기/걷기/점프 모션
- iCampus 페이지 요소를 자동으로 감지해 바닥으로 인식
- 리본/모자 등 악세서리 장착 가능

### ⏱️ 4. 공부 타이머 (Study Timer)
- iCampus에서 공부 시간을 쉽게 기록
- 텍스트 드래그 → 우클릭 → “공부 시간 측정” 시 자동 프리필
- 백그라운드 상태에서도 1초 단위 타이머 유지  
  (Chrome Offscreen Document 사용)
- 공부 기록 저장 기능

### ⭐ 5. 포인트 & 상점
- 접속 보상 / 과제 제출 보상 / 다양한 이벤트 포인트
- 악세서리 구매 및 장착
- 조작 방지를 위해 HMAC 기반 포인트 토큰 구조 사용

---

## 📦 설치 방법

### 1) GitHub에서 다운로드  
Code -> Download ZIP
압축 해제 후 폴더 준비.

### 2) 크롬에서 불러오기  
1. chrome://extensions 접속  
2. 우측 상단 **개발자 모드 ON**  
3. **압축해제된 확장 프로그램 로드**  
4. 다운로드한 폴더 선택

설치 후 오른쪽 상단 확장 아이콘에서 Campus Cat Mate를 실행할 수 있습니다.

---

## 📁 프로젝트 구조

```
icampus-shimeji/
├── assets/ # 고양이 이미지, 악세서리, 스프라이트 시트
├── cat-mascot/ # 마스코트 엔진 (ground/sprite/accessories)
├── popup/ # 상점 · 타이머 · 설정 UI
├── calendarUI.js/css # 캘린더 개선 기능
├── dashboardUI.js/css # 대시보드 개선 기능
├── dday_badge.js/css # 마감일(D-Day) 배지
├── context_prefill.js # 드래그 텍스트 기반 자동 프리필
├── background.js # 백그라운드(타이머, 포인트, offscreen)
├── manifest.json # Chrome 확장 설정
├── offscreen_timer.* # heartbeat 유지용 offscreen 문서
└── README.md
```
---

## 🔒 보안 설계

- 포인트는 background.js에서만 관리  
- HMAC – SHA256 기반 short-lived token  
- persistent balance + token 동기화  
- content script는 포인트 직접 수정 불가능  
- 타이머는 시간 왜곡 방지 로직 포함

---

## 🐾 사용 팁

### 📘 1) 자동 프리필
- 텍스트 드래그 → 우클릭  
→ **공부 시간 측정** 선택  
→ 타이머 팝업에 자동으로 세부내용 입력됨

### 🎀 2) 악세서리 장착
- 팝업 → Shop 탭  
- 포인트로 구매  
- 장착 즉시 마스코트에 반영됨

---

## 🛠️ 기술 스택

- Chrome Extensions MV3  
- JavaScript(ES6)  
- Offscreen Documents API  
- MutationObserver 기반 리렌더 감지  
- WebCrypto API(HMAC)  
- CSS로 UI 재구성

---

## 🤝 기여하기
Pull Request, Issue 모두 환영합니다.  
코드 개선, 새로운 악세서리 또는 UI 개선 기여도 환영합니다.

---

## 📜 라이선스
**MIT License**  
(단, 고양이 이미지 및 악세서리는 개인 제작 아트이므로 무단 재사용 금지)

---

## 📝 개발자 메모
Campus Cat Mate는  
“iCampus의 불편함을 직접 개선하고, 공부 동기부여를 높일 수 없을까?”  
라는 아이디어에서 출발한 프로젝트입니다.

학생이 만든, 학생을 위한 확장 프로그램입니다.
