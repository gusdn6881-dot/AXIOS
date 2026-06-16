// ✅ 승인 큐 — 에이전트가 중요한 행동 전에 사장님 승인을 요청. <approve>제목 | 상세</approve>
// VS Code Extension의 approvals/pending 및 approvals/history와 포맷 호환 및 양방향 동기화 지원.
import * as fs from 'fs';
import * as path from 'path';

export interface ApprovalAction { kind: 'run' | 'write' | 'telegram' | 'email'; payload: string; path?: string; }
export interface Approval {
  id: string; title: string; summary: string; agentEmoji: string;
  status: 'pending' | 'approved' | 'rejected'; createdAt: number;
  action?: ApprovalAction; result?: string;
  kind?: string;
  rawPayload?: any;
}

let APPROVAL_DIR = '';
let items: Approval[] = [];

export function setApprovalFile(p: string) {
  // We expect p to be the approvals folder path now, e.g., C:\Users\sck03\.axios-ai-brain\_company\approvals
  APPROVAL_DIR = p;
  loadFromDirectory();
}

const EMOJI_TO_AGENT: Record<string, string> = {
  '💼': 'ceo',
  '🤖': 'secretary',
  '🎨': 'designer',
  '💻': 'developer',
  '📈': 'marketer'
};

const AGENT_TO_EMOJI: Record<string, string> = {
  'ceo': '💼',
  'secretary': '🤖',
  'designer': '🎨',
  'developer': '💻',
  'marketer': '📈'
};

function loadFromDirectory() {
  try {
    if (!APPROVAL_DIR) return;
    const pendingDir = path.join(APPROVAL_DIR, 'pending');
    if (!fs.existsSync(pendingDir)) {
      items = [];
      return;
    }
    
    const files = fs.readdirSync(pendingDir).filter(f => f.endsWith('.json'));
    const pendingItems: Approval[] = [];
    
    for (const file of files) {
      try {
        const filePath = path.join(pendingDir, file);
        const raw = fs.readFileSync(filePath, 'utf8');
        const ap = JSON.parse(raw || '{}');
        
        if (ap.id) {
          // Determine if it has a desktop action in payload
          let action: ApprovalAction | undefined;
          if (ap.payload && ap.payload.kind && (ap.payload.kind === 'run' || ap.payload.kind === 'write' || ap.payload.kind === 'telegram' || ap.payload.kind === 'email')) {
            action = ap.payload;
          } else if (ap.kind === 'run' || ap.kind === 'write' || ap.kind === 'telegram' || ap.kind === 'email') {
            action = {
              kind: ap.kind,
              payload: ap.payload?.payload || ap.payload || '',
              path: ap.payload?.path
            };
          }
          
          pendingItems.push({
            id: ap.id,
            title: ap.title || '',
            summary: ap.summary || '',
            agentEmoji: AGENT_TO_EMOJI[ap.agentId] || '🤖',
            status: 'pending',
            createdAt: ap.createdAt ? new Date(ap.createdAt).getTime() : Date.now(),
            action,
            kind: ap.kind,
            rawPayload: ap.payload
          });
        }
      } catch (e) {
        console.error('Failed to parse approval file:', file, e);
      }
    }
    
    items = pendingItems;
  } catch (err) {
    console.error('Failed to load approvals from directory:', err);
    items = [];
  }
}

export function listApprovals(): Approval[] {
  loadFromDirectory();
  return items.slice().sort((a, b) => b.createdAt - a.createdAt);
}
export function pendingApprovals(): Approval[] {
  return listApprovals().filter(a => a.status === 'pending');
}
export function approvalCount(): number {
  return pendingApprovals().length;
}

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

export type ApprovalCallback = (a: Approval) => void;
let approvalListener: ApprovalCallback | null = null;
export function setApprovalListener(cb: ApprovalCallback) {
  approvalListener = cb;
}

export function addApproval(title: string, summary = '', agentEmoji = '🤖', action?: ApprovalAction): Approval {
  loadFromDirectory();
  const id = `apr-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  const a: Approval = {
    id,
    title: (title || '').trim().slice(0, 160),
    summary: (summary || '').trim().slice(0, 400),
    agentEmoji,
    status: 'pending',
    createdAt: Date.now(),
    action
  };
  
  // Write to extension format
  try {
    const pendingDir = path.join(APPROVAL_DIR, 'pending');
    fs.mkdirSync(pendingDir, { recursive: true });
    
    const agentId = EMOJI_TO_AGENT[agentEmoji] || 'ceo';
    const createdAtStr = new Date(a.createdAt).toISOString();
    
    const ap = {
      id,
      agentId,
      title: a.title,
      summary: a.summary,
      payload: action ? action : a.summary,
      kind: action ? action.kind : 'info',
      createdAt: createdAtStr
    };
    
    // Front matter markdown
    const md = `# ⏳ 승인 대기 — ${ap.title}

- **에이전트:** ${agentEmoji} ${agentId}
- **종류:** \`${ap.kind}\`
- **요청 시각:** ${ap.createdAt}
- **id:** \`${ap.id.slice(-9)}\`

## 요약

${ap.summary || '_(없음)_'}

## payload (실행기에 전달)

\`\`\`json
${JSON.stringify(ap.payload, null, 2)}
\`\`\`
`;
    fs.writeFileSync(path.join(pendingDir, `${id}.md`), md, 'utf8');
    fs.writeFileSync(path.join(pendingDir, `${id}.json`), JSON.stringify(ap, null, 2), 'utf8');
    
    items.push(a);
    if (approvalListener) {
      try { approvalListener(a); } catch (e) { console.error('Failed to notify approval listener:', e); }
    }
  } catch (err) {
    console.error('Failed to save approval to files:', err);
  }
  
  return a;
}

export function getApproval(id: string): Approval | undefined {
  loadFromDirectory();
  return items.find(x => x.id === id);
}

export function setApprovalStatus(id: string, status: Approval['status'], result?: string): Approval | undefined {
  loadFromDirectory();
  const a = items.find(x => x.id === id);
  if (!a) return undefined;
  
  a.status = status;
  if (result != null) a.result = result;
  
  try {
    const pendingDir = path.join(APPROVAL_DIR, 'pending');
    const historyDir = path.join(APPROVAL_DIR, 'history');
    fs.mkdirSync(historyDir, { recursive: true });
    
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 16);
    const tag = status === 'approved' ? 'OK' : 'NO';
    
    const baseSrc = path.join(pendingDir, id);
    const baseDst = path.join(historyDir, `${stamp}_${tag}_${id}`);
    
    // Append decision to markdown
    const mdPath = `${baseSrc}.md`;
    if (fs.existsSync(mdPath)) {
      try {
        const decisionText = status === 'approved' ? '✅ 승인' : '✖️ 거부';
        const append = `\n---\n\n## 결정: **${decisionText}**\n- 시각: ${new Date().toISOString()}\n- 사유: _(AXIOS CLI에서 처리됨)_\n${status === 'approved' ? `- 실행 결과: ${result ? 'OK' : 'FAIL'}\n\n\`\`\`\n${(result || '').slice(0, 1500)}\n\`\`\`\n` : ''}`;
        fs.appendFileSync(mdPath, append, 'utf8');
      } catch (err) {
        console.error('Failed to append to approval markdown:', err);
      }
    }
    
    // Move pending -> history
    for (const ext of ['.md', '.json']) {
      const src = `${baseSrc}${ext}`;
      const dst = `${baseDst}${ext}`;
      if (fs.existsSync(src)) {
        try {
          fs.renameSync(src, dst);
        } catch (err) {
          console.error(`Failed to move ${ext} to history:`, err);
        }
      }
    }
  } catch (err) {
    console.error('Failed to resolve approval files:', err);
  }
  
  return a;
}
