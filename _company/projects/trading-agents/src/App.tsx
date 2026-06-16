import React, { useState, useEffect } from 'react';
import { Settings, Play, ShieldAlert, RefreshCw, Smartphone, BookOpen, GitBranch } from 'lucide-react';
import { SettingsModal } from './components/SettingsModal';
import { AgentChatView } from './components/AgentChatView';
import { DecisionCard } from './components/DecisionCard';
import { ArchitectureDiagram } from './components/ArchitectureDiagram';
import { AgentOrchestrator, SimulationState, PIPELINE_STEPS, AgentId } from './services/agentOrchestrator';

const STEP_THOUGHTS: Record<string, string> = {
  running_tech: 'E2B 파이썬 샌드박스에서 yfinance 데이터 다운로드 및 기술 지표(RSI/MACD/SMA) 연산 중...',
  running_fund: 'E2B 샌드박스에서 재무제표 크롤링 및 내재가치 지표(ROE, P/E, EPS, 부채비율) 계산 중...',
  running_sent: 'SNS 감성 지수, Fear & Greed 지표, 기관 자금 흐름 데이터 종합 분석 중...',
  running_news: '최신 금융 뉴스 헤드라인, 실적 보고서, 거시경제 발표 스캔 중...',
  running_bull: '황소 연구원이 분석가 데이터로부터 최강의 매수 투자 논리를 구축 중...',
  running_bear: '곰 연구원이 황소 논리를 스트레스 테스트하기 위한 반대 논리 구축 중...',
  running_rm: '리서치 매니저가 황소 vs 곰 토론을 중재하고 균형 잡힌 결론 도출 중...',
  running_trader: '트레이더가 리서치 컨센서스를 실행 가능한 매매 파라미터로 변환 중...',
  running_risk: '리스크 매니저가 포지션 사이징, 손절 수준, 포트폴리오 영향 최종 검증 중...',
};

export const App: React.FC = () => {
  const [ticker, setTicker] = useState<string>('BTC');
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
  const [isDemoMode, setIsDemoMode] = useState<boolean>(true);
  const [e2bApiKey, setE2bApiKey] = useState<string>('');
  const [targetModel, setTargetModel] = useState<string>('gemma2:2b');
  
  const [simState, setSimState] = useState<SimulationState>({
    ticker: '', status: 'idle', currentStep: 0, totalSteps: 9, messages: [], decision: null
  });
  const [activeThoughts, setActiveThoughts] = useState<string>('');

  useEffect(() => {
    const savedDemo = localStorage.getItem('ta_demo_mode');
    const savedE2b = localStorage.getItem('ta_e2b_api_key');
    const savedModel = localStorage.getItem('ta_target_model');
    if (savedDemo !== null) setIsDemoMode(savedDemo === 'true');
    if (savedE2b) setE2bApiKey(savedE2b);
    if (savedModel) setTargetModel(savedModel);
  }, []);

  const handleStartSimulation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ticker.trim()) return;
    setSimState({ ticker: ticker.toUpperCase(), status: 'idle', currentStep: 0, totalSteps: 9, messages: [], decision: null, error: null });
    setActiveThoughts('샌드박스 인프라 초기화 중...');
    try {
      await AgentOrchestrator.runSimulation(ticker, targetModel, e2bApiKey, isDemoMode, (updatedFields) => {
        setSimState(prev => {
          const next = { ...prev, ...updatedFields };
          setActiveThoughts(STEP_THOUGHTS[next.status] || '');
          return next;
        });
      });
    } catch (err: any) {
      setSimState(prev => ({ ...prev, status: 'failed', error: err.message || '시뮬레이션 연결 실패' }));
      setActiveThoughts('');
    }
  };

  const handleSelectTicker = (tick: string) => {
    if (simState.status !== 'idle' && simState.status !== 'completed' && simState.status !== 'failed') return;
    setTicker(tick);
  };

  const getRunningAgentId = (): AgentId | null => {
    const m: Record<string, AgentId> = { running_tech:'tech', running_fund:'fund', running_sent:'sent', running_news:'news', running_bull:'bull', running_bear:'bear', running_rm:'rm', running_trader:'trader', running_risk:'risk' };
    return m[simState.status] || null;
  };

  const isRunning = simState.status.startsWith('running_');

  return (
    <div className="app-container" style={appStyles.container}>
      <header style={appStyles.header}>
        <div style={appStyles.logoGroup}>
          <div style={appStyles.logoIcon}>🔮</div>
          <div>
            <h1 style={appStyles.logoTitle}>TradingAgents</h1>
            <span style={appStyles.logoSub}>자율 멀티에이전트 헤지펀드 시뮬레이터</span>
          </div>
        </div>
        <div style={appStyles.headerControls}>
          <div style={{ ...appStyles.modeIndicator, color: isDemoMode ? 'var(--neon-rose)' : 'var(--neon-emerald)', borderColor: isDemoMode ? 'var(--neon-rose-glow)' : 'var(--neon-emerald-glow)', boxShadow: `0 0 10px ${isDemoMode ? 'var(--neon-rose-glow)' : 'var(--neon-emerald-glow)'}` }}>
            <span style={{ ...appStyles.indicatorDot, backgroundColor: isDemoMode ? 'var(--neon-rose)' : 'var(--neon-emerald)' }}></span>
            {isDemoMode ? '🎮 데모 모드' : `⚡ 실시간 (${targetModel})`}
          </div>
          <a href="https://github.com/TauricResearch/TradingAgents" target="_blank" rel="noreferrer" className="btn-secondary" style={{ ...appStyles.settingsBtn, textDecoration: 'none' }}>
            <GitBranch size={14} /><span>GitHub</span>
          </a>
          <button className="btn-secondary" style={appStyles.settingsBtn} onClick={() => setIsSettingsOpen(true)}>
            <Settings size={16} /><span>설정</span>
          </button>
        </div>
      </header>

      <div style={appStyles.layoutGrid}>
        <div style={appStyles.mainColumn}>
          <div className="glass-panel" style={appStyles.controlBox}>
            <h2 style={appStyles.boxTitle}>🔍 자율 분석 자산 타겟팅</h2>
            <form onSubmit={handleStartSimulation} style={appStyles.form}>
              <div style={appStyles.inputRow}>
                <input type="text" className="glass-input" style={appStyles.tickerInput} value={ticker} onChange={(e) => setTicker(e.target.value)} placeholder="주식/코인 티커 입력 (예: TSLA, AAPL, BTC, ETH)" disabled={isRunning} />
                <button type="submit" className="btn-premium" style={appStyles.submitBtn} disabled={isRunning || !ticker.trim()}>
                  {isRunning ? (<><RefreshCw size={18} style={{ animation: 'spin 1.5s linear infinite' }} /><span>분석 진행 중...</span></>) : (<><Play size={18} /><span>시뮬레이션 시작</span></>)}
                </button>
              </div>
            </form>
            <div style={appStyles.quickSelectRow}>
              <span style={appStyles.quickLabel}>추천 자산:</span>
              {['BTC', 'ETH', 'SOL', 'AAPL', 'TSLA', 'NVDA', 'MSFT', 'AMZN'].map((tick) => (
                <button key={tick} style={{ ...appStyles.quickBadge, backgroundColor: ticker.toUpperCase() === tick ? 'var(--neon-violet)' : 'rgba(255,255,255,0.04)', borderColor: ticker.toUpperCase() === tick ? 'var(--neon-violet)' : 'rgba(255,255,255,0.08)' }} onClick={() => handleSelectTicker(tick)} disabled={isRunning}>{tick}</button>
              ))}
            </div>
          </div>

          {simState.status !== 'idle' && (
            <div className="glass-panel animate-fade-in" style={appStyles.progressBox}>
              <div className="pipeline-track">
                {PIPELINE_STEPS.map((item) => {
                  const isDone = simState.currentStep > item.step || simState.status === 'completed';
                  const isCurrent = simState.status === item.key;
                  return (
                    <div key={item.step} className={`pipeline-step ${isDone ? 'done' : ''} ${isCurrent ? 'active' : ''}`}>
                      <div className={`pipeline-dot ${isDone ? 'done' : ''} ${isCurrent ? 'active' : ''}`}>{isDone ? '✓' : item.step}</div>
                      <span className={`pipeline-label ${isDone ? 'done' : ''} ${isCurrent ? 'active' : ''}`}>{item.label}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {simState.error && (
            <div className="glass-panel border-sell animate-fade-in" style={appStyles.errorBox}>
              <ShieldAlert size={20} color="var(--neon-rose)" />
              <div style={{ textAlign: 'left' }}>
                <h4 style={{ fontWeight: 600, fontSize: 14 }}>시뮬레이션 오류</h4>
                <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>{simState.error}</p>
                <button className="btn-secondary" style={{ marginTop: 10, fontSize: 11, padding: '6px 12px' }} onClick={() => setIsSettingsOpen(true)}>설정 열기</button>
              </div>
            </div>
          )}

          {simState.status === 'completed' && simState.decision && (<div style={{ marginBottom: 20 }}><DecisionCard decision={simState.decision} /></div>)}
          {simState.status !== 'idle' && (<AgentChatView messages={simState.messages} runningAgentId={getRunningAgentId()} agentThoughts={activeThoughts} />)}

          {simState.status === 'idle' && (
            <div className="glass-panel animate-fade-in" style={appStyles.idlePlaceholder}>
              <div style={appStyles.idleIcon}>📡</div>
              <h3>멀티에이전트 시뮬레이션 대기 중</h3>
              <p style={{ maxWidth: 500, textAlign: 'center', color: 'var(--text-secondary)', fontSize: 13 }}>
                원하는 주식 또는 암호화폐 티커(예: TSLA, BTC)를 입력하고 시뮬레이션 시작 버튼을 눌러 
                9개의 전문 AI 에이전트가 기술적, 재무적, 심리적, 뉴스 분석을 거쳐 황소 vs 곰 리서치 토론을 
                진행한 후 최종 트레이딩 의사결정과 리스크 검증까지 수행하는 전체 파이프라인을 가동하세요.
              </p>
            </div>
          )}
        </div>

        <aside style={appStyles.rightSidebar}>
          <div className="glass-panel" style={appStyles.sidebarBox}>
            <h3 style={appStyles.sidebarTitle}><BookOpen size={16} color="var(--neon-emerald)" />프레임워크 아키텍처</h3>
            <ArchitectureDiagram />
          </div>
          <div className="glass-panel" style={appStyles.sidebarBox}>
            <h3 style={appStyles.sidebarTitle}><Smartphone size={16} color="var(--neon-violet)" />모바일 홈 화면 등록 (PWA)</h3>
            <p style={appStyles.sidebarText}>이 웹앱은 모바일 독립 구동을 지원합니다. 스마트폰 브라우저에서 접속한 후 <span style={{ color: '#ffffff', fontWeight: 600 }}>[홈 화면에 추가]</span>를 누르면 주소창 없는 독립 앱으로 평생 무료 사용 가능합니다.</p>
          </div>
          <div className="glass-panel" style={appStyles.sidebarBox}>
            <h3 style={appStyles.sidebarTitle}><GitBranch size={16} color="var(--neon-cyan)" />인프라 스택</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[
                { icon: '🤖', title: 'Ollama 로컬 LLM', desc: '100% 무료 무제한 추론' },
                { icon: '🐍', title: 'E2B 파이썬 샌드박스', desc: '실시간 시세 데이터 크롤링' },
                { icon: '🔗', title: 'LocalTunnel 고정 URL', desc: 'URL 변경 없는 무료 외부 접속' },
                { icon: '📱', title: 'PWA 지원', desc: '모바일 홈 화면 독립 앱 설치' },
              ].map((s, i) => (
                <div key={i} style={appStyles.stackItem}>
                  <span style={appStyles.stackIcon}>{s.icon}</span>
                  <div><strong style={appStyles.stackTitle}>{s.title}</strong><span style={appStyles.stackDesc}>{s.desc}</span></div>
                </div>
              ))}
            </div>
          </div>
        </aside>
      </div>

      <SettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />
    </div>
  );
};

const appStyles = {
  container: { display: 'flex', flexDirection: 'column' as const, gap: 20, minHeight: '90vh' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap' as const, gap: 16, paddingBottom: 16, borderBottom: '1px solid rgba(255, 255, 255, 0.08)' },
  logoGroup: { display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left' as const },
  logoIcon: { fontSize: 32, animation: 'pulse 2s infinite' },
  logoTitle: { fontSize: 24, fontWeight: 800, color: '#ffffff', fontFamily: 'var(--font-display)', letterSpacing: '-0.02em' },
  logoSub: { fontSize: 11, color: 'var(--text-muted)', fontWeight: 500 },
  headerControls: { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' as const },
  modeIndicator: { fontSize: 12, fontWeight: 600, padding: '8px 14px', borderRadius: 30, border: '1px solid', display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(0,0,0,0.3)' },
  indicatorDot: { width: 6, height: 6, borderRadius: '50%', display: 'inline-block' },
  settingsBtn: { padding: '8px 14px' },
  layoutGrid: { display: 'grid', gridTemplateColumns: '1fr 320px', gap: 20, alignItems: 'start' },
  mainColumn: { display: 'flex', flexDirection: 'column' as const, gap: 20 },
  controlBox: { padding: 20, textAlign: 'left' as const },
  boxTitle: { fontSize: 16, fontWeight: 700, color: '#ffffff', marginBottom: 12 },
  form: { width: '100%' },
  inputRow: { display: 'flex', gap: 10, flexWrap: 'wrap' as const },
  tickerInput: { flex: 1, minWidth: 200 },
  submitBtn: { minWidth: 150 },
  quickSelectRow: { display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, flexWrap: 'wrap' as const },
  quickLabel: { fontSize: 12, color: 'var(--text-muted)', marginRight: 4 },
  quickBadge: { padding: '5px 12px', borderRadius: 8, border: '1px solid', fontSize: 11, color: '#ffffff', cursor: 'pointer', transition: 'all 0.2s', background: 'none' },
  progressBox: { padding: '16px 20px', overflowX: 'auto' as const },
  errorBox: { padding: 16, background: 'rgba(244, 63, 94, 0.03)', borderWidth: 1, borderStyle: 'solid' as const, display: 'flex', alignItems: 'flex-start', gap: 12 },
  idlePlaceholder: { padding: '60px 20px', display: 'flex', flexDirection: 'column' as const, alignItems: 'center', gap: 12, background: 'rgba(255, 255, 255, 0.01)' },
  idleIcon: { fontSize: 48, animation: 'pulse 3s infinite' },
  rightSidebar: { display: 'flex', flexDirection: 'column' as const, gap: 20 },
  sidebarBox: { padding: 16, textAlign: 'left' as const },
  sidebarTitle: { fontSize: 13, fontWeight: 700, color: '#ffffff', display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 },
  sidebarText: { fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.5 },
  stackItem: { display: 'flex', gap: 10, alignItems: 'flex-start', padding: '8px 10px', background: 'rgba(0,0,0,0.2)', borderRadius: 10, border: '1px solid rgba(255,255,255,0.04)' },
  stackIcon: { fontSize: 18, flexShrink: 0 },
  stackTitle: { fontSize: 11, fontWeight: 600, color: '#ffffff', display: 'block' },
  stackDesc: { fontSize: 10, color: 'var(--text-muted)', lineHeight: 1.3, display: 'block', marginTop: 2 },
};

const styleSheet = document.createElement("style");
styleSheet.innerText = `@media (max-width: 900px) { .app-container > div { grid-template-columns: 1fr !important; } aside { order: 2; } }`;
document.head.appendChild(styleSheet);
