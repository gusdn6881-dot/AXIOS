# 🔮 TradingAgents - 자율 트레이딩 에이전트 모바일 & 웹 플랫폼

이 프로젝트는 오픈소스 멀티에이전트 금융 토론 프레임워크인 [TauricResearch/TradingAgents](https://github.com/TauricResearch/TradingAgents)를 토대로, 로컬 대형 언어 모델(Ollama - Gemma)과 격리된 파이썬 코드 실행 환경(E2B Sandbox)을 연동하여 **추가 부담금 0원(100% 무료)**으로 구동 및 운용 가능한 **초호화 모바일 친화형 자율 트레이딩 대시보드**입니다.

모바일 PWA(Progressive Web App)를 기본 탑재하여, 스마트폰의 홈 화면에 등록하면 언제든 독립된 모바일 네이티브 앱 형태로 로컬 시스템을 관제하고 분석 시뮬레이션을 가동할 수 있습니다.

---

## 🌟 핵심 특징

1. **에이전트 협동 토론 파이프라인**: 
   - **Technical Analyst (기술 분석 에이전트)**: E2B Sandbox에서 파이썬 코드를 실행하여 최신 시세(Yahoo Finance)를 로드하고, SMA, EMA, RSI, MACD 지표 연산 및 차트 시각화(SVG/PNG)를 자동 생성합니다.
   - **Fundamental Analyst (기본 가치 분석 에이전트)**: E2B Sandbox에서 기업 재무제표(ROE, P/E, EPS, 부채비율 등)를 크롤링하여 기본 밸류에이션 리포트를 생성합니다.
   - **Sentiment Specialist (시장 심리 분석 에이전트)**: 뉴스 여론 동향 및 탐욕/공포 기류 센티멘트를 계량화합니다.
   - **Risk Manager (리스크 제어관 에이전트)**: 변동성을 기준으로 자금 배분 규칙(Kelly Criterion 등)과 손절선(Stop-loss), 추천 포트폴리오 진입 비중(%)을 가이드라인으로 수립합니다.
   - **Portfolio Manager (대표 펀드 매니저 에이전트)**: 4대 전문가의 보고서를 집약하여, 내부 황소(Bull) vs 곰(Bear) 의견을 대조하는 끝장 토론을 거친 후 최종 BUY/SELL/HOLD 결정을 선포합니다.
2. **100% 무료 기동 아키텍처**:
   - 로컬 Ollama 모델(Gemma)을 사용하여 추론 비용이 영구히 0원입니다.
   - E2B Sandbox 무료 개발자 크레딧을 사용하여 클라우드 컨테이너 코드 실행이 완전히 무료입니다.
   - Cloudflare Tunnel 무료 서비스를 이용하여 별도의 포트포워딩, 외부 망 가입비용 없이 모바일에서 안전한 암호화 주소로 내 PC에 무상 원격 접속합니다.
3. **프리미엄 우주적 글래스모피즘 UI**:
   - 다크 모드, 네온 아바타 펄스 이펙트, 실시간 콘솔 및 차트 렌더러가 장착되어 고급스러운 시각 경험을 선사합니다.
4. **PWA Standalone 지원**:
   - 모바일 Safari/Chrome에서 주소창 없이 네이티브 앱 상태로 단독 실행됩니다.

---

## 🛠️ 개발 시작하기 (로컬 설치)

### 1. 패키지 의존성 설치
프로젝트의 루트 폴더(`_company/projects/trading-agents`)로 이동하여 의존성 라이브러리를 설치합니다.
```bash
npm install
```

### 2. 환경 변수 설정
`.env` 파일을 메모장이나 VS Code로 열고 다음과 같이 설정해 줍니다.
```env
# E2B Sandbox API Key (https://e2b.dev/ 에서 이메일로 5초 만에 무료 발급)
E2B_API_KEY=sbx_your_e2b_api_key_here

# Ollama API 주소 (로컬 구동시 기본값)
OLLAMA_HOST=http://localhost:11434

# 트레이딩 에이전트에 적용할 기본 로컬 모델명 (미리 ollama pull 해두어야 함)
DEFAULT_MODEL=gemma2:2b
```

### 3. 애플리케이션 실행

#### 개발 모드 (Vite Dev Server + Express Proxy API)
프론트엔드 변경사항을 실시간 반영하면서 개발하고 테스트할 때 사용합니다:
- **API 프록시 서버 실행** (포트 3000):
  ```bash
  npm run server
  ```
- **Vite 개발 서버 실행** (포트 5173):
  ```bash
  npm run dev
  ```

#### 프로덕션 모드 (빌드 후 단일 서버 통합 구동)
실제 모바일 기기에서 단독으로 돌릴 때에는 전체 빌드를 완료한 후 단일 서버로 실행하는 것이 가장 강력하고 안정적입니다:
- **프로젝트 빌드**:
  ```bash
  npm run build
  ```
- **서버 단독 실행** (포트 3000에서 프론트엔드와 API 백엔드를 모두 원스톱 서비스):
  ```bash
  npm run start
  ```

---

## 📱 모바일에서 100% 무료 단독 운용하는 방법

공인 IP나 포트 포워딩, 도메인 구매 없이 **모바일 LTE/5G 환경에서 집 컴퓨터의 Ollama와 E2B를 완벽하게 무료로 제어하는 방법**입니다.

### 1. Cloudflare Tunnel 구동 (평생 무료 터널링)
터미널(PowerShell 또는 bash)을 열고, 내 PC의 통합 서버가 켜진 상태(포트 3000 또는 dev 포트 5173)에서 아래 명령어를 실행합니다:
```bash
npx cloudflared tunnel --url http://localhost:3000
```
- 실행 후 터미널 창에 `https://[임의의문자열].trycloudflare.com` 주소가 자동으로 출력됩니다.
- **이 주소가 모바일에서 전 세계 어디서든 내 PC의 TradingAgents로 접속하게 해주는 암호화 주소입니다!**

### 2. 모바일 홈 화면에 앱으로 추가 (PWA Standalone)
1. 스마트폰(iPhone의 Safari 또는 Android의 Chrome)에서 위에서 발급받은 `https://[임의의문자열].trycloudflare.com` 터널 주소로 접속합니다.
2. 브라우저의 **[공유]** 또는 **[메뉴]** 버튼을 터치합니다.
3. **[홈 화면에 추가] (Add to Home Screen)**를 선택합니다.
4. 홈 화면에 🔮 모양의 **TradingAgents** 앱 아이콘이 생성됩니다.
5. 이를 터치하여 실행하면, **주소창이 완전히 사라진 상태로 초호화 인터페이스를 탑재한 모바일 독립 앱처럼 구동됩니다.**

### 3. 모바일에서 로컬 Ollama 제어법 (선택사항)
외부 모바일 네트워크에서 시뮬레이션을 돌릴 때 로컬 Ollama를 외부에서 받아야 하므로 다음 두 방법 중 하나를 선택합니다:
- **방법 A (가장 권장 - 로컬 서버 브릿지)**:
  - 본 애플리케이션의 `server.js` 백엔드가 이미 로컬망에서 Ollama(`http://localhost:11434`)와 다이렉트로 결합되어 프록시해 줍니다. 
  - 따라서 모바일 앱 우측 상단 ⚙️ 설정을 눌러 **[🎮 데모 체험 모드]**를 끄기만 하면 다른 설정 없이 백엔드 프록시를 타고 로컬 LLM 추론이 자동으로 연결됩니다.
- **방법 B (Ollama 자체 터널링)**:
  - PC에서 새로운 터미널을 열고 Ollama 포트 자체를 터널링합니다:
    ```bash
    npx cloudflared tunnel --url http://localhost:11434
    ```
  - 발급받은 Ollama 터널용 주소를 모바일 앱 설정창의 `Ollama Base URL`에 넣어주면 다이렉트로 외부에서 로컬 AI 모델을 원격 호출합니다.

---

## 🎯 데모 모드 (Demo Mode) 내장
E2B API Key 발급이나 로컬 PC에 Ollama가 설치되지 않은 상황에서도, 우측 상단 ⚙️ 설정을 누르고 **[🎮 데모 체험 모드]**를 켜두시면 고충실도 시뮬레이션 데이터를 즉시 돌려볼 수 있어 UI 및 에이전트 워크플로우의 미려함을 즉각 감상하실 수 있습니다!
