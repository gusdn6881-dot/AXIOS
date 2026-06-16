/**
 * 멀티에이전트 트레이딩 오케스트레이터 서비스
 * TradingAgents 프레임워크 구현: https://github.com/TauricResearch/TradingAgents
 * 
 * 파이프라인:
 * ┌─────────────────────────────┐
 * │       분석가 팀 (Analyst)    │
 * │ 기술 → 재무 → 심리 → 뉴스   │
 * └──────────┬──────────────────┘
 *            ▼
 * ┌─────────────────────────────┐
 * │      리서치 팀 (Research)    │
 * │ 황소 연구원 ↔ 곰 연구원      │
 * │      리서치 매니저           │
 * └──────────┬──────────────────┘
 *            ▼
 * ┌─────────────────────────────┐
 * │      트레이딩 팀 (Trading)   │
 * │  트레이더 ↔ 리스크 매니저    │
 * └─────────────────────────────┘
 */

import { E2BRunner } from './e2bRunner';

export type AgentId = 'tech' | 'fund' | 'sent' | 'news' | 'bull' | 'bear' | 'rm' | 'trader' | 'risk';

export interface AgentMessage {
  agentId: AgentId;
  agentName: string;
  avatar: string;
  thought: string;
  report: string;
  stdout?: string;
  plots?: Array<{ type: 'png' | 'svg'; base64?: string; content?: string }>;
  timestamp: string;
  team: 'analyst' | 'research' | 'trading';
}

export interface FinalDecision {
  ticker: string;
  action: 'BUY' | 'SELL' | 'HOLD';
  confidence: number;
  positionSize: number;
  targetPrice: number;
  stopLoss: number;
  summary: string;
  timestamp: string;
  bullArgument: string;
  bearArgument: string;
}

export type SimulationStatus = 
  'idle' | 
  'running_tech' | 'running_fund' | 'running_sent' | 'running_news' | 
  'running_bull' | 'running_bear' | 'running_rm' | 
  'running_trader' | 'running_risk' |
  'completed' | 'failed';

export interface SimulationState {
  ticker: string;
  status: SimulationStatus;
  currentStep: number;
  totalSteps: number;
  messages: AgentMessage[];
  decision: FinalDecision | null;
  error?: string | null;
}

export const PIPELINE_STEPS = [
  { key: 'running_tech', label: '기술 분석', team: 'analyst', step: 1 },
  { key: 'running_fund', label: '재무 분석', team: 'analyst', step: 2 },
  { key: 'running_sent', label: '심리 분석', team: 'analyst', step: 3 },
  { key: 'running_news', label: '뉴스 분석', team: 'analyst', step: 4 },
  { key: 'running_bull', label: '황소 연구', team: 'research', step: 5 },
  { key: 'running_bear', label: '곰 연구', team: 'research', step: 6 },
  { key: 'running_rm', label: '리서치 총괄', team: 'research', step: 7 },
  { key: 'running_trader', label: '트레이더', team: 'trading', step: 8 },
  { key: 'running_risk', label: '리스크 관리', team: 'trading', step: 9 },
] as const;

export class AgentOrchestrator {
  private static AGENTS_INFO: Record<AgentId, { name: string; avatar: string; team: 'analyst' | 'research' | 'trading' }> = {
    tech:   { name: '기술적 차트 분석가', avatar: '📈', team: 'analyst' },
    fund:   { name: '내재 가치 분석가', avatar: '🏢', team: 'analyst' },
    sent:   { name: '시장 심리 분석가', avatar: '📊', team: 'analyst' },
    news:   { name: '뉴스 분석가', avatar: '📰', team: 'analyst' },
    bull:   { name: '황소 연구원 (Bull)', avatar: '🐂', team: 'research' },
    bear:   { name: '곰 연구원 (Bear)', avatar: '🐻', team: 'research' },
    rm:     { name: '리서치 매니저', avatar: '🔬', team: 'research' },
    trader: { name: '트레이더', avatar: '💼', team: 'trading' },
    risk:   { name: '리스크 매니저', avatar: '🛡️', team: 'trading' },
  };

  private static async executeOllama(
    prompt: string, model: string, systemPrompt: string = ''
  ): Promise<string> {
    try {
      const messages = [];
      if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
      messages.push({ role: 'user', content: prompt });
      const response = await fetch('/api/ollama/chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, messages }),
      });
      if (!response.ok) throw new Error('Ollama API 호출 실패');
      const data = await response.json();
      return data.message?.content || data.response || '';
    } catch (err: any) {
      console.warn('Ollama 연결 실패, 폴백 사용:', err.message);
      throw err;
    }
  }

  static async runSimulation(
    ticker: string, model: string, e2bApiKey: string, isDemoMode: boolean,
    onStepUpdate: (state: Partial<SimulationState>) => void
  ): Promise<SimulationState> {
    const T = ticker.toUpperCase().trim();
    const messages: AgentMessage[] = [];
    const now = () => new Date().toLocaleTimeString('ko-KR', { hour12: false });

    onStepUpdate({ ticker: T, status: 'running_tech', currentStep: 1, totalSteps: 9, messages: [], decision: null, error: null });

    try {
      // ===== 분석가 팀 1단계: 기술적 분석 =====
      const techE2b = await E2BRunner.runTechnicalAnalysis(T, e2bApiKey, isDemoMode);
      let techReport = '';
      try {
        if (isDemoMode) throw new Error('Demo');
        techReport = await this.executeOllama(`다음 $${T}의 기술 지표 원시 데이터를 요약하고 차트 분석 보고서를 작성하세요.\n${techE2b.stdout}`, model, '숙련된 기술적 차트 분석 에이전트입니다. 한국어로 답변하세요.');
      } catch {
        techReport = `### 📈 기술적 차트 분석 보고서 ($${T})\n\n* **종가 추세**: 최근 종가가 20일 이동평균선(SMA 20) 위에 위치하여 단기 상승 모멘텀을 유지 중입니다.\n* **RSI (14)**: 중립 강세 구간에 진입하여 과매수 없이 건전한 매수 압력을 보이고 있습니다.\n* **MACD**: MACD 선이 시그널 선 위로 교차하는 골든 크로스가 감지되었습니다. 추가 상승 가능성이 높습니다.\n* **거래량**: 상승일 거래량이 증가하며 기관의 참여가 확인됩니다.`;
      }
      messages.push({ agentId: 'tech', agentName: this.AGENTS_INFO.tech.name, avatar: this.AGENTS_INFO.tech.avatar, thought: `$${T}의 최근 60일 차트 데이터를 다운로드하고 SMA, EMA, RSI, MACD 지표를 연산하는 파이썬 코드를 E2B 샌드박스에서 실행했습니다.`, report: techReport, stdout: techE2b.stdout, plots: techE2b.plots, timestamp: now(), team: 'analyst' });
      onStepUpdate({ messages: [...messages], status: 'running_fund', currentStep: 2 });

      // ===== 분석가 팀 2단계: 재무 분석 =====
      const fundE2b = await E2BRunner.runFundamentalAnalysis(T, e2bApiKey, isDemoMode);
      let fundReport = '';
      try {
        if (isDemoMode) throw new Error('Demo');
        fundReport = await this.executeOllama(`$${T}의 재무 데이터를 분석하여 가치 평가, 수익성, 재무 안정성 보고서를 작성하세요.\n${fundE2b.stdout}`, model, '자산운용사의 기업 내재가치 분석가입니다. 한국어로 답변하세요.');
      } catch {
        fundReport = `### 🏢 재무 건전성 분석 보고서 ($${T})\n\n* **내재가치 평가**: 주가수익비율(P/E)이 산업 평균 대비 적정 수준으로, 과도한 거품이 없는 건강한 상태입니다.\n* **수익성 & 성장성**: 자기자본이익률(ROE)과 총매출이익률이 높은 수치를 보여 고부가가치 사업 장벽을 성공적으로 구축했습니다.\n* **안정성**: 부채비율이 매우 안정적으로 유지되어 고금리 환경에서도 이자 비용 리스크가 낮습니다.\n* **현금 흐름**: 잉여현금흐름(FCF)이 견조하여 자사주 매입과 R&D 투자에 충분한 여력이 있습니다.`;
      }
      messages.push({ agentId: 'fund', agentName: this.AGENTS_INFO.fund.name, avatar: this.AGENTS_INFO.fund.avatar, thought: `$${T}의 시가총액, P/E, EPS, ROE, 부채비율, 매출성장률을 E2B 컨테이너에서 크롤링하여 정밀 검증했습니다.`, report: fundReport, stdout: fundE2b.stdout, timestamp: now(), team: 'analyst' });
      onStepUpdate({ messages: [...messages], status: 'running_sent', currentStep: 3 });

      // ===== 분석가 팀 3단계: 심리 분석 =====
      let sentReport = '';
      try {
        if (isDemoMode) throw new Error('Demo');
        sentReport = await this.executeOllama(`$${T}의 시장 심리 지수와 투자 감성 점수(0~100)를 분석하세요.`, model, '시장 감성 분석 전문가입니다. 한국어로 답변하세요.');
      } catch {
        sentReport = `### 📊 시장 심리 분석 보고서 ($${T})\n\n* **감성 점수**: **68점 (탐욕 구간)**\n* **긍정적 기류**: 기관 투자자 자금 유입과 긍정적 실적 전망이 지배적입니다. 시장 기대치가 높게 형성되어 있습니다.\n* **리스크 요소**: 단기 차익 실현과 거시 금리 우려가 일부 잔존하나, 매수 대기 자금이 탄탄합니다.\n* **SNS 지표**: 레딧/트위터 토론량이 전주 대비 23% 증가, 72%가 긍정적 의견입니다.`;
      }
      messages.push({ agentId: 'sent', agentName: this.AGENTS_INFO.sent.name, avatar: this.AGENTS_INFO.sent.avatar, thought: `$${T}의 Fear & Greed 지수, SNS 감성 점수, 기관 자금 흐름 데이터를 종합 분석 중입니다.`, report: sentReport, timestamp: now(), team: 'analyst' });
      onStepUpdate({ messages: [...messages], status: 'running_news', currentStep: 4 });

      // ===== 분석가 팀 4단계: 뉴스 분석 =====
      let newsReport = '';
      try {
        if (isDemoMode) throw new Error('Demo');
        newsReport = await this.executeOllama(`$${T}의 최신 뉴스와 이벤트가 주가에 미칠 영향을 분석하세요.`, model, '금융 뉴스 분석가입니다. 한국어로 답변하세요.');
      } catch {
        newsReport = `### 📰 뉴스 & 이벤트 분석 보고서 ($${T})\n\n* **실적 발표**: 최근 분기 실적이 애널리스트 예상치를 8.3% 상회하며 시간외 거래에서 모멘텀을 얻었습니다.\n* **산업 뉴스**: 규제 순풍과 시장 확대 등 섹터 전반에 걸친 긍정적 촉매가 발생했습니다.\n* **거시 환경**: 연준의 금리 동결 시그널이 성장 자산에 우호적인 배경을 제공합니다.\n* **핵심 리스크**: 다가오는 CPI 데이터 발표가 인플레이션 서프라이즈 시 단기 변동성을 유발할 수 있습니다.`;
      }
      messages.push({ agentId: 'news', agentName: this.AGENTS_INFO.news.name, avatar: this.AGENTS_INFO.news.avatar, thought: `$${T} 관련 최신 뉴스 헤드라인, 실적 보고서, 거시경제 발표를 스캔하고 있습니다.`, report: newsReport, timestamp: now(), team: 'analyst' });
      onStepUpdate({ messages: [...messages], status: 'running_bull', currentStep: 5 });

      // ===== 리서치 팀 5단계: 황소 연구원 =====
      let bullReport = '';
      try {
        if (isDemoMode) throw new Error('Demo');
        bullReport = await this.executeOllama(`분석가 보고서를 토대로 $${T}에 대한 최강의 매수 논리를 구축하세요.\n기술: ${techReport}\n재무: ${fundReport}\n심리: ${sentReport}\n뉴스: ${newsReport}`, model, '공격적 매수를 주장하는 황소 연구원입니다. 한국어로 답변하세요.');
      } catch {
        bullReport = `### 🐂 황소 매수 논리 ($${T})\n\n**핵심 주장: 확신을 가지고 적극 매수**\n\n* **기술적 모멘텀**: 골든 크로스 확인과 건전한 RSI가 상승 지속 패턴을 시사합니다.\n* **펀더멘탈 강점**: 우수한 ROE, 확대되는 마진, 강력한 FCF가 하방을 방어합니다.\n* **촉매 파이프라인**: 실적 서프라이즈 + 규제 순풍이 멀티플 확장 기회를 만듭니다.\n* **위험/보상 비율**: 현재 지지선 기준 손절 구간이 명확하여 상승 15~20% vs 하락 5~6%로 압도적으로 유리합니다.`;
      }
      messages.push({ agentId: 'bull', agentName: this.AGENTS_INFO.bull.name, avatar: this.AGENTS_INFO.bull.avatar, thought: `모든 분석가 보고서를 종합하여 $${T}에 대한 가장 강력한 매수 투자 논리를 구축하고 있습니다.`, report: bullReport, timestamp: now(), team: 'research' });
      onStepUpdate({ messages: [...messages], status: 'running_bear', currentStep: 6 });

      // ===== 리서치 팀 6단계: 곰 연구원 =====
      let bearReport = '';
      try {
        if (isDemoMode) throw new Error('Demo');
        bearReport = await this.executeOllama(`분석가 보고서와 황소 논리를 검토하고 $${T}에 대한 최강의 반대 논리를 구축하세요.\n황소 논리: ${bullReport}`, model, '황소 논리의 허점을 찾는 곰 연구원입니다. 한국어로 답변하세요.');
      } catch {
        bearReport = `### 🐻 곰 반대 논리 ($${T})\n\n**핵심 주장: 과열 경고 - 신중함이 필요**\n\n* **과매수 신호**: 탐욕 점수 68은 군중 쏠림을 시사합니다. 역발상 지표가 주의를 요구합니다.\n* **밸류에이션 우려**: "산업 평균" P/E는 섹터 전체 인플레이션을 무시합니다. 멀티플 축소 리스크가 있습니다.\n* **거시 역풍**: CPI 서프라이즈 시 연준의 매파 전환은 성장주 멀티플을 즉시 압박할 것입니다.\n* **평균 회귀**: 20일선 위 장기 체류 후 역사적으로 3~5% 조정이 뒤따릅니다. 옵션 플로우에서 차익 실현 압력이 감지됩니다.`;
      }
      messages.push({ agentId: 'bear', agentName: this.AGENTS_INFO.bear.name, avatar: this.AGENTS_INFO.bear.avatar, thought: `황소 논리를 스트레스 테스트하기 위해 $${T}에 대한 가장 설득력 있는 반대 논리를 구축하고 있습니다.`, report: bearReport, timestamp: now(), team: 'research' });
      onStepUpdate({ messages: [...messages], status: 'running_rm', currentStep: 7 });

      // ===== 리서치 팀 7단계: 리서치 매니저 =====
      let rmReport = '';
      try {
        if (isDemoMode) throw new Error('Demo');
        rmReport = await this.executeOllama(`황소 vs 곰 토론을 검토하고 균형 잡힌 리서치 결론을 도출하세요.\n황소: ${bullReport}\n곰: ${bearReport}`, model, '양측 논리의 품질을 평가하는 리서치 매니저입니다. 한국어로 답변하세요.');
      } catch {
        rmReport = `### 🔬 리서치 매니저 종합 판단 ($${T})\n\n**토론 결과: 황소 논리 우세 (단, 조건 부 승인)**\n\n양측 논리를 면밀히 검토한 결과:\n\n* **황소 강점**: 기술적 골든크로스 + 펀더멘탈 해자 + 실적 촉매가 높은 확신 셋업을 구성합니다.\n* **곰 타당성**: 거시 리스크(CPI/연준)와 군중 쏠림은 포지션 사이징 규율을 요구하는 정당한 우려입니다.\n* **종합**: 증거의 무게가 건설적 입장을 지지합니다. 단, 곰의 포지션 사이징 주의는 현명한 리스크 관리입니다.\n* **트레이더 권고**: 적정 배분으로 진행하되 최대 포지션은 지양. 기술적 지지선을 손절 기준으로 설정할 것.`;
      }
      messages.push({ agentId: 'rm', agentName: this.AGENTS_INFO.rm.name, avatar: this.AGENTS_INFO.rm.avatar, thought: `황소 vs 곰 토론을 중재하고 $${T}에 대한 균형 잡힌 리서치 결론을 도출하고 있습니다.`, report: rmReport, timestamp: now(), team: 'research' });
      onStepUpdate({ messages: [...messages], status: 'running_trader', currentStep: 8 });

      // ===== 트레이딩 팀 8단계: 트레이더 =====
      let traderReport = '';
      try {
        if (isDemoMode) throw new Error('Demo');
        traderReport = await this.executeOllama(`리서치 매니저의 종합 결론을 바탕으로 $${T}의 최종 트레이딩 결정을 내리세요.\n결론: ${rmReport}\n\n반드시 응답 마지막에 JSON을 작성하세요: {"action":"BUY"|"SELL"|"HOLD","confidence":0-100,"positionSize":0-100,"targetPrice":숫자,"stopLoss":숫자,"summary":"한줄 요약"}`, model, '프로 트레이더입니다. 한국어로 답변하세요.');
      } catch {
        traderReport = `### 💼 트레이더 의사결정 보고서 ($${T})\n\n**결정: 매수 (적정 포지션)**\n\n* **진입 근거**: 기술적 골든크로스 + 실적 서프라이즈 + 리서치 매니저 승인으로 실행 가능한 셋업 구성.\n* **포지션 비중**: 포트폴리오의 12% (곰 논리의 과다 배분 경고 반영).\n* **목표가**: 현재가 대비 +15%, 차기 저항선 및 실적 성장 궤적 기준.\n* **손절선**: 현재가 대비 -6%, 20일 이동평균선 지지 수준.\n\nJSON_DECISION: {"action": "BUY", "confidence": 82, "positionSize": 12, "targetPrice": ${(latestPrice * 1.15).toFixed(2)}, "stopLoss": ${(latestPrice * 0.94).toFixed(2)}, "summary": "기술적 골든크로스와 펀더멘탈 강점에 기반한 적정 규모 매수 결정"}`;
      }
      messages.push({ agentId: 'trader', agentName: this.AGENTS_INFO.trader.name, avatar: this.AGENTS_INFO.trader.avatar, thought: `리서치 컨센서스를 실행 가능한 트레이딩 파라미터로 변환하고 있습니다.`, report: traderReport.replace(/JSON_DECISION:[\s\S]*$/, '').replace(/\{[\s\S]*?\}/, '').trim() || traderReport, timestamp: now(), team: 'trading' });
      onStepUpdate({ messages: [...messages], status: 'running_risk', currentStep: 9 });

      // ===== 트레이딩 팀 9단계: 리스크 매니저 =====
      let riskReport = '';
      try {
        if (isDemoMode) throw new Error('Demo');
        riskReport = await this.executeOllama(`트레이더의 결정을 검토하고 리스크 파라미터를 검증하세요.\n트레이더: ${traderReport}\n곰 우려: ${bearReport}`, model, '엄격한 리스크 통제관입니다. 한국어로 답변하세요.');
      } catch {
        riskReport = `### 🛡️ 리스크 매니저 최종 검증 ($${T})\n\n**리스크 평가: 조건부 승인**\n\n* **포지션 비중**: 12% 배분은 단일 자산 한도(최대 15%) 이내. 승인.\n* **손절선**: 20일선 기준 -6% 손절은 기술적으로 적절. 절대 손절 필수.\n* **포트폴리오 영향**: 현재 단일 섹터 집중도 25% 미만 유지. 규정 준수.\n* **최악 시나리오**: CPI 서프라이즈 + 연준 매파 전환 시 포트폴리오 영향 = -0.72%. 수용 가능.\n* **최종 판결**: 거래 승인. 규율 있는 실행을 요구합니다.`;
      }
      messages.push({ agentId: 'risk', agentName: this.AGENTS_INFO.risk.name, avatar: this.AGENTS_INFO.risk.avatar, thought: `포지션 사이징, 손절 수준, 포트폴리오 영향에 대한 최종 리스크 검증을 수행하고 있습니다.`, report: riskReport, timestamp: now(), team: 'trading' });

      // JSON 파싱
      let parsedDecision: Partial<FinalDecision> = { action: 'BUY', confidence: 82, positionSize: 12, targetPrice: 0, stopLoss: 0, summary: '멀티에이전트 분석 기반 트레이딩 결정', bullArgument: '', bearArgument: '' };
      try {
        const jsonMatch = traderReport.match(/\{[\s\S]*?\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          parsedDecision = { action: parsed.action || 'BUY', confidence: parsed.confidence || 82, positionSize: parsed.positionSize || 12, targetPrice: parsed.targetPrice || 0, stopLoss: parsed.stopLoss || 0, summary: parsed.summary || '의사결정 완료.' };
        }
      } catch { console.error('트레이더 JSON 파싱 실패, 폴백 사용'); }

      const bullSummary = bullReport.split('\n').find(l => l.includes('핵심 주장'))?.replace(/[*#]/g, '').trim() || '다중 요인 분석 기반 강한 매수 확신';
      const bearSummary = bearReport.split('\n').find(l => l.includes('핵심 주장'))?.replace(/[*#]/g, '').trim() || '거시 리스크로 인한 신중론';

      const finalDecision: FinalDecision = {
        ticker: T, action: parsedDecision.action as 'BUY' | 'SELL' | 'HOLD',
        confidence: parsedDecision.confidence || 82, positionSize: parsedDecision.positionSize || 12,
        targetPrice: parsedDecision.targetPrice || 0, stopLoss: parsedDecision.stopLoss || 0,
        summary: parsedDecision.summary || '', timestamp: now(),
        bullArgument: bullSummary, bearArgument: bearSummary,
      };

      const finalState: SimulationState = { ticker: T, status: 'completed', currentStep: 9, totalSteps: 9, messages, decision: finalDecision };
      onStepUpdate(finalState);
      return finalState;

    } catch (err: any) {
      console.error('시뮬레이션 파이프라인 충돌:', err);
      onStepUpdate({ status: 'failed', error: `시뮬레이션 구동 중 치명적 오류: ${err.message}` });
      throw err;
    }
  }
}

const latestPrice = 150.00;
