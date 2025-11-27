# Campus Cat Mate 🐾  
### iCampus Dashboard & Calendar Enhancer + Study Timer + Cat Mascot

**Campus Cat Mate**는 성균관대학교 iCampus 환경을 더 편하게 만들기 위해 제작된 Chrome 확장 프로그램입니다.  
대시보드·캘린더 UI 개선, 귀여운 고양이 마스코트와 포인트 시스템, 공부 타이머를 제공합니다.

---

## ✨ 주요 기능

### 📌 1. iCampus 대시보드 개선
- 완료된 항목 **일괄 펼치기**
- **D-Day 배지 표시** (오늘 / 임박 / 주의)

### 📅 2. 캘린더 UI 개선
- 과목별 일정 그룹핑 → 아코디언 자동 생성
- Proxy 이벤트 카드 기반으로 클릭 충돌 제거
- 월 이동 / 데이터 재로딩 시에도 안정적인 재빌드
- “접힌 항목 펼치기” 버튼으로 한 번에 모두 펼치기

### 🎮 3. 고양이 마스코트 (Cat Mascot)
- 화면 하단을 자유롭게 돌아다니는 고양이
- 드래그해서 집어 들고, 던지면 탱탱볼처럼 튕겨 나오는 물리 기반 움직임 & 충돌 처리
- 앉기 / 걷기 / 점프 모션 애니메이션
- 페이지의 DOM 요소를 감지하여 “바닥”으로 인식
- 리본·모자 등 악세서리 장착 가능
- 설정에서 **마스코트 ON/OFF 토글** 제공

### ⏱️ 4. 공부 타이머 (Study Timer)
- iCampus와 독립적으로 작동하는 공부 타이머
- 텍스트 드래그 → 우클릭 → **“공부 시간 측정”** 시 작업명·세부내용 자동 프리필
- 백그라운드 상태에서도 1초 단위로 타이머 유지  
  (Chrome Offscreen Document API 사용)
- 학습 기록을 로컬에 저장하고, 날짜별 목록으로 확인 가능
- 기록을 **원시 세션 CSV / 일간 요약 CSV** 형태로 내보내기

### ⭐ 5. 포인트 & 상점
- 대시보드/캘린더 접속, 과제 제출, 공부 타이머 보상으로 포인트 획득
- 포인트로 악세서리·컬러 프리셋 구매 가능
- 포인트 조작 방지를 위해 **HMAC 기반 포인트 토큰 구조** 사용  
  (포인트 증가는 모두 background에서만 처리)

### 📊 6. 로그 관리
- 설정 탭에서 **기간별 CSV 내보내기**
- `N`일 이전 로그 일괄 삭제, 전체 로그 삭제 기능 제공
- 자동 로그 정리(기본 180일) 정책 적용

---

## 📸 스크린샷

![고양이 마스코트 & 상점](./docs/cat-mascot-custom.jpg)
![캘린더 개선 예시](./docs/calendar-before-after.jpg)
![공부 타이머 예시](./docs/study-timer.jpg)
![대시보드 D-Day 예시](./docs/d-day-badge.jpg)

---

## 📦 설치 방법

### 🟦 Chrome Web Store (권장)

- Chrome Web Store:  
  https://chromewebstore.google.com/detail/campus-cat-mate/dhfpfhdfnhocmheengpmlbnfhmfiimhe?authuser=0&hl=ko 

브라우저에서 위 링크를 열고 **“Chrome에 추가”** 버튼을 누르면 설치됩니다.

### 🟩 개발자 모드 설치 (ZIP)

1. GitHub에서 이 레포지토리를 연 뒤 **Code → Download ZIP**
2. ZIP 압축 해제
3. Chrome 주소창에 `chrome://extensions/` 입력 후 이동
4. 우측 상단에서 **개발자 모드** 활성화
5. **“압축해제된 확장 프로그램 로드”** 버튼 클릭
6. 방금 압축 해제한 폴더를 선택하면 설치 완료

설치 후 브라우저 우측 상단의 퍼즐 모양 아이콘에서  
**Campus Cat Mate**를 고정(핀 아이콘)하면 더 편하게 열 수 있습니다.

---

## ⚠️ 이용 시 주의사항 · 책임 범위

- 본 확장 프로그램은 **SKKU iCampus와 공식적으로 연동된 제품이 아닙니다.**
- 확장 프로그램은 UI 개선 및 편의 기능 제공에만 동작하며,
  **시험·퀴즈·과제 제출 기능을 변경하거나 개입하지 않습니다.**
- 평가 환경(시험·퀴즈 등)에서의 확장 프로그램 **활성화 여부는 사용자가 직접 관리해야 합니다.** 
- 확장 프로그램 사용으로 인해  인해 발생할 수 있는 문제에 대해 **제작자는 책임을 지지 않습니다.**

---

## 📁 프로젝트 구조

```text
campus-cat-mate/
├── assets/               # 고양이 스프라이트 시트, 악세서리, 썸네일 이미지
├── cat-mascot/           # 마스코트 엔진 (ground / sprite / accessories / color UI)
├── docs/                 # README용 스크린샷 및 문서
├── popup/                # 상점 · 타이머 · 설정 UI
├── calendarUI.js/.css    # 캘린더 개선 기능
├── dashboardUI.js/.css   # 대시보드 개선 기능
├── dday_badge.js/.css    # 마감일(D-Day) 배지 표시
├── background.js         # 타이머, 포인트, offscreen 관리
├── offscreen_timer.*     # Offscreen Document 타이머 유지용 문서
├── manifest.json         # Chrome 확장 설정(MV3)
├── popup.html/.css/.js   # 팝업(Shop/Timer/Settings) 루트
└── README.md
```
---

## 🛠 기술 스택

- **Chrome Extensions MV3**
- **JavaScript (ES6)** / HTML / CSS
- **Offscreen Documents API** (백그라운드 타이머 유지)
- **MutationObserver** 기반 iCampus DOM 변화 감지·UI 리빌드
- **WebCrypto API (HMAC-SHA256)** 기반 포인트 토큰
- Chrome Storage (`chrome.storage.local`)을 이용한 로컬 데이터 관리

---

## 🤝 기여하기
Pull Request, Issue 모두 환영합니다.  
버그 제보, UI 개선 제안, 악세서리/기능 개선 기여도 모두 환영합니다.  

- Issues: https://github.com/SWKHJ/skku-icampus-UIenhancer/issues  

---

## 📜 라이선스
- **소스코드:** MIT License

## 🎨 아트 리소스 라이선스 (고양이 스프라이트·악세서리)

본 확장 프로그램의 고양이 스프라이트 및 악세서리 이미지는 개인 제작 아트이며  
다음 라이선스(CC BY-NC 4.0)에 따라 사용을 허용합니다:

- ✔ 비상업적 목적의 사용, 수정, 2차 창작, 재배포 허용  
- ✔ 본 아트를 포함한 프로젝트 제작 가능  
- ✔ 확장 프로그램 소개·리뷰·영상·블로그 등에서 자유로운 활용 가능  
- ❌ 상업적 사용(판매·유료 서비스·광고 기반 재배포 등) 금지  
- ❌ 아트 리소스 단독 판매·배포 금지  

라이선스 전문: https://creativecommons.org/licenses/by-nc/4.0/

---

## 📝 개발자 메모

Campus Cat Mate는

> “iCampus에서의 학습 경험을,  
> 조금 더 편리하고 즐겁게 만들어보자”

라는 아이디어에서 출발한 프로젝트입니다.

학생이 만든, 학생을 위한 확장 프로그램으로  
앞으로도 조금씩 발전시키며 업데이트해 나갈 예정입니다.
