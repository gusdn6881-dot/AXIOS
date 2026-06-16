import React from 'react';

interface Plot {
  type: 'png' | 'svg';
  base64?: string;
  content?: string;
}

interface TechnicalChartProps {
  plots: Plot[];
}

export const TechnicalChart: React.FC<TechnicalChartProps> = ({ plots }) => {
  if (!plots || plots.length === 0) {
    return (
      <div style={chartStyles.placeholder}>
        차트 이미지를 생성하지 못했습니다.
      </div>
    );
  }

  return (
    <div style={chartStyles.container}>
      {plots.map((plot, idx) => {
        if (plot.type === 'svg' && plot.content) {
          // Render raw SVG safely
          return (
            <div 
              key={idx}
              style={chartStyles.svgWrapper}
              dangerouslySetInnerHTML={{ __html: plot.content }}
            />
          );
        } else if (plot.type === 'png' && plot.base64) {
          // Render Base64 PNG
          return (
            <img 
              key={idx}
              src={`data:image/png;base64,${plot.base64}`} 
              alt="E2B Technical Chart" 
              style={chartStyles.img}
            />
          );
        }
        return null;
      })}
    </div>
  );
};

const chartStyles = {
  container: {
    width: '100%',
    background: 'rgba(0,0,0,0.3)',
    border: '1px solid var(--glass-border)',
    borderRadius: 12,
    overflow: 'hidden',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 8,
    boxShadow: '0 4px 15px rgba(0,0,0,0.3)',
  },
  placeholder: {
    padding: 20,
    textAlign: 'center' as const,
    color: 'var(--text-muted)',
    fontSize: 12,
    border: '1px dashed rgba(255,255,255,0.1)',
    borderRadius: 12,
  },
  svgWrapper: {
    width: '100%',
    height: 'auto',
    display: 'flex',
    justifyContent: 'center',
  },
  img: {
    width: '100%',
    height: 'auto',
    display: 'block',
    borderRadius: 8,
  }
};
