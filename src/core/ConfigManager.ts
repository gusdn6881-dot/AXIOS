import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process';
import { ExternalConnectionsConfig } from '../types/config';

export class ConfigManager {
  private configPath: string;

  constructor(agentId: string) {
    // P-Reinforce 템플릿 규격에 따른 마크다운 저장 경로 주입
    this.configPath = path.join(process.cwd(), 'agents', agentId, 'config.md');
  }

  /**
   * 로컬 config.md에서 마크다운 자격증명 설정을 역직렬화하여 파싱 로드
   */
  public loadConfig(): ExternalConnectionsConfig {
    const config = this.getDefaultConfig();
    if (!fs.existsSync(this.configPath)) return config;

    try {
      const content = fs.readFileSync(this.configPath, 'utf-8');
      
      // 정규표현식 매퍼 파이프라인을 통과시켜 텍스트 데이터 매핑
      const tokenMatch = content.match(/- THREADS_ACCESS_TOKEN:\s*(.*)/);
      const userMatch = content.match(/- THREADS_USER_ID:\s*(.*)/);
      const connectedMatch = content.match(/- THREADS_CONNECTED:\s*(.*)/);

      if (tokenMatch) config.threads.accessToken = tokenMatch[1].trim();
      if (userMatch) config.threads.userId = userMatch[1].trim();
      if (connectedMatch) config.threads.connected = connectedMatch[1].trim() === 'true';
    } catch (error) {
      console.error('[ConfigManager] 파싱 에러:', error);
    }

    return config;
  }

  /**
   * 전송받은 UI 자격증명 상태를 마크다운 데이터 포맷으로 치환 후 자율 깃 동기화 트리거
   */
  public saveConfig(config: ExternalConnectionsConfig): void {
    let content = '';
    if (fs.existsSync(this.configPath)) {
      content = fs.readFileSync(this.configPath, 'utf-8');
    }

    // 마크다운 내부 Threads 메타 데이터 노드 블록 파싱 스펙 빌드
    if (!content.includes('THREADS_ACCESS_TOKEN')) {
      content += `\n\n## Threads\n`;
      content += `- THREADS_ACCESS_TOKEN: ${config.threads.accessToken}\n`;
      content += `- THREADS_USER_ID: ${config.threads.userId}\n`;
      content += `- THREADS_CONNECTED: ${config.threads.connected}\n`;
    } else {
      content = content.replace(/- THREADS_ACCESS_TOKEN:.*/, `- THREADS_ACCESS_TOKEN: ${config.threads.accessToken}`);
      content = content.replace(/- THREADS_USER_ID:.*/, `- THREADS_USER_ID: ${config.threads.userId}`);
      content = content.replace(/- THREADS_CONNECTED:.*/, `- THREADS_CONNECTED: ${config.threads.connected}`);
    }

    // 밀폐형 로컬 지식망 보존을 위한 원자적 파일 쓰기 수행
    fs.writeFileSync(this.configPath, content, 'utf-8');
    
    // 코어 아키텍처 규칙: 로컬 변경 즉시 Auto-Git Sync 100% 자동 실행
    this.triggerAutoGitSync();
  }

  private getDefaultConfig(): ExternalConnectionsConfig {
    return {
      telegram: { botToken: '', chatId: '', connected: false },
      youtubeData: { apiKey: '', channelId: '', connected: false },
      youtubeAnalytics: { clientId: '', clientSecret: '', connected: false },
      googleCalendar: { calendarId: '', connected: false },
      threads: { accessToken: '', userId: '', connected: false }
    };
  }

  /**
   * 터미널 제어 권한을 사용하여 저장과 동시에 백업 커맨드를 자율적으로 처리합니다.
   */
  private triggerAutoGitSync(): void {
    const gitCmd = `git add "${this.configPath}" && git commit -m "chore: auto-sync threads api connections config" && git push`;
    exec(gitCmd, (error) => {
      if (error) {
        console.error('[Auto-Git Sync] 인덱스 푸시 실패:', error);
      }
    });
  }
}
