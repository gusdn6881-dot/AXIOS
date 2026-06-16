import * as vscode from 'vscode';
import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import { readTelegramConfig, executeSeraRoutedCommand, _pythonCmd } from '../extension';

export class SeraGatewayService {
    private process: ChildProcess | null = null;
    private outputChannel: vscode.OutputChannel;
    private isRestarting = false;
    private retryCount = 0;
    private readonly MAX_RETRIES = 5;
    private fallbackTimer: NodeJS.Timeout | null = null;

    constructor(private readonly context: vscode.ExtensionContext) {
        this.outputChannel = vscode.window.createOutputChannel("AXIOS AI SERA Gateway");
    }

    /**
     * SERA Python 게이트웨이 백그라운드 프로세스 기동
     */
    public async start(): Promise<void> {
        if (this.process) {
            this.outputChannel.appendLine("[SERA] Gateway is already running.");
            return;
        }

        const { token, chatId } = readTelegramConfig();
        if (!token || !chatId) {
            this.outputChannel.appendLine("[SERA] Telegram Token 또는 Chat ID가 설정되지 않아 게이트웨이를 구동할 수 없습니다.");
            return;
        }

        this.outputChannel.appendLine("[SERA] Starting Python SERA Gateway Service...");
        
        // workspace 설정에서 사용자 정의 파이썬 경로를 읽고 없으면 기본 py/python3 자동 감지
        const pythonPath = _pythonCmd();

        const scriptPath = path.join(this.context.extensionPath, 'scripts', 'sera_gateway.py');
        if (!fs.existsSync(scriptPath)) {
            this.outputChannel.appendLine(`[SERA] Error: scripts/sera_gateway.py 파일이 ${scriptPath} 에 존재하지 않습니다.`);
            return;
        }

        // 보안 토큰 및 프록시 환경변수 상속
        const env = {
            ...process.env,
            AXIOS_TELEGRAM_TOKEN: token,
            AXIOS_MASTER_CHAT_ID: chatId,
            AXIOS_WORKSPACE_PATH: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || "",
            HTTP_PROXY: process.env.HTTP_PROXY || "",
            HTTPS_PROXY: process.env.HTTPS_PROXY || "",
            ALL_PROXY: process.env.ALL_PROXY || ""
        };

        try {
            this.outputChannel.appendLine(`[SERA] Executing: ${pythonPath} "${scriptPath}"`);
            this.process = spawn(pythonPath, [scriptPath], {
                env,
                cwd: path.dirname(scriptPath)
            });

            // Stdout 한 줄씩 파싱하는 이벤트 스트림 처리
            this.process.stdout?.on('data', (data: Buffer) => {
                const chunk = data.toString();
                const lines = chunk.split('\n');
                
                for (const line of lines) {
                    const trimmed = line.trim();
                    if (!trimmed) continue;
                    
                    if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
                        try {
                            const payload = JSON.parse(trimmed);
                            this.handleGatewayEvent(payload);
                        } catch (err) {
                            this.outputChannel.appendLine(`[SERA Log] ${trimmed}`);
                        }
                    } else {
                        this.outputChannel.appendLine(`[SERA Log] ${trimmed}`);
                    }
                }
            });

            // Stderr 에러 로그 실시간 감시
            this.process.stderr?.on('data', (data: Buffer) => {
                this.outputChannel.appendLine(`[SERA Engine Log] ${data.toString().trim()}`);
            });

            // 프로세스 종료 이벤트 감지 및 지수 백오프 자동 복구
            this.process.on('close', (code) => {
                this.outputChannel.appendLine(`[SERA] Gateway process exited with code ${code}`);
                this.process = null;
                
                if (!this.isRestarting && this.retryCount < this.MAX_RETRIES) {
                    this.retryCount++;
                    const delay = Math.pow(2, this.retryCount) * 1000;
                    this.outputChannel.appendLine(`[SERA] ${delay}ms 후 게이트웨이 프로세스 복구 기동을 시도합니다. (시도 ${this.retryCount}/${this.MAX_RETRIES})`);
                    this.fallbackTimer = setTimeout(() => this.start(), delay);
                } else if (this.retryCount >= this.MAX_RETRIES) {
                    this.outputChannel.appendLine("[SERA] 최대 복구 시도 횟수를 초과했습니다. 게이트웨이가 정지됩니다.");
                    vscode.window.showWarningMessage("⚠️ SERA 게이트웨이가 비정상 종료되었습니다. 텔레그램 토큰 설정 및 파이썬 모듈이 올바른지 확인해 주십시오.");
                }
            });

            this.retryCount = 0; // 정상 실행 성공 시 리트라이 카운트 초기화
        } catch (err: any) {
            this.outputChannel.appendLine(`[SERA] Failed to start process: ${err.message}`);
            vscode.window.showErrorMessage(`⚠️ SERA 파이썬 게이트웨이 실행 실패: ${err.message}`);
        }
    }

    /**
     * Python 프로세스로부터 들어오는 Stdout JSON-RPC 이벤트 처리
     */
    private async handleGatewayEvent(payload: any): Promise<void> {
        const event = payload.event;
        if (event === 'ready') {
            this.outputChannel.appendLine("[SERA] Gateway is ready and listening to Telegram!");
            vscode.window.showInformationMessage("🤖 AXIOS AI: SERA 중앙 게이트웨이가 활성화되었습니다. 텔레그램 원격 명령 수신 대기 중...");
        } else if (event === 'command') {
            const agent = payload.agent || 'all';
            const command = payload.command || '';
            this.outputChannel.appendLine(`[SERA Command] Routed to specialist [${agent}]: "${command}"`);
            
            try {
                // TypeScript Extension의 에이전트 브로드캐스트/디스패처 파이프라인 연동 실행
                await executeSeraRoutedCommand(agent, command);
            } catch (err: any) {
                this.outputChannel.appendLine(`[SERA Action Error] ${err.message}`);
                this.sendReport(agent, `❌ 명령 처리 수행 실패: ${err.message}`);
            }
        } else if (event === 'error') {
            const message = payload.message || '';
            this.outputChannel.appendLine(`[SERA Error] ${message}`);
            
            // 파이썬 모듈(python-telegram-bot, httpx, fastapi, uvicorn, requests) 미설치 시 1-Click 해결 알림 제공
            if (message.includes("ImportError")) {
                this.stop(); // 재시도 루프 중단
                vscode.window.showErrorMessage(
                    `⚠️ SERA 라이브러리(python-telegram-bot, fastapi, uvicorn 등)가 누락되었습니다: ${message}`,
                    "필수 패키지 설치"
                ).then(selection => {
                    if (selection === "필수 패키지 설치") {
                        vscode.commands.executeCommand("workbench.action.terminal.focus");
                        const terminal = vscode.window.activeTerminal || vscode.window.createTerminal("AXIOS AI SERA Setup");
                        terminal.sendText("pip install python-telegram-bot httpx fastapi uvicorn requests");
                        terminal.show();
                    }
                });
            }
        }
    }

    /**
     * TypeScript 에이전트의 작업 결과물을 Python stdin 파이프를 통해 텔레그램 마스터에게 무중단 전송
     */
    public sendReport(agent: string, content: string): void {
        if (!this.process) {
            this.outputChannel.appendLine("[SERA] Gateway process is not active. Report dropped.");
            return;
        }

        this.outputChannel.appendLine(`[SERA Sync Report] Transmitting results for [${agent}]...`);
        const payload = {
            action: 'report',
            agent,
            content
        };
        try {
            this.process.stdin?.write(JSON.stringify(payload) + '\n');
        } catch (err: any) {
            this.outputChannel.appendLine(`[SERA Sync Error] Failed to write stdin: ${err.message}`);
        }
    }

    /**
     * 서비스 중단 시 안전하게 OS 프로세스 해제
     */
    public stop(): void {
        this.isRestarting = true;
        if (this.fallbackTimer) {
            clearTimeout(this.fallbackTimer);
            this.fallbackTimer = null;
        }
        if (this.process) {
            this.outputChannel.appendLine("[SERA] Terminating SERA Python Gateway process...");
            // Stdin에 정중한 종료 요청 전송
            try {
                this.process.stdin?.write(JSON.stringify({ action: "stop" }) + '\n');
            } catch {}
            
            // 1초 후 강제 kill 방지 차단
            const procToKill = this.process;
            setTimeout(() => {
                try { procToKill.kill('SIGKILL'); } catch {}
            }, 1000);
            
            this.process = null;
        }
        this.isRestarting = false;
    }

    public dispose(): void {
        this.stop();
        this.outputChannel.dispose();
    }
}
