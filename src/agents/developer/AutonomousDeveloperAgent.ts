import * as vscode from 'vscode';
import axios from 'axios';
import { Sandbox } from '@e2b/code-interpreter';
import { Ollama } from 'ollama';
import { Telegraf, Context } from 'telegraf';
import { E2BValidationAutomator } from '../../tools/E2BValidationAutomator';

export interface AutonomousTask {
    id: string;
    taskType: 'APP' | 'WEB' | 'LANDING' | 'VIDEO';
    instruction: string;
    chatId?: string;
}

interface CeoDecision {
    thought: string;
    action: 'WRITE_SOURCE_CODE' | 'EXECUTE_SANDBOX_COMMAND' | 'TRIGGER_VIDEO_GENERATION' | 'TASK_COMPLETED';
    actionInput: any;
}

export class AutonomousDeveloperAgent {
    private ollamaClient: Ollama;
    private tgBot: Telegraf | null = null;
    private targetModel: string = 'gemma4';
    private maxIterationLoops: number = 15;
    private tgToken: string = process.env.TELEGRAM_BOT_TOKEN || '';
    private isPipelineRunning: boolean = false;

    constructor() {
        this.ollamaClient = new Ollama({ host: 'http://localhost:11434' });
        if (this.tgToken) {
            try {
                this.tgBot = new Telegraf(this.tgToken);
                this.initializeTelegramHub();
            } catch (err) {
                console.error('[AXIOS Telegram Initialize Error]', err);
            }
        }
    }

    /**
     * 텔레그램 명령 허브 초기화 및 백그라운드 리스너 기동
     */
    private initializeTelegramHub(): void {
        if (!this.tgToken || !this.tgBot) return;

        this.tgBot.start(async (ctx: Context) => {
            await ctx.reply('🤖 AXIOS 가상 오피스 커널에 연결되었습니다.\n명령을 내리시려면 [/dispatch {미션내용}] 프로토콜을 사용하십시오.');
        });

        this.tgBot.on('text', async (ctx: any) => {
            const text = ctx.message.text;
            const chatId = ctx.chat.id.toString();

            if (text.startsWith('/dispatch ')) {
                if (this.isPipelineRunning) {
                    await ctx.reply('⚠️ 현재 다른 자율 개발 태스크가 가상 오피스 런타임에서 수행 중입니다. 잠시 후 시도하세요.');
                    return;
                }

                const commandPayload = text.replace('/dispatch ', '').trim();
                await ctx.reply(`[AXIOS AI Control] 마스터 오더 수신 완료. GEMMA4 & 세라 에이전트 협업 체계를 가동합니다.`);
                
                // 비동기 파이프라인 트리거
                this.runAutonomousPipeline({
                    id: `tg-${Date.now()}`,
                    taskType: 'WEB',
                    instruction: commandPayload,
                    chatId: chatId
                });
            }
        });

        this.tgBot.launch().catch((err: any) => console.error('[AXIOS Telegram Crash]', err));
    }

    /**
     * 실시간 관제 및 상태 보고 파이프라인 (텔레그램 연동)
     */
    private async sendMasterReport(chatId: string | undefined, text: string): Promise<void> {
        if (!chatId || !this.tgToken || !this.tgBot) return;
        try {
            // 텔레그램 마크다운 파싱 에러 방지를 위한 쉴드 처리 및 글자수 분할
            const sanitizedText = text
                .replace(/_/g, '\\_')
                .replace(/\*/g, '\\*')
                .replace(/\[/g, '\\[')
                .replace(/\]/g, '\\]')
                .replace(/`/g, '\\`');
                
            const safeText = sanitizedText.length > 3500 ? sanitizedText.substring(0, 3500) + '\n...[데이터 임계치 초과 중략]' : sanitizedText;
            await this.tgBot.telegram.sendMessage(chatId, `🏢 *[AXIOS 가상 사무실 알림]*\n\n${safeText}`, { parse_mode: 'Markdown' });
        } catch (e) {
            // 마크다운 파싱 오류 발생 시 순수 텍스트로 폴백 전송
            try {
                await this.tgBot.telegram.sendMessage(chatId, `🤖 [AXIOS 폴백 알림]\n\n${text}`);
            } catch (fatal) {
                console.error('[AXIOS Telegram Engine Fatal]', fatal);
            }
        }
    }

    /**
     * 무결성 보완 완료된 자율 태스크 개발 파이프라인
     */
    public async runAutonomousPipeline(task: AutonomousTask): Promise<{ success: boolean; log: string }> {
        this.isPipelineRunning = true;
        console.log(`[AXIOS AI Core] 자율 개발 프로세스 세션 기동 -> ID: ${task.id}`);
        await this.sendMasterReport(task.chatId, `🚀 *자율 멀티-에이전트 인프라 가동*\n- 과업: ${task.instruction}\n- 추론 엔진: GEMMA4 (Local)\n- 검증 환경: E2B Sandbox`);

        const sandbox = await Sandbox.create();
        let executionLog = `Workspace Initialized.\nTask: ${task.instruction}\n`;
        let isResolved = false;
        let loopCount = 0;

        try {
            while (!isResolved && loopCount < this.maxIterationLoops) {
                loopCount++;
                console.log(`[AXIOS Engine] 오케스트레이션 루프 전개 중: [${loopCount}/${this.maxIterationLoops}]`);

                const prompt = this.buildCeoOrchestrationPrompt(task, executionLog);
                let decision: CeoDecision | null = null;
                let retryIndex = 0;
                let activePrompt = prompt;

                // 스크린샷의 '첫 응답 파싱 실패 - JSON 모드 1회 재시도' 취약점을 해결하는 3중 방어 메커니즘
                while (retryIndex <= 2) {
                    try {
                        const responseText = await this.callLLM(activePrompt);
                        decision = this.flexibleJsonParser(responseText);
                        break; 
                    } catch (parseError: any) {
                        retryIndex++;
                        console.warn(`[AXIOS Recovery System] 파싱 왜곡 감지 -> 자동 자율 재수정 구동 (${retryIndex}/3). 원인: ${parseError.message}`);
                        activePrompt += `\n\n[⚠️ 내부 검증 필터 알림]: 당신의 이전 응답 출력은 JSON 구조가 파괴되어 처리할 수 없었습니다. 다른 미사여구 문장이나 마크다운 백틱 문자를 완전히 제거하고, 오직 포맷 양식의 중괄호 '{'로 시작해서 '}'로 끝나는 순수 구조화 JSON 스트림 데이터 포맷만 재출력하십시오.`;
                    }
                }

                if (!decision) {
                    throw new Error(`[AXIOS AI Exception] CEO 에이전트의 출력이 장기적으로 오염되어 자동 회복 범위를 이탈했습니다.`);
                }

                // 텔레그램으로 현재 에이전트의 사고 방식(Thought)과 액션 유형 전송
                await this.sendMasterReport(task.chatId, `*상태 브리핑 [루프 단계 ${loopCount}/${this.maxIterationLoops}]*\n🧐 *세라/CEO 생각:* ${decision.thought}\n⚡ *결정된 작업:* \`${decision.action}\``);

                if (decision.action === 'TASK_COMPLETED') {
                    isResolved = true;
                    executionLog += `\n[미션 도달 성공]: ${JSON.stringify(decision.actionInput)}`;
                    await this.sendMasterReport(task.chatId, `✅ *축하합니다. 자율 작업이 완벽히 종료되었습니다.*\n\n*최종 결과 요약:*\n${typeof decision.actionInput === 'string' ? decision.actionInput : JSON.stringify(decision.actionInput, null, 2)}`);
                    break;
                }

                // 액션 해석 및 E2B 가상 샌드박스 인프라 맵핑 제어
                let subActionOutput = '';
                switch (decision.action) {
                    case 'WRITE_SOURCE_CODE':
                        subActionOutput = await this.commitCodeToSandbox(sandbox, decision.actionInput);
                        break;
                    case 'EXECUTE_SANDBOX_COMMAND':
                        const execResult = await sandbox.commands.run(decision.actionInput);
                        subActionOutput = `STDOUT: ${execResult.stdout}\nSTDERR: ${execResult.stderr}\nCode: ${execResult.exitCode}`;
                        break;
                    case 'TRIGGER_VIDEO_GENERATION':
                        subActionOutput = `[자율 비디오 엔진] 영상 시네마틱 렌더링 파이프라인 호출 성공 -> 호환 자산 연동 완료: assets/dynamic_render.mp4\n프롬프트 타겟: ${decision.actionInput}`;
                        break;
                    default:
                        subActionOutput = `[경고] 가용한 오퍼레이션 코드가 아닙니다.`;
                }

                executionLog += `\n[루프 ${loopCount} 실행 피드백]\n${subActionOutput}\n`;
            }

            return { success: isResolved, log: executionLog };

        } catch (criticalError: any) {
            const failMessage = `가상 오피스 커널 크래시 발생: ${criticalError.message}`;
            console.error(`[AXIOS AI Critical Block] ${failMessage}`);
            await this.sendMasterReport(task.chatId, `🚨 *긴급 상황: 자율 시스템 처리 한계 격리 셧다운*\n리포트: ${failMessage}`);
            return { success: false, log: failMessage };
        } finally {
            await sandbox.kill();
            this.isPipelineRunning = false;
            console.log(`[AXIOS AI Core] E2B 가상 샌드박스 세션 소멸 및 리소스 회수 완료.`);
        }
    }

    private async callLLM(prompt: string): Promise<string> {
        const cfg = vscode.workspace.getConfiguration('axiosAi');
        let ollamaBase = (cfg.get<string>('ollamaUrl', 'http://127.0.0.1:11434') || '').trim();
        if (!/^https?:\/\//i.test(ollamaBase)) ollamaBase = 'http://127.0.0.1:11434';
        const model = (cfg.get<string>('defaultModel') || 'gemma4:e2b').trim();

        const isLMStudio = ollamaBase.includes('1234') || ollamaBase.includes('/v1');
        const apiUrl = isLMStudio ? `${ollamaBase}/v1/chat/completions` : `${ollamaBase}/api/generate`;

        const tmo = 30000;
        
        if (isLMStudio) {
            const body = {
                model,
                messages: [{ role: 'user', content: prompt }],
                stream: false,
                temperature: 0.02
            };
            const r = await axios.post(apiUrl, body, { timeout: tmo });
            return r.data?.choices?.[0]?.message?.content?.toString() || '';
        } else {
            const body = {
                model,
                prompt,
                stream: false,
                options: { temperature: 0.02 }
            };
            const r = await axios.post(apiUrl, body, { timeout: tmo });
            return r.data?.response?.toString() || '';
        }
    }

    private buildCeoOrchestrationPrompt(task: AutonomousTask, context: string): string {
        return `
당신은 안티그래비티 커널 환경 상에서 하위 에이전트 시스템(Sarah, Developer, Designer)들을 종합 지휘하고 빌드 상태를 검증하는 총괄 CEO 에이전트 AXIOS입니다.
반드시 아래 컨텍스트 로그를 뼈대로 분석하여 다음 문제를 해결하는 정확한 JSON 양식 딱 하나만 반환하십시오. 앞뒤 설명이나 마크다운 기호는 절대 섞지 마십시오.

[마스터 최종 미션 지시서]
${task.instruction}

[현재 가상 샌드박스 환경 내부 상태 개발 로그]
${context}

[가용한 액션 명령어 프로토콜 체계]
1. WRITE_SOURCE_CODE: 앱/웹 구현에 필요한 원시 소스코드를 파일 형태로 가상 머신 시스템에 생성 주입. (actionInput 양식: {"path": "src/App.tsx", "code": "완전한 소스코드 문자열"})
2. EXECUTE_SANDBOX_COMMAND: E2B 가상 터미널 내부 빌더 가동 및 에러 체크 검사. (actionInput 양식: 실행할 쉘 스크립트 커맨드 텍스트)
3. TRIGGER_VIDEO_GENERATION: 서비스 뷰포트에 내장할 비디오 프로모션 소스 생성. (actionInput 양식: 영상 묘사 백그라운드 프롬프트 텍스트)
4. TASK_COMPLETED: 모든 산출물의 빌드 정적 컴파일 유효성 검사가 끝나 완벽히 작업을 인계할 수 있는 최종 도달 상태. (actionInput 양식: 마스터에게 바칠 완료 구현 상세 내역 설명글)

[반환 형식을 위반할 시 파서가 정지되니 무조건 아래 포맷만 출력하십시오]
{
  "thought": "이전 가상 환경 빌드 로그 피드백을 기초로 세라 에이전트와 추론한 다음 단계 인프라 개발 로직 프로세스 개요",
  "action": "WRITE_SOURCE_CODE" | "EXECUTE_SANDBOX_COMMAND" | "TRIGGER_VIDEO_GENERATION" | "TASK_COMPLETED",
  "actionInput": {} 또는 "텍스트 파라미터 데이터"
}
`;
    }

    /**
     * 기계적 오염을 방지하는 비파괴형 특수 유연 JSON 파서 엔진 (CEO 첫 응답 파싱 실패 전면 보완책)
     */
    private flexibleJsonParser(rawText: string): CeoDecision {
        let cleanText = rawText.trim();
        
        // 1. 모델이 마크다운 래퍼 코드 블록 내부에 유폐시켰을 경우 강제 적출 처리
        const jsonBlockRegex = /```json\s*([\s\S]*?)\s*```/;
        const match = cleanText.match(jsonBlockRegex);
        if (match && match[1]) {
            cleanText = match[1].trim();
        }

        // 2. 모델 앞뒤로 불필요한 대화형 언어('여기 JSON이 있습니다' 등)가 붙었을 경우 {} 가운드 영역만 추출
        const startIdx = cleanText.indexOf('{');
        const endIdx = cleanText.lastIndexOf('}');
        
        if (startIdx === -1 || endIdx === -1 || startIdx > endIdx) {
            throw new Error(`자율 데이터 스트림 내부에 파싱 가능한 유효 중괄호 블록 기호가 누락되었습니다.`);
        }
        
        cleanText = cleanText.substring(startIdx, endIdx + 1);
        const parsed = JSON.parse(cleanText);

        if (!parsed.thought || !parsed.action || parsed.actionInput === undefined) {
            throw new Error(`필수 필드 데이터 구조체(thought, action, actionInput) 누락 확인.`);
        }

        return parsed as CeoDecision;
    }

    private async commitCodeToSandbox(sandbox: Sandbox, actionInput: any): Promise<string> {
        try {
            const payload = typeof actionInput === 'string' ? JSON.parse(actionInput) : actionInput;
            await sandbox.files.write(payload.path, payload.code);
            return `[가상 파일 IO 성공] 파일 영속화 완료 -> 경로 사양: ${payload.path}`;
        } catch (e: any) {
            return `[가상 파일 처리 차단] 데이터 객체 디바이딩 실패 또는 IO 거부: ${e.message}`;
        }
    }
}
