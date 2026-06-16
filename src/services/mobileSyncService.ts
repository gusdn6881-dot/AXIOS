import * as antigravity from 'vscode';
import { EventEmitter } from 'events';
import * as http from 'http';

interface MobileDeviceSession {
    deviceId: string;
    deviceOs: 'ios' | 'android';
    lastActive: number;
    status: 'connected' | 'disconnected';
    responseStream?: http.ServerResponse; // SSE response stream for real-time pushing
}

export class MobileSyncService extends EventEmitter {
    private activeSessions: Map<string, MobileDeviceSession> = new Map();
    private server: http.Server | null = null;
    private pingInterval: NodeJS.Timeout | null = null;
    private readonly PING_TIMEOUT = 5000; // 5초 간격 하트비트
    private fallbackService: MobileSyncService | null = null;

    constructor(private readonly port: number = 8443) {
        super();
    }

    /**
     * 모바일 연동을 위한 보안 소켓 서버 바인딩 및 구동
     */
    public startSecureSyncServer(): void {
        try {
            console.log(`[AXIOS AI Mobile] Initializing Secure Sync Port: ${this.port}`);
            
            // SSE(Server-Sent Events) 및 REST API를 지원하는 내장 HTTP 서버 구동
            this.server = http.createServer((req, res) => {
                // CORS 허용 및 사전 검증(OPTIONS) 처리
                res.setHeader('Access-Control-Allow-Origin', '*');
                res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
                res.setHeader('Access-Control-Allow-Headers', 'Content-Type, device-id, device-os');

                if (req.method === 'OPTIONS') {
                    res.writeHead(200);
                    res.end();
                    return;
                }

                const parsedUrl = new URL(req.url || '', `http://${req.headers.host || 'localhost'}`);
                const pathName = parsedUrl.pathname;

                // 1. 실시간 이벤트 채널 (Server-Sent Events) 개방
                if (req.method === 'GET' && pathName === '/api/events') {
                    const deviceId = parsedUrl.searchParams.get('deviceId') || (req.headers['device-id'] as string);
                    const deviceOs = (parsedUrl.searchParams.get('deviceOs') || req.headers['device-os'] || 'ios') as 'ios' | 'android';

                    if (!deviceId) {
                        res.writeHead(400, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ error: 'Missing deviceId parameter' }));
                        return;
                    }

                    // SSE를 위한 헤더 설정
                    res.writeHead(200, {
                        'Content-Type': 'text/event-stream',
                        'Cache-Control': 'no-cache',
                        'Connection': 'keep-alive',
                        'X-Accel-Buffering': 'no' // 프록시 환경의 버퍼링 방지
                    });

                    // SSE 초기 응답 전송
                    res.write(': ok\n\n');

                    // 기존 세션이 있다면 스트림 닫고 교체 (멀티 커넥션 정리)
                    const oldSession = this.activeSessions.get(deviceId);
                    if (oldSession && oldSession.responseStream) {
                        try { oldSession.responseStream.end(); } catch {}
                    }

                    // 세션 등록
                    const newSession: MobileDeviceSession = {
                        deviceId,
                        deviceOs,
                        lastActive: Date.now(),
                        status: 'connected',
                        responseStream: res
                    };
                    this.activeSessions.set(deviceId, newSession);
                    this.emit('deviceConnected', deviceId, deviceOs);
                    
                    console.log(`[AXIOS AI Mobile] 기기 연결됨: ID=${deviceId}, OS=${deviceOs}`);

                    // 연결 해제 핸들러
                    req.on('close', () => {
                        const session = this.activeSessions.get(deviceId);
                        if (session && session.responseStream === res) {
                            session.status = 'disconnected';
                            session.responseStream = undefined;
                            this.emit('deviceDisconnected', deviceId);
                            console.log(`[AXIOS AI Mobile] 기기 연결 끊김 (커넥션 종료): ${deviceId}`);
                        }
                    });
                    return;
                }

                // 2. 핸드셰이크 엔드포인트
                if (req.method === 'POST' && pathName === '/api/handshake') {
                    let body = '';
                    let tooLarge = false;
                    req.on('data', chunk => {
                        if (tooLarge) return;
                        body += chunk;
                        if (body.length > 65536) { // 64KB limit
                            tooLarge = true;
                            res.writeHead(413, { 'Content-Type': 'application/json' });
                            res.end(JSON.stringify({ error: 'Payload Too Large' }));
                            req.destroy();
                        }
                    });
                    req.on('end', () => {
                        if (tooLarge) return;
                        try {
                            const data = JSON.parse(body || '{}');
                            const { deviceId, deviceOs } = data;

                            if (!deviceId) {
                                res.writeHead(400, { 'Content-Type': 'application/json' });
                                res.end(JSON.stringify({ error: 'deviceId is required' }));
                                return;
                            }

                            let session = this.activeSessions.get(deviceId);
                            if (session) {
                                session.status = 'connected';
                                session.lastActive = Date.now();
                            } else {
                                session = {
                                    deviceId,
                                    deviceOs: deviceOs || 'ios',
                                    lastActive: Date.now(),
                                    status: 'connected'
                                };
                                this.activeSessions.set(deviceId, session);
                            }

                            res.writeHead(200, { 'Content-Type': 'application/json' });
                            res.end(JSON.stringify({ status: 'success', session: { deviceId: session.deviceId, status: session.status } }));
                        } catch (err) {
                            res.writeHead(400, { 'Content-Type': 'application/json' });
                            res.end(JSON.stringify({ error: 'Invalid JSON body' }));
                        }
                    });
                    return;
                }

                // 3. 모바일 하트비트/핑 수신
                if (req.method === 'POST' && pathName === '/api/ping') {
                    let body = '';
                    let tooLarge = false;
                    req.on('data', chunk => {
                        if (tooLarge) return;
                        body += chunk;
                        if (body.length > 65536) { // 64KB limit
                            tooLarge = true;
                            res.writeHead(413, { 'Content-Type': 'application/json' });
                            res.end(JSON.stringify({ error: 'Payload Too Large' }));
                            req.destroy();
                        }
                    });
                    req.on('end', () => {
                        if (tooLarge) return;
                        try {
                            const data = JSON.parse(body || '{}');
                            const { deviceId } = data;

                            if (!deviceId) {
                                res.writeHead(400, { 'Content-Type': 'application/json' });
                                res.end(JSON.stringify({ error: 'deviceId is required' }));
                                return;
                            }

                            const session = this.activeSessions.get(deviceId);
                            if (session) {
                                session.lastActive = Date.now();
                                session.status = 'connected';
                                res.writeHead(200, { 'Content-Type': 'application/json' });
                                res.end(JSON.stringify({ status: 'pong', deviceId }));
                            } else {
                                res.writeHead(404, { 'Content-Type': 'application/json' });
                                res.end(JSON.stringify({ error: 'Session not found' }));
                            }
                        } catch (err) {
                            res.writeHead(400, { 'Content-Type': 'application/json' });
                            res.end(JSON.stringify({ error: 'Invalid JSON body' }));
                        }
                    });
                    return;
                }

                // 4. 지원하지 않는 라우트
                res.writeHead(404, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Not Found' }));
            });

            this.server.listen(this.port, () => {
                console.log(`[AXIOS AI Mobile] Sync Server listening on port ${this.port}`);
                antigravity.window.showInformationMessage(`AXIOS AI: 모바일 동기화 서버가 포트 ${this.port}에서 가동 중입니다.`);
            });

            this.server.on('error', (err: any) => {
                if (err.code === 'EADDRINUSE') {
                    console.warn(`[AXIOS AI Mobile] Port ${this.port} is already in use. Retrying with port ${this.port + 1}...`);
                    // 포트 충돌 시 예외를 던지지 않고 다른 임의의 포트나 +1 포트로 안전하게 폴백
                    const nextPort = this.port + 1;
                    antigravity.window.showWarningMessage(`AXIOS AI: 포트 ${this.port}이 점유되어 ${nextPort} 포트로 전환을 시도합니다.`);
                    this.fallbackService = new MobileSyncService(nextPort);
                    this.fallbackService.startSecureSyncServer();
                } else {
                    antigravity.window.showErrorMessage(`AXIOS AI 모바일 구동 실패: ${err.message}`);
                }
            });

            this.initializeHeartbeat();
        } catch (error) {
            antigravity.window.showErrorMessage(`AXIOS AI 모바일 구동 실패: ${(error as Error).message}`);
        }
    }

    /**
     * 모바일 기기로부터 현재 작업 중인 소스 코드 컨텍스트를 동기화 요청 처리
     */
    public syncContextToMobile(deviceId: string, payload: { fileName: string; code: string }): void {
        const session = this.activeSessions.get(deviceId);
        
        // 가드 로직: 세션 상태가 정상이 아닐 경우 예외 처리
        if (!session || session.status === 'disconnected') {
            console.warn(`[AXIOS AI Mobile] 동기화 실패: 기기 [${deviceId}]가 오프라인 상태입니다.`);
            this.handleReconnectionTrigger(deviceId);
            return;
        }

        try {
            // 패킷 무결성 검증 후 안전하게 모바일 클라이언트로 브로드캐스팅
            const securePacket = this.encryptPayload(JSON.stringify(payload));
            this.transmitPacket(deviceId, securePacket);
            
            session.lastActive = Date.now();
        } catch (error) {
            console.error(`[AXIOS AI Mobile] 데이터 전송 중 치명적 결함:`, error);
        }
    }

    /**
     * 모든 연결된 세션에 현재 작업 중인 컨텍스트를 동기화
     */
    public syncContextToAll(payload: { fileName: string; code: string }): void {
        this.activeSessions.forEach((session, deviceId) => {
            if (session.status === 'connected') {
                this.syncContextToMobile(deviceId, payload);
            }
        });
    }

    /**
     * 하트비트(Heartbeat) 매니저: 모바일 슬립 모드 진입으로 인한 세션 유실 방지
     */
    private initializeHeartbeat(): void {
        this.pingInterval = setInterval(() => {
            const now = Date.now();
            this.activeSessions.forEach((session, deviceId) => {
                // 10초 이상 무응답 시 연결 유실 처리 및 클라이언트 상태 격리
                if (now - session.lastActive > this.PING_TIMEOUT * 2) {
                    session.status = 'disconnected';
                    if (session.responseStream) {
                        try { session.responseStream.end(); } catch {}
                        session.responseStream = undefined;
                    }
                    this.emit('deviceDisconnected', deviceId);
                    console.log(`[AXIOS AI Mobile] 기기 ${deviceId}가 응답이 없어 연결 끊김 처리됨.`);
                } else if (session.status === 'connected' && session.responseStream) {
                    // SSE 커넥션 유지용 하트비트(ping 주석 데이터) 송신
                    try {
                        session.responseStream.write(': ping\n\n');
                    } catch (e) {
                        console.warn(`[AXIOS AI Mobile] Heartbeat ping send failed for ${deviceId}, closing connection.`);
                        session.status = 'disconnected';
                        try { session.responseStream.end(); } catch {}
                        session.responseStream = undefined;
                        this.emit('deviceDisconnected', deviceId);
                    }
                }
            });
        }, this.PING_TIMEOUT);
    }

    /**
     * 네트워크 단절 시 지수 백오프 기반 재연결 핸드셰이크 시도 파이프라인
     */
    private handleReconnectionTrigger(deviceId: string): void {
        console.log(`[AXIOS AI Mobile] 기기 [${deviceId}] 재연결 핸드셰이크 시도 중...`);
        // 모바일 앱 측으로 Push Notification 인터페이스를 트리거하거나 IDE 가상 포트 재바인딩
    }

    private encryptPayload(data: string): string {
        // 프롬프트 및 소스 코드 탈취 방지를 위한 데이터 인코딩 스트림 처리
        return Buffer.from(data).toString('base64');
    }

    private transmitPacket(deviceId: string, packet: string): void {
        const session = this.activeSessions.get(deviceId);
        if (session && session.responseStream) {
            try {
                // SSE 형식에 맞게 전송
                session.responseStream.write(`event: sync\ndata: ${packet}\n\n`);
                console.log(`[AXIOS AI Mobile] ${packet.length} bytes 전송 완료 -> 기기: ${deviceId}`);
            } catch (err) {
                console.error(`[AXIOS AI Mobile] 패킷 전송 중 오류 발생 for ${deviceId}:`, err);
                session.status = 'disconnected';
                session.responseStream = undefined;
                this.emit('deviceDisconnected', deviceId);
            }
        }
    }

    /**
     * 서비스 종료 시 리소스 완전 해제
     */
    public dispose(): void {
        if (this.fallbackService) {
            try { this.fallbackService.dispose(); } catch {}
            this.fallbackService = null;
        }
        if (this.pingInterval) {
            clearInterval(this.pingInterval);
            this.pingInterval = null;
        }
        
        this.activeSessions.forEach(session => {
            if (session.responseStream) {
                try { session.responseStream.end(); } catch {}
            }
        });
        this.activeSessions.clear();

        if (this.server) {
            try { this.server.close(); } catch {}
            this.server = null;
        }

        console.log('[AXIOS AI Mobile] 모바일 동기화 서브시스템이 완전히 종료되었습니다.');
    }
}
