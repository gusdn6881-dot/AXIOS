import React from 'react';

export const ArchitectureDiagram: React.FC = () => {
  return (
    <div className="arch-diagram">
      <div className="arch-layer">
        <div className="arch-layer-label" style={{ color: 'var(--neon-blue)' }}>분석가 팀 (Analyst Team)</div>
        <div className="arch-nodes">
          <div className="arch-node" style={{ borderColor: 'rgba(59,130,246,0.2)' }}><span className="arch-node-icon">📈</span><span className="arch-node-title">기술 분석</span><span className="arch-node-sub">차트 & 지표</span></div>
          <div className="arch-node" style={{ borderColor: 'rgba(245,158,11,0.2)' }}><span className="arch-node-icon">🏢</span><span className="arch-node-title">재무 분석</span><span className="arch-node-sub">재무제표 & 밸류</span></div>
          <div className="arch-node" style={{ borderColor: 'rgba(244,63,94,0.2)' }}><span className="arch-node-icon">📊</span><span className="arch-node-title">심리 분석</span><span className="arch-node-sub">시장 분위기</span></div>
          <div className="arch-node" style={{ borderColor: 'rgba(6,182,212,0.2)' }}><span className="arch-node-icon">📰</span><span className="arch-node-title">뉴스 분석</span><span className="arch-node-sub">헤드라인 & 이벤트</span></div>
        </div>
      </div>
      <div className="arch-connector"><span className="arch-flow-arrow">▼</span></div>
      <div className="arch-layer">
        <div className="arch-layer-label" style={{ color: 'var(--neon-violet)' }}>리서치 팀 (Research Team)</div>
        <div className="arch-nodes">
          <div className="arch-node" style={{ borderColor: 'rgba(132,204,22,0.2)' }}><span className="arch-node-icon">🐂</span><span className="arch-node-title">황소 연구원</span><span className="arch-node-sub">매수 논리 구축</span></div>
          <div className="arch-node" style={{ borderColor: 'rgba(139,92,246,0.3)', background: 'rgba(139,92,246,0.05)' }}><span className="arch-node-icon">⚔️</span><span className="arch-node-title" style={{ color: 'var(--neon-violet)' }}>끝장 토론</span><span className="arch-node-sub">황소 vs 곰</span></div>
          <div className="arch-node" style={{ borderColor: 'rgba(236,72,153,0.2)' }}><span className="arch-node-icon">🐻</span><span className="arch-node-title">곰 연구원</span><span className="arch-node-sub">반대 논리 구축</span></div>
        </div>
        <div className="arch-nodes" style={{ marginTop: 6 }}>
          <div className="arch-node" style={{ borderColor: 'rgba(139,92,246,0.2)', flex: 'none', width: '100%' }}><span className="arch-node-icon">🔬</span><span className="arch-node-title">리서치 매니저</span><span className="arch-node-sub">토론 결과를 종합하여 컨센서스 도출</span></div>
        </div>
      </div>
      <div className="arch-connector"><span className="arch-flow-arrow">▼</span></div>
      <div className="arch-layer">
        <div className="arch-layer-label" style={{ color: 'var(--neon-emerald)' }}>트레이딩 팀 (Trading Team)</div>
        <div className="arch-nodes">
          <div className="arch-node" style={{ borderColor: 'rgba(16,185,129,0.2)' }}><span className="arch-node-icon">💼</span><span className="arch-node-title">트레이더</span><span className="arch-node-sub">매매 의사결정 실행</span></div>
          <div className="arch-node" style={{ borderColor: 'rgba(139,92,246,0.2)' }}><span className="arch-node-icon">🛡️</span><span className="arch-node-title">리스크 매니저</span><span className="arch-node-sub">포지션 & 리스크 검증</span></div>
        </div>
      </div>
      <div style={{ marginTop: 8, padding: '8px 12px', borderRadius: 10, border: '1px dashed rgba(255,255,255,0.06)', background: 'rgba(0,0,0,0.2)', display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ fontSize: 12 }}>🤖</span><span style={{ fontSize: 9, color: 'var(--text-muted)' }}>Ollama (Gemma)</span></div>
        <div style={{ width: 1, background: 'rgba(255,255,255,0.08)' }}></div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ fontSize: 12 }}>🐍</span><span style={{ fontSize: 9, color: 'var(--text-muted)' }}>E2B 샌드박스</span></div>
        <div style={{ width: 1, background: 'rgba(255,255,255,0.08)' }}></div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ fontSize: 12 }}>🔗</span><span style={{ fontSize: 9, color: 'var(--text-muted)' }}>고정 URL 터널</span></div>
      </div>
    </div>
  );
};
