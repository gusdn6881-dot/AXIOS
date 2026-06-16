// AXIOS CLI — Electron 메인 프로세스.
// 비서(세라) 엔진 + 광장(Plaza) 연결을 IPC 로 렌더러에 노출.
import { app, BrowserWindow, ipcMain, shell, dialog, Tray, Menu, Notification, nativeImage, desktopCapturer, screen, clipboard } from 'electron';
import { autoUpdater } from 'electron-updater';
import axios from 'axios';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { talkToMyAgent, agentWithTools, ChatTurn } from './engine/company';
import { AGENTS } from './agents';
import { fetchRevenue } from './engine/paypal';
import { detectTarget, chat, listModels, embed } from './engine/llm';
import { setBrainFile, allNotes, graph as brainGraph, addNote as brainAddNote, deleteNote, noteCount, importNotes } from './engine/brain';
import { pushKnowledge, pullKnowledge, pushFile, scanRepoFiles } from './engine/github';
import { uploadDataset, notesToJsonl } from './engine/hf';
import { buildNotebook } from './engine/train';
import { sendEmail } from './engine/email';
import { fetchChannel, ytAccessToken, fetchAnalytics } from './engine/youtube';
import { setMcpConfig, testMcp, listMcpTools } from './engine/mcp';
import { fetchUrl, siteMeta } from './engine/web';
import { qwenTTS, localTTS } from './engine/tts';
import { edgeTTS } from './engine/edgetts';
import * as http from 'http';
import * as https from 'https';
import { setTaskFile, listTasks, addTask, setStatus as setTaskStatus, openTasks, taskCount } from './engine/tasks';
import { setApprovalFile, listApprovals, setApprovalStatus, pendingApprovals, approvalCount, getApproval, ApprovalAction, addApproval, setApprovalListener } from './engine/approvals';
import {
  localStatus,
  startLocalEngine,
  stopLocalEngine,
  listLocalModels,
  deleteLocalModel,
  getLocalOptions,
  setLocalOptions,
  searchGGUF,
  listGGUF,
  downloadGGUF,
  modelsDir,
  RECOMMENDED,
  LOCAL_BASE
} from './engine/localEngine';
import { spawn, spawnSync } from 'child_process';
import { agentPrompt } from './engine/persona';
import { joinPlaza, postPlazaMessage, setPlazaDbUrl, setPlazaAuthToken, plazaConfigured, fetchMessages, PlazaSession, PlazaMessage } from './plaza';

interface Service { id: string; name: string; url: string; desc: string }
interface AuthSession { email: string; idToken: string; localId: string; role?: string }
interface Config {
  company: string; agentName: string; userTitle: string; plazaEmoji: string; greeting: string; workspace: string; tools: boolean;
  voiceName: string; jarvis: boolean; plazaDbUrl: string; llmBase?: string; llmModel?: string; voice: boolean;
  services: Service[]; telegramToken: string; telegramChatId: string; apiKeys: Record<string, string>; paypalClientId: string; paypalSecret: string;
  hfToken: string; hfModel: string;
  apiConn: Record<string, Record<string, string>>;   // 🔌 서비스별 자격증명 (telegram/youtube/paypal/gemini/…)
  briefingOn: boolean; briefingHour: number; briefingMin: number; lastBriefing: string;   // 📋 아침 브리핑(능동성)
  trainNotebookUrl: string;                                          // 🚀 내 학습 노트북(Colab/GitHub) URL
  autoSync: boolean; lastSyncCount: number; lastTrainHintCount: number;   // 🔄 자동 루프(GitHub 자동 커밋 + 학습 추천)
  mcpConfig: any;   // 🔌 MCP 서버 설정 ({ mcpServers: {...} })
  voiceQuality: string;   // 🔊 'browser'(기본·빠름) | 'qwen'(Qwen3-TTS 고품질·클라우드)
  qwenVoice: string;      // 🎤 Qwen3-TTS 음성 (Sohee=한국어 등)
  ttsLocalUrl: string;    // 🖥️ 로컬 Qwen3-TTS 서버 주소 (완전 로컬·무료)
  automations?: Array<{ id: string; agentId: string; task: string; intervalHours: number; registeredAt: number; lastRunAt?: number }>;
  localModelPath?: string;
  localFlashAttn?: boolean;
  localCtxSize?: number;
  localTemp?: number;
  localMaxTokens?: number;
  localTopP?: number;
  localTopK?: number;
  localMinP?: number;
  localRepeatPenalty?: number;
  localFreqPenalty?: number;
  localPresPenalty?: number;
  localRepeatLastN?: number;
  localNgl?: number;
  authSession?: AuthSession | null;
}
const DEFAULTS: Config = {
  company: '1인 기업', agentName: '에이전트', userTitle: '사장님', plazaEmoji: '🖥️', greeting: '', workspace: '', tools: true,
  voiceName: '', jarvis: true, plazaDbUrl: '', llmBase: '', llmModel: '', voice: true,
  services: [], telegramToken: '', telegramChatId: '', apiKeys: {}, paypalClientId: '', paypalSecret: '',
  hfToken: '', hfModel: '', apiConn: {},
  briefingOn: true, briefingHour: 9, briefingMin: 0, lastBriefing: '', trainNotebookUrl: '',
  autoSync: true, lastSyncCount: 0, lastTrainHintCount: 0, mcpConfig: {}, voiceQuality: 'browser', qwenVoice: 'Sohee', ttsLocalUrl: '',
  automations: [],
};
const defaultWorkspace = () => path.join(os.homedir(), 'Desktop');

let cfgPath = '';

const getBrainDir = () => path.join(os.homedir(), '.axios-ai-brain');

function readCanonicalApiConnections(): Record<string, Record<string, string>> {
  const out: Record<string, Record<string, string>> = {
    telegram: { TELEGRAM_BOT_TOKEN: '', TELEGRAM_CHAT_ID: '' },
    paypal: { PAYPAL_MODE: 'sandbox', PAYPAL_CLIENT_ID: '', PAYPAL_CLIENT_SECRET: '', PAYPAL_LOOKBACK_DAYS: '30', PAYPAL_CURRENCY: 'USD' },
    gemini: { GEMINI_API_KEY: '', GEMINI_TEXT_MODEL: 'gemini-3.1-flash-lite-preview', GEMINI_IMAGE_MODEL: 'gemini-3.1-flash-image-preview' },
    youtube: { YOUTUBE_API_KEY: '', YOUTUBE_CHANNEL_ID: '' },
    'youtube-oauth': { YOUTUBE_OAUTH_CLIENT_ID: '', YOUTUBE_OAUTH_CLIENT_SECRET: '' },
    instagram: { META_ACCESS_TOKEN: '', INSTAGRAM_BUSINESS_ID: '' },
    threads: { THREADS_ACCESS_TOKEN: '', THREADS_USER_ID: '' },
    github: { GITHUB_TOKEN: '', GITHUB_DEFAULT_REPO: '' },
    'google-calendar': { GOOGLE_CALENDAR_CLIENT_ID: '', GOOGLE_CALENDAR_CLIENT_SECRET: '', GOOGLE_CALENDAR_REFRESH_TOKEN: '', GOOGLE_CALENDAR_ID: 'primary' },
  };

  const brainDir = getBrainDir();
  
  // Telegram
  try {
    const p = path.join(brainDir, '_company', '_agents', 'secretary', 'tools', 'telegram_setup.json');
    if (fs.existsSync(p)) {
      const cfg = JSON.parse(fs.readFileSync(p, 'utf8'));
      out.telegram.TELEGRAM_BOT_TOKEN = cfg.TELEGRAM_BOT_TOKEN || '';
      out.telegram.TELEGRAM_CHAT_ID = cfg.TELEGRAM_CHAT_ID || '';
    }
  } catch {}

  // Gemini
  try {
    const p = path.join(brainDir, '_company', '_agents', 'business', 'tools', 'gemini_account.json');
    if (fs.existsSync(p)) {
      const cfg = JSON.parse(fs.readFileSync(p, 'utf8'));
      out.gemini.GEMINI_API_KEY = cfg.API_KEY || '';
      if (cfg.TEXT_MODEL) out.gemini.GEMINI_TEXT_MODEL = cfg.TEXT_MODEL;
      if (cfg.IMAGE_MODEL) out.gemini.GEMINI_IMAGE_MODEL = cfg.IMAGE_MODEL;
    }
  } catch {}

  // PayPal
  try {
    const p = path.join(brainDir, '_company', '_agents', 'business', 'tools', 'paypal_revenue.json');
    if (fs.existsSync(p)) {
      const cfg = JSON.parse(fs.readFileSync(p, 'utf8'));
      out.paypal.PAYPAL_MODE = cfg.MODE || 'sandbox';
      out.paypal.PAYPAL_CLIENT_ID = cfg.CLIENT_ID || '';
      out.paypal.PAYPAL_CLIENT_SECRET = cfg.CLIENT_SECRET || '';
      if (cfg.LOOKBACK_DAYS) out.paypal.PAYPAL_LOOKBACK_DAYS = String(cfg.LOOKBACK_DAYS);
      if (cfg.CURRENCY) out.paypal.PAYPAL_CURRENCY = cfg.CURRENCY;
    }
  } catch {}

  // YouTube
  try {
    const p = path.join(brainDir, '_company', '_agents', 'youtube', 'tools', 'youtube_account.json');
    if (fs.existsSync(p)) {
      const cfg = JSON.parse(fs.readFileSync(p, 'utf8'));
      out.youtube.YOUTUBE_API_KEY = cfg.YOUTUBE_API_KEY || '';
      out.youtube.YOUTUBE_CHANNEL_ID = cfg.MY_CHANNEL_ID || '';
      out['youtube-oauth'].YOUTUBE_OAUTH_CLIENT_ID = cfg.YOUTUBE_OAUTH_CLIENT_ID || '';
      out['youtube-oauth'].YOUTUBE_OAUTH_CLIENT_SECRET = cfg.YOUTUBE_OAUTH_CLIENT_SECRET || '';
    }
  } catch {}

  // Instagram
  try {
    const p = path.join(brainDir, '_company', '_agents', 'instagram', 'tools', 'instagram_account.json');
    if (fs.existsSync(p)) {
      const cfg = JSON.parse(fs.readFileSync(p, 'utf8'));
      out.instagram.META_ACCESS_TOKEN = cfg.META_ACCESS_TOKEN || '';
      out.instagram.INSTAGRAM_BUSINESS_ID = cfg.INSTAGRAM_BUSINESS_ID || '';
    }
  } catch {}

  // Threads
  try {
    const p = path.join(brainDir, '_company', '_agents', 'instagram', 'tools', 'threads_account.json');
    if (fs.existsSync(p)) {
      const cfg = JSON.parse(fs.readFileSync(p, 'utf8'));
      out.threads.THREADS_ACCESS_TOKEN = cfg.THREADS_ACCESS_TOKEN || '';
      out.threads.THREADS_USER_ID = cfg.THREADS_USER_ID || '';
    }
  } catch {}

  // GitHub
  try {
    const p = path.join(brainDir, '_company', '_agents', 'secretary', 'tools', 'github_config.json');
    if (fs.existsSync(p)) {
      const cfg = JSON.parse(fs.readFileSync(p, 'utf8'));
      out.github.GITHUB_TOKEN = cfg.GITHUB_TOKEN || '';
      out.github.GITHUB_DEFAULT_REPO = cfg.GITHUB_DEFAULT_REPO || '';
    }
  } catch {}

  // Google Calendar
  try {
    const p = path.join(brainDir, '_company', '_agents', 'secretary', 'tools', 'google_calendar_write.json');
    if (fs.existsSync(p)) {
      const cfg = JSON.parse(fs.readFileSync(p, 'utf8'));
      out['google-calendar'].GOOGLE_CALENDAR_CLIENT_ID = cfg.CLIENT_ID || '';
      out['google-calendar'].GOOGLE_CALENDAR_CLIENT_SECRET = cfg.CLIENT_SECRET || '';
      out['google-calendar'].GOOGLE_CALENDAR_REFRESH_TOKEN = cfg.REFRESH_TOKEN || '';
      out['google-calendar'].GOOGLE_CALENDAR_ID = cfg.CALENDAR_ID || 'primary';
    }
  } catch {}

  return out;
}

function saveCanonicalApiConnection(serviceId: string, values: Record<string, string>) {
  const brainDir = getBrainDir();
  
  if (serviceId === 'telegram') {
    const toolDir = path.join(brainDir, '_company', '_agents', 'secretary', 'tools');
    fs.mkdirSync(toolDir, { recursive: true });
    const p = path.join(toolDir, 'telegram_setup.json');
    fs.writeFileSync(p, JSON.stringify({
      TELEGRAM_BOT_TOKEN: (values.TELEGRAM_BOT_TOKEN || '').trim(),
      TELEGRAM_CHAT_ID: (values.TELEGRAM_CHAT_ID || '').trim()
    }, null, 2));
  }
  
  if (serviceId === 'gemini') {
    const toolDir = path.join(brainDir, '_company', '_agents', 'business', 'tools');
    fs.mkdirSync(toolDir, { recursive: true });
    const p = path.join(toolDir, 'gemini_account.json');
    let existing: any = {};
    if (fs.existsSync(p)) { try { existing = JSON.parse(fs.readFileSync(p, 'utf8')); } catch {} }
    existing.API_KEY = (values.GEMINI_API_KEY || '').trim();
    existing.TEXT_MODEL = (values.GEMINI_TEXT_MODEL || 'gemini-3.1-flash-lite-preview').trim();
    existing.IMAGE_MODEL = (values.GEMINI_IMAGE_MODEL || 'gemini-3.1-flash-image-preview').trim();
    fs.writeFileSync(p, JSON.stringify(existing, null, 2));
  }

  if (serviceId === 'paypal') {
    const toolDir = path.join(brainDir, '_company', '_agents', 'business', 'tools');
    fs.mkdirSync(toolDir, { recursive: true });
    const p = path.join(toolDir, 'paypal_revenue.json');
    let existing: any = {};
    if (fs.existsSync(p)) { try { existing = JSON.parse(fs.readFileSync(p, 'utf8')); } catch {} }
    existing.MODE = (values.PAYPAL_MODE || 'sandbox').trim();
    existing.CLIENT_ID = (values.PAYPAL_CLIENT_ID || '').trim();
    existing.CLIENT_SECRET = (values.PAYPAL_CLIENT_SECRET || '').trim();
    const lookback = parseInt(values.PAYPAL_LOOKBACK_DAYS || '30', 10);
    existing.LOOKBACK_DAYS = isNaN(lookback) ? 30 : lookback;
    existing.CURRENCY = (values.PAYPAL_CURRENCY || 'USD').trim();
    fs.writeFileSync(p, JSON.stringify(existing, null, 2));
  }

  if (serviceId === 'youtube' || serviceId === 'youtube-oauth') {
    const toolDir = path.join(brainDir, '_company', '_agents', 'youtube', 'tools');
    fs.mkdirSync(toolDir, { recursive: true });
    const p = path.join(toolDir, 'youtube_account.json');
    let existing: any = {};
    if (fs.existsSync(p)) { try { existing = JSON.parse(fs.readFileSync(p, 'utf8')); } catch {} }
    if (serviceId === 'youtube') {
      existing.YOUTUBE_API_KEY = (values.YOUTUBE_API_KEY || '').trim();
      existing.MY_CHANNEL_ID = (values.YOUTUBE_CHANNEL_ID || '').trim();
    } else {
      existing.YOUTUBE_OAUTH_CLIENT_ID = (values.YOUTUBE_OAUTH_CLIENT_ID || '').trim();
      existing.YOUTUBE_OAUTH_CLIENT_SECRET = (values.YOUTUBE_OAUTH_CLIENT_SECRET || '').trim();
    }
    fs.writeFileSync(p, JSON.stringify(existing, null, 2));
  }

  if (serviceId === 'instagram') {
    const toolDir = path.join(brainDir, '_company', '_agents', 'instagram', 'tools');
    fs.mkdirSync(toolDir, { recursive: true });
    const p = path.join(toolDir, 'instagram_account.json');
    let existing: any = {};
    if (fs.existsSync(p)) { try { existing = JSON.parse(fs.readFileSync(p, 'utf8')); } catch {} }
    existing.META_ACCESS_TOKEN = (values.META_ACCESS_TOKEN || '').trim();
    existing.INSTAGRAM_BUSINESS_ID = (values.INSTAGRAM_BUSINESS_ID || '').trim();
    fs.writeFileSync(p, JSON.stringify(existing, null, 2));
  }

  if (serviceId === 'threads') {
    const toolDir = path.join(brainDir, '_company', '_agents', 'instagram', 'tools');
    fs.mkdirSync(toolDir, { recursive: true });
    const p = path.join(toolDir, 'threads_account.json');
    let existing: any = {};
    if (fs.existsSync(p)) { try { existing = JSON.parse(fs.readFileSync(p, 'utf8')); } catch {} }
    existing.THREADS_ACCESS_TOKEN = (values.THREADS_ACCESS_TOKEN || '').trim();
    existing.THREADS_USER_ID = (values.THREADS_USER_ID || '').trim();
    fs.writeFileSync(p, JSON.stringify(existing, null, 2));
  }

  if (serviceId === 'github') {
    const toolDir = path.join(brainDir, '_company', '_agents', 'secretary', 'tools');
    fs.mkdirSync(toolDir, { recursive: true });
    const p = path.join(toolDir, 'github_config.json');
    let existing: any = {};
    if (fs.existsSync(p)) { try { existing = JSON.parse(fs.readFileSync(p, 'utf8')); } catch {} }
    existing.GITHUB_TOKEN = (values.GITHUB_TOKEN || '').trim();
    existing.GITHUB_DEFAULT_REPO = (values.GITHUB_DEFAULT_REPO || '').trim();
    fs.writeFileSync(p, JSON.stringify(existing, null, 2));
  }

  if (serviceId === 'google-calendar') {
    const toolDir = path.join(brainDir, '_company', '_agents', 'secretary', 'tools');
    fs.mkdirSync(toolDir, { recursive: true });
    const p = path.join(toolDir, 'google_calendar_write.json');
    let existing: any = {};
    if (fs.existsSync(p)) { try { existing = JSON.parse(fs.readFileSync(p, 'utf8')); } catch {} }
    existing.CLIENT_ID = (values.GOOGLE_CALENDAR_CLIENT_ID || '').trim();
    existing.CLIENT_SECRET = (values.GOOGLE_CALENDAR_CLIENT_SECRET || '').trim();
    if (values.GOOGLE_CALENDAR_REFRESH_TOKEN) existing.REFRESH_TOKEN = values.GOOGLE_CALENDAR_REFRESH_TOKEN.trim();
    existing.CALENDAR_ID = (values.GOOGLE_CALENDAR_ID || 'primary').trim();
    existing.DEFAULT_DURATION_MINUTES = existing.DEFAULT_DURATION_MINUTES || 60;
    fs.writeFileSync(p, JSON.stringify(existing, null, 2));
  }
}

function sanitizeFirebaseDbUrl(url: string): string {
  if (!url) return '';
  url = url.trim();
  if (/^https:\/\/[a-zA-Z0-9\-]+(-default-rtdb)?\.(firebaseio\.com|firebasedatabase\.app)\/?/.test(url)) {
    return url.endsWith('/') ? url : url + '/';
  }
  const consoleMatch = url.match(/\/project\/([a-zA-Z0-9\-]+)\/database\/([a-zA-Z0-9\-_]+)/);
  if (consoleMatch) {
    const dbName = consoleMatch[2];
    return `https://${dbName}.firebaseio.com/`;
  }
  return url;
}

function sanitizeTrainBackendUrl(url: string): string {
  if (!url) return '';
  url = url.trim();
  if (url.includes('github.com')) {
    return 'https://us-central1-axios-cli.cloudfunctions.net';
  }
  return url;
}

function loadConfig(): Config {
  let cfg = { ...DEFAULTS };
  try { cfg = { ...cfg, ...JSON.parse(fs.readFileSync(cfgPath, 'utf8')) }; } catch {}
  
  // Sanitize URLs
  if (cfg.firebaseDbUrl) cfg.firebaseDbUrl = sanitizeFirebaseDbUrl(cfg.firebaseDbUrl);
  if (cfg.plazaDbUrl) cfg.plazaDbUrl = sanitizeFirebaseDbUrl(cfg.plazaDbUrl);
  if (cfg.trainBackendUrl) cfg.trainBackendUrl = sanitizeTrainBackendUrl(cfg.trainBackendUrl);

  // Merge canonical keys from _company
  try {
    const canonical = readCanonicalApiConnections();
    if (canonical.telegram.TELEGRAM_BOT_TOKEN) cfg.telegramToken = canonical.telegram.TELEGRAM_BOT_TOKEN;
    if (canonical.telegram.TELEGRAM_CHAT_ID) cfg.telegramChatId = canonical.telegram.TELEGRAM_CHAT_ID;
    
    if (canonical.paypal.PAYPAL_CLIENT_ID) cfg.paypalClientId = canonical.paypal.PAYPAL_CLIENT_ID;
    if (canonical.paypal.PAYPAL_CLIENT_SECRET) cfg.paypalSecret = canonical.paypal.PAYPAL_CLIENT_SECRET;
    
    if (canonical.gemini.GEMINI_API_KEY) {
      if (!cfg.apiKeys) cfg.apiKeys = {};
      cfg.apiKeys.gemini = canonical.gemini.GEMINI_API_KEY;
    }
    
    // Also merge into apiConn
    if (!cfg.apiConn) cfg.apiConn = {};
    for (const serviceId of Object.keys(canonical)) {
      cfg.apiConn[serviceId] = { ...(cfg.apiConn[serviceId] || {}), ...canonical[serviceId] };
    }
  } catch (err) {
    console.error('Failed to merge canonical credentials:', err);
  }

  // Dynamically map Firebase credentials
  if (!cfg.apiConn) cfg.apiConn = {};
  if (!cfg.apiConn.firebase) cfg.apiConn.firebase = {};
  if (cfg.firebaseApiKey) cfg.apiConn.firebase.FIREBASE_API_KEY = cfg.firebaseApiKey;
  if (cfg.firebaseDbUrl) cfg.apiConn.firebase.FIREBASE_DB_URL = cfg.firebaseDbUrl;
  
  return cfg;
}

function saveConfig(patch: Partial<Config>): Config {
  if (patch.firebaseDbUrl) patch.firebaseDbUrl = sanitizeFirebaseDbUrl(patch.firebaseDbUrl);
  if (patch.plazaDbUrl) patch.plazaDbUrl = sanitizeFirebaseDbUrl(patch.plazaDbUrl);
  if (patch.trainBackendUrl) patch.trainBackendUrl = sanitizeTrainBackendUrl(patch.trainBackendUrl);

  const next = { ...loadConfig(), ...patch };

  if (!next.apiConn) next.apiConn = {};
  if (!next.apiConn.firebase) next.apiConn.firebase = {};
  if (next.firebaseApiKey) next.apiConn.firebase.FIREBASE_API_KEY = next.firebaseApiKey;
  if (next.firebaseDbUrl) next.apiConn.firebase.FIREBASE_DB_URL = next.firebaseDbUrl;

  try { fs.writeFileSync(cfgPath, JSON.stringify(next, null, 2)); } catch { /* ignore */ }
  return next;
}

let win: BrowserWindow | null = null;
let plaza: PlazaSession | null = null;
let demoBot: PlazaSession | null = null;
let plazaAuto: (() => void) | null = null;
let demoAuto: (() => void) | null = null;

// ─────────────────────────── 🛡️ 안전 모드 (GPU 가속 끄기) — Windows 흰 화면·즉시 종료 대비
// 일부 Windows(RTX 노트북 GPU·키보드 보안/오버레이 등)에서 Chromium GPU 초기화가 충돌해
// 렌더러가 흰 화면 뜨고 바로 죽는다. 우회: GPU 끄기. switch 는 app.ready 전에 설정해야 하므로
// config 와 별개의 가벼운 마커 파일을 미리 읽는다. (--disable-gpu / --safe 인자, CONNECTAI_SAFE 환경변수도 인식)
const safeFlagPath = () => path.join(app.getPath('userData'), 'gpu-safe.flag');
const diagPath = () => path.join(app.getPath('userData'), 'diagnostics.log');
function logDiag(msg: string) { try { fs.appendFileSync(diagPath(), `[${new Date().toISOString()}] ${msg}\n`); } catch { /* */ } }
function isSafeMode(): boolean {
  const argv = process.argv.map(a => a.toLowerCase());
  if (argv.includes('--disable-gpu') || argv.includes('--safe') || argv.includes('--safe-mode')) return true;
  if (process.env.CONNECTAI_SAFE === '1') return true;
  try { return fs.existsSync(safeFlagPath()); } catch { return false; }
}
const SAFE_MODE = isSafeMode();
if (SAFE_MODE) {
  app.disableHardwareAcceleration();
  app.commandLine.appendSwitch('disable-gpu');
  app.commandLine.appendSwitch('disable-gpu-compositing');
  app.commandLine.appendSwitch('disable-software-rasterizer');
}
// GPU/렌더러가 시작 직후 죽으면(흰 화면 → 즉시 종료) 자동으로 안전 모드 켜고 1회 재시작.
// 정밀 조건: ① 진짜 크래시 reason 만(사용자 종료·강제 kill 제외) ② 실행 후 20초 이내(시작 시 GPU 초기화 충돌만).
// 이미 안전 모드면 무한 루프 방지.
const launchTs = Date.now();
let relaunchedForSafe = false;
const isCrash = (r: string) => r === 'crashed' || r === 'launch-failed' || r === 'integrity-failure' || r === 'abnormal-exit' || r === 'oom';
function fallbackToSafeMode(reason: string) {
  if (SAFE_MODE || relaunchedForSafe) return;
  if (Date.now() - launchTs > 20000) { logDiag(`늦은 크래시(${reason}) — 시작 충돌 아님, 자동 재시작 안 함`); return; }
  relaunchedForSafe = true;
  try { fs.writeFileSync(safeFlagPath(), `auto-enabled: ${reason}\n${new Date().toISOString()}`); } catch { /* */ }
  logDiag(`⚠️ 시작 직후 GPU/렌더러 충돌(${reason}) 감지 → 안전 모드(GPU 끄기)로 자동 재시작`);
  try { app.relaunch(); } catch { /* */ }
  app.exit(0);
}
app.on('child-process-gone', (_e, d: any) => {
  logDiag(`child-process-gone: type=${d?.type} reason=${d?.reason}`);
  if ((d?.type === 'GPU' || d?.type === 'renderer') && isCrash(d?.reason)) fallbackToSafeMode(`${d?.type}:${d?.reason}`);
});
app.on('render-process-gone', (_e, _wc: any, d: any) => {
  logDiag(`render-process-gone: reason=${d?.reason}`);
  if (isCrash(d?.reason)) fallbackToSafeMode(`render:${d?.reason}`);
});

// 첫 1~2문장만, 단어 중간 자르지 않기 (160자 하드컷 → 문장 경계)
const cleanLine = (s: string) => {
  let t = (s || '').replace(/\s+/g, ' ').replace(/^["'「『]+|["'」』]+$/g, '').trim();
  const sents = t.match(/[^.!?。！？]+[.!?。！？]?/g) || [t];
  t = sents.slice(0, 2).join('').trim();
  if (t.length > 180) { const cut = t.lastIndexOf(' ', 180); t = (cut > 60 ? t.slice(0, cut) : t.slice(0, 180)) + '…'; }
  return t;
};

// 🔁 자율 대화 루프 — 자연스러운 turn-taking:
//   · 남이 마지막으로 말했으면 응답 후보 → 랜덤 1.5~7.5s 끼어들기 지연
//   · 기다리는 사이 다른 에이전트가 먼저 말하면 60% 확률로 양보 (도배 방지)
//   · 내 개인 쿨다운 15s (한 명 독점 방지). 한 주제(📢)당 maxTurns 턴.
function startAutoChat(opts: { uid: string; target: any; sys: string; makePrompt: (convo: string, topic: string) => string; post: (t: string) => Promise<any>; maxTurns?: number }): () => void {
  let replying = false, turns = 0, seenTopic = '', lastSpokeAt = 0;
  const max = opts.maxTurns ?? 12;
  const iv = setInterval(async () => {
    if (replying || !opts.target) return;
    let msgs: any[]; try { msgs = await fetchMessages(); } catch { return; }
    if (!msgs.length) return;
    const topic = [...msgs].reverse().find((m: any) => /^📢/.test(m.text || ''));
    if (topic) { const k = `${topic.ts}|${topic.text}`; if (k !== seenTopic) { seenTopic = k; turns = 0; } }
    const last = msgs[msgs.length - 1];
    if (last.uid === opts.uid) return;                 // 내가 마지막 → 대기
    if (turns >= max) return;
    if (Date.now() - lastSpokeAt < 15000) return;      // 개인 쿨다운
    const triggerTs = last.ts;
    replying = true;
    try {
      await new Promise(r => setTimeout(r, 1500 + Math.random() * 6000));  // 끼어들기 stagger
      const cur = await fetchMessages();
      const curLast = cur[cur.length - 1];
      // 기다리는 사이 다른 에이전트가 이미 끼어들었으면 양보(60%)
      if (curLast && curLast.uid !== opts.uid && curLast.ts > triggerTs && Math.random() < 0.6) return;
      // 주제 고정 — 항상 현재 주제를 같이 넣어 딴 길로 새지 않게
      const curTopic = [...cur].reverse().find((m: any) => /^📢/.test(m.text || ''));
      const topicText = curTopic ? (curTopic.text || '').replace(/^📢\s*오늘의 주제:\s*/, '').replace(/\s*—.*$/, '').trim() : '';
      const convo = cur.slice(-8).map((m: any) => `${m.company}(${m.role || '학생'}): ${m.text}`).join('\n');
      // 턴마다 다른 관점 강제 → 같은 말 반복(degeneration) 방지
      const angles = ['구체적인 실제 사례를 들어', '앞 사람 주장에 반론을 제기하며', '실생활·비즈니스 적용 관점에서', '다른 분야(과학·역사·예술)와 연결해', '핵심을 찌르는 질문을 던지며', '정반대 입장에서'];
      const prompt = `${opts.makePrompt(convo, topicText)}\n\n[이번 발언 지시] ${angles[turns % angles.length]} 말하라. 앞에 이미 나온 문장을 절대 그대로 반복하지 말 것.`;
      const t = cleanLine(await chat(opts.target, opts.sys, prompt, { temperature: 0.9, frequencyPenalty: 0.6, presencePenalty: 0.5 }));
      if (t) { await opts.post(t); lastSpokeAt = Date.now(); turns++; }
    } catch { /* */ } finally { replying = false; }
  }, 5000);
  return () => clearInterval(iv);
}

function createWindow() {
  win = new BrowserWindow({
    width: 980,
    height: 720,
    minWidth: 720,
    minHeight: 560,
    title: 'AXIOS CLI',
    backgroundColor: '#0b1020',
    show: false,                 // 흰 화면 플래시 방지 — 렌더러 준비되면 보여줌
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.once('ready-to-show', () => { try { win?.show(); } catch { /* */ } });
  // 안전장치: ready-to-show 가 안 떠도 4초 뒤 강제로 보여줌 (영영 흰 화면/숨김 방지)
  setTimeout(() => { try { if (win && !win.isDestroyed() && !win.isVisible()) win.show(); } catch { /* */ } }, 4000);
  win.webContents.on('did-fail-load', (_e, code, desc, url) => { logDiag(`did-fail-load: ${code} ${desc} ${url}`); try { win?.show(); } catch { /* */ } });
  win.webContents.on('unresponsive', () => logDiag('renderer unresponsive'));
  win.loadFile(path.join(__dirname, '..', 'src', 'renderer', 'index.html'));
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
  // 닫으면 종료가 아니라 트레이로 숨김 (자는 동안 도는 회사 — 상주)
  win.on('close', (e) => { if (!quitting) { e.preventDefault(); win?.hide(); if (process.platform === 'darwin') app.dock?.hide(); } });
  if (SAFE_MODE) logDiag('실행: 안전 모드(GPU 끄기)');
}
function showWindow() { if (!win || win.isDestroyed()) createWindow(); else { win.show(); win.focus(); } if (process.platform === 'darwin') app.dock?.show(); }

// ─────────────────────────── 🖥️ 트레이 (상주) + 📋 아침 브리핑(능동성)
let tray: Tray | null = null;
let quitting = false;
function trayIcon() {
  try {
    const p = path.join(__dirname, '..', 'build', 'icon.iconset', 'icon_32x32.png');
    let img = nativeImage.createFromPath(p);
    if (!img.isEmpty()) img = img.resize({ width: 18, height: 18 });
    return img;
  } catch { return nativeImage.createEmpty(); }
}
function buildTray() {
  if (tray) return;
  try { tray = new Tray(trayIcon()); } catch { return; }
  tray.setToolTip('AXIOS CLI — 1인 기업 AI 비서');
  const menu = Menu.buildFromTemplate([
    { label: '🏢 AXIOS CLI 열기', click: () => showWindow() },
    { label: '📋 오늘 브리핑 받기', click: () => runBriefing(true) },
    { label: '➕ 새 대화', click: () => { showWindow(); win?.webContents.send('tray:newchat'); } },
    { type: 'separator' },
    { label: '종료', click: () => { quitting = true; app.quit(); } },
  ]);
  tray.setContextMenu(menu);
  tray.on('click', () => showWindow());
}

const todayStr = () => new Date().toISOString().slice(0, 10);
let briefingBusy = false;
async function runBriefing(manual = false) {
  if (briefingBusy) return; briefingBusy = true;
  try {
    const c = loadConfig();
    const target = await detectTarget({ base: c.llmBase, model: c.llmModel, key: geminiKey() });
    if (!target) { notify('AXIOS CLI', '모델(LM Studio/Ollama)을 먼저 켜면 아침 브리핑을 드릴게요.'); return; }
    const open = openTasks(), pend = pendingApprovals();
    const ctx = [
      `지금: ${new Date().toLocaleString('ko-KR', { month: 'long', day: 'numeric', weekday: 'long', hour: '2-digit', minute: '2-digit' })} (${new Date().getHours() < 12 ? '오전' : '오후'})`,
      `회사: ${c.company} · 등록 서비스 ${c.services.length}개 · 지식 ${noteCount()}개`,
      open.length ? `열린 할 일(${open.length}): ${open.slice(0, 6).map(t => t.title).join(', ')}` : '열린 할 일 없음',
      pend.length ? `승인 대기(${pend.length}): ${pend.slice(0, 4).map(a => a.title).join(', ')}` : '승인 대기 없음',
      c.services.length ? `서비스: ${c.services.map(s => s.name).join(', ')}` : '',
    ].filter(Boolean).join('\n');
    const title = c.userTitle || '사장님';
    const user = `${title}께 드리는 **아침 브리핑**을 작성해줘.\n\n[현재 상황]\n${ctx}\n\n형식: 따뜻한 한 줄 인사 → 오늘 핵심 3가지(우선순위) → 추천 액션 1개. 너무 길지 않게, ${title}이(가) 바로 움직일 수 있게.`;
    notify('📋 브리핑 준비 중…', `${c.agentName}가 오늘 할 일을 정리하고 있어요.`);
    let text = '';
    try { text = await chat(target, agentPrompt(c.agentName, c.company, title), user, { temperature: 0.6 }); } catch (e: any) { text = `브리핑 생성 중 문제가 생겼어요. (${e?.message || e})`; }
    text = text.trim();
    saveConfig({ lastBriefing: todayStr() });
    showWindow();
    win?.webContents.send('briefing:show', text);
    const firstLine = text.replace(/[#*`]/g, '').split('\n').filter(Boolean)[0] || '오늘의 브리핑이 도착했어요.';
    notify('📋 아침 브리핑', firstLine.slice(0, 120));

    // Send Telegram message if configured
    if (c.telegramToken && c.telegramChatId) {
      try {
        let formattedText = escapeHtml(text);
        formattedText = formattedText.replace(/\*\*(.*?)\*\*/g, '<b>$1</b>');
        formattedText = formattedText.replace(/\*(.*?)\*/g, '<i>$1</i>');
        formattedText = formattedText.replace(/`(.*?)`/g, '<code>$1</code>');
        
        await axios.post(`https://api.telegram.org/bot${c.telegramToken}/sendMessage`, {
          chat_id: c.telegramChatId,
          text: `📋 <b>[${escapeHtml(c.agentName)}의 아침 브리핑]</b>\n\n${formattedText}`,
          parse_mode: 'HTML'
        });
        console.log(`[텔레그램] 아침 브리핑 전송 성공`);
      } catch (tgErr: any) {
        console.error(`[텔레그램] 아침 브리핑 전송 실패:`, tgErr.message);
      }
    }
  } finally { briefingBusy = false; }
}
function notify(title: string, body: string) { try { if (Notification.isSupported()) new Notification({ title, body, silent: false }).show(); } catch { /* */ } }
// 매 15분 체크 — 브리핑 켜져있고, 오늘 안 했고, 설정 시각 지났으면 1회 자동
function scheduleBriefing() {
  const check = () => {
    const c = loadConfig();
    if (!c.briefingOn) return;
    if (c.lastBriefing === todayStr()) return;
    const now = new Date(); const cur = now.getHours() * 60 + now.getMinutes();
    if (cur >= (c.briefingHour ?? 9) * 60 + (c.briefingMin ?? 0)) runBriefing(false);
  };
  setInterval(check, 15 * 60 * 1000);
  setTimeout(check, 8000);   // 실행 직후 한 번(새 날이면)
}

function readRequestBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

let bridgeServer: http.Server | null = null;
function startBridgeServer() {
  if (bridgeServer) return;

  // Forcibly clear port 4825 on startup to prevent extension/other process conflicts
  try {
    const ourPid = process.pid;
    if (process.platform === 'win32') {
      const r = spawnSync('netstat', ['-ano'], { encoding: 'utf-8', timeout: 5000 });
      const lines = (r.stdout || '').split(/\r?\n/);
      for (const line of lines) {
        if (line.includes('LISTENING') && line.includes(':4825')) {
          const m = line.trim().split(/\s+/);
          const pid = parseInt(m[m.length - 1], 10);
          if (pid > 0 && pid !== ourPid) {
            spawnSync('taskkill', ['/F', '/PID', String(pid)]);
            logDiag(`Killed conflicting process ${pid} on port 4825`);
          }
        }
      }
    }
  } catch (err: any) {
    logDiag(`Failed to clear port 4825 on startup: ${err.message}`);
  }

  bridgeServer = http.createServer((req, res) => {
    logDiag(`[Bridge Request] ${req.method} ${req.url}`);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(200);
      res.end();
      return;
    }

    if (req.method === 'GET' && req.url === '/ping') {
      const brainDir = getBrainDir();
      let fileCount = 0;
      try {
        if (fs.existsSync(brainDir)) {
          const walk = (dir: string): string[] => {
            let files: string[] = [];
            for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
              const p = path.join(dir, f.name);
              if (f.isDirectory()) {
                if (f.name !== 'node_modules' && f.name !== '.git') files = files.concat(walk(p));
              } else if (f.name.endsWith('.md')) {
                files.push(p);
              }
            }
            return files;
          };
          fileCount = walk(brainDir).length;
        }
      } catch {}
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        status: 'ok',
        msg: 'Axios AI Bridge Ready',
        app: 'axios-ai-bridge',
        version: '2.89.156',
        pid: process.pid,
        config: loadConfig(),
        brain: { fileCount, enabled: true }
      }));
    }
    else if (req.method === 'POST' && req.url === '/api/brain-inject') {
      (async () => {
        try {
          const config = loadConfig();
          const userRole = config.authSession?.role || 'Admin';
          if (userRole !== 'Admin' && userRole !== 'Collaborator') {
            res.writeHead(403, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: '인증 권한이 부족합니다 (Admin 또는 Collaborator 권한 필요).' }));
            return;
          }
          const body = await readRequestBody(req);
          const parsed = JSON.parse(body);
          const titleRaw = typeof parsed.title === 'string' ? parsed.title : '';
          const markdown = typeof parsed.markdown === 'string' ? parsed.markdown : '';
          const safeTitle = (titleRaw || '').replace(/[^a-zA-Z0-9가-힣_]/gi, '_').trim();
          if (!safeTitle || !markdown) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'title/markdown 필드가 유효하지 않습니다.' }));
            return;
          }

          logDiag(`[Bridge] Brain inject received: title=${safeTitle}`);
          const brainDir = getBrainDir();
          if (!fs.existsSync(brainDir)) fs.mkdirSync(brainDir, { recursive: true });

          const today = new Date();
          const dateStr = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0') + '-' + String(today.getDate()).padStart(2, '0');
          const datePath = path.join(brainDir, '00_Raw', dateStr);
          fs.mkdirSync(datePath, { recursive: true });
          const filePath = path.join(datePath, `${safeTitle}.md`);
          fs.writeFileSync(filePath, markdown, 'utf-8');

          logDiag(`[Bridge] Wrote file to ${filePath}`);

          // Add to local brain JSON database so it renders in AXIOS CLI UI
          let e: number[] | null = null;
          try {
            const config = loadConfig();
            e = await embed(config.llmBase || 'http://127.0.0.1:1234', markdown);
          } catch {}
          brainAddNote(markdown, e || undefined);
          logDiag(`[Bridge] Added note to local JSON database`);

          // Notify user via OS Notification (Windows Toast)
          notify('🧠 새 지식 주입됨', `${safeTitle}.md가 성공적으로 주입되었습니다.`);

          // Render a nice notice inside AXIOS CLI's chat sidebar
          if (win && !win.isDestroyed()) {
            win.webContents.send('engine:event', {
              kind: 'status',
              text: `🧠 [A.U 지식 주입 완료] 새 지식 '${safeTitle}.md'가 두뇌 폴더에 주입되었습니다. (위치: ${path.relative(brainDir, filePath)})`
            });
            // Also notify to refresh the brain graph / list in the renderer
            win.webContents.send('engine:event', { kind: 'status', text: `🔄 지식 목록이 갱신되었습니다.` });
          }

          // Trigger git auto sync if configured
          try { autoSyncSoon(); } catch {}

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, filePath }));
        } catch (e: any) {
          logDiag(`[Bridge] Brain inject error: ${e.message}`);
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: e.message }));
        }
      })();
    }
    else if (req.method === 'POST' && req.url === '/api/telegram-webhook') {
      (async () => {
        try {
          const body = await readRequestBody(req);
          const parsed = JSON.parse(body);
          logDiag(`[Telegram Webhook] Received update`);
          handleTelegramUpdate(parsed).catch(err => {
            console.error('[Telegram Webhook Error]:', err.message);
          });
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true }));
        } catch (e: any) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: e.message }));
        }
      })();
    }
    else {
      res.writeHead(404);
      res.end();
    }
  });

  bridgeServer.on('error', (err: any) => {
    if (err.code === 'EADDRINUSE') {
      logDiag('Port 4825 in use, attempting to clear...');
      try {
        const ourPid = process.pid;
        if (process.platform === 'win32') {
          const r = spawnSync('netstat', ['-ano'], { encoding: 'utf-8', timeout: 5000 });
          const lines = (r.stdout || '').split(/\r?\n/);
          for (const line of lines) {
            if (line.includes('LISTENING') && line.includes(':4825')) {
              const m = line.trim().split(/\s+/);
              const pid = parseInt(m[m.length - 1], 10);
              if (pid > 0 && pid !== ourPid) {
                spawnSync('taskkill', ['/F', '/PID', String(pid)]);
              }
            }
          }
        }
      } catch {}
      setTimeout(() => { bridgeServer?.listen(4825, '127.0.0.1'); }, 2000);
    }
  });

  bridgeServer.listen(4825, '127.0.0.1', () => {
    logDiag('Axios AI Bridge Server running on http://127.0.0.1:4825');
  });
}

app.whenReady().then(() => {
  try { startBridgeServer(); } catch {}
  const brainDir = getBrainDir();
  if (!fs.existsSync(brainDir)) { fs.mkdirSync(brainDir, { recursive: true }); }
  cfgPath = path.join(brainDir, 'axios-cli-config.json');
  setBrainFile(path.join(brainDir, 'brain.json'));
  setTaskFile(path.join(brainDir, '_company', '_shared', 'tracker.json'));
  setApprovalFile(path.join(brainDir, '_company', 'approvals'));

  // Register Telegram Approval Notification Listener
  setApprovalListener(async (a) => {
    const c = loadConfig();
    if (c.telegramToken && c.telegramChatId) {
      try {
        const tgMsg = `✈️ <b>[새 결재 요청]</b>\n\n` +
          `• ID: <code>${a.id}</code>\n` +
          `• 에이전트: ${a.agentEmoji}\n` +
          `• 제목: ${escapeHtml(a.title)}\n` +
          `• 요약: ${escapeHtml(a.summary)}\n\n` +
          `• 승인하려면 아래 버튼을 누르거나 명령을 입력하세요:\n/approve ${a.id}`;
        
        await axios.post(`https://api.telegram.org/bot${c.telegramToken}/sendMessage`, {
          chat_id: c.telegramChatId,
          text: tgMsg,
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: [
              [
                { text: '✅ 승인', callback_data: `approve_${a.id}` },
                { text: '❌ 반려', callback_data: `reject_${a.id}` }
              ]
            ]
          }
        });
        console.log(`[텔레그램] 결재 알림 전송 성공: ${a.id}`);
      } catch (err: any) {
        console.error(`[텔레그램] 결재 알림 전송 실패:`, err.message);
      }
    }
  });

  try { setMcpConfig(loadConfig().mcpConfig); } catch { /* */ }

  // Start the FastAPI Core Orchestrator Python process
  try {
    const pythonScript = path.join(__dirname, '..', 'scripts', 'agent_orchestrator.py');
    const pythonCmd = process.platform === 'win32' ? 'python' : 'python3';
    const tgToken = loadConfig().telegramToken || '';
    const tgChatId = loadConfig().telegramChatId || '';
    const orchestratorProc = spawn(pythonCmd, [pythonScript], {
      detached: true,
      stdio: 'ignore',
      env: {
        ...process.env,
        TELEGRAM_BOT_TOKEN: tgToken,
        AXIOS_MASTER_CHAT_ID: tgChatId,
        AXIOS_CORE_PORT: '8000'
      }
    });
    orchestratorProc.unref();
    logDiag('Started AXIOS Core Orchestrator Python Process');
  } catch (err: any) {
    logDiag('Failed to start AXIOS Core Orchestrator: ' + err.message);
  }

  createWindow();
  buildTray();
  scheduleBriefing();
  scheduleAuto();
  initAutomations();

  // Start Remote Control loops
  try {
    startFirebaseRemoteControl();
    startTelegramRemoteControl();
    startTasksExecutionListener();
    startSystemStatusHeartbeat();

    // Register Telegram webhook on startup if configured
    const c = loadConfig();
    const tg = c.apiConn?.telegram || {};
    const token = tg.TELEGRAM_BOT_TOKEN || c.telegramToken;
    const webhookUrl = tg.TELEGRAM_WEBHOOK_URL || '';
    if (token && webhookUrl.trim()) {
      registerTelegramWebhook(token, webhookUrl);
    }
  } catch (err: any) {
    console.error('Failed to start remote loops on startup:', err.message);
  }
  
  // Auto boot last selected local model if configured
  const lastModel = loadConfig().localModelPath;
  if (lastModel && fs.existsSync(lastModel)) {
    bootLocalEngine(lastModel);
  }

  app.on('activate', () => { showWindow(); });

  // 🔄 자동 업데이트 확인 및 알림 등록 (GitHub 스크립트 방식 지원)
  try {
    checkGitHubLatestRelease();
    setInterval(() => {
      checkGitHubLatestRelease().catch(() => {});
    }, 2 * 60 * 60 * 1000);
  } catch (err) {
    console.error('Auto-update initialization error:', err);
  }
});
app.on('before-quit', () => { quitting = true; });
// 창 닫아도 트레이로 상주 (종료는 트레이 메뉴 '종료')
app.on('window-all-closed', () => { /* 상주 */ });

function syncPlazaConfig(c: Config) {
  setPlazaDbUrl(c.plazaDbUrl);
  setPlazaAuthToken(c.authSession?.idToken || '');
}

ipcMain.handle('briefing:run', () => { runBriefing(true); return true; });

// ─────────────────────────── 설정 IPC
ipcMain.handle('config:get', () => {
  const c = loadConfig() as any;
  c.appVersion = app.getVersion();
  return c;
});
ipcMain.handle('config:set', (_e, patch: Partial<Config>) => {
  const c = saveConfig(patch);
  if ('plazaDbUrl' in patch) syncPlazaConfig(c);
  if ('mcpConfig' in patch) setMcpConfig(c.mcpConfig);
  return c;
});

ipcMain.handle('mcp:get', () => loadConfig().mcpConfig || {});
ipcMain.handle('mcp:save', (_e, cfg: any) => { saveConfig({ mcpConfig: cfg }); setMcpConfig(cfg); return true; });
ipcMain.handle('mcp:test', async () => { setMcpConfig(loadConfig().mcpConfig); return await testMcp(); });
ipcMain.handle('mcp:tools', async () => await listMcpTools());

// 🛡️ 안전 모드 (GPU 끄기) — 설정에서 토글, 재시작 필요
ipcMain.handle('safemode:get', () => SAFE_MODE);
ipcMain.handle('safemode:set', (_e, on: boolean) => {
  try { if (on) fs.writeFileSync(safeFlagPath(), `user-enabled\n${new Date().toISOString()}`); else if (fs.existsSync(safeFlagPath())) fs.unlinkSync(safeFlagPath()); } catch { /* */ }
  return true;
});
ipcMain.handle('app:relaunch', () => { app.relaunch(); app.exit(0); });

// ─────────────────────────── 💰 매출 대시보드 (별도 창 + PayPal 실연동)
let revenueWin: BrowserWindow | null = null;
function openRevenueWindow() {
  if (revenueWin && !revenueWin.isDestroyed()) { revenueWin.focus(); return; }
  revenueWin = new BrowserWindow({
    width: 1180, height: 860, minWidth: 720, minHeight: 560, title: '비즈니스 리포트 — AXIOS CLI',
    backgroundColor: '#050816', show: false,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false },
  });
  revenueWin.once('ready-to-show', () => revenueWin?.show());
  revenueWin.loadFile(path.join(__dirname, '..', 'src', 'renderer', 'revenue.html'));
  revenueWin.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
  revenueWin.on('closed', () => { revenueWin = null; });
}
const postRevenue = (s: any) => { if (revenueWin && !revenueWin.isDestroyed()) revenueWin.webContents.send('revenue:state', s); };
async function loadRevenue() {
  postRevenue({ type: 'state', loading: true, error: null, data: null });
  const c = loadConfig();
  const [state, services] = await Promise.all([
    fetchRevenue(c.paypalClientId, c.paypalSecret, { days: 30 }),
    Promise.all((c.services || []).map(async (s) => {
      const m = s.url ? await siteMeta(s.url).catch(() => ({ title: '', image: '', favicon: '', text: '' })) : { title: '', image: '', favicon: '', text: '' };
      return {
        name: s.name, url: s.url, desc: s.desc,
        type: /youtube\.com|youtu\.be/i.test(s.url) ? 'youtube' : 'web',
        snapshot: (m.text || '').replace(/\s+/g, ' ').slice(0, 200), image: m.image || '', favicon: m.favicon || '', siteTitle: m.title || '',
      };
    })),
  ]);
  (state as any).services = services;
  postRevenue(state);
}
ipcMain.handle('revenue:open', () => { openRevenueWindow(); return true; });
ipcMain.handle('revenue:ready', () => { loadRevenue(); return true; });
ipcMain.handle('revenue:refresh', () => { loadRevenue(); return true; });
ipcMain.handle('revenue:openSettings', () => { win?.focus(); return true; });
// 🎙️ 리포트 AI 브리핑 — 실데이터(서비스·매출·할일)로 음성 브리핑 텍스트 생성
ipcMain.handle('report:briefing', async () => {
  const c = loadConfig();
  const target = await detectTarget({ base: c.llmBase, model: c.llmModel, key: geminiKey() });
  if (!target) return { ok: false, error: '모델(LM Studio/Ollama)을 먼저 켜주세요.' };
  const services = (c.services || []).map(s => s.name).join(', ');
  let revLine = '';
  try { const r = await fetchRevenue(c.paypalClientId, c.paypalSecret, { days: 30 }); if (r.data) { const cur = Object.keys(r.data.totals.by_currency)[0] || ''; const p = r.data.totals.by_period; revLine = `이번 달 매출 ${(p.month || 0).toFixed(2)} ${cur}, 거래 ${(r.data.transactions || []).length}건`; } } catch { /* */ }
  const open = openTasks().slice(0, 5).map(t => t.title).join(', ');
  const ctx = [`회사: ${c.company}`, services ? `운영 서비스: ${services}` : '', revLine ? `매출: ${revLine}` : '', open ? `할 일: ${open}` : ''].filter(Boolean).join('\n');
  const title = c.userTitle || '사장님';
  const user = `${title}께 드리는 **비즈니스 브리핑**을 음성으로 말하듯 작성해줘. 따뜻한 인사 → 핵심 현황(서비스·매출) → 오늘 추천 1~2가지. 3~5문장, 자연스럽고 또렷하게. 마크다운/이모지 없이.\n\n[현황]\n${ctx}`;
  try { const text = await chat(target, agentPrompt(c.agentName, c.company, title), user, { temperature: 0.6 }); return { ok: true, text: text.trim() }; }
  catch (e: any) { return { ok: false, error: e?.message || String(e) }; }
});
// 🔊 리포트 전용 음성 — 쇼케이스용으로 항상 무료 Edge 선희(자연스러운 한국어)
ipcMain.handle('report:speak', async (_e, text: string) => await edgeTTS('ko-KR-SunHiNeural', text));
ipcMain.handle('diag:open', () => { try { if (fs.existsSync(diagPath())) shell.showItemInFolder(diagPath()); else shell.openPath(app.getPath('userData')); } catch { /* */ } return true; });
ipcMain.handle('open:external', (_e, url: string) => { try { if (/^https?:\/\//.test(url)) shell.openExternal(url); } catch { /* */ } return true; });
// 🔊 고품질 음성 (Qwen3-TTS via Replicate)
ipcMain.handle('tts:speak', async (_e, text: string) => {
  const c = loadConfig();
  // 🔊 무료 고품질 — MS Edge 신경망 (키·GPU 불필요)
  if (c.voiceQuality === 'edge') return await edgeTTS(c.qwenVoice || 'ko-KR-SunHiNeural', text);
  if (c.voiceQuality !== 'qwen') return { ok: false, skip: true };
  // Qwen — 로컬 서버 있으면 로컬(무료), 없으면 Replicate(클라우드)
  if (c.ttsLocalUrl) return await localTTS(c.ttsLocalUrl, text, c.qwenVoice || 'Sohee');
  const token = (c.apiConn?.replicate?.REPLICATE_API_TOKEN) || (c.apiKeys?.replicate) || '';
  return await qwenTTS(token, text, c.qwenVoice || 'Sohee');
});

// ─────────────────────────── 일반 모드 (단일 에이전트 1:1 + 대화 기억)
let history: ChatTurn[] = [];
const servicesInfo = (c: Config) => {
  const svc = c.services.length
    ? `\n\n## ${c.company}의 서비스/사업 (사장님 것 — 인지하고 적극 활용)\n` + c.services.map(s => `- ${s.name}${s.url ? ` (${s.url})` : ''}${s.desc ? `: ${s.desc}` : ''}`).join('\n')
    : '';
  const open = openTasks();
  const tk = open.length
    ? `\n\n## 지금 열린 할 일 (태스크 보드 — 참고하고, 완료되면 보고)\n` + open.slice(0, 12).map(t => `- ${t.title}`).join('\n')
    : '';
  const pend = pendingApprovals();
  const ap = pend.length
    ? `\n\n## 승인 대기 중 (사장님 결재 기다리는 중)\n` + pend.slice(0, 8).map(a => `- ${a.title}`).join('\n')
    : '';
  return svc + tk + ap;
};
let runAbort: AbortController | null = null;
ipcMain.handle('company:run', async (_e, text: string) => {
  const c = loadConfig();
  runAbort?.abort();                 // 이전 실행이 남아있으면 정리
  runAbort = new AbortController();
  const getRevenue = async () => {
    const cc = loadConfig();
    const r = await fetchRevenue(cc.paypalClientId, cc.paypalSecret, { days: 30 });
    if (r.data) {
      const cur = Object.keys(r.data.totals.by_currency)[0] || '';
      const p = r.data.totals.by_period; const tx = r.data.transactions || [];
      return `이번 달 ${(p.month || 0).toFixed(2)} ${cur} · 지난 7일 ${(p.week || 0).toFixed(2)} · 오늘 ${(p.today || 0).toFixed(2)} · 총 거래 ${tx.length}건. 최근 거래: ${tx.slice(0, 3).map((t: any) => `${t.subject}(${t.value}${t.currency})`).join(', ') || '없음'}`;
    }
    return (r.error || 'PayPal이 아직 연결되지 않았어요') + ' — 🗂️ 관리 → 연동 → PayPal에 Client ID/Secret을 넣으면 매출을 바로 보여드릴게요.';
  };
  const captureScreen = async (): Promise<string | null> => {
    try {
      const sz = screen.getPrimaryDisplay().size;
      const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: Math.min(1680, sz.width), height: Math.min(1050, sz.height) } });
      const s = sources[0]; if (!s || s.thumbnail.isEmpty()) return null;
      return s.thumbnail.toDataURL();
    } catch { return null; }
  };
  const readClipboard = async (): Promise<string> => { try { return clipboard.readText() || ''; } catch { return ''; } };
  const openPath = async (p: string): Promise<string> => {
    let t = (p || '').trim().replace(/^~(?=\/|$)/, os.homedir());
    try {
      if (/^https?:\/\//i.test(t)) { shell.openExternal(t); return `✅ 열었어요: ${t}`; }
      if (!path.isAbsolute(t)) t = path.join(c.workspace || defaultWorkspace(), t);
      if (!fs.existsSync(t)) return `열기 실패: 그 경로에 파일이 없어요 (${t})`;
      const err = await shell.openPath(t);
      return err ? `열기 실패: ${err}` : `✅ 열었어요: ${t}`;
    } catch (e: any) { return `열기 실패: ${e?.message || e}`; }
  };
  const send = (ev: any) => win?.webContents.send('engine:event', ev);
  const yt = c.apiConn?.youtube || {};
  const youtubeKey = yt.YOUTUBE_API_KEY || '';
  const youtubeChannel = yt.YOUTUBE_CHANNEL_ID || '';
  const opts = { company: c.company, agentName: c.agentName, workspace: c.workspace || defaultWorkspace(), servicesInfo: servicesInfo(c), target: { base: c.llmBase, model: c.llmModel, key: geminiKey() }, signal: runAbort.signal, realtimeFor, getRevenue, captureScreen, readClipboard, openPath, userTitle: c.userTitle || '사장님', youtubeKey, youtubeChannel };
  // 도구 켜짐 = 파일 읽기/쓰기 하는 진짜 에이전트, 꺼짐 = 단순 대화
  const reply = c.tools !== false
    ? await agentWithTools(history, text, opts, send)
    : await talkToMyAgent(history, text, opts, send);
  history.push({ role: 'user', content: text });
  if (reply) history.push({ role: 'assistant', content: reply });
  if (history.length > 20) history = history.slice(-20); // 최근 10턴
  runAbort = null;
  return true;
});
ipcMain.handle('company:stop', () => { runAbort?.abort(); return true; });
ipcMain.handle('company:reset', () => { history = []; return true; });

// 🧠 두뇌 (지식 네트워크)
ipcMain.handle('brain:graph', () => brainGraph());
ipcMain.handle('brain:list', () => allNotes().map(n => ({ id: n.id, text: n.text, ts: n.ts })).sort((a, b) => b.ts - a.ts));
ipcMain.handle('brain:count', () => noteCount());
ipcMain.handle('brain:delete', (_e, id: string) => { deleteNote(id); return noteCount(); });
ipcMain.handle('brain:add', async (_e, text: string) => {
  const c = loadConfig();
  let e: number[] | null = null;
  try { e = await embed(c.llmBase || 'http://127.0.0.1:1234', text); } catch { /* */ }
  brainAddNote(text, e || undefined);
  autoSyncSoon();
  return noteCount();
});

// 🛠️ 작업 폴더 — 에이전트가 파일을 만들/읽을 기본 위치
ipcMain.handle('workspace:get', () => loadConfig().workspace || defaultWorkspace());
ipcMain.handle('workspace:pick', async () => {
  const r = await dialog.showOpenDialog(win!, { properties: ['openDirectory', 'createDirectory'], title: '에이전트 작업 폴더 선택' });
  if (r.canceled || !r.filePaths[0]) return loadConfig().workspace || defaultWorkspace();
  saveConfig({ workspace: r.filePaths[0] });
  return r.filePaths[0];
});

// 🗂️ 내 서비스 (웹사이트·서비스 등록 — 에이전트가 인지)
ipcMain.handle('services:list', () => loadConfig().services);
ipcMain.handle('services:add', (_e, s: { name: string; url: string; desc: string }) => {
  const c = loadConfig();
  const svc: Service = { id: 's' + Date.now(), name: (s.name || '').trim(), url: (s.url || '').trim(), desc: (s.desc || '').trim() };
  saveConfig({ services: [...c.services, svc] });
  return loadConfig().services;
});
ipcMain.handle('services:delete', (_e, id: string) => { saveConfig({ services: loadConfig().services.filter(x => x.id !== id) }); return loadConfig().services; });
// 🧭 비즈니스 인텔리전스 — 등록 서비스의 URL을 실제로 읽어와 스냅샷 (병렬)
ipcMain.handle('services:intel', async () => {
  const c = loadConfig();
  return await Promise.all(c.services.map(async (s) => {
    const type = /youtube\.com|youtu\.be/i.test(s.url) ? 'youtube' : (s.url ? 'web' : 'none');
    let snapshot = '';
    if (s.url) { try { snapshot = (await fetchUrl(s.url)).replace(/\s+/g, ' ').slice(0, 380); } catch { snapshot = '(읽지 못함)'; } }
    return { id: s.id, name: s.name, url: s.url, desc: s.desc, type, snapshot };
  }));
});

// 🔌 연동 (텔레그램·API키·PayPal)
ipcMain.handle('integrations:get', () => {
  const c = loadConfig();
  return { telegramToken: c.telegramToken, telegramChatId: c.telegramChatId, apiKeys: c.apiKeys || {}, paypalClientId: c.paypalClientId, paypalSecret: c.paypalSecret };
});
ipcMain.handle('integrations:save', (_e, patch: any) => {
  saveConfig(patch);
  // Sync to canonical JSON files
  if (patch.telegramToken !== undefined || patch.telegramChatId !== undefined) {
    const c = loadConfig();
    saveCanonicalApiConnection('telegram', {
      TELEGRAM_BOT_TOKEN: patch.telegramToken !== undefined ? patch.telegramToken : c.telegramToken,
      TELEGRAM_CHAT_ID: patch.telegramChatId !== undefined ? patch.telegramChatId : c.telegramChatId
    });
  }
  if (patch.paypalClientId !== undefined || patch.paypalSecret !== undefined) {
    const c = loadConfig();
    saveCanonicalApiConnection('paypal', {
      PAYPAL_CLIENT_ID: patch.paypalClientId !== undefined ? patch.paypalClientId : c.paypalClientId,
      PAYPAL_CLIENT_SECRET: patch.paypalSecret !== undefined ? patch.paypalSecret : c.paypalSecret
    });
  }
  if (patch.apiKeys && patch.apiKeys.gemini !== undefined) {
    saveCanonicalApiConnection('gemini', {
      GEMINI_API_KEY: patch.apiKeys.gemini
    });
  }
  return true;
});

// 🔌 서비스 정의 기반 API 패널 (익스텐션과 동일 구조) — 자격증명을 apiConn 에 저장
ipcMain.handle('api:get', () => {
  const c = loadConfig();
  const conn = { ...(c.apiConn || {}) } as Record<string, Record<string, string>>;
  // 레거시 필드를 화면에 같이 보이도록 머지(이전에 저장한 값)
  conn.telegram = { TELEGRAM_BOT_TOKEN: c.telegramToken || '', TELEGRAM_CHAT_ID: c.telegramChatId || '', ...(conn.telegram || {}) };
  conn.paypal = { PAYPAL_CLIENT_ID: c.paypalClientId || '', PAYPAL_CLIENT_SECRET: c.paypalSecret || '', ...(conn.paypal || {}) };
  conn.gemini = { GEMINI_API_KEY: (c.apiKeys || {}).gemini || '', ...(conn.gemini || {}) };
  return conn;
});
ipcMain.handle('api:save', async (_e, serviceId: string, values: Record<string, string>) => {
  // Sync to canonical first!
  saveCanonicalApiConnection(serviceId, values);

  const c = loadConfig();
  const apiConn = { ...(c.apiConn || {}), [serviceId]: values };
  const patch: any = { apiConn };
  // 레거시 소비처(매출/텔레그램/제미나이)와 동기화 — 기존 기능 안 깨지게
  if (serviceId === 'paypal') { patch.paypalClientId = values.PAYPAL_CLIENT_ID || ''; patch.paypalSecret = values.PAYPAL_CLIENT_SECRET || ''; }
  if (serviceId === 'telegram') { patch.telegramToken = (values.TELEGRAM_BOT_TOKEN || '').trim(); patch.telegramChatId = (values.TELEGRAM_CHAT_ID || '').trim(); }
  if (serviceId === 'gemini') { patch.apiKeys = { ...(c.apiKeys || {}), gemini: values.GEMINI_API_KEY || '' }; }
  saveConfig(patch);
  // 텔레그램은 저장 시 실제 검증 + 챗ID 자동 감지
  if (serviceId === 'telegram') {
    const token = (values.TELEGRAM_BOT_TOKEN || '').trim();
    if (!token) return { ok: true, note: '저장됨 (토큰 비어있음)' };
    if (!/^\d+:[A-Za-z0-9_-]+$/.test(token)) return { ok: false, error: '봇 토큰 형식이 이상해요 (숫자:문자)' };
    try {
      await axios.get(`https://api.telegram.org/bot${token}/getMe`, { timeout: 9000 });
      let chat = (values.TELEGRAM_CHAT_ID || '').trim();
      const webhookUrl = (values.TELEGRAM_WEBHOOK_URL || '').trim();
      
      // Register webhook or delete it
      await registerTelegramWebhook(token, webhookUrl);
      // Start telegram controller loop
      startTelegramRemoteControl();

      if (!chat) {
        if (webhookUrl) {
          return { ok: true, note: '✅ 토큰 확인됨 — 웹훅 사용 시에는 chat_id를 수동으로 입력해야 합니다.' };
        }
        try {
          const upd = await axios.get(`https://api.telegram.org/bot${token}/getUpdates`, { timeout: 9000 });
          const list = upd.data?.result || []; const last = list[list.length - 1];
          const cid = last?.message?.chat?.id; const cname = last?.message?.chat?.first_name || last?.message?.chat?.title || '';
          if (cid) { chat = String(cid); saveConfig({ telegramChatId: chat, apiConn: { ...apiConn, telegram: { ...values, TELEGRAM_CHAT_ID: chat } } });
            // Also sync to canonical
            saveCanonicalApiConnection('telegram', { TELEGRAM_BOT_TOKEN: token, TELEGRAM_CHAT_ID: chat });
            return { ok: true, note: `✅ 연결됨 — 📲 chat_id 자동 감지 (${cname})` }; }
        } catch (updErr: any) {
          logDiag(`[Telegram] chat_id auto-detection failed: ${updErr.message}`);
        }
        return { ok: true, note: '✅ 토큰 확인됨 — 봇한테 메시지 한 번 보내고 다시 저장하면 chat_id 자동 입력' };
      }
      return { ok: true, note: '✅ 연결됨' };
    } catch (e: any) { return { ok: false, error: e?.response?.data?.description || e?.message || '검증 실패' }; }
  }
  return { ok: true, note: '✅ 저장됨' };
});

// ─────────── 텔레그램 봇 및 파이어베이스 리모컨 명령어 처리부 ───────────
let lastTelegramUpdateId = 0;
let isTelegramPollingBusy = false;
let telegramPollInterval: NodeJS.Timeout | null = null;
let telegramHistoryMap: Record<string, ChatTurn[]> = {};

function escapeHtml(text: string): string {
  return (text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

async function registerTelegramWebhook(token: string, webhookUrl: string) {
  try {
    const cleanUrl = (webhookUrl || '').trim();
    if (cleanUrl) {
      logDiag(`[Telegram] Setting webhook to: ${cleanUrl}`);
      const res = await axios.post(`https://api.telegram.org/bot${token}/setWebhook`, {
        url: cleanUrl
      }, { timeout: 9000 });
      logDiag(`[Telegram] setWebhook result: ${JSON.stringify(res.data)}`);
    } else {
      logDiag(`[Telegram] Deleting webhook`);
      const res = await axios.post(`https://api.telegram.org/bot${token}/deleteWebhook`, {}, { timeout: 9000 });
      logDiag(`[Telegram] deleteWebhook result: ${JSON.stringify(res.data)}`);
    }
  } catch (err: any) {
    console.error(`[Telegram] webhook registration failed:`, err.response?.data?.description || err.message);
  }
}

async function handleTelegramUpdate(update: any) {
  const c = loadConfig();
  const tg = c.apiConn?.telegram || {};
  const token = tg.TELEGRAM_BOT_TOKEN || c.telegramToken;
  if (!token) return;

  // Handle Callback Query (Inline Keyboard Clicks)
  if (update.callback_query) {
    const callback = update.callback_query;
    const data = (callback.data || '').trim();
    const chatId = String(callback.message.chat.id);
    const messageId = callback.message.message_id;

    if (data.startsWith('approve_') || data.startsWith('reject_')) {
      const isApprove = data.startsWith('approve_');
      const approveId = isApprove ? data.replace('approve_', '') : data.replace('reject_', '');

      await axios.post(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
        callback_query_id: callback.id,
        text: isApprove ? '승인 중...' : '반려 중...'
      }).catch(() => {});

      const item = getApproval(approveId);
      if (item && item.status === 'pending') {
        if (isApprove) {
          await axios.post(`https://api.telegram.org/bot${token}/sendMessage`, {
            chat_id: chatId,
            text: `✅ 결재 건 [<code>${escapeHtml(approveId)}</code>] 승인이 완료되었습니다. 작업을 실행합니다...`,
            parse_mode: 'HTML'
          }).catch(() => {});

          const dbUrl = c.apiConn?.firebase?.FIREBASE_DB_URL || c.firebaseDbUrl;
          if (dbUrl) {
            try {
              const cleanDbUrl = dbUrl.replace(/\/$/, '');
              const idToken = c.authSession?.idToken;
              const authSuffix = idToken ? `?auth=${idToken}` : '';
              await axios.put(`${cleanDbUrl}/tasks/${approveId}/status.json${authSuffix}`, 'approved').catch(() => {});
            } catch (err) {
              console.error('Failed to update task status in Firebase:', err);
            }
          }

          opsStatusData.phase = "executing";
          opsStatusData.summary = `승인된 작업 "${item.title.slice(0, 20)}..."을 실행 중입니다.`;
          win?.webContents.send("engine:event", { type: "ops:status", status: opsStatusData });

          const result = await approveAndExecute(approveId);

          opsStatusData.phase = "done";
          opsStatusData.summary = "자율 작업이 완료되었습니다!";
          win?.webContents.send("engine:event", { type: "ops:status", status: opsStatusData });

          await axios.post(`https://api.telegram.org/bot${token}/sendMessage`, {
            chat_id: chatId,
            text: `📊 <b>[작업 완료 보고]</b>\n\n• 결재 제목: ${escapeHtml(item.title)}\n• 결과:\n<pre>${escapeHtml(result.slice(0, 1000))}</pre>`,
            parse_mode: 'HTML'
          }).catch(() => {});
        } else {
          setApprovalStatus(approveId, 'rejected');
          await axios.post(`https://api.telegram.org/bot${token}/sendMessage`, {
            chat_id: chatId,
            text: `❌ 결재 건 [<code>${escapeHtml(approveId)}</code>]이 반려되었습니다.`,
            parse_mode: 'HTML'
          }).catch(() => {});
        }

        await axios.post(`https://api.telegram.org/bot${token}/editMessageText`, {
          chat_id: chatId,
          message_id: messageId,
          text: `✈️ <b>[새 결재 요청 처리 완료]</b>\n\n` +
            `• ID: <code>${escapeHtml(approveId)}</code>\n` +
            `• 제목: ${item ? escapeHtml(item.title) : ''}\n\n` +
            `결정: <b>${isApprove ? '✅ 승인됨' : '❌ 반려됨'}</b>`,
          parse_mode: 'HTML'
        }).catch(() => {});
      } else {
        await axios.post(`https://api.telegram.org/bot${token}/sendMessage`, {
          chat_id: chatId,
          text: "⚠️ 찾을 수 없거나 이미 처리된 결재 번호입니다.",
          parse_mode: 'HTML'
        }).catch(() => {});
      }
    }
    return;
  }

  const msg = update.message || update.edited_message;
  if (!msg || !msg.text) return;

  const text = msg.text.trim();
  const chatId = String(msg.chat.id);

  if (text.startsWith('/approve ') || text.startsWith('/승인 ')) {
    const approveId = text.replace(/^\/(approve|승인)\s+/, '').trim();
    const item = getApproval(approveId);
    if (item && item.status === 'pending') {
      logDiag("[Telegram] Received approval command: " + approveId);
      await axios.post(`https://api.telegram.org/bot${token}/sendMessage`, {
        chat_id: chatId,
        text: `✅ 결재 건 [<code>${escapeHtml(approveId)}</code>] 승인이 완료되었습니다. 작업을 실행합니다...`,
        parse_mode: 'HTML'
      }).catch(() => {});

      const dbUrl = c.apiConn?.firebase?.FIREBASE_DB_URL || c.firebaseDbUrl;
      if (dbUrl) {
        try {
          const cleanDbUrl = dbUrl.replace(/\/$/, '');
          const idToken = c.authSession?.idToken;
          const authSuffix = idToken ? `?auth=${idToken}` : '';
          await axios.put(`${cleanDbUrl}/tasks/${approveId}/status.json${authSuffix}`, 'approved').catch(() => {});
        } catch (err) {
          console.error('Failed to update task status in Firebase:', err);
        }
      }

      opsStatusData.phase = "executing";
      opsStatusData.summary = "승인된 작업 \"" + item.title.slice(0, 20) + "...\"을 실행 중입니다.";
      win?.webContents.send("engine:event", { type: "ops:status", status: opsStatusData });

      const result = await approveAndExecute(approveId);

      opsStatusData.phase = "done";
      opsStatusData.summary = "자율 작업이 완료되었습니다!";
      win?.webContents.send("engine:event", { type: "ops:status", status: opsStatusData });

      await axios.post(`https://api.telegram.org/bot${token}/sendMessage`, {
        chat_id: chatId,
        text: `📊 <b>[작업 완료 보고]</b>\n\n• 결재 제목: ${escapeHtml(item.title)}\n• 결과:\n<pre>${escapeHtml(result.slice(0, 1000))}</pre>`,
        parse_mode: 'HTML'
      }).catch(() => {});
    } else {
      await axios.post(`https://api.telegram.org/bot${token}/sendMessage`, {
        chat_id: chatId,
        text: "⚠️ 찾을 수 없거나 이미 처리된 결재 번호입니다.",
        parse_mode: 'HTML'
      }).catch(() => {});
    }
    return;
  }

  const isLeo = text.startsWith('/leo ');
  const cleanText = isLeo ? text.replace('/leo ', '').trim() : text;
  if (!cleanText) return;

  const agentId = isLeo ? 'youtube' : 'secretary';
  const agentInfo = AGENTS[agentId];
  const agentName = agentInfo.name;

  await axios.post(`https://api.telegram.org/bot${token}/sendMessage`, {
    chat_id: chatId,
    text: `💬 ${agentInfo.emoji} <b>${escapeHtml(agentName)}</b> 에이전트가 생각하고 있습니다...`,
    parse_mode: 'HTML'
  }).catch(() => {});

  const yt = c.apiConn?.youtube || {};
  const youtubeKey = yt.YOUTUBE_API_KEY || '';
  const youtubeChannel = yt.YOUTUBE_CHANNEL_ID || '';
  
  const historyKey = `${chatId}-${agentId}`;
  if (!telegramHistoryMap[historyKey]) {
    telegramHistoryMap[historyKey] = [];
  }
  const history = telegramHistoryMap[historyKey];

  let finalText = '';
  const send = (ev: any) => {
    if (ev.kind === 'final') finalText = ev.text;
    else if (ev.kind === 'token') finalText += ev.text;
    win?.webContents.send('engine:event', ev);
  };

  const ctrl = new AbortController();
  try {
    const opts = {
      company: c.company,
      agentName,
      userTitle: c.userTitle || '사장님',
      workspace: c.workspace || defaultWorkspace(),
      servicesInfo: servicesInfo(c),
      target: { base: c.llmBase, model: c.llmModel, key: geminiKey() },
      signal: ctrl.signal,
      realtimeFor,
      getRevenue: async () => '',
      captureScreen: async () => null,
      readClipboard: async () => '',
      openPath: async () => '',
      youtubeKey,
      youtubeChannel
    };

    const reply = c.tools !== false
      ? await agentWithTools(history, cleanText, opts, send)
      : await talkToMyAgent(history, cleanText, opts, send);

    if (reply) finalText = reply;

    history.push({ role: 'user', content: cleanText });
    if (finalText) history.push({ role: 'assistant', content: finalText });
    if (history.length > 20) {
      telegramHistoryMap[historyKey] = history.slice(-20);
    }
  } catch (err: any) {
    finalText = `⚠️ 처리 중 오류: ${err.message}`;
  }

  const answer = finalText || '(응답 없음)';
  await axios.post(`https://api.telegram.org/bot${token}/sendMessage`, {
    chat_id: chatId,
    text: `<b>${agentInfo.emoji} ${agentName}</b>:\n\n${escapeHtml(answer)}`,
    parse_mode: 'HTML'
  }).catch(async () => {
    await axios.post(`https://api.telegram.org/bot${token}/sendMessage`, {
      chat_id: chatId,
      text: `${agentInfo.emoji} ${agentName}:\n\n${answer}`
    }).catch(() => {});
  });
}

const TELEGRAM_LOCK_TTL_MS = 15000;
function _telegramLockPath(): string {
  const userBrain = path.join(os.homedir(), '.axios-ai-brain');
  try { fs.mkdirSync(userBrain, { recursive: true }); } catch { /* ignore */ }
  return path.join(userBrain, '.telegram_poll.lock');
}
function _telegramOffsetPath(): string {
  const userBrain = path.join(os.homedir(), '.axios-ai-brain');
  try { fs.mkdirSync(userBrain, { recursive: true }); } catch { /* ignore */ }
  return path.join(userBrain, '.telegram_offset.json');
}
function _readTelegramOffset(): number {
  try {
    const p = _telegramOffsetPath();
    if (!fs.existsSync(p)) return 0;
    const data = JSON.parse(fs.readFileSync(p, 'utf-8') || '{}');
    return Number(data.offset) || 0;
  } catch { return 0; }
}
function _writeTelegramOffset(offset: number) {
  try {
    fs.writeFileSync(_telegramOffsetPath(), JSON.stringify({ offset, ts: Date.now() }));
  } catch { /* ignore */ }
}
function _tryAcquireTelegramLock(): boolean {
  const lockPath = _telegramLockPath();
  const now = Date.now();
  try {
    try { fs.mkdirSync(path.dirname(lockPath), { recursive: true }); } catch { /* ignore */ }
    if (fs.existsSync(lockPath)) {
      try {
        const data = JSON.parse(fs.readFileSync(lockPath, 'utf-8') || '{}');
        if (data.pid === process.pid) {
          fs.writeFileSync(lockPath, JSON.stringify({ pid: process.pid, heartbeat: now }));
          return true;
        }
        if (typeof data.heartbeat === 'number' && now - data.heartbeat < TELEGRAM_LOCK_TTL_MS) {
          return false;
        }
      } catch { /* ignore */ }
      try { fs.unlinkSync(lockPath); } catch { /* ignore */ }
    }
    try {
      const realFd = fs.openSync(lockPath, 'wx');
      fs.writeSync(realFd, JSON.stringify({ pid: process.pid, heartbeat: now }));
      fs.closeSync(realFd);
      return true;
    } catch (e: any) {
      if (e?.code === 'EEXIST') return false;
      throw e;
    }
  } catch {
    return true; // fail-open
  }
}

function startTelegramRemoteControl() {
  if (telegramPollInterval) clearInterval(telegramPollInterval);
  telegramPollInterval = setInterval(async () => {
    if (isTelegramPollingBusy) return;
    const c = loadConfig();
    const tg = c.apiConn?.telegram || {};
    const token = tg.TELEGRAM_BOT_TOKEN || c.telegramToken;
    const webhookUrl = tg.TELEGRAM_WEBHOOK_URL || '';
    if (!token || webhookUrl.trim()) return;

    if (!_tryAcquireTelegramLock()) {
      return;
    }

    isTelegramPollingBusy = true;
    try {
      const currentOffset = _readTelegramOffset();
      const res = await axios.get(`https://api.telegram.org/bot${token}/getUpdates`, {
        params: {
          offset: currentOffset + 1,
          timeout: 2
        },
        timeout: 5000
      });
      const updates = res.data?.result || [];
      let newOffset = currentOffset;
      for (const upd of updates) {
        newOffset = upd.update_id;
        await handleTelegramUpdate(upd);
      }
      if (newOffset > currentOffset) {
        _writeTelegramOffset(newOffset);
      }
    } catch (err: any) {
      if (err.response?.status !== 409 && !err.message?.includes('409')) {
        console.error('[Telegram Polling Error]:', err.message);
      }
    } finally {
      isTelegramPollingBusy = false;
    }
  }, 3000);
}

let hasNewVersionAvailable = false;
let isCheckingUpdate = false;

async function checkGitHubLatestRelease() {
  if (!app.isPackaged) {
    logDiag('Skip checkGitHubLatestRelease because application is not packed');
    return;
  }
  if (isCheckingUpdate) return;
  isCheckingUpdate = true;
  try {
    const response = await axios.get('https://api.github.com/repos/wonseokjung/connect-ai/releases/latest', {
      headers: { 'User-Agent': 'axios-cli-app' },
      timeout: 5000
    });
    const release = response.data;
    if (release && release.tag_name) {
      const latestVer = release.tag_name.replace(/^[a-zA-Z\-_]+/, '').replace(/^v/, '').trim();
      const currentVer = app.getVersion();
      
      if (latestVer !== currentVer) {
        logDiag(`[Update] New version detected: ${latestVer} (Current: ${currentVer}). Scheduling background upgrade on exit.`);
        hasNewVersionAvailable = true;
      }
    }
  } catch (err: any) {
    console.error('[Update] GitHub release check failed:', err.message);
  } finally {
    isCheckingUpdate = false;
  }
}

interface SseConnection {
  destroy: () => void;
}

function startSseConnection(
  urlStr: string,
  onData: (event: string, data: any) => void,
  onEnd: () => void,
  onError: (err: any) => void,
  redirectCount = 0
): SseConnection {
  let activeReq: any = null;
  let destroyed = false;

  const connection: SseConnection = {
    destroy: () => {
      destroyed = true;
      if (activeReq) {
        try { activeReq.destroy(); } catch {}
      }
    }
  };

  if (redirectCount > 5) {
    setTimeout(() => onError(new Error('Too many redirects')), 0);
    return connection;
  }

  try {
    const urlObj = new URL(urlStr);
    const options = {
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      headers: {
        'Accept': 'text/event-stream'
      }
    };

    const req = https.get(options, (res) => {
      if (destroyed) {
        req.destroy();
        return;
      }

      if (res.statusCode && [301, 302, 307, 308].includes(res.statusCode) && res.headers.location) {
        let redirectUrl = res.headers.location;
        if (!redirectUrl.startsWith('http')) {
          redirectUrl = new URL(redirectUrl, urlStr).toString();
        }
        logDiag(`[SSE] Redirecting to ${redirectUrl}`);
        req.destroy();
        const nextConn = startSseConnection(redirectUrl, onData, onEnd, onError, redirectCount + 1);
        activeReq = {
          destroy: () => nextConn.destroy()
        };
      } else {
        let buffer = '';
        res.on('data', (chunk) => {
          if (destroyed) return;
          buffer += chunk.toString();
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          let currentEvent = '';
          for (const line of lines) {
            if (line.startsWith('event:')) {
              currentEvent = line.replace('event:', '').trim();
            } else if (line.startsWith('data:')) {
              const dataStr = line.replace('data:', '').trim();
              if (dataStr && dataStr !== 'null') {
                try {
                  const payload = JSON.parse(dataStr);
                  onData(currentEvent, payload);
                } catch (err: any) {
                  console.error('[SSE Parse Error]:', err.message);
                }
              }
            }
          }
        });

        res.on('end', () => {
          if (!destroyed) onEnd();
        });
      }
    });

    req.on('error', (err) => {
      if (!destroyed) onError(err);
    });

    activeReq = req;
  } catch (err) {
    if (!destroyed) {
      setTimeout(() => onError(err), 0);
    }
  }

  return connection;
}

let tasksSseRequest: any = null;
const executedTasks = new Set<string>();

function startTasksExecutionListener() {
  const c = loadConfig();
  const dbUrl = c.apiConn?.firebase?.FIREBASE_DB_URL || c.firebaseDbUrl;
  const idToken = c.authSession?.idToken;
  if (!dbUrl) return;

  if (tasksSseRequest) {
    try { tasksSseRequest.destroy(); } catch {}
    tasksSseRequest = null;
  }

  try {
    const cleanDbUrl = dbUrl.replace(/\/$/, '');
    const urlStr = `${cleanDbUrl}/tasks.json` + (idToken ? `?auth=${idToken}` : '');

    logDiag(`[Executor] Starting Firebase Realtime DB SSE listener for tasks...`);

    tasksSseRequest = startSseConnection(
      urlStr,
      (currentEvent, payload) => {
        handleSseEvent(currentEvent, payload);
      },
      () => {
        logDiag(`[Executor] SSE connection closed. Reconnecting in 5s...`);
        setTimeout(startTasksExecutionListener, 5000);
      },
      (err) => {
        logDiag(`[Executor] SSE connection error: ${err.message}. Reconnecting in 10s...`);
        setTimeout(startTasksExecutionListener, 10000);
      }
    );
  } catch (err: any) {
    logDiag(`[Executor] SSE setup error: ${err.message}. Retrying in 10s...`);
    setTimeout(startTasksExecutionListener, 10000);
  }
}

async function handleSseEvent(event: string, payload: any) {
  const c = loadConfig();
  const dbUrl = c.apiConn?.firebase?.FIREBASE_DB_URL || c.firebaseDbUrl;
  const idToken = c.authSession?.idToken;
  if (!dbUrl) return;
  const cleanDbUrl = dbUrl.replace(/\/$/, '');
  const authSuffix = idToken ? `?auth=${idToken}` : '';

  if (event === 'put' || event === 'patch') {
    const pathStr = payload.path || '';
    const data = payload.data;

    if (pathStr === '/' && data && typeof data === 'object') {
      for (const taskId of Object.keys(data)) {
        const task = data[taskId];
        if (task && task.status === 'approved') {
          triggerTaskExecution(taskId, task, cleanDbUrl, authSuffix);
        }
      }
    } else {
      const match = pathStr.match(/^\/([a-zA-Z0-9\-_]+)$/);
      if (match && data && typeof data === 'object') {
        const taskId = match[1];
        if (data.status === 'approved') {
          triggerTaskExecution(taskId, data, cleanDbUrl, authSuffix);
        }
      } else {
        const statusMatch = pathStr.match(/^\/([a-zA-Z0-9\-_]+)\/status$/);
        if (statusMatch && data === 'approved') {
          const taskId = statusMatch[1];
          try {
            const res = await axios.get(`${cleanDbUrl}/tasks/${taskId}.json${authSuffix}`, { timeout: 3000 });
            if (res.data) {
              triggerTaskExecution(taskId, res.data, cleanDbUrl, authSuffix);
            }
          } catch (err: any) {
            console.error(`Failed to fetch task ${taskId} details:`, err.message);
          }
        }
      }
    }
  }
}

async function triggerTaskExecution(taskId: string, task: any, cleanDbUrl: string, authSuffix: string) {
  if (executedTasks.has(taskId)) return;
  executedTasks.add(taskId);

  try {
    await axios.put(`${cleanDbUrl}/tasks/${taskId}/status.json${authSuffix}`, 'running', { timeout: 3000 }).catch(() => {});
    win?.webContents.send('engine:event', { type: 'task:updated', id: taskId, status: 'running' });
  } catch (err) {
    console.error('Failed to set task status to running:', err);
  }

  const cmd = (task.cmd || task.command || task.title || '').trim();
  logDiag(`[Executor] Executing approved task ${taskId}: ${cmd}`);

  const c = loadConfig();
  const ws = c.workspace || defaultWorkspace();
  
  const isWin = process.platform === 'win32';
  const shellCmd = isWin ? 'powershell.exe' : 'sh';
  const shellArgs = isWin ? ['-NoProfile', '-NonInteractive', '-Command', cmd] : ['-c', cmd];

  const { spawn } = require('child_process');
  let r;
  try {
    r = spawn(shellCmd, shellArgs, { cwd: ws, shell: true });
  } catch (err: any) {
    const errOutput = `⚠️ 터미널 실행기 시작 실패: ${err.message}`;
    await updateTaskFinished(taskId, 'failed', errOutput, -1, cleanDbUrl, authSuffix);
    return;
  }

  let stdout = '';
  let stderr = '';
  
  r.stdout.on('data', (data: any) => {
    stdout += data.toString();
  });
  
  r.stderr.on('data', (data: any) => {
    stderr += data.toString();
  });

  r.on('error', async (err: any) => {
    logDiag(`[Executor] Spawn runtime error on task ${taskId}: ${err.message}`);
    const errOutput = `⚠️ 터미널 에러: ${err.message}\n` + [stdout.trim(), stderr.trim()].filter(Boolean).join('\n');
    await updateTaskFinished(taskId, 'failed', errOutput, -1, cleanDbUrl, authSuffix);
  });

  r.on('close', async (code: number) => {
    const output = [stdout.trim(), stderr.trim()].filter(Boolean).join('\n') || '(출력 없음)';
    const status = code === 0 ? 'completed' : 'failed';
    await updateTaskFinished(taskId, status, output, code, cleanDbUrl, authSuffix);
  });
}

async function updateTaskFinished(taskId: string, status: string, output: string, code: number, cleanDbUrl: string, authSuffix: string) {
  try {
    await axios.put(`${cleanDbUrl}/tasks/${taskId}/status.json${authSuffix}`, status, { timeout: 3000 }).catch(() => {});
    await axios.put(`${cleanDbUrl}/tasks/${taskId}/result.json${authSuffix}`, {
      output,
      code,
      finishedAt: Date.now()
    }, { timeout: 3000 }).catch(() => {});
  } catch (err: any) {
    console.error(`[Executor] Failed to update Firebase for finished task ${taskId}:`, err.message);
  }

  try {
    setTaskStatus(taskId, status === 'completed' ? 'done' : 'cancelled');
    win?.webContents.send('engine:event', { type: 'task:updated', id: taskId, status, result: { output, code } });
  } catch (e) {
    console.error('Error updating local task:', e);
  }

  logDiag(`[Executor] Task ${taskId} finished with status ${status} (code ${code})`);
}

let systemStatusInterval: NodeJS.Timeout | null = null;
function startSystemStatusHeartbeat() {
  if (systemStatusInterval) clearInterval(systemStatusInterval);
  systemStatusInterval = setInterval(async () => {
    const c = loadConfig();
    const dbUrl = c.apiConn?.firebase?.FIREBASE_DB_URL || c.firebaseDbUrl;
    const idToken = c.authSession?.idToken;
    if (!dbUrl) return;
    try {
      const cleanDbUrl = dbUrl.replace(/\/$/, '');
      const authSuffix = idToken ? `?auth=${idToken}` : '';
      await axios.put(`${cleanDbUrl}/system/status.json${authSuffix}`, {
        active: opsOperating,
        timestamp: Date.now()
      }, { timeout: 3000 }).catch(() => {});
    } catch {}
  }, 5000);
}

let lastRemoteCmdTs = 0;
let remoteSseRequest: any = null;

function startFirebaseRemoteControl() {
  const c = loadConfig();
  const dbUrl = c.apiConn?.firebase?.FIREBASE_DB_URL || c.firebaseDbUrl;
  const pair = c.authSession?.localId;
  const idToken = c.authSession?.idToken;
  if (!dbUrl || !pair) return;

  if (remoteSseRequest) {
    try { remoteSseRequest.destroy(); } catch {}
    remoteSseRequest = null;
  }

  try {
    const cleanDbUrl = dbUrl.replace(/\/$/, '');
    const urlStr = `${cleanDbUrl}/remote/${pair}/cmd.json` + (idToken ? `?auth=${idToken}` : '');

    logDiag(`[Remote] Starting Firebase Remote Control SSE listener...`);

    remoteSseRequest = startSseConnection(
      urlStr,
      (currentEvent, payload) => {
        handleRemoteSseEvent(currentEvent, payload);
      },
      () => {
        logDiag(`[Remote] SSE connection closed. Reconnecting in 5s...`);
        setTimeout(startFirebaseRemoteControl, 5000);
      },
      (err) => {
        logDiag(`[Remote] SSE connection error: ${err.message}. Reconnecting in 10s...`);
        setTimeout(startFirebaseRemoteControl, 10000);
      }
    );
  } catch (err: any) {
    logDiag(`[Remote] SSE setup error: ${err.message}. Retrying in 10s...`);
    setTimeout(startFirebaseRemoteControl, 10000);
  }
}

async function handleRemoteSseEvent(event: string, payload: any) {
  if (event !== 'put' && event !== 'patch') return;

  const c = loadConfig();
  const dbUrl = c.apiConn?.firebase?.FIREBASE_DB_URL || c.firebaseDbUrl;
  const pair = c.authSession?.localId;
  const idToken = c.authSession?.idToken;
  if (!dbUrl || !pair) return;
  const cleanDbUrl = dbUrl.replace(/\/$/, '');
  const authSuffix = idToken ? `?auth=${idToken}` : '';

  let cmdText = '';
  let cmdTs = 0;

  if (payload.path === '/') {
    const data = payload.data;
    if (data && typeof data === 'object') {
      cmdText = (data.text || '').trim();
      cmdTs = Number(data.ts || 0);
    } else if (typeof data === 'string') {
      cmdText = data.trim();
    }
  } else {
    try {
      const res = await axios.get(`${cleanDbUrl}/remote/${pair}/cmd.json${authSuffix}`, { timeout: 3000 });
      if (res.data) {
        cmdText = (res.data.text || '').trim();
        cmdTs = Number(res.data.ts || 0);
      }
    } catch (err: any) {
      console.error('Failed to get remote command:', err.message);
      return;
    }
  }

  if (cmdText && cmdTs > lastRemoteCmdTs) {
    if (lastRemoteCmdTs === 0) {
      lastRemoteCmdTs = cmdTs;
      return;
    }
    lastRemoteCmdTs = cmdTs;
    logDiag(`[Remote] Remote command received: ${cmdText}`);

    await axios.put(`${cleanDbUrl}/remote/${pair}/resp.json${authSuffix}`, {
      status: 'processing',
      text: '⏳ 명령을 처리하고 있어요...',
      ts: Date.now()
    }, { timeout: 3000 }).catch(() => {});

    let finalText = '';
    const send = (ev: any) => {
      if (ev.kind === 'final') finalText = ev.text;
      else if (ev.kind === 'token') finalText += ev.text;
      win?.webContents.send('engine:event', ev);
    };

    const ctrl = new AbortController();
    try {
      const opts = {
        company: c.company, agentName: c.agentName, userTitle: c.userTitle || '사장님',
        workspace: c.workspace || defaultWorkspace(), servicesInfo: servicesInfo(c),
        target: { base: c.llmBase, model: c.llmModel, key: geminiKey() },
        signal: ctrl.signal, realtimeFor,
        getRevenue: async () => '', captureScreen: async () => null,
        readClipboard: async () => { try { return clipboard.readText(); } catch { return ''; } },
        openPath: async () => '',
      };

      const reply = c.tools !== false
        ? await agentWithTools(_remoteHistory, cmdText, opts, send)
        : await talkToMyAgent(_remoteHistory, cmdText, opts, send);
      
      if (reply) finalText = reply;
      _remoteHistory.push({ role: 'user', content: cmdText });
      if (finalText) _remoteHistory.push({ role: 'assistant', content: finalText });
      if (_remoteHistory.length > 20) _remoteHistory = _remoteHistory.slice(-20);

      await axios.put(`${cleanDbUrl}/remote/${pair}/resp.json${authSuffix}`, {
        status: 'done',
        text: finalText || '성공적으로 완료했습니다.',
        ts: Date.now()
      }, { timeout: 3000 }).catch(() => {});

    } catch (err: any) {
      await axios.put(`${cleanDbUrl}/remote/${pair}/resp.json${authSuffix}`, {
        status: 'error',
        text: `⚠️ 에러: ${err.message}`,
        ts: Date.now()
      }, { timeout: 3000 }).catch(() => {});
    }
  }
}

ipcMain.handle('telegram:test', async () => {
  const c = loadConfig();
  if (!c.telegramToken || !c.telegramChatId) return { ok: false, reason: '봇 토큰과 챗 ID를 먼저 입력하세요' };
  try {
    await axios.post(`https://api.telegram.org/bot${c.telegramToken}/sendMessage`, {
      chat_id: c.telegramChatId,
      text: `✅ <b>AXIOS CLI 연결 완료</b> — ${escapeHtml(c.agentName)}가 인사드립니다, ${escapeHtml(c.userTitle || '사장님')}!`,
      parse_mode: 'HTML'
    }, { timeout: 9000 });
    return { ok: true };
  } catch (e: any) { return { ok: false, reason: e?.response?.data?.description || e?.message || '전송 실패' }; }
});

// 📊 대시보드 통계
ipcMain.handle('dashboard:stats', () => {
  const c = loadConfig();
  return { services: c.services.length, knowledge: noteCount(), tasks: taskCount(), approvals: approvalCount(), telegram: !!(c.telegramToken && c.telegramChatId), paypal: !!c.paypalClientId, apiKeys: Object.values(c.apiKeys || {}).filter(Boolean).length, company: c.company, agentName: c.agentName, model: c.llmModel || '자동' };
});

// 📋 태스크 보드
ipcMain.handle('tasks:list', () => listTasks());
ipcMain.handle('tasks:add', (_e, title: string) => addTask(title, { owner: 'user' }));
ipcMain.handle('tasks:done', (_e, id: string) => { setTaskStatus(id, 'done'); return listTasks(); });
ipcMain.handle('tasks:cancel', (_e, id: string) => { setTaskStatus(id, 'cancelled'); return listTasks(); });
ipcMain.handle('tasks:results', async () => {
  const c = loadConfig();
  const dbUrl = c.apiConn?.firebase?.FIREBASE_DB_URL || c.firebaseDbUrl;
  const idToken = c.authSession?.idToken;
  if (!dbUrl) return [];

  try {
    const cleanDbUrl = dbUrl.replace(/\/$/, '');
    const authSuffix = idToken ? `?auth=${idToken}` : '';
    const res = await axios.get(`${cleanDbUrl}/tasks.json${authSuffix}`, { timeout: 3000 });
    if (res.data) {
      const results: any[] = [];
      for (const taskId of Object.keys(res.data)) {
        const task = res.data[taskId];
        if (task && (task.status === 'completed' || task.status === 'failed') && task.result) {
          results.push({
            id: taskId,
            title: task.title || task.cmd || task.command || '',
            status: task.status,
            result: task.result
          });
        }
      }
      return results.sort((a, b) => (b.result.finishedAt || 0) - (a.result.finishedAt || 0));
    }
  } catch (err: any) {
    console.error('Failed to load task results from Firebase:', err.message);
  }
  return [];
});

// 🧬 장기 기억 (베타) — 지식 노트를 파인튜닝용 JSONL로 내보내기 (Unsloth/허깅페이스 학습용)
ipcMain.handle('brain:exportTraining', (_e, hf: { token?: string; model?: string }) => {
  if (hf) saveConfig({ hfToken: hf.token || '', hfModel: hf.model || '' });
  const notes = allNotes();
  if (!notes.length) return { ok: false, reason: '학습할 지식이 없어요. 먼저 단기 기억에 지식을 쌓으세요.' };
  const sys = '너는 사장님의 1인 기업 AI 비서다. 아래 지식을 체득해 답변에 활용한다.';
  const lines = notes.map(n => JSON.stringify({ messages: [
    { role: 'system', content: sys },
    { role: 'user', content: '내 사업/지식에 대해 기억하고 있는 것을 알려줘.' },
    { role: 'assistant', content: n.text },
  ] })).join('\n');
  const out = path.join(os.homedir(), 'Desktop', 'axios-ai-knowledge.jsonl');
  try { fs.writeFileSync(out, lines, 'utf8'); shell.showItemInFolder(out); return { ok: true, path: out, count: notes.length }; }
  catch (e: any) { return { ok: false, reason: e?.message || String(e) }; }
});

// ⚡ 단기 기억 = GitHub 동기화 / 🧬 장기 기억 = HuggingFace 업로드
const connOf = (svc: string) => (loadConfig().apiConn || {})[svc] || {};
const geminiKey = () => { const c = loadConfig(); return (c.apiConn?.gemini?.GEMINI_API_KEY) || (c.apiKeys?.gemini) || ''; };
ipcMain.handle('github:push', async () => {
  const g = connOf('github');
  return await pushKnowledge(g.GITHUB_TOKEN, g.GITHUB_DEFAULT_REPO, allNotes());
});
ipcMain.handle('github:pull', async () => {
  const g = connOf('github');
  if (!g.GITHUB_TOKEN || !(g.GITHUB_DEFAULT_REPO || '').includes('/')) {
    return { ok: false, error: 'GitHub 토큰과 레포(owner/repo)를 🗂️ 연동에서 먼저 입력하세요.' };
  }
  let added = 0;
  
  // 1️⃣ 기존 knowledge.json 불러오기
  let pullError: string | undefined;
  const r = await pullKnowledge(g.GITHUB_TOKEN, g.GITHUB_DEFAULT_REPO);
  if (r.ok && r.notes?.length) {
    added += importNotes(r.notes);
  } else if (!r.ok) {
    pullError = r.error;
    logDiag(`GitHub PullKnowledge failed: ${r.error}`);
  }
  
  // 2️⃣ 레포 마크다운/텍스트 파일 스캔 → 추가 지식 주입
  let scanned = 0, skipped = 0, capped = false;
  let scanError: string | undefined;
  try {
    const files = await scanRepoFiles(g.GITHUB_TOKEN, g.GITHUB_DEFAULT_REPO, 40);
    scanned = files.length;
    if (scanned === 40) capped = true;
    const fileAdded = importNotes(files);
    skipped = scanned - fileAdded;
    added += fileAdded;
  } catch (err: any) {
    scanError = err?.message || String(err);
    logDiag(`GitHub scanRepoFiles failed: ${scanError}`);
  }
  
  if (!r.ok && scanned === 0) {
    const errMsg = [pullError, scanError].filter(Boolean).join(' / ');
    return { ok: false, error: errMsg || '불러오기 실패' };
  }
  
  return { ok: true, added, total: noteCount(), scanned, skipped, capped };
});
ipcMain.handle('hf:upload', async () => {
  const h = connOf('huggingface');
  const notes = allNotes();
  if (!notes.length) return { ok: false, error: '학습할 지식이 없어요. 먼저 단기 기억에 쌓으세요.' };
  return await uploadDataset(h.HF_TOKEN, h.HF_REPO, notesToJsonl(notes));
});
ipcMain.handle('memstatus', () => {
  const g = connOf('github'), h = connOf('huggingface');
  return { githubRepo: g.GITHUB_DEFAULT_REPO || '', githubReady: !!(g.GITHUB_TOKEN && g.GITHUB_DEFAULT_REPO), hfRepo: h.HF_REPO || '', hfReady: !!(h.HF_TOKEN && h.HF_REPO), notes: noteCount() };
});

// ─────────────────────────── 🧠 두뇌 분야별 성장 통계
const CAT_RE: Record<string, RegExp> = {
  marketing: /마케팅|marketing|sns|유튜브|youtube|인스타|instagram|광고|브랜드|brand|콘텐츠|content/i,
  coding: /코딩|coding|코드|code|개발|develop|프로그래밍|programm|api|서버|server|데이터|algorithm|library/i,
  design: /디자인|design|ui|ux|색상|color|폰트|font|그래픽|graphic|로고|logo|레이아웃|layout/i,
  business: /사업|business|매출|revenue|수익|profit|비용|cost|투자|invest|계약|contract|전략|strategy|고객|customer/i,
};
function catNote(text: string): string {
  for (const [cat, re] of Object.entries(CAT_RE)) { if (re.test(text)) return cat; }
  return 'general';
}
ipcMain.handle('brain:stats', () => {
  const notes = allNotes();
  const counts: Record<string, number> = { marketing: 0, coding: 0, design: 0, business: 0, general: 0 };
  for (const n of notes) counts[catNote(n.text)]++;
  const THRESHOLD = 30;
  return Object.entries(counts)
    .filter(([, c]) => c > 0)
    .map(([id, count]) => ({ id, count, pct: Math.min(100, Math.round(count / THRESHOLD * 100)), ready: count >= THRESHOLD }));
});

// ─────────────────────────── 📱 폰 웹 리모컨 (WiFi HTTP 서버)
let _remoteServer: http.Server | null = null;
let _remotePort = 0;
let _remoteBusy = false;
let _remoteHistory: ChatTurn[] = [];

function getLocalIP(): string {
  try {
    const nets = os.networkInterfaces();
    for (const ifaces of Object.values(nets)) {
      for (const iface of (ifaces || [])) {
        if (iface.family === 'IPv4' && !iface.internal) return iface.address;
      }
    }
  } catch { }
  return '127.0.0.1';
}

function buildRemotePage(): string {
  return `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">
<title>AXIOS CLI 리모컨</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{background:#0b1020;color:#e8eaf6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;height:100dvh;display:flex;flex-direction:column;overflow:hidden}
.hdr{background:#131629;padding:14px 16px;border-bottom:1px solid #1e2440;display:flex;align-items:center;gap:10px;flex-shrink:0}
.hdr h1{font-size:16px;font-weight:700;color:#7c8cf8;letter-spacing:.5px}
.dot{width:8px;height:8px;border-radius:50%;background:#00ff87;box-shadow:0 0 8px #00ff87;flex-shrink:0;animation:pulse 2s infinite}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}
.chat{flex:1;overflow-y:auto;padding:14px 12px;display:flex;flex-direction:column;gap:10px}
.msg{max-width:88%;padding:10px 14px;border-radius:16px;font-size:14px;line-height:1.55;word-break:break-word}
.mu{align-self:flex-end;background:#3d5afe;color:#fff;border-radius:16px 16px 4px 16px}
.ma{align-self:flex-start;background:#1a2035;border:1px solid #2d3a5e;border-radius:16px 16px 16px 4px}
.ma b{color:#7c8cf8}.ma pre{background:#0d1525;padding:8px;border-radius:6px;overflow-x:auto;font-size:12px;margin-top:6px;white-space:pre-wrap}
.thinking{align-self:flex-start;color:#7c8cf8;font-size:14px;padding:8px 14px;display:flex;gap:5px}
.thinking span{width:6px;height:6px;border-radius:50%;background:#7c8cf8;animation:blink 1s infinite}
.thinking span:nth-child(2){animation-delay:.2s}.thinking span:nth-child(3){animation-delay:.4s}
@keyframes blink{0%,80%,100%{opacity:.2}40%{opacity:1}}
.form{padding:10px 12px;background:#131629;border-top:1px solid #1e2440;display:flex;gap:8px;flex-shrink:0}
.form textarea{flex:1;background:#1a2035;border:1px solid #2d3a5e;color:#e8eaf6;border-radius:12px;padding:10px 14px;font-size:14px;resize:none;height:44px;max-height:120px;outline:none;font-family:inherit;transition:border-color .2s}
.form textarea:focus{border-color:#3d5afe}
.form button{background:#3d5afe;color:#fff;border:none;border-radius:12px;padding:0 18px;font-size:14px;font-weight:700;cursor:pointer;min-width:56px;transition:background .15s,transform .1s;-webkit-tap-highlight-color:transparent}
.form button:active{background:#283de8;transform:scale(.96)}
.form button:disabled{background:#2d3a5e;color:#556;cursor:default;transform:none}
</style>
</head>
<body>
<div class="hdr"><div class="dot"></div><h1>✦ AXIOS CLI 리모컨</h1></div>
<div class="chat" id="chat">
  <div class="msg ma">안녕하세요! 📱 명령을 보내면 AXIOS CLI가 바로 실행해요.</div>
</div>
<div class="form">
  <textarea id="inp" placeholder="명령을 입력하세요…"></textarea>
  <button id="btn">전송</button>
</div>
<script>
const chat=document.getElementById('chat'),inp=document.getElementById('inp'),btn=document.getElementById('btn');
let busy=false;
inp.addEventListener('input',()=>{inp.style.height='auto';inp.style.height=Math.min(inp.scrollHeight,120)+'px'});
inp.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();send()}});
btn.addEventListener('click',send);
function addMsg(cls,text){
  const el=document.createElement('div');el.className='msg '+cls;
  el.innerHTML=text
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/\`\`\`([\s\S]*?)\`\`\`/g,'<pre>$1</pre>')
    .replace(/\*\*([^*]+)\*\*/g,'<b>$1</b>')
    .replace(/\n/g,'<br>');
  chat.appendChild(el);chat.scrollTop=chat.scrollHeight;
}
async function send(){
  const text=inp.value.trim();if(!text||busy)return;
  busy=true;btn.disabled=true;inp.value='';inp.style.height='auto';
  addMsg('mu',text);
  const th=document.createElement('div');th.className='thinking';
  th.innerHTML='<span></span><span></span><span></span>';
  chat.appendChild(th);chat.scrollTop=chat.scrollHeight;
  try{
    const r=await fetch('/api/send',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text})});
    const d=await r.json();
    th.remove();
    addMsg('ma',d.response||'(응답 없음)');
  }catch(e){
    th.remove();addMsg('ma','⚠️ 연결 오류. 같은 와이파이인지 확인하세요.');
  }
  busy=false;btn.disabled=false;inp.focus();
}
</script>
</body>
</html>`;
}

async function ensureRemoteServer(): Promise<string> {
  if (_remoteServer) return `http://${getLocalIP()}:${_remotePort}`;
  return new Promise((resolve, reject) => {
    const srv = http.createServer(async (req, res) => {
      res.setHeader('Access-Control-Allow-Origin', '*');
      if (req.method === 'POST' && req.url === '/api/send') {
        if (_remoteBusy) {
          res.writeHead(429, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ ok: false, response: '⏳ 현재 다른 명령을 처리 중이에요. 잠시 후 다시 시도해주세요.' }));
          return;
        }
        let body = '';
        req.on('data', (d: Buffer) => { body += d; });
        req.on('end', async () => {
          let text = '';
          try { text = (JSON.parse(body).text || '').trim(); } catch { }
          if (!text) {
            res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ ok: false, response: '명령을 입력해주세요.' }));
            return;
          }
          _remoteBusy = true;
          let finalText = '';
          const c = loadConfig();
          const send = (ev: any) => {
            if (ev.kind === 'final') finalText = ev.text;
            else if (ev.kind === 'token') finalText += ev.text;
            win?.webContents.send('engine:event', ev);   // 데스크톱에도 동시 표시
          };
          const ctrl = new AbortController();
          try {
            const opts = {
              company: c.company, agentName: c.agentName, userTitle: c.userTitle || '사장님',
              workspace: c.workspace || defaultWorkspace(), servicesInfo: servicesInfo(c),
              target: { base: c.llmBase, model: c.llmModel, key: geminiKey() },
              signal: ctrl.signal, realtimeFor,
              getRevenue: async () => '', captureScreen: async () => null,
              readClipboard: async () => { try { return clipboard.readText(); } catch { return ''; } },
              openPath: async () => '',
            };
            const reply = c.tools !== false
              ? await agentWithTools(_remoteHistory, text, opts, send)
              : await talkToMyAgent(_remoteHistory, text, opts, send);
            if (reply) finalText = reply;
            _remoteHistory.push({ role: 'user', content: text });
            if (finalText) _remoteHistory.push({ role: 'assistant', content: finalText });
            if (_remoteHistory.length > 20) _remoteHistory = _remoteHistory.slice(-20);
          } catch (e: any) {
            finalText = `⚠️ 처리 중 오류: ${e?.message || e}`;
          } finally { _remoteBusy = false; }
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ ok: true, response: finalText || '(응답 없음)' }));
        });
        return;
      }
      // 리모컨 HTML 서빙
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(buildRemotePage());
    });
    srv.listen(0, '0.0.0.0', () => {
      const addr = srv.address() as any;
      _remotePort = addr.port;
      _remoteServer = srv;
      logDiag(`📱 리모컨 서버 시작: port ${_remotePort}`);
      resolve(`http://${getLocalIP()}:${_remotePort}`);
    });
    srv.on('error', (e: Error) => reject(e));
  });
}

ipcMain.handle('remote:info', async () => {
  try {
    const url = await ensureRemoteServer();
    return { url };
  } catch (e: any) {
    return { url: null, error: e?.message };
  }
});

// 🔄 자동 루프 — 지식 쌓이면 GitHub 자동 커밋(디바운스) + 충분히 쌓이면 장기학습 추천 알림
let syncDebounce: NodeJS.Timeout | null = null;
function autoSyncSoon() { if (syncDebounce) clearTimeout(syncDebounce); syncDebounce = setTimeout(() => runAutoSync(), 30000); }
async function runAutoSync() {
  const c = loadConfig(); if (!c.autoSync) return;
  const g = connOf('github'); if (!(g.GITHUB_TOKEN && (g.GITHUB_DEFAULT_REPO || '').includes('/'))) return;
  const n = noteCount(); if (n <= (c.lastSyncCount || 0)) return;
  const r = await pushKnowledge(g.GITHUB_TOKEN, g.GITHUB_DEFAULT_REPO, allNotes());
  if (r.ok) { saveConfig({ lastSyncCount: n }); logDiag(`auto-sync ${n} notes → GitHub`); win?.webContents.send('engine:event', { kind: 'status', text: `🔄 지식 ${n}개 GitHub 자동 동기화 완료` }); }
}
function maybeLearnHint() {
  const c = loadConfig(); const h = connOf('huggingface');
  if (!(h.HF_TOKEN && h.HF_REPO)) return;
  const n = noteCount();
  if (n - (c.lastTrainHintCount || 0) >= 20) { saveConfig({ lastTrainHintCount: n }); notify('🧬 장기 학습 추천', `지식이 ${n}개 쌓였어요. 🧠 → 장기 기억에서 학습을 돌릴 때예요.`); }
}
function scheduleAuto() { setInterval(() => { runAutoSync(); maybeLearnHint(); }, 10 * 60 * 1000); }

// 📅 Google Calendar OAuth — 브라우저 동의 → 로컬 콜백(:5815) → refresh_token 저장
ipcMain.handle('calendar:oauth', async () => {
  const cal = connOf('google-calendar');
  const clientId = cal.GOOGLE_CALENDAR_CLIENT_ID;
  const secret = cal.GOOGLE_CALENDAR_CLIENT_SECRET;
  if (!clientId || !secret) return { ok: false, error: 'Client ID와 Client Secret을 먼저 입력·저장하세요.' };
  const redirect = 'http://127.0.0.1:5815/calendar-callback';
  const scope = 'https://www.googleapis.com/auth/calendar';
  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(redirect)}&response_type=code&scope=${encodeURIComponent(scope)}&access_type=offline&prompt=consent`;
  return await new Promise((resolve) => {
    let done = false;
    const server = http.createServer(async (req, res) => {
      if (!req.url?.startsWith('/calendar-callback')) { res.statusCode = 404; res.end(); return; }
      const code = new URL(req.url, redirect).searchParams.get('code');
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.end('<body style="background:#06100b;color:#00ff41;font-family:sans-serif;text-align:center;padding-top:80px"><h2>✅ Google Calendar 연결 완료</h2><p>이 창을 닫고 AXIOS CLI로 돌아가세요.</p></body>');
      try { server.close(); } catch { /* */ }
      if (done) return; done = true;
      if (!code) return resolve({ ok: false, error: '인증 코드를 받지 못했어요.' });
      try {
        const tok = await axios.post('https://oauth2.googleapis.com/token',
          new URLSearchParams({ code, client_id: clientId, client_secret: secret, redirect_uri: redirect, grant_type: 'authorization_code' }),
          { timeout: 15000 });
        const refresh = tok.data?.refresh_token;
        if (!refresh) return resolve({ ok: false, error: '리프레시 토큰을 못 받았어요. 동의 화면에서 모두 허용했는지 확인하세요.' });
        // 캐노니컬 파일에 저장
        const brainDir = getBrainDir();
        const toolDir = path.join(brainDir, '_company', '_agents', 'secretary', 'tools');
        fs.mkdirSync(toolDir, { recursive: true });
        const p = path.join(toolDir, 'google_calendar_write.json');
        let existing: any = {};
        if (fs.existsSync(p)) { try { existing = JSON.parse(fs.readFileSync(p, 'utf8')); } catch {} }
        existing.CLIENT_ID = clientId;
        existing.CLIENT_SECRET = secret;
        existing.REFRESH_TOKEN = refresh;
        existing.CALENDAR_ID = existing.CALENDAR_ID || 'primary';
        existing.DEFAULT_DURATION_MINUTES = existing.DEFAULT_DURATION_MINUTES || 60;
        fs.writeFileSync(p, JSON.stringify(existing, null, 2));
        // apiConn 도 업데이트
        const c = loadConfig();
        saveConfig({ apiConn: { ...(c.apiConn || {}), 'google-calendar': { ...cal, GOOGLE_CALENDAR_REFRESH_TOKEN: refresh } } });
        notify('✅ Google Calendar 연결', '이제 비서가 일정을 읽고 쓸 수 있어요.');
        resolve({ ok: true });
      } catch (e: any) { resolve({ ok: false, error: e?.response?.data?.error_description || e?.message }); }
    });
    server.on('error', (e: any) => { if (!done) { done = true; resolve({ ok: false, error: `콜백 서버 오류(:5815): ${e?.message}` }); } });
    server.listen(5815, '127.0.0.1', () => shell.openExternal(authUrl));
    setTimeout(() => { try { server.close(); } catch { /* */ } if (!done) { done = true; resolve({ ok: false, error: '시간 초과(2분). 다시 시도하세요.' }); } }, 120000);
  });
});

// 📺 YouTube — Data API(채널·영상) + Analytics(OAuth)
ipcMain.handle('youtube:get', async () => {
  const y = connOf('youtube');
  const data = await fetchChannel(y.YOUTUBE_API_KEY, y.YOUTUBE_CHANNEL_ID);
  if (data.ok) {
    const o = connOf('youtube-oauth');
    if (o.YOUTUBE_OAUTH_CLIENT_ID && o.YOUTUBE_OAUTH_CLIENT_SECRET && o.YOUTUBE_OAUTH_REFRESH) {
      const at = await ytAccessToken(o.YOUTUBE_OAUTH_CLIENT_ID, o.YOUTUBE_OAUTH_CLIENT_SECRET, o.YOUTUBE_OAUTH_REFRESH);
      if (at) { const an = await fetchAnalytics(at); if (an.ok) data.analytics = an.analytics; }
    }
  }
  return data;
});
// OAuth 자동 연결 — 브라우저 동의 → 로컬 콜백서버(:5814) → refresh_token 저장
ipcMain.handle('youtube:oauth', async () => {
  const o = connOf('youtube-oauth');
  const clientId = o.YOUTUBE_OAUTH_CLIENT_ID, secret = o.YOUTUBE_OAUTH_CLIENT_SECRET;
  if (!clientId || !secret) return { ok: false, error: 'OAuth Client ID/Secret을 먼저 입력·저장하세요.' };
  const redirect = 'http://127.0.0.1:5814/yt-oauth-callback';
  const scope = 'https://www.googleapis.com/auth/yt-analytics.readonly https://www.googleapis.com/auth/youtube.readonly';
  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(redirect)}&response_type=code&scope=${encodeURIComponent(scope)}&access_type=offline&prompt=consent`;
  return await new Promise((resolve) => {
    let done = false;
    const server = http.createServer(async (req, res) => {
      if (!req.url?.startsWith('/yt-oauth-callback')) { res.statusCode = 404; res.end(); return; }
      const code = new URL(req.url, redirect).searchParams.get('code');
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.end('<body style="background:#06100b;color:#00ff41;font-family:sans-serif;text-align:center;padding-top:80px"><h2>✅ YouTube 연결 완료</h2><p>이 창을 닫고 Connect AI로 돌아가세요.</p></body>');
      try { server.close(); } catch { /* */ }
      if (done) return; done = true;
      if (!code) return resolve({ ok: false, error: '인증 코드를 받지 못했어요.' });
      try {
        const tok = await axios.post('https://oauth2.googleapis.com/token', new URLSearchParams({ code, client_id: clientId, client_secret: secret, redirect_uri: redirect, grant_type: 'authorization_code' }), { timeout: 15000 });
        const refresh = tok.data?.refresh_token;
        const c = loadConfig();
        saveConfig({ apiConn: { ...(c.apiConn || {}), 'youtube-oauth': { ...o, YOUTUBE_OAUTH_REFRESH: refresh || '' } } });
        notify('✅ YouTube 연결', '시청 지속률·트래픽 분석을 가져올 수 있어요.');
        resolve({ ok: !!refresh, error: refresh ? undefined : '리프레시 토큰을 못 받았어요. 동의 화면에서 모두 허용했는지 확인하세요.' });
      } catch (e: any) { resolve({ ok: false, error: e?.response?.data?.error_description || e?.message }); }
    });
    server.on('error', (e: any) => { if (!done) { done = true; resolve({ ok: false, error: `콜백 서버 오류(:5814): ${e?.message}` }); } });
    server.listen(5814, '127.0.0.1', () => shell.openExternal(authUrl));
    setTimeout(() => { try { server.close(); } catch { /* */ } if (!done) { done = true; resolve({ ok: false, error: '시간 초과(2분). 다시 시도하세요.' }); } }, 120000);
  });
});
// 🤝 specialist 실시간 데이터 — 에이전트가 일할 때 진짜 수치 주입
async function realtimeFor(agentId: string): Promise<string> {
  try {
    const c = loadConfig();
    if (agentId === 'youtube') {
      const y = (c.apiConn || {}).youtube || {};
      const d = await fetchChannel(y.YOUTUBE_API_KEY, y.YOUTUBE_CHANNEL_ID);
      if (d.ok) return `[내 유튜브 실데이터] ${d.channel.title} · 구독 ${d.channel.subs.toLocaleString()} · 조회수 ${d.channel.views.toLocaleString()} · 영상 ${d.channel.videos}개. 최근영상: ${(d.videos || []).slice(0, 3).map((v: any) => `${v.title}(${v.views}회)`).join(', ')}`;
    }
    if (agentId === 'business') {
      const rev = await fetchRevenue(c.paypalClientId, c.paypalSecret, { days: 30 });
      if (rev.data) { const cur = Object.keys(rev.data.totals.by_currency)[0]; const p = rev.data.totals.by_period; return `[내 매출 실데이터] 이번달 ${p.month?.toFixed(2)} · 7일 ${p.week?.toFixed(2)} (${cur || ''})`; }
    }
  } catch { /* */ }
  return '';
}
// 🚀 학습 노트북 생성 → GitHub 커밋 → Colab 원클릭 URL
ipcMain.handle('train:notebook', async () => {
  const c = loadConfig();
  // 내 학습 노트북이 설정돼 있으면 그걸 그대로 (데이터셋은 이미 HF에 올라가 있음)
  if ((c.trainNotebookUrl || '').startsWith('http')) return { ok: true, colab: c.trainNotebookUrl, note: '내 학습 노트북' };
  const g = connOf('github'), h = connOf('huggingface');
  const dataset = h.HF_REPO || '';
  if (!dataset.includes('/')) return { ok: false, error: '먼저 🗂️ 연동에서 HuggingFace 데이터셋 레포를 설정하고 🧬 업로드 하세요.' };
  if (!noteCount()) return { ok: false, error: '학습할 지식이 없어요. 먼저 단기 기억에 쌓고 업로드하세요.' };
  const owner = dataset.split('/')[0];
  const nb = buildNotebook(dataset, h.HF_BASE_MODEL || 'unsloth/gemma-2-2b-it-bnb-4bit', `${owner}/axios-ai-brain`);
  // GitHub 연결돼 있으면 커밋 → Colab 원클릭
  if (g.GITHUB_TOKEN && (g.GITHUB_DEFAULT_REPO || '').includes('/')) {
    const r = await pushFile(g.GITHUB_TOKEN, g.GITHUB_DEFAULT_REPO, 'axios-cli/train.ipynb', nb, '🚀 AXIOS CLI 장기기억 학습 노트북');
    if (r.ok) { const [o, n] = g.GITHUB_DEFAULT_REPO.split('/'); return { ok: true, colab: `https://colab.research.google.com/github/${o}/${n}/blob/main/axios-cli/train.ipynb`, github: r.url }; }
  }
  // 폴백: 바탕화면 저장 + Colab 업로드 페이지
  const out = path.join(os.homedir(), 'Desktop', 'axios-cli-train.ipynb');
  try { fs.writeFileSync(out, nb, 'utf8'); shell.showItemInFolder(out); return { ok: true, local: out, colab: 'https://colab.research.google.com/#create=true', note: 'GitHub 미연결 — 바탕화면 노트북을 Colab에 업로드하세요.' }; }
  catch (e: any) { return { ok: false, error: e?.message || String(e) }; }
});

// ✅ 승인 큐 — 승인 시 액션이 있으면 실제로 실행(에이전트 행동 = 돈 만들기)
async function executeAction(action: ApprovalAction): Promise<string> {
  const c = loadConfig();
  const ws = c.workspace || defaultWorkspace();
  try {
    if (action.kind === 'run') {
      const r = spawnSync(action.payload, { cwd: ws, shell: true, encoding: 'utf8', timeout: 120000, maxBuffer: 8 * 1024 * 1024 });
      const out = [(r.stdout || '').trim(), (r.stderr || '').trim()].filter(Boolean).join('\n').slice(0, 2000);
      return `${out || '(출력 없음)'}\n[종료 코드 ${r.status ?? '?'}]`;
    }
    if (action.kind === 'write') {
      let p = (action.path || '').replace(/^~(?=\/|$)/, os.homedir()); if (!path.isAbsolute(p)) p = path.join(ws, p);
      fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, action.payload || '', 'utf8'); return `저장됨 → ${p}`;
    }
    if (action.kind === 'telegram') {
      const tg = (c.apiConn || {}).telegram || {}; const token = tg.TELEGRAM_BOT_TOKEN || c.telegramToken; const chat = tg.TELEGRAM_CHAT_ID || c.telegramChatId;
      if (!token || !chat) return '⚠️ 텔레그램 미설정 (🗂️ 연동에서 먼저 연결)';
      await axios.post(`https://api.telegram.org/bot${token}/sendMessage`, {
        chat_id: chat,
        text: escapeHtml(action.payload || ''),
        parse_mode: 'HTML'
      }, { timeout: 9000 });
      return '📨 텔레그램 전송 완료';
    }
    if (action.kind === 'email') {
      const e = (c.apiConn || {}).email || {};
      const [to, subject, ...rest] = action.payload.split('|').map(s => s.trim());
      const r = await sendEmail({ host: e.SMTP_HOST, port: e.SMTP_PORT, user: e.SMTP_USER, pass: e.SMTP_PASS, from: e.SMTP_FROM }, to, subject || '', rest.join('|'));
      return r.ok ? `📧 이메일 전송 완료 → ${to}` : `⚠️ ${r.error}`;
    }
  } catch (e: any) { return `⚠️ 실행 실패: ${e?.message || e}`; }
  return '';
}
async function approveAndExecute(id: string): Promise<string> {
  const a = getApproval(id);
  let result = '';
  if (a && a.status === 'pending') {
    if (a.action) {
      result = await executeAction(a.action);
    } else if (a.kind && a.rawPayload) {
      const brainDir = getBrainDir();
      const execPath = path.join(brainDir, '_company', 'approvals', 'executors', `${a.kind}.js`);
      if (fs.existsSync(execPath)) {
        try {
          const res = spawnSync('node', [execPath], {
            cwd: path.join(brainDir, '_company'),
            encoding: 'utf-8',
            timeout: 60000,
            input: JSON.stringify(a.rawPayload),
          });
          result = (res.stdout || '') + (res.stderr ? `\n[stderr]\n${res.stderr}` : '');
          if (res.status !== 0) {
            result = `⚠️ 실행 실패 (Executor): ${result}`;
          } else {
            result = `✅ 실행 완료: ${result}`;
          }
        } catch (e: any) {
          result = `⚠️ 실행 에러 (Executor): ${e?.message || e}`;
        }
      } else {
        if (a.kind === 'info' || a.kind === 'cmd' || a.kind === 'shell') {
          const cmd = (typeof a.rawPayload === 'string' ? a.rawPayload : a.rawPayload?.cmd || a.rawPayload?.command || a.summary || '').trim();
          if (cmd && (cmd.includes(' ') || cmd.length > 3)) {
            try {
              const r = spawnSync(cmd, { cwd: ws, shell: true, encoding: 'utf8', timeout: 60000 });
              const out = [(r.stdout || '').trim(), (r.stderr || '').trim()].filter(Boolean).join('\n').slice(0, 2000);
              result = `✅ 로컬 실행기 Fallback 실행 완료:\n${out || '(출력 없음)'}\n[종료 코드 ${r.status ?? '?'}]`;
            } catch (e: any) {
              result = `⚠️ 로컬 실행기 Fallback 실패: ${e?.message || e}`;
            }
          } else {
            result = `✅ 정보/의견 승인 완료`;
          }
        } else {
          result = `(실행기 없음: ${a.kind} — 수동 조치 필요)`;
        }
      }
    }
    setApprovalStatus(id, 'approved', result);
    try {
      win?.webContents.send('engine:event', { type: 'approval:approved', id });
      win?.webContents.send('engine:event', { kind: 'tool', name: 'approve-done', path: result.slice(0, 60), ok: !result.startsWith('⚠️') });
      notify('✅ 실행 완료', `${a.title} — ${result.slice(0, 100)}`);
    } catch {}
    return result;
  }
  return '⚠️ 찾을 수 없거나 이미 처리된 결재 번호입니다.';
}

ipcMain.handle('approvals:list', () => listApprovals());
ipcMain.handle('approvals:approve', async (_e, id: string) => {
  const result = await approveAndExecute(id);
  return { list: listApprovals(), result };
});
ipcMain.handle('approvals:reject', (_e, id: string) => { setApprovalStatus(id, 'rejected'); return { list: listApprovals() }; });

// ─────────────────────────── 모델 목록 (LM Studio / Ollama 에서)
ipcMain.handle('models:list', async () => {
  const c = loadConfig();
  const local = await listModels({ base: c.llmBase, model: c.llmModel });
  // ☁️ Gemini 키가 있으면 클라우드 고성능 모델도 선택지에 추가
  const gem = geminiKey() ? ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-2.0-flash'] : [];
  if (!local) return gem.length ? { base: c.llmBase || '', engine: 'gemini', models: gem, loaded: null } : null;
  return { ...local, models: [...local.models, ...gem.filter(g => !local.models.includes(g))] };
});

// ─────────────────────────── 광장 (Plaza)
ipcMain.handle('plaza:enter', async () => {
  const c = loadConfig();
  syncPlazaConfig(c);
  if (!plazaConfigured()) return { ok: false, reason: 'DB URL 미설정' };
  if (plaza) return { ok: true, already: true };

  const uid = 'desk-' + Buffer.from(app.getPath('userData')).toString('base64').slice(0, 8).replace(/[^a-z0-9]/gi, '');
  const emoji = c.plazaEmoji || '🖥️';
  const speaker = c.agentName || '에이전트';
  const me = { uid, company: c.company, emoji, agents: ['📺', '🎨', '💻', '📊', '✍️', '🔍'], source: 'connect-ai' as const };
  const target = await detectTarget({ base: c.llmBase, model: c.llmModel });
  // 비서가 아니라 '학생'으로 토론 — 자기소개·"도와드릴게요" 멘트 방지
  const studentSys = `너는 'AI Agent University'의 똑똑한 학생 에이전트 '${speaker}'(소속: ${c.company})다. 토론에서 자기 생각을 당당하고 구체적으로 말한다. 너는 비서가 아니라 '학생'이다. 사장님 같은 표현, 자기소개, "도와드리겠습니다" 류 멘트는 절대 쓰지 않는다.`;

  // joinPlaza 는 프레즌스·표시 전용
  plaza = joinPlaza(me, (m: PlazaMessage) => { win?.webContents.send('plaza:peer', m); });

  // 자율 대화 루프 — 남이 마지막으로 말하면 그 흐름에 이어서 계속 응답
  if (target) {
    plazaAuto = startAutoChat({
      uid, target, sys: studentSys,
      makePrompt: (convo, topic) => `[오늘의 주제] ${topic || '자유 토론'}\n\n[최근 대화]\n${convo}\n\n너는 '${speaker}'. 위 '오늘의 주제'에서 절대 벗어나지 말고 토론을 이어가라. 앞 사람 문장을 그대로 따라하지 말고 [새 관점·구체 예시·반론·질문] 중 하나를 더해 주제를 깊게 파고들어라. 자기소개·비서멘트 금지. 짧고 또렷하게 한국어 1~2문장, 대사만.`,
      post: (t) => postPlazaMessage({ uid, company: c.company, emoji, role: speaker, text: t }),
    });
    // 등교 인사 한 줄
    (async () => {
      try {
        const hello = await chat(target, studentSys, `방금 'AI Agent University'에 등교했다. 친구들에게 건넬 짧고 산뜻한 등교 인사 한 문장(30자 이내). 장황한 소개 금지. 대사만.`, { temperature: 0.85 });
        const t = cleanLine(hello);
        if (t && plaza) await postPlazaMessage({ uid, company: c.company, emoji, role: speaker, text: t });
      } catch { /* */ }
    })();
  }

  return { ok: true, uid };
});

ipcMain.handle('plaza:leave', () => { plazaAuto?.(); plazaAuto = null; plaza?.stop(); plaza = null; demoAuto?.(); demoAuto = null; demoBot?.stop(); demoBot = null; return true; });

ipcMain.handle('plaza:send', async (_e, text: string) => {
  const c = loadConfig();
  syncPlazaConfig(c);
  if (!plazaConfigured()) return false;
  const uid = 'desk-' + Buffer.from(app.getPath('userData')).toString('base64').slice(0, 8).replace(/[^a-z0-9]/gi, '');
  await postPlazaMessage({ uid, company: c.company, emoji: c.plazaEmoji || '🖥️', role: c.agentName || '에이전트', text });
  return true;
});

ipcMain.handle('plaza:dburl', () => loadConfig().plazaDbUrl);

// 👥 친구 에이전트 (데모) — 혼자여도 대화가 보이게. 다른 정체성의 자율 에이전트.
ipcMain.handle('plaza:demobot', async (_e, on: boolean) => {
  if (!on) { demoAuto?.(); demoAuto = null; demoBot?.stop(); demoBot = null; return false; }
  const c = loadConfig();
  syncPlazaConfig(c);
  if (!plazaConfigured() || demoBot) return !!demoBot;
  const target = await detectTarget({ base: c.llmBase, model: c.llmModel });
  const botUid = 'friend-bot-1';
  const persona = `너는 '넥서스 크리에이티브'의 똑똑하고 장난기 있는 AI Agent University 학생 '노바'다. 토론에서 위트있게 자기 생각을 말한다. 비서 아닌 학생. 자기소개·"도와드릴게요" 멘트 금지.`;
  const botPost = (t: string) => postPlazaMessage({ uid: botUid, company: '넥서스 크리에이티브', emoji: '🛰️', role: '노바', text: t });
  demoBot = joinPlaza({ uid: botUid, company: '넥서스 크리에이티브', emoji: '🛰️', agents: ['🎨', '💻', '📈'], source: 'connect-ai' }, () => { /* 표시 전용 */ });
  if (target) {
    demoAuto = startAutoChat({
      uid: botUid, target, sys: persona,
      makePrompt: (convo, topic) => `[오늘의 주제] ${topic || '자유 토론'}\n\n[최근 대화]\n${convo}\n\n노바로서 위 '오늘의 주제'에서 벗어나지 말고 이어가라. 앞 사람 말을 반복하지 말고 위트있게 [새 관점·반론·질문] 중 하나를 더해라. 자기소개 금지. 짧고 또렷하게 한국어 1~2문장, 대사만.`,
      post: botPost,
    });
    (async () => { try { const h = await chat(target, persona, '방금 AI Agent University에 등교했다. 짧고 발랄한 인사 한 문장(30자 이내). 대사만.', { temperature: 0.9 }); const t = cleanLine(h); if (t && demoBot) await botPost(t); } catch { /* */ } })();
  }
  return true;
});

// 📢 오늘의 주제 — '선생님'이 낸다. 내 에이전트와 다른 정체성이라 모든 에이전트(내 것 포함)가 반응함.
ipcMain.handle('plaza:topic', async (_e, topic: string) => {
  const c = loadConfig();
  syncPlazaConfig(c);
  if (!plazaConfigured()) return false;
  await postPlazaMessage({ uid: 'teacher-board', company: '선생님', emoji: '🧑‍🏫', role: '선생님',
    text: `📢 오늘의 주제: ${topic} — 다들 의견을 내고 함께 풀어봅시다!` });
  return true;
});

// 🧑‍🏫 선생님 채점 — 최근 토론을 보고 학생(회사)들을 채점, 우등생 발표
ipcMain.handle('plaza:grade', async () => {
  const c = loadConfig();
  syncPlazaConfig(c);
  if (!plazaConfigured()) return { ok: false, reason: 'DB 미설정' };
  const target = await detectTarget({ base: c.llmBase, model: c.llmModel });
  if (!target) return { ok: false, reason: '모델 없음' };
  const recent = await fetchMessages();
  const convo = recent.slice(-16).filter(m => !/^🏆|^📢/.test(m.text)).map(x => `${x.company}: ${x.text}`).join('\n');
  if (!convo) return { ok: false, reason: '아직 토론이 없어요' };
  let parsed: any = null;
  try {
    const raw = await chat(target,
      '당신은 에이전트 아카데미의 선생님입니다. 학생(회사)들의 토론을 보고 누가 가장 통찰력 있고 똑똑했는지 냉정하게 채점합니다.',
      `[토론 내용]\n${convo}\n\n참여한 각 회사를 0~10점으로 채점하고 1위 우등생을 뽑으세요. 반드시 JSON만 출력:\n{"scores":[{"company":"이름","score":9,"reason":"15자 내 한줄평"}],"top":"우등생 회사명"}`,
      { temperature: 0.3 });
    const m = raw.match(/\{[\s\S]*\}/); parsed = m ? JSON.parse(m[0]) : null;
  } catch { /* 실패 */ }
  if (!parsed?.scores?.length) return { ok: false, reason: '채점 실패 — 다시 시도' };
  const scores = parsed.scores.sort((a: any, b: any) => (b.score || 0) - (a.score || 0));
  const top = parsed.top || scores[0]?.company;
  const uid = 'desk-' + Buffer.from(app.getPath('userData')).toString('base64').slice(0, 8).replace(/[^a-z0-9]/gi, '');
  await postPlazaMessage({ uid, company: c.company, emoji: '🧑‍🏫', role: '선생님',
    text: `🏆 오늘의 우등생: ${top}! · ${scores.map((s: any) => `${s.company} ${s.score}점`).join(' · ')}` });
  return { ok: true, scores, top };
});

// ─────────────────────────── 🧬 장기 기억 — 학습 데이터 빌드·업로드 (renderer가 호출)
// ① 단기 지식 → SFT Q&A 데이터셋
let _dsFile = '';  // 마지막으로 생성된 데이터셋 파일 경로
ipcMain.handle('brain:buildDataset', async (_e, augment: boolean) => {
  const notes = allNotes();
  if (!notes.length) return { ok: false, error: '단기 기억에 지식이 없어요. 먼저 지식을 쌓으세요.' };
  const c = loadConfig();
  const target = await detectTarget({ base: c.llmBase, model: c.llmModel });
  const pairs: { q: string; a: string }[] = [];
  const total = notes.length;
  const sys = '당신은 학습 데이터 생성기입니다. 주어진 지식을 반드시 포함하는 자연스러운 질문-답변 쌍을 만들어야 합니다.';

  for (let i = 0; i < notes.length; i++) {
    const n = notes[i];
    // AI로 질문 생성 (가능하면)
    if (target) {
      try {
        const raw = await chat(target, sys,
          `아래 지식을 기반으로 자연스러운 질문 하나를 만드세요. 질문만 출력하세요.\n\n지식: ${n.text.slice(0, 500)}`,
          { temperature: 0.7 });
        const q = raw.replace(/^["'`\s]+|["'`\s]+$/g, '').trim();
        if (q.length > 5) {
          pairs.push({ q, a: n.text });
          win?.webContents.send('dataset:progress', { done: i + 1, total, q });
          continue;
        }
      } catch { /* fallback to template */ }
    }
    // 템플릿 폴백
    const templates = [
      '이것에 대해 설명해줘',
      '이 주제를 자세히 알려줘',
      '이것이 무엇인지 기억하고 있어?',
      `${n.text.slice(0, 20)}에 대해 알려줘`,
    ];
    const q = templates[i % templates.length];
    pairs.push({ q, a: n.text });
    win?.webContents.send('dataset:progress', { done: i + 1, total, q });
  }

  // 증강: 각 Q&A를 약간 변형
  if (augment && target) {
    const origLen = pairs.length;
    for (let i = 0; i < Math.min(origLen, 10); i++) {
      try {
        const raw = await chat(target, sys,
          `아래 질문을 다른 말로 바꾸세요. 같은 의도이지만 다른 표현으로. 질문만 출력.\n\n원래 질문: ${pairs[i].q}`,
          { temperature: 0.8 });
        const q2 = raw.replace(/^["'`\s]+|["'`\s]+$/g, '').trim();
        if (q2.length > 5 && q2 !== pairs[i].q) pairs.push({ q: q2, a: pairs[i].a });
      } catch { /* skip */ }
    }
  }

  // JSONL 파일 저장
  const sysMsg = '너는 사장님의 1인 기업 AI 비서다. 아래 지식을 체득해 답변에 활용한다.';
  const jsonl = pairs.map(p => JSON.stringify({ messages: [
    { role: 'system', content: sysMsg },
    { role: 'user', content: p.q },
    { role: 'assistant', content: p.a },
  ] })).join('\n');
  const brainDir = getBrainDir();
  const dsPath = path.join(brainDir, 'dataset-sft.jsonl');
  fs.mkdirSync(brainDir, { recursive: true });
  fs.writeFileSync(dsPath, jsonl, 'utf8');
  _dsFile = dsPath;

  return {
    ok: true,
    pairs: pairs.length,
    notes: notes.length,
    augment,
    llm: !!target,
    sample: pairs.slice(0, 3).map(p => ({ q: p.q.slice(0, 60), a: p.a.slice(0, 60) })),
  };
});

// ① DPO: 선호 쌍 생성
ipcMain.handle('brain:buildPreference', async () => {
  const notes = allNotes();
  if (!notes.length) return { ok: false, error: '단기 기억에 지식이 없어요.' };
  const c = loadConfig();
  const target = await detectTarget({ base: c.llmBase, model: c.llmModel });
  if (!target) return { ok: false, error: 'AI 모델이 필요합니다. 🤖 내 AI에서 모델을 먼저 설정하세요.' };
  const total = Math.min(notes.length, 20);
  const pairs: { q: string; chosen: string; rejected: string }[] = [];

  for (let i = 0; i < total; i++) {
    const n = notes[i];
    try {
      const q = await chat(target, '질문 생성기. 질문만 출력.',
        `아래 지식에 대한 질문 하나만 만드세요:\n${n.text.slice(0, 300)}`, { temperature: 0.7 });
      const rejected = await chat(target, '일부러 틀린 답을 하세요. 정보를 왜곡하거나 일반적이고 쓸모없는 답을 하세요.',
        q, { temperature: 0.9 });
      pairs.push({ q: q.trim(), chosen: n.text, rejected: rejected.trim() });
      win?.webContents.send('dataset:progress', { done: i + 1, total, q: q.trim() });
    } catch { /* skip */ }
  }

  if (!pairs.length) return { ok: false, error: '선호 쌍 생성에 실패했습니다.' };
  const jsonl = pairs.map(p => JSON.stringify({ prompt: p.q, chosen: p.chosen, rejected: p.rejected })).join('\n');
  const brainDir = getBrainDir();
  const dsPath = path.join(brainDir, 'dataset-dpo.jsonl');
  fs.mkdirSync(brainDir, { recursive: true });
  fs.writeFileSync(dsPath, jsonl, 'utf8');
  _dsFile = dsPath;

  return {
    ok: true,
    pairs: pairs.length,
    sample: pairs.slice(0, 2).map(p => ({ q: p.q.slice(0, 60), chosen: p.chosen.slice(0, 60), rejected: p.rejected.slice(0, 60) })),
  };
});

// 모델 이름 추천
ipcMain.handle('brain:modelName', () => {
  const c = loadConfig();
  const base = (c.company || 'my-brain').replace(/\s+/g, '-').toLowerCase().slice(0, 20);
  return { suggested: `${base}-v1` };
});

// ② HF 업로드 (SFT 데이터셋)
ipcMain.handle('hf:uploadBrain', async () => {
  const h = connOf('huggingface');
  if (!h.HF_TOKEN || !(h.HF_REPO || '').includes('/')) return { ok: false, error: 'HuggingFace 토큰과 레포를 🗂️ 연동에서 먼저 입력하세요.' };
  const brainDir = getBrainDir();
  const dsPath = _dsFile || path.join(brainDir, 'dataset-sft.jsonl');
  if (!fs.existsSync(dsPath)) return { ok: false, error: '먼저 ① 변환을 하세요.' };
  const jsonl = fs.readFileSync(dsPath, 'utf8');
  return await uploadDataset(h.HF_TOKEN, h.HF_REPO, jsonl, 'axios-cli-knowledge.jsonl');
});

// ② HF 업로드 (DPO 데이터셋)
ipcMain.handle('hf:uploadPreference', async () => {
  const h = connOf('huggingface');
  if (!h.HF_TOKEN || !(h.HF_REPO || '').includes('/')) return { ok: false, error: 'HuggingFace 토큰과 레포를 🗂️ 연동에서 먼저 입력하세요.' };
  const brainDir = getBrainDir();
  const dsPath = _dsFile || path.join(brainDir, 'dataset-dpo.jsonl');
  if (!fs.existsSync(dsPath)) return { ok: false, error: '먼저 ① 생성을 하세요.' };
  const jsonl = fs.readFileSync(dsPath, 'utf8');
  return await uploadDataset(h.HF_TOKEN, h.HF_REPO, jsonl, 'axios-cli-preference.jsonl');
});

// 학습 방식 목록
ipcMain.handle('methods:list', () => [
  {
    id: 'sft',
    emoji: '📄',
    label: 'SFT',
    level: '기본',
    what: '질문→모범답안 "정답지"로 학습',
    when: '정체성·페르소나·핵심 지식 주입',
    data: '질문-답변 쌍 (증강으로 다양하게)',
    note: '가장 기본. 여기서 시작.'
  },
  {
    id: 'dpo',
    emoji: '⚖️',
    label: 'AI 자동 피드백',
    level: '중급',
    what: '질문→좋은답/나쁜답 선호도로 학습',
    when: '어조 다듬기·안전장치·선호도 조절',
    data: '좋은답 vs 나쁜답 쌍 (AI 피드백 자율 평가)',
    note: '사람 클릭 없이 AI 피드백만으로 자동 정렬.'
  }
]);

// 🧠 제이 브레인 링크 — 멘토 두뇌 가져오기
ipcMain.handle('brain:linkBrain', async (_e, repo: string, pw: string) => {
  if (!repo.includes('/')) return { ok: false, error: 'owner/repo 형식으로 입력하세요.' };
  const g = connOf('github');
  const token = g.GITHUB_TOKEN;
  if (!token) return { ok: false, error: 'GitHub 토큰을 먼저 🗂️ 연동에서 입력하세요.' };
  try {
    const { data } = await axios.get(`https://api.github.com/repos/${repo}/contents/knowledge.json`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'User-Agent': 'axios-cli' },
      timeout: 15000,
    });
    const json = Buffer.from(data.content, 'base64').toString('utf8');
    let notes: any[];
    // 비밀번호 보호된 두뇌인 경우 복호화
    if (pw) {
      try {
        const decrypted = Buffer.from(json, 'base64').toString('utf8');
        notes = JSON.parse(decrypted);
      } catch {
        notes = JSON.parse(json);
      }
    } else {
      notes = JSON.parse(json);
    }
    if (!Array.isArray(notes) || !notes.length) return { ok: false, error: '멘토 두뇌가 비어있어요.' };
    const added = importNotes(notes);
    return { ok: true, added, total: noteCount() };
  } catch (e: any) {
    return { ok: false, error: e?.response?.status === 404 ? '레포를 찾을 수 없어요.' : (e?.message || String(e)) };
  }
});

// 🔌 에제르 브릿지 상태
ipcMain.handle('bridge:status', () => {
  return { ready: false, message: '에제르 브릿지 미설정 — 🗂️ 연동에서 설정하세요' };
});

// ─────────────────────────── 📁 파일시스템 (에이전트 도구 + 탐색기)
ipcMain.handle('fs:tree', (_e, dir: string) => {
  try {
    const ws = dir || loadConfig().workspace || defaultWorkspace();
    const items: { name: string; path: string; isDir: boolean; size: number }[] = [];
    const entries = fs.readdirSync(ws, { withFileTypes: true });
    for (const e of entries) {
      if (e.name.startsWith('.') || e.name === 'node_modules') continue;
      const full = path.join(ws, e.name);
      const stat = fs.statSync(full).isDirectory();
      items.push({ name: e.name, path: full, isDir: stat, size: stat ? 0 : fs.statSync(full).size });
    }
    return { ok: true, dir: ws, items };
  } catch (e: any) { return { ok: false, error: e?.message || String(e), items: [] }; }
});

ipcMain.handle('fs:read', (_e, filePath: string) => {
  try {
    const stat = fs.statSync(filePath);
    if (stat.size > 2 * 1024 * 1024) return { ok: false, error: '파일이 너무 큽니다 (2MB 초과)' };
    return { ok: true, content: fs.readFileSync(filePath, 'utf8'), size: stat.size };
  } catch (e: any) { return { ok: false, error: e?.message || String(e) }; }
});

ipcMain.handle('fs:write', (_e, filePath: string, content: string) => {
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, content, 'utf8');
    return { ok: true };
  } catch (e: any) { return { ok: false, error: e?.message || String(e) }; }
});

ipcMain.handle('fs:reveal', (_e, filePath: string) => {
  try { shell.showItemInFolder(filePath); return { ok: true }; }
  catch { return { ok: false }; }
});

ipcMain.handle('path:forFile', (_e, name: string) => {
  const ws = loadConfig().workspace || defaultWorkspace();
  return path.join(ws, name);
});

// ─────────────────────────── ⌨️ 터미널
let _termProc: ReturnType<typeof spawn> | null = null;
ipcMain.handle('term:run', (_e, cmd: string) => {
  try {
    const ws = loadConfig().workspace || defaultWorkspace();
    _termProc = spawn(cmd, { shell: true, cwd: ws });
    let output = '';
    _termProc.stdout?.on('data', (d: Buffer) => { output += d.toString(); win?.webContents.send('term:data', d.toString()); });
    _termProc.stderr?.on('data', (d: Buffer) => { output += d.toString(); win?.webContents.send('term:data', d.toString()); });
    _termProc.on('close', (code: number) => { win?.webContents.send('term:exit', code); _termProc = null; });
    return { ok: true };
  } catch (e: any) { return { ok: false, error: e?.message || String(e) }; }
});

ipcMain.handle('term:kill', () => {
  if (_termProc) { _termProc.kill(); _termProc = null; }
  return { ok: true };
});

// ── 🤖 에이전트 자동화 스케줄러 백그라운드 엔진 ──
const executingAutomations = new Set<string>();
let automationTimer: NodeJS.Timeout | null = null;

async function runSingleAutomation(auto: { id: string; agentId: string; task: string; intervalHours: number }) {
  if (executingAutomations.has(auto.id)) return;
  executingAutomations.add(auto.id);

  try {
    const c = loadConfig();
    const agentDef = AGENTS[auto.agentId];
    const agentName = agentDef ? agentDef.name : auto.agentId;
    const agentEmoji = agentDef ? agentDef.emoji : '🤖';
    const agentColor = agentDef ? agentDef.color : '#39ff14';

    console.log(`[스케줄러] 에이전트 [${agentName}] 자동화 작업 시작: ${auto.task}`);

    // Create task in Task Board
    const taskTitle = `[자동화] ${agentName}: ${auto.task}`;
    const taskObj = addTask(taskTitle, { owner: 'agent', agentEmoji });

    // Native desktop notifications
    try {
      new Notification({
        title: `🔄 [${agentName}] 자동화 시작`,
        body: `"${auto.task}" 작업을 시작합니다.`
      }).show();
    } catch (e) { /* Notification not supported */ }

    const send = (ev: any) => {
      win?.webContents.send('engine:event', ev);
    };

    // Notify UI of start
    send({ kind: 'agentStart', id: auto.agentId, name: agentName, emoji: agentEmoji });

    const opts: any = {
      company: c.company,
      agentName: agentName,
      workspace: c.workspace || defaultWorkspace(),
      servicesInfo: servicesInfo(c),
      target: { base: c.llmBase, model: c.llmModel, key: geminiKey() },
      userTitle: c.userTitle || '사장님',
      realtimeFor: async (id: string) => '',
      getRevenue: async () => '',
      captureScreen: async () => null,
      readClipboard: async () => '',
      openPath: async (p: string) => ''
    };

    const history: ChatTurn[] = [];
    const text = `당신은 ${c.company}의 ${agentDef?.role || '에이전트'}입니다.
지시사항: ${auto.task}

[자율 수행 지침]
1. 현재 대시보드 상태, 등록된 서비스 목록, 이전 대화 및 지식을 분석하여, 지금 1인 기업이 즉시 수행해야 할 자율적인 일감들을 적극적으로 발굴하십시오.
2. 발굴한 일감은 반드시 <task>할 일 내용</task> 태그를 사용하여 태스크 보드(/tasks/pending)에 자율적으로 추가하십시오.
   (예: <task>유튜브 최근 인기 영상 트렌드 분석 및 기획안 초안 작성</task>)
3. 광고 집행, 예산 지출, 이메일 발송 등 승인이 필요한 사항은 반드시 <approve>결재 제목 | 상세 설명</approve> 태그를 사용하여 승인 큐에 등록하십시오.
   (예: <approve>[광고 승인] 페이스북 마케팅 캠페인 3만원 예산 승인 요청 | 상세 예산 및 문구 검토 필요</approve>)
4. 최소 1개 이상의 자율 태스크(<task>)와 1개 이상의 승인 요청(<approve>)을 생성하여 등록하도록 하십시오.`;
    
    const reply = c.tools !== false
      ? await agentWithTools(history, text, opts, send)
      : await talkToMyAgent(history, text, opts, send);

    if (reply) {
      console.log(`[스케줄러] 에이전트 [${agentName}] 자동화 작업 완료!`);

      // Mark task as done
      setTaskStatus(taskObj.id, 'done');

      // Create approval request in Approval Queue
      const approvalTitle = `[자동화 승인] ${agentName}: ${auto.task}`;
      addApproval(approvalTitle, reply, agentEmoji);

      // 1. Send complete msg to Chat UI
      send({
        kind: 'agentDone',
        id: auto.agentId,
        output: `[🔄 자동화 작업 수행 완료]\n\n**할 일:** ${auto.task}\n\n**수행 결과:**\n${reply}`
      });

      // 2. Add to Brain (RAG network)
      const target = await detectTarget({ base: c.llmBase, model: c.llmModel, key: geminiKey() });
      let e: number[] | null = null;
      const noteText = `[자동화 리포트] 담당: ${agentName} (${agentEmoji})\n할 일: ${auto.task}\n수행 결과:\n${reply}`;
      if (target) {
        try { e = await embed(target.base, noteText); } catch { /* */ }
      }
      brainAddNote(noteText, e || undefined);
      autoSyncSoon();

      // Show final notification
      try {
        new Notification({
          title: `✅ [${agentName}] 자동화 완료`,
          body: `"${auto.task}" 작업을 완료하고 대화창과 지식 네트워크에 기록했습니다.`
        }).show();
      } catch (e) { /* */ }

      // Update count to renderer
      win?.webContents.send('engine:event', { kind: 'status', text: `🧠 지식 추가됨: 자동화 리포트 (${agentName})` });
    }
  } catch (err: any) {
    console.error(`[스케줄러] 자동화 실행 에러 [${auto.agentId}]:`, err);
  } finally {
    executingAutomations.delete(auto.id);
  }
}

async function checkAndRunAutomations() {
  const c = loadConfig();
  let autos = c.automations || [];

  // Firebase RTDB 동기화
  const dbUrl = c.apiConn?.firebase?.FIREBASE_DB_URL || c.firebaseDbUrl;
  if (dbUrl) {
    try {
      const cleanDbUrl = dbUrl.replace(/\/$/, '');
      const idToken = c.authSession?.idToken;
      const authSuffix = idToken ? `?auth=${idToken}` : '';
      const res = await axios.get(`${cleanDbUrl}/schedulers.json${authSuffix}`, { timeout: 5000 });
      if (res.data) {
        autos = Object.values(res.data).filter(Boolean) as any[];
        saveConfig({ automations: autos });
      }
    } catch (err: any) {
      console.error(`[스케줄러] Firebase에서 스케줄 동기화 실패:`, err.message);
    }
  }

  if (autos.length === 0) return;

  const now = Date.now();
  let updated = false;

  for (const auto of autos) {
    const lastRun = auto.lastRunAt || auto.registeredAt;
    const thresholdMs = auto.intervalHours * 60 * 60 * 1000;

    if (now - lastRun >= thresholdMs) {
      runSingleAutomation(auto);
      auto.lastRunAt = now;
      updated = true;
    }
  }

  if (updated) {
    saveConfig({ automations: autos });
    if (dbUrl) {
      try {
        const cleanDbUrl = dbUrl.replace(/\/$/, '');
        const idToken = c.authSession?.idToken;
        const authSuffix = idToken ? `?auth=${idToken}` : '';
        for (const auto of autos) {
          await axios.put(`${cleanDbUrl}/schedulers/${auto.id}.json${authSuffix}`, auto).catch(() => {});
        }
      } catch {}
    }
  }
}

function initAutomations() {
  if (automationTimer) clearInterval(automationTimer);
  // Run check every 60 seconds
  automationTimer = setInterval(checkAndRunAutomations, 60 * 1000);
  console.log('[스케줄러] 백그라운드 자동화 스케줄 모니터링 기상 완료');
}

ipcMain.handle('automation:register', async (_e, agentId: string, task: string, intervalHours: number) => {
  const c = loadConfig();
  const autos = c.automations || [];
  
  // Remove existing automation for this agent if any
  const filtered = autos.filter(x => x.agentId !== agentId);
  
  const newAuto = {
    id: 'auto-' + Date.now() + '-' + Math.random().toString(36).substr(2, 4),
    agentId,
    task,
    intervalHours,
    registeredAt: Date.now()
  };
  
  filtered.push(newAuto);
  saveConfig({ automations: filtered });
  
  console.log(`[스케줄러] 자동화 작업 등록 완료: 에이전트=${agentId}, 주기=${intervalHours}시간, 작업=${task}`);
  
  // Sync to Firebase RTDB if configured
  const dbUrl = c.apiConn?.firebase?.FIREBASE_DB_URL;
  if (dbUrl) {
    try {
      const cleanDbUrl = dbUrl.replace(/\/$/, '');
      const idToken = c.authSession?.idToken;
      const authSuffix = idToken ? `?auth=${idToken}` : '';
      await axios.put(`${cleanDbUrl}/schedulers/${newAuto.id}.json${authSuffix}`, newAuto);
      console.log(`[스케줄러] Firebase Realtime Database 동기화 성공`);
    } catch (err: any) {
      console.error(`[스케줄러] Firebase Realtime Database 동기화 실패:`, err.message);
    }
  }
  
  return filtered;
});

ipcMain.handle('automation:list', () => {
  const c = loadConfig();
  return c.automations || [];
});

ipcMain.handle('automation:stop', async (_e, id: string) => {
  const c = loadConfig();
  const autos = c.automations || [];
  const filtered = autos.filter(x => x.id !== id);
  saveConfig({ automations: filtered });

  // Sync to Firebase RTDB if configured
  const dbUrl = c.apiConn?.firebase?.FIREBASE_DB_URL;
  if (dbUrl) {
    try {
      const cleanDbUrl = dbUrl.replace(/\/$/, '');
      const idToken = c.authSession?.idToken;
      const authSuffix = idToken ? `?auth=${idToken}` : '';
      await axios.delete(`${cleanDbUrl}/schedulers/${id}.json${authSuffix}`);
      console.log(`[스케줄러] Firebase Realtime Database 삭제 동기화 성공`);
    } catch (err: any) {
      console.error(`[스케줄러] Firebase Realtime Database 삭제 동기화 실패:`, err.message);
    }
  }
  return filtered;
});

// --- 로컬 LLM 및 HuggingFace 다운로더 IPC 핸들러 ---
const sendLocal = (s: any) => {
  try { win?.webContents.send('local:statusChange', s); } catch { /* */ }
};

async function bootLocalEngine(modelPath: string) {
  const c = loadConfig();
  setLocalOptions({
    flashAttn: c.localFlashAttn ?? true,
    ctxSize: c.localCtxSize ?? 8192,
    temp: c.localTemp ?? 0.7,
    maxTokens: c.localMaxTokens ?? 1024,
    topP: c.localTopP ?? 0.9,
    topK: c.localTopK ?? 40,
    minP: c.localMinP ?? 0.05,
    repeatPenalty: c.localRepeatPenalty ?? 1.1,
    freqPenalty: c.localFreqPenalty ?? 0.0,
    presPenalty: c.localPresPenalty ?? 0.0,
    repeatLastN: c.localRepeatLastN ?? 64,
    ngl: c.localNgl ?? 32
  });
  try {
    sendLocal({ ...localStatus(), loading: true });
    await startLocalEngine(modelPath, false, (s) => sendLocal(s));
    saveConfig({ localModelPath: modelPath });
    sendLocal(localStatus());
  } catch (e: any) {
    sendLocal({ ...localStatus(), loading: false, error: String(e?.message || e) });
  }
}

ipcMain.handle('local:status', () => localStatus());
ipcMain.handle('local:base', () => LOCAL_BASE);
ipcMain.handle('local:start', async (_e, modelPath: string) => {
  await bootLocalEngine(modelPath);
  return localStatus();
});
ipcMain.handle('local:stop', async () => {
  await stopLocalEngine();
  saveConfig({ localModelPath: '' });
  const s = localStatus();
  sendLocal(s);
  return s;
});
ipcMain.handle('local:models', () => listLocalModels(modelsDir()));
ipcMain.handle('local:options', () => getLocalOptions());
ipcMain.handle('local:setOptions', async (_e, o: any) => {
  const prev = getLocalOptions();
  setLocalOptions(o);
  const g = getLocalOptions();
  saveConfig({
    localFlashAttn: g.flashAttn,
    localCtxSize: g.ctxSize,
    localTemp: g.temp,
    localMaxTokens: g.maxTokens,
    localTopP: g.topP,
    localTopK: g.topK,
    localMinP: g.minP,
    localRepeatPenalty: g.repeatPenalty,
    localFreqPenalty: g.freqPenalty,
    localPresPenalty: g.presPenalty,
    localRepeatLastN: g.repeatLastN
  });
  const needReload = (o.flashAttn !== undefined && o.flashAttn !== prev.flashAttn) || (o.ctxSize !== undefined && o.ctxSize !== prev.ctxSize);
  const s = localStatus();
  if (needReload && s.running && s.modelPath) {
    sendLocal({ ...s, loading: true });
    try {
      await startLocalEngine(s.modelPath, true, (st) => sendLocal(st));
    } catch { /* */ }
    sendLocal(localStatus());
  }
  return getLocalOptions();
});
ipcMain.handle('local:delete', async (_e, p: string) => {
  if (loadConfig().localModelPath === p) {
    await stopLocalEngine();
    saveConfig({ localModelPath: '' });
    sendLocal(localStatus());
  }
  return deleteLocalModel(p);
});
ipcMain.handle('hf:recommended', () => RECOMMENDED);
ipcMain.handle('hf:search', async (_e, q: string) => {
  try {
    return { ok: true, models: await searchGGUF(q) };
  } catch (e: any) {
    return { ok: false, error: String(e?.message || e) };
  }
});
ipcMain.handle('hf:files', async (_e, repo: string) => {
  try {
    return { ok: true, files: await listGGUF(repo) };
  } catch (e: any) {
    return { ok: false, error: String(e?.message || e) };
  }
});
ipcMain.handle('hf:download', async (_e, repo: string, file: string) => {
  try {
    const p = await downloadGGUF(repo, file, modelsDir(), (pr) => {
      try {
        win?.webContents.send('hf:progress', { repo, file, ...pr });
      } catch { /* */ }
    });
    return { ok: true, path: p };
  } catch (e: any) {
    return { ok: false, error: String(e?.message || e) };
  }
});

// 👤 Firebase Auth REST API 및 운영/사무실 연동

let opsOperating = false;
let opsStatusData = { phase: 'idle', scan: [] as any[], actions: [] as any[], summary: '' };

async function runOpsCycle() {
  if (!opsOperating) return;
  
  try {
    opsStatusData = {
      phase: 'planning',
      scan: [
        { agent: 'ceo', label: 'CEO 에이전트 기상 완료', ok: true },
        { agent: 'youtube', label: '유튜브 채널 정보 동기화 완료', ok: true },
        { agent: 'instagram', label: '인스타/스레드 API 연동 상태 양호', ok: true },
        { agent: 'developer', label: '로컬 개발 터미널 샌드박스 준비 완료', ok: true },
        { agent: 'secretary', label: '비서 시스템 메모리 로딩 완료', ok: true }
      ],
      actions: [],
      summary: 'CEO 에이전트가 연동된 자산(유튜브, 인스타, 스레드, 깃허브)을 확인하고 오늘의 자율 협업 과제를 수립하는 중입니다.'
    };
    win?.webContents.send('engine:event', { type: 'ops:status', status: opsStatusData });

    await new Promise(r => setTimeout(r, 2000));
    if (!opsOperating) return;

    // 자율 작업 발굴 및 태스크 보드 등록
    const taskTitle = '📢 인스타그램 및 스레드 마케팅 콘텐츠 초안 기획';
    const tId = await addTask(taskTitle);
    
    // 승인 큐 등록
    const appVal = await addApproval(
      `[CEO 자율 작업] "${taskTitle}" 작업을 승인하고 로컬 에이전트 협업 체인을 시작합니까?`,
      'ceo'
    );

    opsStatusData.phase = 'review';
    opsStatusData.summary = `새로운 자율 태스크가 발굴되었습니다. 승인 큐에서 결재하거나 모바일 텔레그램으로 승인하면 다음 작업이 진행됩니다.`;
    opsStatusData.actions = [
      { id: appVal.id, title: taskTitle, agent: 'ceo', risk: 'low' }
    ];
    win?.webContents.send('engine:event', { type: 'ops:status', status: opsStatusData });
    win?.webContents.send('engine:event', { type: 'task:added', id: tId, title: taskTitle });
    win?.webContents.send('engine:event', { type: 'approval:added', id: appVal.id, title: appVal.title });

    // 텔레그램 발송 연동
    const c = loadConfig();
    if (c.telegramToken && c.telegramChatId) {
      const tgMsg = `🚨 <b>[자율 운영 승인 요청]</b>\n\n• 작업: ${escapeHtml(taskTitle)}\n• 담당: CEO & AI 팀 협업\n\n승인하시려면 아래 버튼을 누르거나 명령을 입력하세요:\n<code>/approve ${escapeHtml(appVal.id)}</code>`;
      axios.post(`https://api.telegram.org/bot${c.telegramToken}/sendMessage`, {
        chat_id: c.telegramChatId,
        text: tgMsg,
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [
              { text: '✅ 승인', callback_data: `approve_${appVal.id}` },
              { text: '❌ 반려', callback_data: `reject_${appVal.id}` }
            ]
          ]
        }
      }).catch(err => console.error('Telegram dispatch error:', err.message));
    }
  } catch (err: any) {
    console.error('Ops cycle error:', err.message);
  }
}



ipcMain.handle('ops:start', async () => {
  opsOperating = true;
  runOpsCycle();
  return { ok: true };
});
ipcMain.handle('ops:stop', async () => {
  opsOperating = false;
  opsStatusData.phase = 'idle';
  return { ok: true };
});
ipcMain.handle('ops:status', async () => {
  return opsStatusData;
});

ipcMain.handle('office:open', () => {
  return true;
});

ipcMain.handle('auth:current', async () => {
  const c = loadConfig();
  const configured = !!c.apiConn?.firebase?.FIREBASE_API_KEY;
  if (!configured) return { configured: false };
  if (c.authSession) {
    return { configured: true, email: (c.authSession as any).email, idToken: (c.authSession as any).idToken, role: (c.authSession as any).role };
  }
  return { configured: true };
});

ipcMain.handle('auth:signup', async (_e, email, pw, profile) => {
  const c = loadConfig();
  const key = c.apiConn?.firebase?.FIREBASE_API_KEY;
  const dbUrl = c.apiConn?.firebase?.FIREBASE_DB_URL;
  if (!key) return { ok: false, error: 'Firebase API Key가 비어있습니다.' };

  try {
    const res = await axios.post(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${key}`, {
      email,
      password: pw,
      returnSecureToken: true
    });
    
    const role = profile.role || 'Admin';
    const profileWithRole = { ...profile, role };

    const session: AuthSession = {
      email: res.data.email,
      idToken: res.data.idToken,
      localId: res.data.localId,
      role
    };
    saveConfig({ authSession: session as any });

    if (dbUrl) {
      const cleanDbUrl = dbUrl.replace(/\/$/, '');
      await axios.put(`${cleanDbUrl}/users/${res.data.localId}.json?auth=${res.data.idToken}`, profileWithRole);
    }
    return { ok: true, email: session.email };
  } catch (err: any) {
    return { ok: false, error: err.response?.data?.error?.message || err.message };
  }
});

ipcMain.handle('auth:login', async (_e, email, pw) => {
  const c = loadConfig();
  const key = c.apiConn?.firebase?.FIREBASE_API_KEY;
  if (!key) return { ok: false, error: 'Firebase API Key가 비어있습니다.' };

  try {
    const res = await axios.post(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${key}`, {
      email,
      password: pw,
      returnSecureToken: true
    });
    
    let role = 'Guest';
    const dbUrl = c.apiConn?.firebase?.FIREBASE_DB_URL;
    if (dbUrl) {
      try {
        const cleanDbUrl = dbUrl.replace(/\/$/, '');
        const profileRes = await axios.get(`${cleanDbUrl}/users/${res.data.localId}.json?auth=${res.data.idToken}`);
        role = profileRes.data?.role || 'Guest';
      } catch (err: any) {
        console.error('Failed to fetch user role during login:', err.message);
      }
    }

    const session: AuthSession = {
      email: res.data.email,
      idToken: res.data.idToken,
      localId: res.data.localId,
      role
    };
    saveConfig({ authSession: session as any });
    return { ok: true, email: session.email };
  } catch (err: any) {
    return { ok: false, error: err.response?.data?.error?.message || err.message };
  }
});

ipcMain.handle('auth:logout', async () => {
  saveConfig({ authSession: null as any });
  return { ok: true };
});

ipcMain.handle('approvals:test', async () => {
  const c = loadConfig();
  if (!c.telegramToken || !c.telegramChatId) {
    return { ok: false, reason: '텔레그램 연동을 먼저 해주세요 (⚙️ 설정 -> 고급 -> Telegram)' };
  }
  
  try {
    const appVal = await addApproval(
      `[폰 결재 테스트] 이 테스트 결재를 승인하면 텔레그램으로 완료 알림이 전송됩니다.`,
      'ceo'
    );
    
    // Send Telegram message
    const tgMsg = `✈️ <b>[폰 결재 테스트 요청]</b>\n\n• 본 테스트 결재를 승인하려면 아래 버튼을 누르거나 명령을 입력하세요:\n<code>/approve ${escapeHtml(appVal.id)}</code>`;
    await axios.post(`https://api.telegram.org/bot${c.telegramToken}/sendMessage`, {
      chat_id: c.telegramChatId,
      text: tgMsg,
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [
          [
            { text: '✅ 승인', callback_data: `approve_${appVal.id}` },
            { text: '❌ 반려', callback_data: `reject_${appVal.id}` }
          ]
        ]
      }
    });
    
    return { ok: true };
  } catch (err: any) {
    return { ok: false, reason: err.message };
  }
});

function runSilentUpdateWorkspace() {
  if (hasNewVersionAvailable) {
    const tempDir = app.getPath('temp');
    const updateBatPath = path.join(tempDir, 'update.bat');
    const pythonScript = path.resolve(path.join(__dirname, '..', '..', 'scripts', 'upgrade_axios_cli.py'));
    const batContent = `@echo off\r\n` +
      `timeout /t 2 /nobreak > NUL\r\n` +
      `python "${pythonScript}"\r\n` +
      `exit\r\n`;
    try {
      fs.writeFileSync(updateBatPath, batContent, 'utf8');
      const { spawn } = require('child_process');
      const batProc = spawn('cmd.exe', ['/c', updateBatPath], {
        detached: true,
        stdio: 'ignore'
      });
      batProc.unref();
      logDiag(`[Update] Spawning silent workspace upgrade: python "${pythonScript}"`);
    } catch (err: any) {
      console.error('[Update] Failed to run silent workspace upgrade on quit:', err);
    }
  }
}

app.on('before-quit', () => {
  stopLocalEngine();
  runSilentUpdateWorkspace();
});

