import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import axios from 'axios';
import pkg from '@e2b/code-interpreter';
const { CodeInterpreter } = pkg;

// Load environment variables
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Serve static files from Vite build folder (dist) in production
app.use(express.static(path.join(__dirname, 'dist')));

// 1. Ollama Proxy Endpoint
app.post('/api/ollama/chat', async (req, res) => {
  const { model, messages, prompt, options, stream = false } = req.body;
  const ollamaHost = process.env.OLLAMA_HOST || 'http://localhost:11434';
  
  try {
    if (stream) {
      // Streamed response proxy if needed, otherwise fallback to normal
      const response = await axios.post(`${ollamaHost}/api/chat`, {
        model: model || 'gemma2:2b',
        messages,
        options,
        stream: false // simplified to non-stream for high reliability on mobile
      });
      return res.json(response.data);
    } else {
      const payload = messages 
        ? { model: model || 'gemma2:2b', messages, options, stream: false }
        : { model: model || 'gemma2:2b', prompt, options, stream: false };
      
      const endpoint = messages ? '/api/chat' : '/api/generate';
      const response = await axios.post(`${ollamaHost}${endpoint}`, payload, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 90000 // 90 seconds timeout for larger local models
      });
      res.json(response.data);
    }
  } catch (error) {
    console.error('Ollama Proxy Error:', error.message);
    res.status(500).json({
      error: 'Ollama 연결에 실패했습니다.',
      details: error.message,
      hint: '로컬 PC에서 Ollama가 켜져 있는지, 모델이 잘 설치되었는지 확인해 주세요.'
    });
  }
});

// 2. E2B Sandbox Code Interpreter Endpoint
app.post('/api/e2b/run', async (req, res) => {
  const { code, apiKeyOverride } = req.body;
  const apiKey = apiKeyOverride || process.env.E2B_API_KEY;

  if (!code) {
    return res.status(400).json({ error: '실행할 파이썬 코드가 필요합니다.' });
  }

  if (!apiKey) {
    return res.status(400).json({ 
      error: 'E2B API Key가 누락되었습니다.',
      hint: '앱 설정 창에서 E2B API Key를 직접 입력하거나, 로컬 .env 파일에 E2B_API_KEY를 기입하십시오.'
    });
  }

  console.log('E2B Sandbox 기동 및 파이썬 코드 실행...');
  let sandbox;
  try {
    // Create E2B Code Interpreter instance
    sandbox = await CodeInterpreter.create({ apiKey });
    
    // Execute python code in the sandbox
    const execution = await sandbox.runCode(code);
    
    // Parse results
    const stdout = execution.stdout;
    const stderr = execution.stderr;
    const error = execution.error;
    
    // Extract any plots (matplotlib figures)
    const plots = [];
    if (execution.results && execution.results.length > 0) {
      for (const result of execution.results) {
        // E2B automatically captures figures and provides raw formats
        if (result.png) {
          plots.push({
            type: 'png',
            base64: result.png // png is base64 string
          });
        } else if (result.svg) {
          plots.push({
            type: 'svg',
            content: result.svg // raw svg string
          });
        }
      }
    }

    res.json({
      success: !error,
      stdout,
      stderr,
      error: error ? error.value : null,
      plots
    });

  } catch (err) {
    console.error('E2B Execution Error:', err.message);
    res.status(500).json({
      error: 'E2B 파이썬 샌드박스 실행 실패',
      details: err.message
    });
  } finally {
    if (sandbox) {
      try {
        await sandbox.close();
      } catch (closeErr) {
        console.error('E2B Sandbox Close Error:', closeErr.message);
      }
    }
  }
});

// Fallback to serving the SPA React app in production
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`=======================================================`);
  console.log(`🚀 TradingAgents 통합 브릿지 서버 구동 중!`);
  console.log(`   - 로컬 접속: http://localhost:${PORT}`);
  console.log(`   - 모바일 외부 접속: http://[PC의_공유기_IP_주소]:${PORT}`);
  console.log(`   - 터널링 무료 주소: npx cloudflared tunnel 구동 권장`);
  console.log(`=======================================================`);
});
