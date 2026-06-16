import React, { useState, useEffect } from 'react';
import { Settings, X, Key, Cpu, Eye, EyeOff } from 'lucide-react';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose }) => {
  const [isDemoMode, setIsDemoMode] = useState<boolean>(true);
  const [e2bApiKey, setE2bApiKey] = useState<string>('');
  const [ollamaHost, setOllamaHost] = useState<string>('http://localhost:11434');
  const [targetModel, setTargetModel] = useState<string>('gemma2:2b');
  const [showKey, setShowKey] = useState<boolean>(false);

  useEffect(() => {
    // Load saved settings
    const savedDemo = localStorage.getItem('ta_demo_mode');
    const savedE2b = localStorage.getItem('ta_e2b_api_key');
    const savedHost = localStorage.getItem('ta_ollama_host');
    const savedModel = localStorage.getItem('ta_target_model');

    if (savedDemo !== null) setIsDemoMode(savedDemo === 'true');
    if (savedE2b) setE2bApiKey(savedE2b);
    if (savedHost) setOllamaHost(savedHost);
    if (savedModel) setTargetModel(savedModel);
  }, []);

  const handleSave = () => {
    localStorage.setItem('ta_demo_mode', String(isDemoMode));
    localStorage.setItem('ta_e2b_api_key', e2bApiKey);
    localStorage.setItem('ta_ollama_host', ollamaHost);
    localStorage.setItem('ta_target_model', targetModel);
    
    // Force page reload to apply settings globally
    window.location.reload();
  };

  if (!isOpen) return null;

  return (
    <div style={modalStyles.overlay}>
      <div className="glass-panel" style={modalStyles.container}>
        <div style={modalStyles.header}>
          <div style={modalStyles.titleArea}>
            <Settings size={20} color="var(--neon-violet)" />
            <h3 style={modalStyles.title}>시뮬레이션 가동 설정</h3>
          </div>
          <button style={modalStyles.closeBtn} onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div style={modalStyles.body}>
          {/* Mode Switcher */}
          <div style={modalStyles.section}>
            <label style={modalStyles.label}>구동 환경 모드</label>
            <div style={modalStyles.toggleContainer}>
              <button
                style={{
                  ...modalStyles.toggleBtn,
                  ...(isDemoMode ? modalStyles.toggleBtnActive : {}),
                }}
                onClick={() => setIsDemoMode(true)}
              >
                🎮 데모 체험 모드 (즉시 테스트)
              </button>
              <button
                style={{
                  ...modalStyles.toggleBtn,
                  ...(!isDemoMode ? modalStyles.toggleBtnActive : {}),
                }}
                onClick={() => setIsDemoMode(false)}
              >
                ⚡ 실시간 샌드박스 (Ollama + E2B)
              </button>
            </div>
            <p style={modalStyles.description}>
              {isDemoMode 
                ? '데모 체험 모드는 E2B 키나 로컬 Ollama 실행 없이 고충실도 시뮬레이션 데이터를 즉시 돌려볼 수 있어 모바일 단독 체험에 가장 적합합니다.'
                : '실시간 샌드박스는 실제 로컬 PC의 Ollama 모델(Gemma)과 E2B 파이썬 샌드박스를 사용하여 실제 주식/코인 시세를 실시간 분석합니다.'}
            </p>
          </div>

          {!isDemoMode && (
            <>
              {/* E2B API Key */}
              <div style={modalStyles.section}>
                <label style={modalStyles.label}>
                  <Key size={14} style={{ marginRight: 6 }} />
                  E2B Sandbox API Key
                </label>
                <div style={modalStyles.inputWrapper}>
                  <input
                    type={showKey ? 'text' : 'password'}
                    className="glass-input"
                    value={e2bApiKey}
                    onChange={(e) => setE2bApiKey(e.target.value)}
                    placeholder="sbx_..."
                  />
                  <button 
                    style={modalStyles.eyeBtn}
                    onClick={() => setShowKey(!showKey)}
                  >
                    {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                <p style={modalStyles.description}>
                  파이썬 코드를 샌드박스에서 돌리기 위해 필요한 무료 API 키입니다.{' '}
                  <a href="https://e2b.dev/" target="_blank" rel="noreferrer" style={{ color: 'var(--text-link)' }}>
                    e2b.dev
                  </a>
                  에서 5초 만에 무료 발급할 수 있습니다.
                </p>
              </div>

              {/* Ollama URL */}
              <div style={modalStyles.section}>
                <label style={modalStyles.label}>
                  <Cpu size={14} style={{ marginRight: 6 }} />
                  Ollama Base URL (로컬 LLM)
                </label>
                <input
                  type="text"
                  className="glass-input"
                  value={ollamaHost}
                  onChange={(e) => setOllamaHost(e.target.value)}
                  placeholder="http://localhost:11434"
                />
                <p style={modalStyles.description}>
                  집 PC의 Ollama 주소입니다. 외부 모바일 네트워크에서 접속할 경우,{' '}
                  <span style={{ color: 'var(--neon-amber)' }}>Cloudflare Tunnel 무료 HTTPS 주소</span>를 여기에 넣으시면 됩니다.
                </p>
              </div>

              {/* Model Select */}
              <div style={modalStyles.section}>
                <label style={modalStyles.label}>분석 타겟 LLM 모델</label>
                <input
                  type="text"
                  className="glass-input"
                  value={targetModel}
                  onChange={(e) => setTargetModel(e.target.value)}
                  placeholder="gemma2:2b"
                />
                <p style={modalStyles.description}>
                  Ollama에 다운로드(`ollama pull`) 받아 둔 트레이딩 분석용 모델명입니다. 예: `gemma2:2b`, `qwen2.5:7b`, `llama3.2:1b`
                </p>
              </div>
            </>
          )}
        </div>

        <div style={modalStyles.footer}>
          <button style={modalStyles.cancelBtn} onClick={onClose}>
            취소
          </button>
          <button className="btn-premium" style={modalStyles.saveBtn} onClick={handleSave}>
            저장 및 적용
          </button>
        </div>
      </div>
    </div>
  );
};

const modalStyles = {
  overlay: {
    position: 'fixed' as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    backdropFilter: 'blur(5px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
    padding: 16,
  },
  container: {
    width: '100%',
    maxWidth: 500,
    borderRadius: 20,
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column' as const,
    animation: 'fadeInUp 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
  },
  header: {
    padding: '16px 20px',
    borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  titleArea: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  title: {
    fontSize: 18,
    color: '#ffffff',
    fontWeight: 600,
  },
  closeBtn: {
    background: 'none',
    border: 'none',
    color: 'var(--text-secondary)',
    cursor: 'pointer',
    padding: 4,
    borderRadius: '50%',
    transition: 'background 0.2s',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    padding: 20,
    overflowY: 'auto' as const,
    maxHeight: '70vh',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 16,
  },
  section: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 8,
  },
  label: {
    fontSize: 14,
    fontWeight: 500,
    color: 'var(--text-primary)',
    display: 'flex',
    alignItems: 'center',
  },
  toggleContainer: {
    display: 'flex',
    gap: 8,
    background: 'rgba(0,0,0,0.4)',
    padding: 4,
    borderRadius: 12,
    border: '1px solid var(--glass-border)',
  },
  toggleBtn: {
    flex: 1,
    padding: '10px 6px',
    borderRadius: 8,
    border: 'none',
    background: 'none',
    color: 'var(--text-secondary)',
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  },
  toggleBtnActive: {
    background: 'var(--neon-violet)',
    color: '#ffffff',
    boxShadow: '0 2px 8px var(--neon-violet-glow)',
  },
  description: {
    fontSize: 11,
    color: 'var(--text-muted)',
    lineHeight: 1.4,
  },
  inputWrapper: {
    position: 'relative' as const,
    display: 'flex',
    alignItems: 'center',
  },
  eyeBtn: {
    position: 'absolute' as const,
    right: 12,
    background: 'none',
    border: 'none',
    color: 'var(--text-secondary)',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
  },
  footer: {
    padding: '12px 20px',
    borderTop: '1px solid rgba(255, 255, 255, 0.08)',
    display: 'flex',
    justifyContent: 'flex-end',
    gap: 10,
    background: 'rgba(0,0,0,0.2)',
  },
  cancelBtn: {
    background: 'rgba(255, 255, 255, 0.05)',
    border: '1px solid var(--glass-border)',
    color: 'var(--text-primary)',
    padding: '10px 16px',
    borderRadius: 10,
    fontSize: 14,
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  saveBtn: {
    padding: '10px 20px',
    fontSize: 14,
  }
};
