// 📋 태스크 트래커 — 할 일을 파일에 저장. 사용자가 추가하거나, 에이전트가 <task>로 자동 생성.
// VS Code Extension의 _shared/tracker.json 과 포맷 호환 및 양방향 동기화 지원.
import * as fs from 'fs';
import * as path from 'path';

export interface Task {
  id: string; title: string; priority: 'normal' | 'high' | 'urgent';
  owner: 'user' | 'agent'; agentEmoji: string; status: 'open' | 'done' | 'cancelled'; createdAt: number;
}

let TASK_FILE = '';
// In-memory extension tasks, preserved to avoid dropping fields like dueAt, nudges, calendarEventId, etc.
let rawExtensionTasks: any[] = [];
let tasks: Task[] = [];

export function setTaskFile(p: string) {
  TASK_FILE = p;
  loadFromTracker();
}

function loadFromTracker() {
  try {
    if (!TASK_FILE) return;
    if (!fs.existsSync(TASK_FILE)) {
      rawExtensionTasks = [];
      tasks = [];
      return;
    }
    const raw = fs.readFileSync(TASK_FILE, 'utf8');
    const parsed = JSON.parse(raw || '{}');
    rawExtensionTasks = Array.isArray(parsed.tasks) ? parsed.tasks : [];
    
    tasks = rawExtensionTasks.map((t: any) => {
      // Map status: pending/in_progress -> open, done -> done, cancelled -> cancelled
      let status: 'open' | 'done' | 'cancelled' = 'open';
      if (t.status === 'done') status = 'done';
      else if (t.status === 'cancelled') status = 'cancelled';

      // Map owner: user -> user, agent/mixed -> agent
      const owner: 'user' | 'agent' = t.owner === 'user' ? 'user' : 'agent';

      // Map priority: urgent/high -> urgent/high, normal/low/other -> normal
      let priority: 'normal' | 'high' | 'urgent' = 'normal';
      if (t.priority === 'urgent') priority = 'urgent';
      else if (t.priority === 'high') priority = 'high';

      // Map createdAt: parse ISO string to ms timestamp
      let createdAt = Date.now();
      if (t.createdAt) {
        const parsedTime = Date.parse(t.createdAt);
        if (!isNaN(parsedTime)) createdAt = parsedTime;
      }

      return {
        id: t.id || '',
        title: t.title || '',
        priority,
        owner,
        agentEmoji: (t.agentIds && t.agentIds.length > 0) ? '🤖' : '', // Placeholder or mapped
        status,
        createdAt
      };
    });
  } catch (err) {
    console.error('Failed to load tasks from tracker.json:', err);
    tasks = [];
    rawExtensionTasks = [];
  }
}

function saveToTracker() {
  try {
    if (!TASK_FILE) return;
    
    // Read current state from file to get latest modifications from extension
    let currentRawTasks: any[] = [];
    if (fs.existsSync(TASK_FILE)) {
      try {
        const raw = fs.readFileSync(TASK_FILE, 'utf8');
        const parsed = JSON.parse(raw || '{}');
        currentRawTasks = Array.isArray(parsed.tasks) ? parsed.tasks : [];
      } catch {
        currentRawTasks = rawExtensionTasks;
      }
    } else {
      currentRawTasks = rawExtensionTasks;
    }

    const updatedRawTasks: any[] = [];

    for (const t of tasks) {
      // Check if it exists in current raw tasks
      const existing = currentRawTasks.find((x: any) => x.id === t.id);
      
      let status: 'pending' | 'in_progress' | 'done' | 'cancelled' = 'pending';
      if (t.status === 'done') status = 'done';
      else if (t.status === 'cancelled') status = 'cancelled';
      else if (existing && (existing.status === 'in_progress' || existing.status === 'pending')) {
        status = existing.status;
      } else {
        status = t.owner === 'agent' ? 'in_progress' : 'pending';
      }

      const priority = t.priority; // 'urgent' | 'high' | 'normal'

      if (existing) {
        // Update existing task
        updatedRawTasks.push({
          ...existing,
          title: t.title,
          status,
          priority,
          completedAt: (status === 'done' || status === 'cancelled') ? (existing.completedAt || new Date().toISOString()) : undefined
        });
      } else {
        // Create new task
        updatedRawTasks.push({
          id: t.id,
          title: t.title,
          owner: t.owner === 'user' ? 'user' : 'agent',
          createdAt: new Date(t.createdAt).toISOString(),
          status,
          priority,
          nudges: 0,
          preAlarmsSent: []
        });
      }
    }

    // Cutoff logic in the extension removes old completed/cancelled tasks
    const cutoff = Date.now() - 30 * 86_400_000;
    const finalTasks = updatedRawTasks.filter(x => {
      if (x.status === 'done' || x.status === 'cancelled') {
        const at = new Date(x.completedAt || x.createdAt).getTime();
        return at >= cutoff;
      }
      return true;
    });

    const dir = path.dirname(TASK_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(TASK_FILE, JSON.stringify({ tasks: finalTasks }, null, 2));
    
    // Update local raw cache
    rawExtensionTasks = finalTasks;
  } catch (err) {
    console.error('Failed to save tasks to tracker.json:', err);
  }
}

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

export function listTasks(): Task[] {
  loadFromTracker();
  return tasks.slice().sort((a, b) => b.createdAt - a.createdAt);
}
export function openTasks(): Task[] {
  return listTasks().filter(t => t.status === 'open');
}
export function taskCount(): number {
  return openTasks().length;
}

export function addTask(title: string, opts: Partial<Task> = {}): Task {
  loadFromTracker();
  const t: Task = {
    id: uid(), title: (title || '').trim().slice(0, 200), priority: opts.priority || 'normal',
    owner: opts.owner || 'user', agentEmoji: opts.agentEmoji || '', status: 'open', createdAt: Date.now(),
  };
  tasks.push(t);
  saveToTracker();
  return t;
}

export function setStatus(id: string, status: Task['status']): Task | undefined {
  loadFromTracker();
  const t = tasks.find(x => x.id === id);
  if (t) {
    t.status = status;
    saveToTracker();
  }
  return t;
}
