import React from 'react';

interface TerminalLogProps {
  logs: string;
}

export const TerminalLog: React.FC<TerminalLogProps> = ({ logs }) => {
  if (!logs) return null;

  return (
    <div className="terminal-box" style={termStyles.box}>
      <div style={termStyles.header}>
        <div style={termStyles.dotRed}></div>
        <div style={termStyles.dotYellow}></div>
        <div style={termStyles.dotGreen}></div>
        <span style={termStyles.title}>E2B Python Console (Isolated Sandbox)</span>
      </div>
      <div style={termStyles.content}>
        {logs.split('\n').map((line, idx) => (
          <div key={idx} className="terminal-line" style={termStyles.line}>
            <span className="terminal-prompt" style={termStyles.prompt}>$ </span>
            <span>{line}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

const termStyles = {
  box: {
    display: 'flex',
    flexDirection: 'column' as const,
    background: '#04020a',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: 10,
    fontFamily: "Consolas, 'Fira Code', Monaco, monospace",
    fontSize: 12,
    color: '#10b981',
    overflow: 'hidden',
    boxShadow: 'inset 0 0 20px rgba(0,0,0,0.9), 0 4px 15px rgba(0,0,0,0.4)',
    height: 'auto',
    maxHeight: 220,
  },
  header: {
    background: 'rgba(255,255,255,0.03)',
    borderBottom: '1px solid rgba(255,255,255,0.06)',
    padding: '8px 12px',
    display: 'flex',
    alignItems: 'center',
    gap: 6,
  },
  dotRed: { width: 8, height: 8, borderRadius: '50%', background: '#ef4444' },
  dotYellow: { width: 8, height: 8, borderRadius: '50%', background: '#f59e0b' },
  dotGreen: { width: 8, height: 8, borderRadius: '50%', background: '#10b981' },
  title: {
    marginLeft: 8,
    fontSize: 10,
    color: 'var(--text-muted)',
    fontWeight: 600,
    letterSpacing: '0.05em',
  },
  content: {
    padding: 12,
    overflowY: 'auto' as const,
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 4,
    textAlign: 'left' as const,
    whiteSpace: 'pre-wrap' as const,
    wordBreak: 'break-all' as const,
  },
  line: {
    lineHeight: 1.4,
  },
  prompt: {
    color: '#a78bfa',
    fontWeight: 'bold' as const,
  }
};
