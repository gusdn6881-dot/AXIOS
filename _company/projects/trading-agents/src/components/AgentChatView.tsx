import React, { useState } from 'react';
import { AgentMessage, AgentId } from '../services/agentOrchestrator';
import { Terminal, LineChart, ChevronDown, ChevronUp } from 'lucide-react';
import { TechnicalChart } from './TechnicalChart';
import { TerminalLog } from './TerminalLog';

interface AgentChatViewProps {
  messages: AgentMessage[];
  runningAgentId?: AgentId | null;
  agentThoughts?: string;
}

const AGENT_COLORS: Record<AgentId, string> = {
  tech: 'var(--neon-blue)', fund: 'var(--neon-amber)', sent: 'var(--neon-rose)', news: 'var(--neon-cyan)',
  bull: 'var(--neon-lime)', bear: 'var(--neon-pink)', rm: 'var(--neon-violet)',
  trader: 'var(--neon-emerald)', risk: 'var(--neon-violet)',
};

const AGENT_THINKING: Record<AgentId, string> = {
  tech: '기술적 차트 분석가 분석 중...', fund: '내재 가치 분석가 평가 중...', sent: '시장 심리 분석가 진단 중...',
  news: '뉴스 분석가 헤드라인 스캔 중...', bull: '황소 연구원 매수 논리 구축 중...', bear: '곰 연구원 반대 논리 구축 중...',
  rm: '리서치 매니저 토론 종합 중...', trader: '트레이더 의사결정 실행 중...', risk: '리스크 매니저 최종 검증 중...',
};

const AGENT_EMOJIS: Record<AgentId, string> = {
  tech: '📈', fund: '🏢', sent: '📊', news: '📰', bull: '🐂', bear: '🐻', rm: '🔬', trader: '💼', risk: '🛡️',
};

const TEAM_LABELS: Record<string, { label: string; color: string }> = {
  analyst: { label: '분석가 팀', color: 'var(--neon-blue)' },
  research: { label: '리서치 팀', color: 'var(--neon-violet)' },
  trading: { label: '트레이딩 팀', color: 'var(--neon-emerald)' },
};

export const AgentChatView: React.FC<AgentChatViewProps> = ({ messages, runningAgentId, agentThoughts }) => {
  const [openLogs, setOpenLogs] = useState<Record<number, boolean>>({});
  const toggleLogs = (i: number) => setOpenLogs(p => ({ ...p, [i]: !p[i] }));
  const getColor = (id: AgentId) => AGENT_COLORS[id] || 'var(--neon-violet)';

  const grouped: { team: string; msgs: { msg: AgentMessage; idx: number }[] }[] = [];
  let curTeam = '';
  messages.forEach((msg, idx) => {
    if (msg.team !== curTeam) { curTeam = msg.team; grouped.push({ team: curTeam, msgs: [] }); }
    grouped[grouped.length - 1].msgs.push({ msg, idx });
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <h3 style={{ fontSize: 16, fontWeight: 600, color: '#fff', display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 18 }}>🤝</span> 멀티에이전트 토론 & 분석 타임라인
      </h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {grouped.map((g, gi) => {
          const ti = TEAM_LABELS[g.team];
          return (
            <div key={gi} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 12px', borderRadius: 8, border: `1px solid ${ti?.color}`, fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', color: ti?.color, background: 'rgba(0,0,0,0.3)', alignSelf: 'flex-start', marginTop: 8 }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: ti?.color, display: 'inline-block' }}></span>
                {ti?.label}
              </div>
              {g.msgs.map(({ msg, idx }) => (
                <div key={idx} className="glass-panel animate-fade-in" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12, borderLeftWidth: 4, borderLeftStyle: 'solid', borderLeftColor: getColor(msg.agentId) }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div className="thinking-ring" style={{ '--pulse-color': getColor(msg.agentId), boxShadow: `0 0 10px ${getColor(msg.agentId)}` } as React.CSSProperties}>
                      <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>{msg.avatar}</div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
                      <span style={{ fontSize: 14, fontWeight: 600, color: '#fff' }}>{msg.agentName}</span>
                      <span style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>{msg.timestamp}</span>
                    </div>
                    {msg.agentId === 'bull' && <span className="badge badge-bull">🟢 매수 논리</span>}
                    {msg.agentId === 'bear' && <span className="badge badge-bear">🔴 매도 논리</span>}
                    {msg.agentId === 'rm' && <span className="badge badge-research">🔬 종합 판단</span>}
                  </div>
                  <div style={{ background: 'rgba(0,0,0,0.25)', borderRadius: 10, padding: 10, borderLeft: '2px solid var(--neon-violet)' }}>
                    <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-link)', display: 'block', marginBottom: 4 }}>💭 에이전트 인지 프로세스:</span>
                    <p style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.4 }}>{msg.thought}</p>
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--text-primary)', lineHeight: 1.6, display: 'flex', flexDirection: 'column', gap: 6, paddingLeft: 4 }}>
                    {msg.report.split('\n').map((line, li) => {
                      if (line.startsWith('###')) return <h4 key={li} style={{ fontSize: 14, fontWeight: 700, color: '#fff', marginTop: 8, borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: 4 }}>{line.replace(/###/g, '').trim()}</h4>;
                      if (line.startsWith('**') && line.endsWith('**')) return <h5 key={li} style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-link)', marginTop: 4 }}>{line.replace(/\*\*/g, '').trim()}</h5>;
                      if (line.startsWith('*')) return <li key={li} style={{ fontSize: 13, paddingLeft: 16, listStyle: 'disc', color: 'var(--text-secondary)', marginLeft: 8 }}>{line.replace(/^\*\s*/, '').trim()}</li>;
                      if (line.trim() === '') return null;
                      return <p key={li} style={{ fontSize: 13 }}>{line}</p>;
                    })}
                  </div>
                  {(msg.stdout || (msg.plots && msg.plots.length > 0)) && (
                    <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 10, marginTop: 6 }}>
                      <button style={{ width: '100%', background: 'rgba(255,255,255,0.02)', border: '1px solid var(--glass-border)', borderRadius: 8, color: 'var(--text-secondary)', padding: '8px 12px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }} onClick={() => toggleLogs(idx)}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Terminal size={14} color="var(--neon-emerald)" /><span style={{ fontSize: 12, fontWeight: 600 }}>E2B 파이썬 샌드박스 실행 결과</span></div>
                        {openLogs[idx] ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                      </button>
                      {openLogs[idx] && (
                        <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 12 }}>
                          {msg.plots && msg.plots.length > 0 && (<div><div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', display: 'flex', alignItems: 'center' }}><LineChart size={12} style={{ marginRight: 4 }} />동적 분석 차트</div><TechnicalChart plots={msg.plots} /></div>)}
                          {msg.stdout && (<div><div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)' }}>파이썬 콘솔 로그 (stdout)</div><TerminalLog logs={msg.stdout} /></div>)}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          );
        })}

        {runningAgentId && (
          <div className="glass-panel" style={{ padding: 16, borderStyle: 'dashed', borderColor: 'rgba(255,255,255,0.15)', display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div className="thinking-ring" style={{ '--pulse-color': getColor(runningAgentId), animation: 'neon-pulse 1.2s infinite ease-in-out' } as React.CSSProperties}>
                <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>{AGENT_EMOJIS[runningAgentId]}</div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={{ fontSize: 14, fontWeight: 600, color: getColor(runningAgentId) }}>{AGENT_THINKING[runningAgentId]}</span>
                <span style={{ fontSize: 16, color: 'var(--text-muted)', letterSpacing: 2, animation: 'pulse 1s infinite' }}>•••</span>
              </div>
            </div>
            {agentThoughts && (
              <div style={{ background: 'rgba(0,0,0,0.25)', borderRadius: 10, padding: 10, borderLeft: '2px solid var(--neon-violet)' }}>
                <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-link)', display: 'block', marginBottom: 4 }}>💭 실시간 인지 추론:</span>
                <p style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.4 }}>{agentThoughts}</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
