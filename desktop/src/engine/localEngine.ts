import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as http from 'http';
import { spawn, spawnSync, ChildProcess } from 'child_process';
import axios from 'axios';
import { app, dialog } from 'electron';

export const LOCAL_PORT = 1235;
export const LOCAL_BASE = `http://127.0.0.1:${LOCAL_PORT}`;

let _proc: ChildProcess | null = null;
let _modelPath = "";
let _modelName = "";
let _gpu = "";
let _maxCtx = 0;
let _loadedCtx = 0;
let _ready = false;
let _loading = false;
let _error = "";
let _startSeq = 0;

export interface LocalOptions {
  flashAttn: boolean;
  ctxSize: number;
  maxTokens: number;
  temp: number;
  topP: number;
  topK: number;
  minP: number;
  repeatPenalty: number;
  freqPenalty: number;
  presPenalty: number;
  repeatLastN: number;
  ngl: number;
}

let _opts: LocalOptions = {
  flashAttn: true,
  ctxSize: 8192,
  maxTokens: 1024,
  temp: 0.7,
  topP: 0.9,
  topK: 40,
  minP: 0.05,
  repeatPenalty: 1.1,
  freqPenalty: 0,
  presPenalty: 0,
  repeatLastN: 64,
  ngl: 32
};

export function setLocalOptions(o: Partial<LocalOptions>) {
  _opts = { ..._opts, ...o };
}

export function getLocalOptions(): LocalOptions {
  return { ..._opts };
}

export function localStatus() {
  return {
    running: _ready && !!_proc,
    loading: _loading,
    modelName: _modelName,
    modelPath: _modelPath,
    port: LOCAL_PORT,
    base: LOCAL_BASE,
    gpu: _gpu,
    error: _error,
    maxCtx: _maxCtx,
    ctxSize: _loadedCtx
  };
}

export const modelsDir = () => path.join(app.getPath('userData'), 'models');

function getPersistedBinPath(): string {
  try {
    const brainDir = path.join(os.homedir(), '.axios-ai-brain');
    const p = path.join(brainDir, 'axios-cli-config.json');
    if (fs.existsSync(p)) {
      const cfg = JSON.parse(fs.readFileSync(p, 'utf8'));
      return cfg.localEngineBinPath || '';
    }
  } catch {}
  return '';
}

function savePersistedBinPath(binPath: string) {
  try {
    const brainDir = path.join(os.homedir(), '.axios-ai-brain');
    const p = path.join(brainDir, 'axios-cli-config.json');
    let cfg: any = {};
    if (fs.existsSync(p)) {
      cfg = JSON.parse(fs.readFileSync(p, 'utf8'));
    }
    cfg.localEngineBinPath = binPath;
    fs.mkdirSync(brainDir, { recursive: true });
    fs.writeFileSync(p, JSON.stringify(cfg, null, 2), 'utf8');
  } catch {}
}

function binDir() {
  const plat = process.platform === 'win32' ? 'win-x64' : process.arch === 'arm64' ? 'mac-arm64' : 'mac-x64';
  const res = (process as any).resourcesPath;
  if (res) {
    const p = path.join(res, 'llamacpp', plat);
    if (fs.existsSync(p)) return p;
  }
  // Fallback to project root vendor dir
  return path.join(app.getAppPath(), 'vendor', 'llamacpp', plat);
}

function binPath() {
  const persisted = getPersistedBinPath();
  if (persisted && fs.existsSync(persisted)) {
    return persisted;
  }

  // Try axios-engine.exe first, then llama-server.exe on Windows
  const exe = process.platform === 'win32' 
    ? (fs.existsSync(path.join(binDir(), 'axios-engine.exe')) ? 'axios-engine.exe' : 'llama-server.exe')
    : 'llama-server';
  const defaultPath = path.join(binDir(), exe);
  if (fs.existsSync(defaultPath)) {
    return defaultPath;
  }

  // Auto-detect Ollama path on Windows
  if (process.platform === 'win32') {
    const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
    const ollamaPath = path.join(localAppData, 'Programs', 'Ollama', 'ollama.exe');
    if (fs.existsSync(ollamaPath)) {
      savePersistedBinPath(ollamaPath);
      return ollamaPath;
    }
  }

  return '';
}

function getJson(pathname: string, timeoutMs = 2000): Promise<any> {
  return new Promise((resolve) => {
    const req = http.get({
      host: '127.0.0.1',
      port: LOCAL_PORT,
      path: pathname,
      timeout: timeoutMs
    }, (res) => {
      let s = '';
      res.on('data', (d) => s += d);
      res.on('end', () => {
        try {
          resolve(JSON.parse(s));
        } catch {
          resolve(null);
        }
      });
    });
    req.on('error', () => resolve(null));
    req.on('timeout', () => {
      try { req.destroy(); } catch { /* */ }
      resolve(null);
    });
  });
}

async function waitReady(timeoutMs: number): Promise<boolean> {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    if (!_proc) return false;
    const h = await getJson('/health', 1500);
    if (h && (h.status === 'ok' || h.status === undefined)) {
      if (h.status === 'ok' || await getJson('/v1/models', 1500)) return true;
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  return false;
}

function tailErr(log: string): string {
  const lines = log.split(/\r?\n/).filter(l => /error|failed|unknown|assert|exception/i.test(l));
  return lines.slice(-2).join(' | ').slice(0, 300);
}

async function killProc() {
  return new Promise<void>((resolve) => {
    const p = _proc;
    _proc = null;
    if (!p || p.exitCode != null) return resolve();
    let done = false;
    const fin = () => {
      if (!done) {
        done = true;
        resolve();
      }
    };
    p.once('exit', fin);
    try {
      p.kill('SIGTERM');
    } catch { /* */ }
    setTimeout(() => {
      try {
        if (p.exitCode == null) p.kill('SIGKILL');
      } catch { /* */ }
      fin();
    }, 2500);
  });
}

export async function startLocalEngine(modelPath: string, force = false, onStateChange?: (s: any) => void) {
  if (_loading) return localStatus();
  if (!force && _ready && _proc && _modelPath === modelPath) return localStatus();
  
  const seq = ++_startSeq;
  _loading = true;
  _ready = false;
  _error = "";
  
  try {
    await killProc();
    if (seq !== _startSeq) return localStatus();
    
    let bin = binPath();
    if (!bin || !fs.existsSync(bin)) {
      const chosen = dialog.showOpenDialogSync({
        title: '추론 엔진 실행파일 선택 (ollama.exe 또는 axios-engine.exe 등)',
        filters: [
          { name: 'Executables', extensions: process.platform === 'win32' ? ['exe'] : ['*'] }
        ],
        properties: ['openFile']
      });
      if (chosen && chosen[0]) {
        bin = chosen[0];
        savePersistedBinPath(bin);
      } else {
        throw new Error('추론 엔진 실행파일이 지정되지 않아 시작할 수 없어요.');
      }
    }
    
    try {
      if (process.platform !== 'win32') fs.chmodSync(bin, 0o755);
    } catch { /* */ }

    const isOllama = bin.toLowerCase().includes('ollama.exe') || bin.toLowerCase().includes('ollama');
    if (isOllama) {
      const modelDir = path.dirname(modelPath);
      const modelFileContent = `FROM ${modelPath.replace(/\\/g, '/')}`;
      const modelfilePath = path.join(modelDir, 'Modelfile_axios_temp');
      fs.writeFileSync(modelfilePath, modelFileContent, 'utf-8');
      
      const env = { ...process.env, OLLAMA_HOST: `127.0.0.1:${LOCAL_PORT}` };
      const serverProcess = spawn(bin, ['serve'], { env, stdio: 'ignore' });
      _proc = serverProcess;
      
      await new Promise(resolve => setTimeout(resolve, 4000));
      
      try {
        const createRes = spawnSync(bin, ['create', 'axios-local-model', '-f', modelfilePath], { env, timeout: 30000 });
        console.log('[Ollama] Model creation stdout:', createRes.stdout?.toString());
        console.error('[Ollama] Model creation stderr:', createRes.stderr?.toString());
      } catch (err: any) {
        console.error('[Ollama] Model creation failed:', err.message);
      } finally {
        try { fs.unlinkSync(modelfilePath); } catch {}
      }
      
      try {
        await axios.post(`http://127.0.0.1:${LOCAL_PORT}/api/chat`, {
          model: 'axios-local-model',
          messages: [],
          keep_alive: '1h'
        }, { timeout: 15000 });
      } catch {}
      
      _maxCtx = _opts.ctxSize;
      _loadedCtx = _opts.ctxSize;
      _modelPath = modelPath;
      _modelName = 'axios-local-model';
      _ready = true;
      _gpu = 'Ollama';
      return localStatus();
    }
    
    _maxCtx = 0;
    _loadedCtx = _opts.ctxSize;
    
    const threads = Math.max(1, Math.min(4, os.cpus().length - 1));
    const args = [
      '-m', modelPath,
      '--host', '127.0.0.1',
      '--port', String(LOCAL_PORT),
      '-c', String(_opts.ctxSize),
      '-ngl', String(_opts.ngl ?? 32),
      '-fa', _opts.flashAttn ? 'on' : 'off',
      '-t', String(threads),
      '--jinja',
      '--no-webui',
      '--temp', String(_opts.temp),
      '--top-p', String(_opts.topP),
      '--top-k', String(_opts.topK),
      '--min-p', String(_opts.minP),
      '--repeat-penalty', String(_opts.repeatPenalty),
      '--repeat-last-n', String(_opts.repeatLastN),
      '--frequency-penalty', String(_opts.freqPenalty),
      '--presence-penalty', String(_opts.presPenalty)
    ];
    
    const env: any = { ...process.env, GGML_METAL_NO_RESIDENCY: '1' };
    if (process.platform === 'win32') {
      env.PATH = `${binDir()}${path.delimiter}${env.PATH || ''}`;
    }
    
    const child = spawn(bin, args, { cwd: binDir(), env, stdio: ['ignore', 'pipe', 'pipe'] });
    _proc = child;
    
    let log = '';
    const onOut = (d: any) => {
      log = (log + String(d)).slice(-4000);
    };
    child.stdout?.on('data', onOut);
    child.stderr?.on('data', onOut);
    
    child.on('exit', (code) => {
      if (_proc === child) {
        _proc = null;
        _ready = false;
        if (!_error && code) {
          _error = `엔진이 종료되었어요 (code ${code}). ${tailErr(log)}`;
        }
        if (onStateChange) onStateChange(localStatus());
      }
    });
    
    child.on('error', (e) => {
      if (_proc === child) {
        _error = String(e?.message || e);
        _proc = null;
        _ready = false;
        if (onStateChange) onStateChange(localStatus());
      }
    });
    
    if (onStateChange) onStateChange(localStatus());
    
    const ok = await waitReady(120000);
    if (seq !== _startSeq) return localStatus();
    if (!ok || !_proc) throw new Error(_error || `모델 로드 실패. ${tailErr(log)}`);
    
    _modelPath = modelPath;
    _modelName = path.basename(modelPath).replace(/\.gguf$/i, '');
    _ready = true;
    
    try {
      const props = await getJson('/props', 3000);
      if (props) {
        const n = Number(props.n_ctx ?? props?.default_generation_settings?.n_ctx);
        if (n) _loadedCtx = n;
        const tr = Number(props?.default_generation_settings?.n_ctx_train ?? props?.n_ctx_train);
        _maxCtx = tr || n || 0;
      }
    } catch { /* */ }
    
    _gpu = process.platform === 'win32' ? 'cuda/vulkan' : process.arch === 'arm64' ? 'metal' : 'cpu/metal';
    return localStatus();
  } catch (e: any) {
    if (seq === _startSeq) {
      _error = String(e?.message || e);
      _ready = false;
    }
    await killProc();
    throw e;
  } finally {
    if (seq === _startSeq) _loading = false;
  }
}

export async function stopLocalEngine() {
  _startSeq++;
  await killProc();
  _ready = false;
  _modelPath = "";
  _modelName = "";
}

// --- HuggingFace GGUF Search & Download Engine ---

const NON_CHAT_GGUF = /ace[-_]?step|mmproj|embed|whisper|\btts\b|nomic|\bbge\b|rerank|musicgen|bark|wavtokenizer|sdxl|flux|stable-diffusion/i;
const QUANT_RE = /(Q\d[0-9A-Z_]*|IQ\d[0-9A-Z_]*|BF16|F16|F32)/i;

function paramOf(id: string): string {
  const m = (id || '').match(/\b(\d+(?:\.\d+)?x\d+(?:\.\d+)?b|\d+(?:\.\d+)?b)\b/i);
  return m ? m[1].toUpperCase() : '';
}

export async function searchGGUF(query: string) {
  const q = (query || '').trim() || 'gguf';
  const url = `https://huggingface.co/api/models?search=${encodeURIComponent(q)}&filter=gguf&sort=downloads&direction=-1&limit=24`;
  const r = await axios.get(url, { timeout: 15000, headers: { Accept: 'application/json' } });
  return (r.data || []).map((m: any) => {
    const id = m.id || m.modelId;
    const tags = m.tags || [];
    const vision = tags.some((t: string) => /vision|image-text|multimodal|vlm|mmproj/i.test(t)) || /vl|vision|llava/i.test(id);
    return {
      id,
      downloads: m.downloads || 0,
      likes: m.likes || 0,
      params: paramOf(id),
      updated: m.lastModified || m.createdAt || '',
      vision
    };
  }).filter((m: any) => m.id);
}

export async function listGGUF(repo: string) {
  const url = `https://huggingface.co/api/models/${repo}/tree/main?recursive=1`;
  const r = await axios.get(url, { timeout: 20000, headers: { Accept: 'application/json' } });
  return (r.data || [])
    .filter((f: any) => f.type === 'file' && /\.gguf$/i.test(f.path) && !/mmproj/i.test(f.path))
    .map((f: any) => ({
      path: f.path,
      size: f.size || (f.lfs && f.lfs.size) || 0,
      quant: (f.path.match(QUANT_RE) || ['GGUF'])[0].toUpperCase()
    }))
    .sort((a: any, b: any) => a.size - b.size);
}

export async function downloadGGUF(repo: string, filePath: string, destDir: string, onProgress: (pr: any) => void) {
  fs.mkdirSync(destDir, { recursive: true });
  const out = path.join(destDir, path.basename(filePath));
  const tmp = out + '.part';
  if (fs.existsSync(out)) return out;
  
  const url = `https://huggingface.co/${repo}/resolve/main/${filePath.split('/').map(encodeURIComponent).join('/')}?download=true`;
  const r = await axios.get(url, { responseType: 'stream', timeout: 0, maxRedirects: 5, headers: { Accept: 'application/octet-stream' } });
  const total = Number(r.headers['content-length']) || 0;
  
  let received = 0, lastTick = 0;
  const ws = fs.createWriteStream(tmp);
  
  r.data.on('data', (c: Buffer) => {
    received += c.length;
    const now = Date.now();
    if (now - lastTick > 300 || (total && received >= total)) {
      lastTick = now;
      onProgress({ received, total, percent: total ? Math.round(received / total * 100) : 0 });
    }
  });
  
  await new Promise<void>((resolve, reject) => {
    r.data.pipe(ws);
    ws.on('finish', () => resolve());
    ws.on('error', reject);
    r.data.on('error', reject);
  });
  
  fs.renameSync(tmp, out);
  onProgress({ received: total || received, total: total || received, percent: 100 });
  return out;
}

function walkGGUF(root: string, out: any[], source: string, removable: boolean, depth = 0) {
  if (depth > 5) return;
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(root, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    const p = path.join(root, e.name);
    if (e.isDirectory()) {
      walkGGUF(p, out, source, removable, depth + 1);
    } else if (/\.gguf$/i.test(e.name) && !NON_CHAT_GGUF.test(e.name)) {
      try {
        out.push({
          name: e.name.replace(/\.gguf$/i, ''),
          path: p,
          size: fs.statSync(p).size,
          source,
          removable
        });
      } catch { /* */ }
    }
  }
}

export function listLocalModels(dir: string) {
  const out: any[] = [];
  walkGGUF(dir, out, '앱', true);
  walkGGUF(path.join(os.homedir(), '.lmstudio', 'models'), out, 'LM Studio', false);
  walkGGUF(path.join(os.homedir(), '.cache', 'lm-studio', 'models'), out, 'LM Studio', false);
  
  const seen = new Set<string>();
  return out.filter((m) => {
    if (seen.has(m.path)) return false;
    seen.add(m.path);
    return true;
  }).sort((a, b) => a.size - b.size);
}

export function deleteLocalModel(filePath: string): boolean {
  try {
    fs.unlinkSync(filePath);
    return true;
  } catch {
    return false;
  }
}

export const RECOMMENDED = [
  { label: 'Qwen2.5 1.5B', repo: 'Qwen/Qwen2.5-1.5B-Instruct-GGUF', hint: '1GB · 가벼움' },
  { label: 'Llama 3.2 3B', repo: 'bartowski/Llama-3.2-3B-Instruct-GGUF', hint: '2GB · 균형' },
  { label: 'Qwen2.5 7B', repo: 'Qwen/Qwen2.5-7B-Instruct-GGUF', hint: '4.5GB · 똑똑함' }
];
