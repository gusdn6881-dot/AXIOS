import React, { useState, useEffect } from 'react';
import { ExternalConnectionsConfig } from '../types/config';

export const ExternalConnections: React.FC = () => {
  const [config, setConfig] = useState<ExternalConnectionsConfig | null>(null);
  const [threadsToken, setThreadsToken] = useState('');
  const [threadsUserId, setThreadsUserId] = useState('');

  // 안티그래비티 호스트 익스텐션 IPC 메시지 루프 바인딩
  useEffect(() => {
    // 로컬 agents/<id>/config.md의 기존 저장된 데이터 상태 요청
    window.postMessage({ command: 'loadConfig' }, '*');

    const handleMessage = (event: MessageEvent) => {
      const message = event.data;
      if (message.command === 'initConfig' && message.data) {
        setConfig(message.data);
        if (message.data.threads) {
          setThreadsToken(message.data.threads.accessToken || '');
          setThreadsUserId(message.data.threads.userId || '');
        }
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const handleSaveThreads = () => {
    if (!config) return;

    // 불변성(Immutability)을 준수하여 데이터 갱신
    const updatedConfig: ExternalConnectionsConfig = {
      ...config,
      threads: {
        accessToken: threadsToken.trim(),
        userId: threadsUserId.trim(),
        connected: threadsToken.trim().length > 0 && threadsUserId.trim().length > 0
      }
    };

    // 안티그래비티 Core IPC 채널을 통해 하드디스크 쓰기 연산 요청 전달
    window.postMessage({
      command: 'saveConfig',
      data: updatedConfig
    }, '*');

    setConfig(updatedConfig);
  };

  if (!config) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#020617]">
        <p className="text-slate-400 font-medium text-sm animate-pulse">로컬 설정 동기화 중...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#020617] p-8 text-slate-100 font-sans">
      {/* 최상단 헤더 정보 표시 영역 */}
      <div className="mb-8 border-b border-slate-800/60 pb-6">
        <span className="text-xs font-bold text-amber-400 uppercase tracking-widest block mb-1">AXIOS · 외부 연결</span>
        <h1 className="text-3xl font-extrabold text-white tracking-tight">API 키 한 곳에서 관리</h1>
        <p className="text-slate-400 text-sm mt-2 max-w-3xl leading-relaxed">
          텔레그램 · YouTube · Google Calendar · GitHub · Instagram · Threads — 모든 자격증명을 한 패널에서 입력하고 자율 저장합니다.
          같은 값이 각 에이전트의 로컬 데이터인 <code className="bg-slate-900 px-1.5 py-0.5 rounded text-amber-300 border border-slate-800 font-mono text-xs">_agents/&lt;id&gt;/config.md</code> 파일로 빌드되어 기록됩니다.
        </p>
      </div>

      {/* 대시보드 카드 레이아웃 그리드 시스템 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

        {/* 기존 연동 컴포넌트(Telegram, YouTube) 배치 블록 - 레이아웃 구조 유지 */}

        {/* 신규 확장 적용된 Threads API 전용 연동 카드 컴포넌트 */}
        <div className="border border-slate-800 bg-[#0f172a] p-5 rounded-xl shadow-xl flex flex-col gap-4 transition-all hover:border-slate-700">
          <div>
            <div className="flex justify-between items-center mb-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-slate-950 border border-slate-800 flex items-center justify-center text-xl shadow-inner">
                  🧵
                </div>
                <div>
                  <h3 className="text-white font-bold text-base tracking-tight">Threads API</h3>
                </div>
              </div>
              <span className={`px-2.5 py-1 rounded-full text-[11px] font-bold tracking-wider uppercase transition-all ${config.threads?.connected
                ? 'bg-emerald-950/60 text-emerald-400 border border-emerald-800'
                : 'bg-slate-900 text-slate-500 border border-slate-800'
                }`}>
                {config.threads?.connected ? '● 연결됨' : '미설정'}
              </span>
            </div>

            <p className="text-slate-400 text-xs leading-relaxed mb-4">
              로컬 가상사무실 지식 비서 엔진이 Threads 계정과 연동하여 마크다운 산출물을 자율 교차 업로드하고 포스트 피드 및 소셜 통계 데이터를 수집합니다.
            </p>

            <div className="space-y-3">
              <div>
                <label className="block text-slate-300 text-xs font-bold mb-1 tracking-wide uppercase">Access Token</label>
                <input
                  type="password"
                  className="w-full bg-[#020617] text-white border border-slate-800 rounded-lg p-2 text-xs font-mono focus:outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-400 transition-all placeholder:text-slate-600"
                  value={threadsToken}
                  onChange={(e: any) => setThreadsToken(e.target.value)}
                  placeholder="발급받은 Graph API 토큰 코드 입력 (EAAG...)"
                />
              </div>

              <div>
                <label className="block text-slate-300 text-xs font-bold mb-1 tracking-wide uppercase">User ID</label>
                <input
                  type="text"
                  className="w-full bg-[#020617] text-white border border-slate-800 rounded-lg p-2 text-xs focus:outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-400 transition-all placeholder:text-slate-600"
                  value={threadsUserId}
                  onChange={(e: any) => setThreadsUserId(e.target.value)}
                  placeholder="스레드 유저 고유 ID 계정 식별 번호"
                />
              </div>
            </div>
          </div>

          <div className="flex gap-2.5 pt-4 mt-2 border-t border-slate-800/60">
            <button
              onClick={handleSaveThreads}
              className="bg-amber-400 hover:bg-amber-500 text-slate-900 font-extrabold px-5 py-2.5 rounded-lg text-xs flex items-center gap-1.5 transition-all shadow-lg active:scale-95"
            >
              💾 저장
            </button>
            <button className="border border-slate-700 hover:bg-slate-800 text-slate-300 px-4 py-2.5 rounded-lg text-xs font-semibold transition-all">
              도움말
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
