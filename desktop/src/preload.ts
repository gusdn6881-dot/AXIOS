// 렌더러에 안전하게 노출되는 API (contextIsolation).
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('connect', {
  // 설정
  getConfig: () => ipcRenderer.invoke('config:get'),
  setConfig: (patch: any) => ipcRenderer.invoke('config:set', patch),
  // 🛡️ 안전 모드 (GPU 끄기) — 흰 화면/크래시 대비
  safeModeGet: () => ipcRenderer.invoke('safemode:get'),
  safeModeSet: (on: boolean) => ipcRenderer.invoke('safemode:set', on),
  relaunch: () => ipcRenderer.invoke('app:relaunch'),
  ttsSpeak: (text: string) => ipcRenderer.invoke('tts:speak', text),  // 🔊 Qwen3-TTS
  openDiagnostics: () => ipcRenderer.invoke('diag:open'),

  // 비서 엔진
  run: (text: string) => ipcRenderer.invoke('company:run', text),         // 통합 에이전트 (혼자 처리 or 팀 위임 자동 판단)
  stop: () => ipcRenderer.invoke('company:stop'),                          // 생성 중단
  reset: () => ipcRenderer.invoke('company:reset'),
  listModels: () => ipcRenderer.invoke('models:list'),
  getWorkspace: () => ipcRenderer.invoke('workspace:get'),
  pickWorkspace: () => ipcRenderer.invoke('workspace:pick'),
  // 🧠 두뇌 / 지식 네트워크
  brainGraph: () => ipcRenderer.invoke('brain:graph'),
  brainList: () => ipcRenderer.invoke('brain:list'),
  brainCount: () => ipcRenderer.invoke('brain:count'),
  brainAdd: (text: string) => ipcRenderer.invoke('brain:add', text),
  brainDelete: (id: string) => ipcRenderer.invoke('brain:delete', id),
  brainExportTraining: (hf: any) => ipcRenderer.invoke('brain:exportTraining', hf),  // 🧬 장기 기억 (로컬 JSONL)
  // ⚡ 단기=GitHub · 🧬 장기=HuggingFace
  memStatus: () => ipcRenderer.invoke('memstatus'),
  githubPush: () => ipcRenderer.invoke('github:push'),
  githubPull: () => ipcRenderer.invoke('github:pull'),
  hfUpload: () => ipcRenderer.invoke('hf:upload'),
  trainNotebook: () => ipcRenderer.invoke('train:notebook'),
  // 📋 아침 브리핑(능동성) + 트레이
  briefingRun: () => ipcRenderer.invoke('briefing:run'),
  onBriefing: (cb: (t: string) => void) => { const h = (_e: any, t: string) => cb(t); ipcRenderer.on('briefing:show', h); return () => ipcRenderer.removeListener('briefing:show', h); },
  onTrayNewChat: (cb: () => void) => { const h = () => cb(); ipcRenderer.on('tray:newchat', h); return () => ipcRenderer.removeListener('tray:newchat', h); },
  // 🗂️ 관리 — 서비스·연동·대시보드
  servicesList: () => ipcRenderer.invoke('services:list'),
  servicesAdd: (s: any) => ipcRenderer.invoke('services:add', s),
  servicesDelete: (id: string) => ipcRenderer.invoke('services:delete', id),
  servicesIntel: () => ipcRenderer.invoke('services:intel'),
  integrationsGet: () => ipcRenderer.invoke('integrations:get'),
  integrationsSave: (patch: any) => ipcRenderer.invoke('integrations:save', patch),
  telegramTest: () => ipcRenderer.invoke('telegram:test'),
  // 🔌 서비스 정의 기반 API 패널
  apiGet: () => ipcRenderer.invoke('api:get'),
  apiSave: (serviceId: string, values: any) => ipcRenderer.invoke('api:save', serviceId, values),
  openExternal: (url: string) => ipcRenderer.invoke('open:external', url),
  // 📺 YouTube
  youtubeGet: () => ipcRenderer.invoke('youtube:get'),
  youtubeOAuth: () => ipcRenderer.invoke('youtube:oauth'),
  // 🔌 MCP
  mcpGet: () => ipcRenderer.invoke('mcp:get'),
  mcpSave: (cfg: any) => ipcRenderer.invoke('mcp:save', cfg),
  mcpTest: () => ipcRenderer.invoke('mcp:test'),
  mcpTools: () => ipcRenderer.invoke('mcp:tools'),
  dashboardStats: () => ipcRenderer.invoke('dashboard:stats'),
  // 📋 태스크 보드
  tasksList: () => ipcRenderer.invoke('tasks:list'),
  tasksAdd: (title: string) => ipcRenderer.invoke('tasks:add', title),
  tasksDone: (id: string) => ipcRenderer.invoke('tasks:done', id),
  tasksCancel: (id: string) => ipcRenderer.invoke('tasks:cancel', id),
  tasksResults: () => ipcRenderer.invoke('tasks:results'),
  // ✅ 승인 큐
  approvalsList: () => ipcRenderer.invoke('approvals:list'),
  approvalsApprove: (id: string) => ipcRenderer.invoke('approvals:approve', id),
  approvalsReject: (id: string) => ipcRenderer.invoke('approvals:reject', id),
  approvalsTest: () => ipcRenderer.invoke('approvals:test'),
  // 💰 매출 대시보드 (별도 창)
  openRevenue: () => ipcRenderer.invoke('revenue:open'),
  revReady: () => ipcRenderer.invoke('revenue:ready'),
  reportBriefing: () => ipcRenderer.invoke('report:briefing'),
  reportSpeak: (text: string) => ipcRenderer.invoke('report:speak', text),
  revRefresh: () => ipcRenderer.invoke('revenue:refresh'),
  revOpenSettings: () => ipcRenderer.invoke('revenue:openSettings'),
  onRevenueState: (cb: (m: any) => void) => {
    const h = (_e: any, m: any) => cb(m);
    ipcRenderer.on('revenue:state', h);
    return () => ipcRenderer.removeListener('revenue:state', h);
  },
  onEngineEvent: (cb: (e: any) => void) => {
    const h = (_e: any, ev: any) => cb(ev);
    ipcRenderer.on('engine:event', h);
    return () => ipcRenderer.removeListener('engine:event', h);
  },

  // 광장
  plazaEnter: () => ipcRenderer.invoke('plaza:enter'),
  plazaLeave: () => ipcRenderer.invoke('plaza:leave'),
  plazaSend: (text: string) => ipcRenderer.invoke('plaza:send', text),
  plazaTopic: (text: string) => ipcRenderer.invoke('plaza:topic', text),
  plazaDemoBot: (on: boolean) => ipcRenderer.invoke('plaza:demobot', on),
  plazaGrade: () => ipcRenderer.invoke('plaza:grade'),
  plazaDbUrl: () => ipcRenderer.invoke('plaza:dburl'),
  onPlazaPeer: (cb: (m: any) => void) => {
    const h = (_e: any, m: any) => cb(m);
    ipcRenderer.on('plaza:peer', h);
    return () => ipcRenderer.removeListener('plaza:peer', h);
  },

  // 📱 폰 웹 리모컨 — 같은 와이파이에서 폰 브라우저로 운영 지휘
  remoteInfo: () => ipcRenderer.invoke('remote:info'),

  // 🧠 두뇌 분야별 성장 통계
  brainStats: () => ipcRenderer.invoke('brain:stats'),

  // 📅 Google Calendar OAuth 자동 연결
  calendarOAuth: () => ipcRenderer.invoke('calendar:oauth'),

  // 🧬 장기 기억 — 학습 데이터 빌드·업로드
  brainBuildDataset: (augment: boolean) => ipcRenderer.invoke('brain:buildDataset', augment),
  brainBuildPreference: () => ipcRenderer.invoke('brain:buildPreference'),
  brainModelName: () => ipcRenderer.invoke('brain:modelName'),
  hfUploadBrain: () => ipcRenderer.invoke('hf:uploadBrain'),
  hfUploadPreference: () => ipcRenderer.invoke('hf:uploadPreference'),
  methodsList: () => ipcRenderer.invoke('methods:list'),
  brainLinkBrain: (repo: string, pw: string) => ipcRenderer.invoke('brain:linkBrain', repo, pw),
  onDatasetProgress: (cb: (d: any) => void) => {
    const h = (_e: any, d: any) => cb(d);
    ipcRenderer.on('dataset:progress', h);
    return () => ipcRenderer.removeListener('dataset:progress', h);
  },

  // 🔌 에제르 브릿지 상태
  bridgeStatus: () => ipcRenderer.invoke('bridge:status'),

  // 📁 파일시스템 (에이전트 도구)
  fsTree: (dir: string) => ipcRenderer.invoke('fs:tree', dir),
  fsRead: (filePath: string) => ipcRenderer.invoke('fs:read', filePath),
  fsWrite: (filePath: string, content: string) => ipcRenderer.invoke('fs:write', filePath, content),
  fsReveal: (filePath: string) => ipcRenderer.invoke('fs:reveal', filePath),
  pathForFile: (name: string) => ipcRenderer.invoke('path:forFile', name),

  // ⌨️ 터미널
  termRun: (cmd: string) => ipcRenderer.invoke('term:run', cmd),
  termKill: () => ipcRenderer.invoke('term:kill'),

  // 🤖 에이전트 자동화 스케줄러
  automationRegister: (agentId: string, task: string, intervalHours: number) => ipcRenderer.invoke('automation:register', agentId, task, intervalHours),
  automationList: () => ipcRenderer.invoke('automation:list'),
  automationStop: (id: string) => ipcRenderer.invoke('automation:stop', id),

  // ⚪ 내장 로컬 AI 엔진 및 HuggingFace 다운로더
  localStatus: () => ipcRenderer.invoke('local:status'),
  localModels: () => ipcRenderer.invoke('local:models'),
  localStart: (modelPath: string) => ipcRenderer.invoke('local:start', modelPath),
  localStop: () => ipcRenderer.invoke('local:stop'),
  localDelete: (filePath: string) => ipcRenderer.invoke('local:delete', filePath),
  localSetOptions: (o: any) => ipcRenderer.invoke('local:setOptions', o),
  hfSearch: (q: string) => ipcRenderer.invoke('hf:search', q),
  hfFiles: (repo: string) => ipcRenderer.invoke('hf:files', repo),
  hfDownload: (repo: string, file: string) => ipcRenderer.invoke('hf:download', repo, file),
  hfRecommended: () => ipcRenderer.invoke('hf:recommended'),
  onLocalStatus: (cb: (s: any) => void) => {
    const h = (_e: any, s: any) => cb(s);
    ipcRenderer.on('local:statusChange', h);
    return () => ipcRenderer.removeListener('local:statusChange', h);
  },
  onHfProgress: (cb: (p: any) => void) => {
    const h = (_e: any, p: any) => cb(p);
    ipcRenderer.on('hf:progress', h);
    return () => ipcRenderer.removeListener('hf:progress', h);
  },

  // 🚀 운영 사이클 및 회원 연동
  opsStart: () => ipcRenderer.invoke('ops:start'),
  opsStop: () => ipcRenderer.invoke('ops:stop'),
  opsStatus: () => ipcRenderer.invoke('ops:status'),
  authCurrent: () => ipcRenderer.invoke('auth:current'),
  authSignup: (email: string, pw: string, profile: any) => ipcRenderer.invoke('auth:signup', email, pw, profile),
  authLogin: (email: string, pw: string) => ipcRenderer.invoke('auth:login', email, pw),
  authLogout: () => ipcRenderer.invoke('auth:logout'),
  officeOpen: () => ipcRenderer.invoke('office:open'),
});

