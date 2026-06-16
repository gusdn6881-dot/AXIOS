/**
 * AXIOS 가상 사무실 외부 연동 자격증명 인터페이스
 */
export interface ExternalConnectionsConfig {
  telegram: {
    botToken: string;
    chatId: string;
    connected: boolean;
  };
  youtubeData: {
    apiKey: string;
    channelId: string;
    connected: boolean;
  };
  youtubeAnalytics: {
    clientId: string;
    clientSecret: string;
    connected: boolean;
  };
  googleCalendar: {
    calendarId: string;
    connected: boolean;
  };
  /** 
   * 신규 추가: Threads 자율 마크다운 동기화용 API 인증 정보 스키마
   */
  threads: {
    accessToken: string;
    userId: string;
    connected: boolean;
  };
}
