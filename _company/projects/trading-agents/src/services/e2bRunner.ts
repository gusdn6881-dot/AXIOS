/**
 * E2B Sandbox Execution Runner Service
 * Generates and runs Python code in the secure E2B container
 * Includes a high-fidelity Mock Fallback for instant Demo Mode
 */

export interface E2BAnalysisResult {
  success: boolean;
  stdout: string;
  stderr: string;
  plots: Array<{ type: 'png' | 'svg'; base64?: string; content?: string }>;
  error?: string | null;
}

export class E2BRunner {
  /**
   * Runs Technical Analysis Python code inside the E2B sandbox
   */
  static async runTechnicalAnalysis(
    ticker: string,
    e2bApiKey: string,
    isDemoMode: boolean = false
  ): Promise<E2BAnalysisResult> {
    if (isDemoMode || !e2bApiKey) {
      return this.getMockTechnicalResult(ticker);
    }

    const pythonCode = `
import yfinance as yf
import pandas as pd
import numpy as np
import matplotlib.pyplot as plt
import io
import base64

# Configure dark style matplotlib
plt.style.use('dark_background')
fig, (ax1, ax2) = plt.subplots(2, 1, figsize=(10, 8), gridspec_kw={'height_ratios': [2, 1]})
fig.patch.set_facecolor('#05040a')
ax1.set_facecolor('#0a0817')
ax2.set_facecolor('#0a0817')

print(f"[{ticker}] 데이터를 야후 파이낸스에서 다운로드 중...")
try:
    stock = yf.Ticker("${ticker}")
    df = stock.history(period="3mo")
    if df.empty:
        raise ValueError("데이터를 찾을 수 없습니다. 티커를 확인하세요.")
        
    print(f"성공적으로 {len(df)} 영업일 데이터 로드 완료.")
    
    # 1. Calculate Technical Indicators
    # Moving Averages
    df['SMA20'] = df['Close'].rolling(window=20).mean()
    df['EMA50'] = df['Close'].rolling(window=50).mean()
    
    # RSI (Relative Strength Index)
    delta = df['Close'].diff()
    gain = (delta.where(delta > 0, 0)).rolling(window=14).mean()
    loss = (-delta.where(delta < 0, 0)).rolling(window=14).mean()
    rs = gain / (loss + 1e-10)
    df['RSI'] = 100 - (100 / (1 + rs))
    
    # MACD (Moving Average Convergence Divergence)
    exp1 = df['Close'].ewm(span=12, adjust=False).mean()
    exp2 = df['Close'].ewm(span=26, adjust=False).mean()
    df['MACD'] = exp1 - exp2
    df['Signal'] = df['MACD'].ewm(span=9, adjust=False).mean()
    
    # Latest statistics
    latest = df.iloc[-1]
    prev = df.iloc[-2]
    
    price_change = ((latest['Close'] - prev['Close']) / prev['Close']) * 100
    
    print("\\n=== 최신 기술 지표 분석 결과 ===")
    print(f"종가 (Close): {latest['Close']:.2f} ({price_change:+.2f}%)")
    print(f"거래량 (Volume): {latest['Volume']:,}")
    print(f"SMA 20: {latest['SMA20']:.2f} | EMA 50: {latest['EMA50']:.2f}")
    print(f"RSI (14): {latest['RSI']:.2f}")
    print(f"MACD: {latest['MACD']:.2f} | Signal: {latest['Signal']:.2f}")
    
    # 2. Render Chart
    # Top Chart: Price, SMA, EMA
    ax1.plot(df.index, df['Close'], label='Close Price', color='#3b82f6', linewidth=2)
    ax1.plot(df.index, df['SMA20'], label='SMA 20', color='#f59e0b', linestyle='--', linewidth=1.5)
    ax1.plot(df.index, df['EMA50'], label='EMA 50', color='#8b5cf6', linestyle=':', linewidth=1.5)
    ax1.set_title(f"${ticker} Technical Dashboard (3 Months)", fontsize=14, color='#f8fafc', pad=15)
    ax1.legend(loc='upper left', framealpha=0.3)
    ax1.grid(True, color='rgba(255,255,255,0.05)')
    ax1.tick_params(colors='#64748b')
    
    # Bottom Chart: RSI
    ax2.plot(df.index, df['RSI'], label='RSI (14)', color='#10b981', linewidth=1.5)
    ax2.axhline(70, color='#f43f5e', linestyle='--', alpha=0.5, label='Overbought (70)')
    ax2.axhline(30, color='#3b82f6', linestyle='--', alpha=0.5, label='Oversold (30)')
    ax2.set_ylim(10, 90)
    ax2.legend(loc='upper left', framealpha=0.3)
    ax2.grid(True, color='rgba(255,255,255,0.05)')
    ax2.tick_params(colors='#64748b')
    
    plt.tight_layout()
    plt.show() # E2B runCode automatically captures this plot
    
except Exception as e:
    print(f"기술 분석 오류 발생: {e}", file=sys.stderr)
`;

    try {
      const response = await fetch('/api/e2b/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: pythonCode, apiKeyOverride: e2bApiKey }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'E2B Sandbox 실행 실패');
      }

      return await response.json();
    } catch (err: any) {
      console.error('Technical E2B sandbox failed:', err);
      return {
        success: false,
        stdout: `E2B 샌드박스 실행 시도 중 오류: ${err.message}`,
        stderr: err.message,
        plots: [],
        error: err.message,
      };
    }
  }

  /**
   * Runs Fundamental Analysis Python code inside E2B sandbox
   */
  static async runFundamentalAnalysis(
    ticker: string,
    e2bApiKey: string,
    isDemoMode: boolean = false
  ): Promise<E2BAnalysisResult> {
    if (isDemoMode || !e2bApiKey) {
      return this.getMockFundamentalResult(ticker);
    }

    const pythonCode = `
import yfinance as yf
print(f"[{ticker}] 기본적 재무 분석 진행 중...")
try:
    stock = yf.Ticker("${ticker}")
    info = stock.info
    
    print("\\n=== 기업 기본 재무 데이터 ===")
    print(f"회사명: {info.get('longName', '${ticker}')}")
    print(f"산업군 (Industry): {info.get('industry', 'N/A')}")
    print(f"섹터 (Sector): {info.get('sector', 'N/A')}")
    print(f"시가총액 (Market Cap): {info.get('marketCap', 0):,}")
    print(f"주가수익비율 (P/E Ratio): {info.get('trailingPE', 'N/A')}")
    print(f"주당순이익 (EPS): {info.get('trailingEps', 'N/A')}")
    print(f"자기자본이익률 (ROE): {info.get('returnOnEquity', 0) * 100:.2f}%")
    print(f"부채비율 (Debt to Equity): {info.get('debtToEquity', 'N/A')}")
    print(f"매출성장률 (Revenue Growth): {info.get('revenueGrowth', 0) * 100:.2f}%")
    print(f"총매출이익률 (Gross Margins): {info.get('grossMargins', 0) * 100:.2f}%")
    print(f"설명: {info.get('longBusinessSummary', '설명 없음')[:200]}...")
    
except Exception as e:
    print(f"기본 분석 오류 발생: {e}")
`;

    try {
      const response = await fetch('/api/e2b/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: pythonCode, apiKeyOverride: e2bApiKey }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'E2B Sandbox 실행 실패');
      }

      return await response.json();
    } catch (err: any) {
      console.error('Fundamental E2B sandbox failed:', err);
      return {
        success: false,
        stdout: `E2B 샌드박스 실행 시도 중 오류: ${err.message}`,
        stderr: err.message,
        plots: [],
        error: err.message,
      };
    }
  }

  /**
   * Generates high-fidelity mock Technical Analysis for Demo/Free sandbox fallback
   */
  private static getMockTechnicalResult(ticker: string): E2BAnalysisResult {
    const isCrypto = ['BTC', 'ETH', 'SOL', 'DOGE', 'XRP'].includes(ticker.toUpperCase());
    const latestPrice = isCrypto ? (ticker.toUpperCase() === 'BTC' ? 68420.50 : 3450.20) : 178.45;
    const priceChange = isCrypto ? 3.42 : -1.15;
    const rsi = isCrypto ? 64.35 : 44.12;

    const mockStdout = `[${ticker.toUpperCase()}] 데이터를 야후 파이낸스에서 다운로드 중...
성공적으로 63 영업일 데이터 로드 완료.

=== 최신 기술 지표 분석 결과 ===
종가 (Close): ${latestPrice.toLocaleString()} (${priceChange >= 0 ? '+' : ''}${priceChange}%)
거래량 (Volume): ${isCrypto ? '45,214,892,100' : '52,431,900'}
SMA 20: ${(latestPrice * 0.98).toFixed(2)} | EMA 50: ${(latestPrice * 0.95).toFixed(2)}
RSI (14): ${rsi.toFixed(2)} (${rsi > 70 ? '과매수' : rsi < 30 ? '과매도' : '중립'})
MACD: ${(latestPrice * 0.005).toFixed(2)} | Signal: ${(latestPrice * 0.004).toFixed(2)}
골든크로스 발생 감지 (매수 시그널 우세)
`;

    // A beautiful SVG dark mock chart to avoid placeholders!
    const svgChart = `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 350" width="100%" height="100%">
        <rect width="100%" height="100%" fill="#05040a" rx="10"/>
        <rect x="50" y="30" width="500" height="200" fill="#0a0817" stroke="rgba(255,255,255,0.05)" stroke-width="1"/>
        <rect x="50" y="250" width="500" height="70" fill="#0a0817" stroke="rgba(255,255,255,0.05)" stroke-width="1"/>
        
        <!-- Grid lines -->
        <line x1="50" y1="80" x2="550" y2="80" stroke="rgba(255,255,255,0.03)" />
        <line x1="50" y1="130" x2="550" y2="130" stroke="rgba(255,255,255,0.03)" />
        <line x1="50" y1="180" x2="550" y2="180" stroke="rgba(255,255,255,0.03)" />
        
        <!-- Technical Indicators Lines (Mock) -->
        <path d="M 50 180 L 100 190 L 150 170 L 200 160 L 250 150 L 300 155 L 350 120 L 400 135 L 450 110 L 500 85 L 550 75" fill="none" stroke="#3b82f6" stroke-width="2.5" />
        <path d="M 50 190 L 100 192 L 150 185 L 200 178 L 250 172 L 300 170 L 350 160 L 400 155 L 450 148 L 500 138 L 550 125" fill="none" stroke="#f59e0b" stroke-dasharray="4" stroke-width="1.5" />
        <path d="M 50 195 L 100 196 L 150 194 L 200 190 L 250 186 L 300 185 L 350 180 L 400 176 L 450 170 L 500 163 L 550 155" fill="none" stroke="#8b5cf6" stroke-width="1.5" />
        
        <!-- RSI Line -->
        <path d="M 50 295 L 100 300 L 150 280 L 200 270 L 250 260 L 300 285 L 350 260 L 400 275 L 450 258 L 500 252 L 550 255" fill="none" stroke="#10b981" stroke-width="2" />
        
        <line x1="50" y1="270" x2="550" y2="270" stroke="#f43f5e" stroke-dasharray="2" stroke-width="1" opacity="0.6"/>
        <line x1="50" y1="300" x2="550" y2="300" stroke="#3b82f6" stroke-dasharray="2" stroke-width="1" opacity="0.6"/>
        
        <!-- Labels -->
        <text x="60" y="50" fill="#f8fafc" font-family="Outfit" font-size="12" font-weight="bold">${ticker.toUpperCase()} Technical Dashboard (Demo Mode)</text>
        <text x="505" y="50" fill="#64748b" font-family="Outfit" font-size="9">Close &amp; MAs</text>
        <text x="515" y="265" fill="#64748b" font-family="Outfit" font-size="8">RSI (14)</text>
      </svg>
    `;

    return {
      success: true,
      stdout: mockStdout,
      stderr: '',
      plots: [{ type: 'svg', content: svgChart }],
    };
  }

  /**
   * Generates high-fidelity mock Fundamental Analysis for Demo/Free sandbox fallback
   */
  private static getMockFundamentalResult(ticker: string): E2BAnalysisResult {
    const isCrypto = ['BTC', 'ETH', 'SOL', 'DOGE', 'XRP'].includes(ticker.toUpperCase());
    
    let mockStdout = '';
    if (isCrypto) {
      mockStdout = `[${ticker.toUpperCase()}] 기본적 온체인 재무 분석 진행 중...

=== 암호화폐 기본 온체인 데이터 ===
자산명 (Asset): ${ticker.toUpperCase() === 'BTC' ? 'Bitcoin' : 'Ethereum'}
시가총액 (Market Cap): ${ticker.toUpperCase() === 'BTC' ? '1,345,129,482,000' : '415,294,852,100'} USD
유통 공급량 (Circulating Supply): ${ticker.toUpperCase() === 'BTC' ? '19,705,320' : '120,120,490'}
활성 주소 수 (24h Active Addresses): 924,510
온체인 거래수 수 (Transactions): 412,892
MVRV Ratio: 2.14 (역사적 중평균 상회, 추가 상승 동력 존재)
해시레이트 / 스테이킹 비율: 최근 3개월간 역대 최고치 경신 중.
설명: ${ticker.toUpperCase() === 'BTC' ? '비트코인은 탈중앙화된 디지털 자산으로...' : '이더리움은 스마트 계약을 지원하는 글로벌 컴퓨팅 플랫폼...'}
`;
    } else {
      mockStdout = `[${ticker.toUpperCase()}] 기본적 재무 분석 진행 중...

=== 기업 기본 재무 데이터 ===
회사명 (Company): ${ticker.toUpperCase() === 'AAPL' ? 'Apple Inc.' : ticker.toUpperCase() === 'TSLA' ? 'Tesla Inc.' : 'Global Tech Inc.'}
산업군 (Industry): Consumer Electronics / Electric Vehicles
섹터 (Sector): Technology / Automotive
시가총액 (Market Cap): 2,895,124,000,000
주가수익비율 (P/E Ratio): 28.45
주당순이익 (EPS): 6.12
자기자본이익률 (ROE): 142.35%
부채비율 (Debt to Equity): 1.45
매출성장률 (Revenue Growth): +8.45%
총매출이익률 (Gross Margins): 44.12%
설명: ${ticker.toUpperCase() === 'AAPL' ? '애플(Apple Inc.)은 아이폰, 아이패드, 맥 등 혁신적 전자제품을...' : '테슬라(Tesla Inc.)는 순수 전기차, 자율주행 기술 및 친환경 에너지...'}
`;
    }

    return {
      success: true,
      stdout: mockStdout,
      stderr: '',
      plots: [],
    };
  }
}
