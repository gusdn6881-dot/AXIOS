import React from 'react';
import { FinalDecision } from '../services/agentOrchestrator';
import { TrendingUp, TrendingDown, Target, ShieldAlert, Award, PieChart } from 'lucide-react';

interface DecisionCardProps { decision: FinalDecision | null; }

export const DecisionCard: React.FC<DecisionCardProps> = ({ decision }) => {
  if (!decision) return null;
  const isBuy = decision.action === 'BUY';
  const isSell = decision.action === 'SELL';
  const color = isBuy ? 'var(--neon-emerald)' : isSell ? 'var(--neon-rose)' : 'var(--neon-amber)';
  const glow = isBuy ? 'var(--neon-emerald-glow)' : isSell ? 'var(--neon-rose-glow)' : 'var(--neon-amber-glow)';
  const border = isBuy ? 'border-buy' : isSell ? 'border-sell' : 'border-hold';
  const actionKr = isBuy ? '매수 (BUY)' : isSell ? '매도 (SELL)' : '관망 (HOLD)';

  return (
    <div className={`glass-panel animate-fade-in ${border}`} style={{ padding: 20, borderWidth: 2, borderStyle: 'solid', display: 'flex', flexDirection: 'column', gap: 16, borderRadius: 24, background: 'rgba(255,255,255,0.03)', boxShadow: `0 8px 32px rgba(0,0,0,0.4), 0 0 20px ${glow}` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Award size={20} color={color} />
          <span style={{ fontSize: 15, fontWeight: 600, color: '#fff', fontFamily: 'var(--font-display)' }}>최종 트레이딩 의사결정</span>
        </div>
        <div style={{ padding: '6px 14px', borderRadius: 30, fontSize: 14, fontWeight: 800, color: '#fff', fontFamily: 'var(--font-display)', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', backgroundColor: color, boxShadow: `0 0 10px ${glow}` }}>
          {isBuy && <TrendingUp size={16} style={{ marginRight: 4 }} />}
          {isSell && <TrendingDown size={16} style={{ marginRight: 4 }} />}
          {actionKr}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 16, background: 'rgba(0,0,0,0.2)', padding: 16, borderRadius: 16, border: '1px solid rgba(255,255,255,0.04)' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, textAlign: 'left' }}>
          <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>분석 자산</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#fff', fontFamily: 'var(--font-display)' }}>${decision.ticker}</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, textAlign: 'left' }}>
          <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>판단 신뢰도</div>
          <div style={{ fontSize: 22, fontWeight: 800, color, fontFamily: 'var(--font-display)' }}>{decision.confidence}%</div>
          <div style={{ width: '100%', height: 4, background: 'rgba(255,255,255,0.1)', borderRadius: 2, marginTop: 4, overflow: 'hidden' }}>
            <div style={{ height: '100%', borderRadius: 2, backgroundColor: color, width: `${decision.confidence}%`, boxShadow: `0 0 8px ${color}`, transition: 'width 0.5s ease-out' }}></div>
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, textAlign: 'left' }}>
          <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}><PieChart size={12} style={{ marginRight: 4, verticalAlign: 'middle' }} />추천 포트폴리오 비중</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#fff', fontFamily: 'var(--font-display)' }}>{decision.positionSize}%</div>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>전체 투자 원금 대비</div>
        </div>
      </div>

      {(decision.bullArgument || decision.bearArgument) && (
        <div className="debate-container">
          {decision.bullArgument && (
            <div className="debate-card bull">
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}><span style={{ fontSize: 16 }}>🐂</span><span style={{ fontSize: 11, fontWeight: 700, color: 'var(--neon-lime)' }}>황소 매수 논리</span></div>
              <p style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.4 }}>{decision.bullArgument}</p>
            </div>
          )}
          {decision.bearArgument && (
            <div className="debate-card bear">
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}><span style={{ fontSize: 16 }}>🐻</span><span style={{ fontSize: 11, fontWeight: 700, color: 'var(--neon-pink)' }}>곰 반대 논리</span></div>
              <p style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.4 }}>{decision.bearArgument}</p>
            </div>
          )}
        </div>
      )}

      {(decision.targetPrice > 0 || decision.stopLoss > 0) && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          {decision.targetPrice > 0 && (
            <div style={{ background: 'rgba(255,255,255,0.015)', border: '1px solid var(--glass-border)', borderRadius: 12, padding: 12, display: 'flex', alignItems: 'center', gap: 10 }}>
              <Target size={16} color="var(--neon-emerald)" />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2, textAlign: 'left' }}>
                <span style={{ fontSize: 10, color: 'var(--text-secondary)' }}>예상 목표가</span>
                <span style={{ fontSize: 14, fontWeight: 700, color: '#fff', fontFamily: 'var(--font-display)' }}>${decision.targetPrice.toLocaleString()}</span>
              </div>
            </div>
          )}
          {decision.stopLoss > 0 && (
            <div style={{ background: 'rgba(255,255,255,0.015)', border: '1px solid var(--glass-border)', borderRadius: 12, padding: 12, display: 'flex', alignItems: 'center', gap: 10 }}>
              <ShieldAlert size={16} color="var(--neon-rose)" />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2, textAlign: 'left' }}>
                <span style={{ fontSize: 10, color: 'var(--text-secondary)' }}>손절선 (Stop-Loss)</span>
                <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--neon-rose)', fontFamily: 'var(--font-display)' }}>${decision.stopLoss.toLocaleString()}</span>
              </div>
            </div>
          )}
        </div>
      )}

      <div style={{ background: 'rgba(139,92,246,0.05)', border: '1px solid rgba(139,92,246,0.15)', borderRadius: 16, padding: 14, textAlign: 'left' }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-link)', marginBottom: 6 }}>의사결정 핵심 근거 요약</div>
        <p style={{ fontSize: 13, color: 'var(--text-primary)', lineHeight: 1.5 }}>{decision.summary || '지표 호조에 따른 포지션 취득 권고.'}</p>
      </div>

      <div style={{ fontSize: 9, color: 'var(--text-muted)', lineHeight: 1.4, textAlign: 'left', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: 10 }}>
        ⚠️ **면책조항**: 본 분석은 AI 에이전트 자율 시뮬레이션 결과물로, 어떠한 금융 투자 조언이나 매수/매도 권유가 아닙니다. 모든 투자 책임은 본인에게 있습니다.
      </div>
    </div>
  );
};
