// ⚡ 단기 기억 = GitHub. 지식 노트를 레포에 버전관리로 동기화(push) / 불러오기(pull).
import axios from 'axios';

const FILE_PATH = 'axios-cli/knowledge.json';
const LEGACY_FILE_PATHS = ['connect-ai/knowledge.json', 'knowledge.json'];
const hdr = (token: string) => ({ Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'User-Agent': 'connect-ai-desktop' });
const split = (repo: string) => { const [owner, name] = (repo || '').split('/'); return { owner, name }; };

// 범용 파일 푸시(생성/업데이트). 텍스트 내용을 레포 path 에 커밋.
export async function pushFile(token: string, repo: string, filePath: string, text: string, message: string): Promise<{ ok: boolean; error?: string; url?: string }> {
  if (!token || !(repo || '').includes('/')) return { ok: false, error: 'GitHub 토큰과 레포(owner/repo)를 🗂️ 연동에서 먼저 입력하세요.' };
  const { owner, name } = split(repo);
  const url = `https://api.github.com/repos/${owner}/${name}/contents/${filePath}`;
  try {
    let sha: string | undefined;
    try { const cur = await axios.get(url, { headers: hdr(token), timeout: 15000 }); sha = cur.data?.sha; } catch { /* 신규 */ }
    const content = Buffer.from(text, 'utf8').toString('base64');
    await axios.put(url, { message, content, sha }, { headers: hdr(token), timeout: 20000 });
    return { ok: true, url: `https://github.com/${owner}/${name}/blob/main/${filePath}` };
  } catch (e: any) { return { ok: false, error: e?.response?.data?.message || e?.message || String(e) }; }
}

export async function pushKnowledge(token: string, repo: string, notes: any[]): Promise<{ ok: boolean; count?: number; error?: string; url?: string }> {
  const r = await pushFile(token, repo, FILE_PATH, JSON.stringify(notes, null, 2), `🧠 AXIOS CLI 지식 동기화 (${notes.length}개)`);
  return r.ok ? { ok: true, count: notes.length, url: r.url } : r;
}

export async function pullKnowledge(token: string, repo: string): Promise<{ ok: boolean; notes?: any[]; error?: string }> {
  if (!token || !(repo || '').includes('/')) return { ok: false, error: 'GitHub 토큰과 레포를 🗂️ 연동에서 먼저 입력하세요.' };
  const { owner, name } = split(repo);
  
  const pathsToTry = [FILE_PATH, ...LEGACY_FILE_PATHS];
  let lastError: any = null;
  
  for (const path of pathsToTry) {
    const url = `https://api.github.com/repos/${owner}/${name}/contents/${path}`;
    try {
      const r = await axios.get(url, { headers: hdr(token), timeout: 15000 });
      const json = Buffer.from(r.data.content, 'base64').toString('utf8');
      const notes = JSON.parse(json);
      return { ok: true, notes: Array.isArray(notes) ? notes : [] };
    } catch (e: any) {
      lastError = e;
      // If it's a 404, we'll try the next path.
    }
  }
  
  if (lastError?.response?.status === 404) return { ok: false, error: '아직 GitHub에 동기화된 지식이 없어요. 먼저 ⬆ 동기화하세요.' };
  return { ok: false, error: lastError?.response?.data?.message || lastError?.message || String(lastError) };
}

// 🔍 레포 마크다운/텍스트 파일 스캔 — 레포의 .md/.txt 파일을 읽어 지식으로 추가
// 지식 동기화 파일(knowledge.json) 외의 레포 콘텐츠를 두뇌에 주입할 때 사용.
export async function scanRepoFiles(token: string, repo: string, maxFiles = 40): Promise<{ text: string; ts: number }[]> {
  if (!token || !(repo || '').includes('/')) return [];
  const { owner, name } = split(repo);
  const results: { text: string; ts: number }[] = [];
  try {
    // 재귀 트리로 모든 파일 목록 획득
    const treeRes = await axios.get(
      `https://api.github.com/repos/${owner}/${name}/git/trees/HEAD?recursive=1`,
      { headers: hdr(token), timeout: 20000 }
    );
    const SKIP_PATHS = /node_modules|\.git|dist|build|vendor|__pycache__/i;
    const files = ((treeRes.data?.tree as any[]) || [])
      .filter(f => f.type === 'blob'
        && /\.(md|txt|mdx)$/i.test(f.path)
        && f.path !== FILE_PATH
        && !LEGACY_FILE_PATHS.includes(f.path)
        && !SKIP_PATHS.test(f.path)
        && (f.size || 0) < 80000
        && (f.size || 0) > 20)
      .slice(0, maxFiles);

    for (const file of files) {
      try {
        const r = await axios.get(
          `https://api.github.com/repos/${owner}/${name}/contents/${file.path}`,
          { headers: hdr(token), timeout: 10000 }
        );
        const content = Buffer.from(r.data.content, 'base64').toString('utf8').trim();
        if (content.length > 20) {
          // 파일 경로를 앞에 태그로 붙여 출처 명시
          const snippet = content.slice(0, 2000);
          results.push({ text: `[📄 ${file.path}]\n${snippet}`, ts: Date.now() });
        }
      } catch { /* 파일 읽기 실패 시 skip */ }
    }
  } catch { /* 트리 조회 실패 시 skip */ }
  return results;
}
