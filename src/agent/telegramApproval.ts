/* ============================================================================
 * [AXIOS AI] telegramApproval.ts — 텔레그램 연동형 에이전트 승인 매니저
 *
 * 이 모듈은 코다리 에이전트가 코드를 제안했을 때 안티그래비티 내부 가상 버퍼에 Diff 창을
 * 생성함과 동시에, 외부 텔레그램 봇 API를 연동하여 모바일 메신저에서 원격으로
 * '최종 승인(Apply)' 또는 '거절(Cancel)'을 처리할 수 있는 양방향 비동기 승인 파이프라인입니다.
 *
 * 안전성 강화 요소:
 *   1. 자격 증명 암호화 (vscode.ExtensionContext.secrets를 통해 Token & Chat ID 안전 보관)
 *   2. 낙관적 잠금 (Optimistic Locking - 파일 해시값을 통해 대기 시간 중 발생한 로컬 편집과의 충돌 방지)
 *   3. 허용 대화방 화이트리스트 검증 (타인에 의한 패치 승인 방지)
 *   4. 가상 문서 프로바이더 구현 (vscode.TextDocumentContentProvider를 상속하여 실시간 메모리 Diff 제공)
 * ============================================================================ */

import * as vscode from 'vscode';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import axios from 'axios';
import { getCompanyDir } from '../paths';

interface PendingPatch {
    filePath: string;
    patchedCode: string;
    timestamp: number;
    originalHash: string; // 승인 요청 시점의 파일 SHA-256 해시값 (경쟁 상태 방지용)
}

export class TelegramApprovalManager implements vscode.TextDocumentContentProvider {
    private pendingPatches: Map<string, PendingPatch> = new Map();
    private _onDidChange = new vscode.EventEmitter<vscode.Uri>();
    readonly onDidChange = this._onDidChange.event;

    constructor(private readonly context: vscode.ExtensionContext) {}

    /**
     * VS Code 가상 문서 제공 API
     * axios-ai-preview://patch/{patchId}/{filename} 형태의 URI 가 로드될 때 패치 소스코드를 동적으로 반환합니다.
     */
    public provideTextDocumentContent(uri: vscode.Uri): string {
        const queryParams = new URLSearchParams(uri.query);
        const patchId = queryParams.get('patchId');
        if (!patchId) return '';
        const patch = this.pendingPatches.get(patchId);
        return patch ? patch.patchedCode : '';
    }

    /**
     * 자격 증명 획득
     * context.secrets에서 암호화 보관된 자격 증명을 1차로 로드하고, 없을 경우 로컬 JSON/MD 설정 파일로 안전하게 폴백합니다.
     */
    private async getCredentials(): Promise<{ token: string; chatId: string }> {
        // 1. VS Code SecretStorage(보안 키체인) 조회
        let token = await this.context.secrets.get('TELEGRAM_BOT_TOKEN');
        let chatId = await this.context.secrets.get('TELEGRAM_CHAT_ID');

        // 2. SecretStorage에 없을 시 로컬 에이전트 설정 파일에서 폴백 로드
        if (!token || !chatId) {
            const dir = getCompanyDir();
            if (dir) {
                try {
                    // 신규 폼 설정 JSON 로드
                    const jsonPath = path.join(dir, '_agents', 'secretary', 'tools', 'telegram_setup.json');
                    try {
                        const content = await fs.promises.readFile(jsonPath, 'utf-8');
                        const cfg = JSON.parse(content || '{}');
                        token = token || String(cfg.TELEGRAM_BOT_TOKEN || '').trim();
                        chatId = chatId || String(cfg.TELEGRAM_CHAT_ID || '').trim();
                    } catch { /* ignored */ }
                } catch { /* ignored */ }

                // 레거시 마크다운 설정 파일 로드
                if (!token || !chatId) {
                    try {
                        const cfgPath = path.join(dir, '_agents', 'secretary', 'config.md');
                        try {
                            const txt = await fs.promises.readFile(cfgPath, 'utf-8');
                            if (!token) {
                                const tokenM = txt.match(/TELEGRAM_BOT_TOKEN\s*[:：=]\s*([A-Za-z0-9:_\-]+)/);
                                if (tokenM) token = tokenM[1].trim();
                            }
                            if (!chatId) {
                                const chatM = txt.match(/TELEGRAM_CHAT_ID\s*[:：=]\s*(-?\d+)/);
                                if (chatM) chatId = chatM[1].trim();
                            }
                        } catch { /* ignored */ }
                    } catch { /* ignored */ }
                }
            }
        }

        return {
            token: token || '',
            chatId: chatId || ''
        };
    }

    /**
     * 에이전트가 생성한 패치 코드 승인 요청 전송 및 가상 Diff 뷰어 기동
     * @param targetFilePath - 수정 대상 파일의 절대 경로
     * @param patchedCode - 에이전트가 제안한 최종 수정 소스 코드
     */
    public async requestApproval(targetFilePath: string, patchedCode: string): Promise<void> {
        try {
            const { token, chatId } = await this.getCredentials();
            if (!token || !chatId) {
                vscode.window.showWarningMessage('⚠️ 텔레그램 연동 정보가 설정되지 않았습니다. 비서 에이전트의 ⚙️ 설정에서 봇 설정을 완료해 주세요.');
                return;
            }

            const patchId = `patch_${Date.now()}`;

            // [안전장치 - 낙관적 잠금] 승인 요청 시점의 원본 파일 내용을 SHA-256 해시화하여 기록합니다.
            let originalContent = '';
            try {
                originalContent = await fs.promises.readFile(targetFilePath, 'utf-8');
            } catch { /* file does not exist */ }
            const originalHash = crypto.createHash('sha256').update(originalContent).digest('hex');

            // 1. 메모리 큐에 패치 데이터 적재
            this.pendingPatches.set(patchId, {
                filePath: targetFilePath,
                patchedCode,
                timestamp: Date.now(),
                originalHash
            });

            // 2. IDE 내부 가상 버퍼에 선제적 Diff 창 생성
            const virtualUri = vscode.Uri.parse(`axios-ai-preview://patch/${patchId}/${path.basename(targetFilePath)}?patchId=${patchId}`);
            const currentDocUri = vscode.Uri.file(targetFilePath);

            // 가상 문서 이벤트 갱신 통지
            this._onDidChange.fire(virtualUri);

            await vscode.commands.executeCommand(
                'vscode.diff',
                currentDocUri,
                virtualUri,
                `[AXIOS AI] ${path.basename(targetFilePath)} 패치 제안`
            );

            // 3. 텔레그램 인라인 키보드 인터페이스 구성 및 송신
            const fileRelativePath = vscode.workspace.workspaceFolders
                ? path.relative(vscode.workspace.workspaceFolders[0].uri.fsPath, targetFilePath)
                : path.basename(targetFilePath);

            // 특수문자 에스케이프 처리 (Markdown 안정성)
            const escapedPath = fileRelativePath.replace(/[_*`[\]]/g, '\\$&');
            
            const message = `🚨 *[AXIOS AI 에이전트]* 소스 코드 패치 승인 요청\n\n📄 *대상 파일:* \`${escapedPath}\`\n\nIDE에서 Diff 창이 열렸습니다. 변경 내역을 확인하시고 아래 버튼을 눌러 승인/거절을 선택해 주십시오.`;
            const replyMarkup = {
                inline_keyboard: [
                    [
                        { text: "🟢 최종 승인 (Apply)", callback_data: `apply:${patchId}` },
                        { text: "🔴 거절 (Cancel)", callback_data: `reject:${patchId}` }
                    ]
                ]
            };

            await this.sendTelegramPost('sendMessage', {
                chat_id: chatId,
                text: message,
                parse_mode: 'Markdown',
                reply_markup: replyMarkup
            }, token);

            vscode.window.showInformationMessage('AXIOS AI: 모바일 텔레그램으로 최종 코드 패치 승인 요청을 송신했습니다.');
        } catch (error) {
            vscode.window.showErrorMessage(`텔레그램 승인 요청 송신 실패: ${(error as Error).message}`);
        }
    }

    /**
     * 사용자의 승인/거절 버튼 클릭(Callback Query) 이벤트 비동기 처리
     */
    public async handleCallbackQuery(callbackQuery: any): Promise<void> {
        try {
            const { token, chatId } = await this.getCredentials();
            if (!token || !chatId) return;

            // [안전장치 - 화이트리스트 검증] 등록된 chatId와 콜백 송신 chatId가 일치하는지 철저히 점검합니다.
            const queryChatId = String(callbackQuery.message?.chat?.id ?? '');
            if (queryChatId !== String(chatId)) {
                console.warn(`[AXIOS AI Telegram] Whitelist blocked unauthorized callback from chat: ${queryChatId}`);
                await this.answerCallback(callbackQuery.id, "❌ 승인 권한이 없는 대화방입니다.", token);
                return;
            }

            const data: string = callbackQuery.data || '';
            const [action, targetData] = data.split(':');

            if (action === 'trigger_ai') {
                await this.answerCallback(callbackQuery.id, "코다리 에이전트가 리팩토링 연산을 시작합니다.", token);
                
                // 1. 대상 파일 존재 유무 검증
                let fileExists = false;
                try {
                    await fs.promises.access(targetData);
                    fileExists = true;
                } catch {}
                if (!fileExists) {
                    await this.sendTelegramPost('sendMessage', {
                        chat_id: chatId,
                        text: `❌ *[에러]* 대상 파일을 찾을 수 없습니다: \`${path.basename(targetData)}\``,
                        parse_mode: 'Markdown'
                    }, token);
                    return;
                }

                // 2. 텔레그램 진행 중 피드백 송신 (UX 개선)
                await this.sendTelegramPost('sendMessage', {
                    chat_id: chatId,
                    text: `⚙️ *[AXIOS AI 코다리]* \`${path.basename(targetData)}\` 리팩토링 및 UI 고도화 연산을 수행하고 있습니다. 로컬 LLM 연산 속도에 따라 최대 수십 초가 소요될 수 있으니 잠시만 기다려 주십시오...`,
                    parse_mode: 'Markdown'
                }, token);

                try {
                    const originalCode = await fs.promises.readFile(targetData, 'utf-8');
                    const refactoredCode = await this.generateRefactoredCode(targetData, originalCode);
                    
                    if (!refactoredCode) {
                        throw new Error("로컬 LLM이 빈 응답을 반환했습니다.");
                    }

                    // 3. 생성된 코드로 정식 승인 요청 프로세스 기동
                    await this.requestApproval(targetData, refactoredCode);
                } catch (err: any) {
                    const errMsg = err?.message || String(err);
                    console.error('[AXIOS AI Telegram] Autonomous refactoring failed:', err);
                    await this.sendTelegramPost('sendMessage', {
                        chat_id: chatId,
                        text: `❌ *[자율 리팩토링 실패]*\n연산 중 오류가 발생했습니다: \`${this.escapeMarkdown(errMsg)}\`\n\n로컬 AI 서버(Ollama/LM Studio) 작동 및 모델 상태를 확인해 주십시오.`,
                        parse_mode: 'Markdown'
                    }, token);
                }
                return;
            }

            const patchId = targetData;
            const patch = this.pendingPatches.get(patchId);

            if (!patch) {
                await this.answerCallback(callbackQuery.id, "⚠️ 만료되거나 존재하지 않는 패치 요청입니다.", token);
                // 버튼만 제거
                await this.sendTelegramPost('editMessageText', {
                    chat_id: chatId,
                    message_id: callbackQuery.message.message_id,
                    text: `⚠️ 존재하지 않거나 이미 만료된 패치 요청입니다.`,
                    parse_mode: 'Markdown'
                }, token);
                return;
            }

            const filename = path.basename(patch.filePath);

            if (action === 'apply') {
                // [안전장치 - 낙관적 잠금] 파일 쓰기 직전, 승인 대기 중 IDE 등에서 파일이 변경되었는지 해시 검증을 수행합니다.
                let nowContent = '';
                try {
                    nowContent = await fs.promises.readFile(patch.filePath, 'utf-8');
                } catch { /* file does not exist */ }
                const nowHash = crypto.createHash('sha256').update(nowContent).digest('hex');

                if (nowHash !== patch.originalHash) {
                    vscode.window.showErrorMessage(`[텔레그램 승인 거부] 경쟁 상태(Race Condition) 감지: 승인 대기 중에 파일이 로컬에서 수정되어 패치 적용이 취소되었습니다.`);
                    await this.answerCallback(callbackQuery.id, "❌ 경쟁 상태 감지: 승인 대기 중에 파일이 변경되어 취소되었습니다.", token);
                    
                    await this.sendTelegramPost('editMessageText', {
                        chat_id: chatId,
                        message_id: callbackQuery.message.message_id,
                        text: `⚠️ *[반영 실패 - 경쟁 상태 감지]*\n\n\`${filename}\` 파일이 승인 대기 중 로컬에서 직접 수정되었습니다. 코드 소실 방지를 위해 본 패치 반영 요청을 취소했습니다.`,
                        parse_mode: 'Markdown'
                    }, token);

                    this.pendingPatches.delete(patchId);
                    return;
                }

                try {
                    // 안전한 파일 쓰기 수행
                    const dir = path.dirname(patch.filePath);
                    await fs.promises.mkdir(dir, { recursive: true });
                    await fs.promises.writeFile(patch.filePath, patch.patchedCode, 'utf-8');

                    vscode.window.showInformationMessage(`[텔레그램 승인] ${filename} 파일이 파일 시스템에 최종 업데이트되었습니다.`);
                    await this.answerCallback(callbackQuery.id, "🟢 패치가 파일 시스템에 성공적으로 반영되었습니다.", token);

                    // 텔레그램 메세지 상태 승인 완료로 업데이트 및 버튼 제거
                    await this.sendTelegramPost('editMessageText', {
                        chat_id: chatId,
                        message_id: callbackQuery.message.message_id,
                        text: `✅ *[최종 승인 완료]*\n\n\`${filename}\` 파일의 코드 변경 사항이 최종 반영되었습니다.`,
                        parse_mode: 'Markdown'
                    }, token);

                } catch (fsError) {
                    const errMsg = (fsError as Error).message;
                    vscode.window.showErrorMessage(`[텔레그램 승인 실패] 파일 쓰기 오류: ${errMsg}`);
                    await this.answerCallback(callbackQuery.id, `❌ 파일 반영 중 오류 발생: ${errMsg}`, token);
                }
            } else if (action === 'reject') {
                vscode.window.showWarningMessage(`[텔레그램 거절] 사용자가 에이전트 패치 제안을 취소 및 기각했습니다.`);
                await this.answerCallback(callbackQuery.id, "🔴 패치 요청이 거절 및 파기되었습니다.", token);

                await this.sendTelegramPost('editMessageText', {
                    chat_id: chatId,
                    message_id: callbackQuery.message.message_id,
                    text: `❌ *[패치 반영 거절]*\n\n사용자가 \`${filename}\` 파일의 코드 패치 제안을 거절했습니다.`,
                    parse_mode: 'Markdown'
                }, token);
            }

            this.pendingPatches.delete(patchId);
        } catch (error) {
            console.error('[AXIOS AI Telegram] Callback handling error:', error);
        }
    }

    /**
     * 텔레그램 팝업 응답 송신
     */
    private async answerCallback(callbackQueryId: string, text: string, token: string): Promise<void> {
        try {
            await this.sendTelegramPost('answerCallbackQuery', {
                callback_query_id: callbackQueryId,
                text: text
            }, token);
        } catch (e) {
            console.error('[AXIOS AI Telegram] answerCallbackQuery failed:', e);
        }
    }

    /**
     * Pure Node.js HTTPS POST 요청 추상화
     */
    private sendTelegramPost(method: string, payload: any, token: string): Promise<string> {
        return new Promise((resolve, reject) => {
            const data = JSON.stringify(payload);
            const options = {
                hostname: 'api.telegram.org',
                port: 443,
                path: `/bot${token}/${method}`,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(data)
                }
            };

            const req = https.request(options, (res) => {
                let body = '';
                res.on('data', (chunk) => body += chunk);
                res.on('end', () => resolve(body));
            });

            req.on('error', (error) => reject(error));
            req.write(data);
            req.end();
        });
    }

    /**
     * [강제 인터셉터 레벨] 유저가 독촉하거나 보여달라고 할 때 무조건 코드를 가시화
     */
    public async processStrictUserCommand(userMessage: string): Promise<boolean> {
        const msg = userMessage.toLowerCase().replace(/\s+/g, '');
        
        // "보여줘야지", "보여줘", "제공하고있나", "가져와" 등 시각화 요구 키워드 강제 필터링
        const showKeywords = ['보여', '제공', '가져', '수정', '코다리', '있나'];
        const isShowRequest = showKeywords.some(kw => msg.includes(kw));

        if (isShowRequest) {
            await this.forceShowCurrentPatchOrContext();
            return true;
        }
        return false;
    }

    /**
     * 비서가 대화로 얼타지 않고, 무조건 파일과 코드를 텔레그램 화면에 띄우게 만드는 핵심 액션
     */
    public async forceShowCurrentPatchOrContext(): Promise<void> {
        try {
            const { token, chatId } = await this.getCredentials();
            if (!token || !chatId) {
                vscode.window.showWarningMessage('⚠️ 텔레그램 연동 정보가 설정되지 않았습니다.');
                return;
            }

            const activeEditor = vscode.window.activeTextEditor;
            
            if (!activeEditor) {
                await this.sendTelegramPost('sendMessage', {
                    chat_id: chatId,
                    text: "❌ *[비서 알림]* 현재 안티그래비티 IDE에 활성화된 소스 코드가 없어 수정할 내역을 추출할 수 없습니다\\.",
                    parse_mode: 'MarkdownV2'
                }, token);
                return;
            }

            const document = activeEditor.document;
            const filePath = document.fileName;
            const fileName = path.basename(filePath) || "unknown.ts";
            const currentCode = document.getText();

            // [시나리오 1] 이미 대기 중인 패치(수정본)가 있다면 그것을 출력
            if (this.pendingPatches.size > 0) {
                const [firstPatchId, firstPatch] = Array.from(this.pendingPatches.entries())[0];
                const diffSnippet = firstPatch.patchedCode.split('\n').slice(0, 25).join('\n');
                
                const message = `📦 *[AXIOS AI 코다리 패치 제안 내역]*\n\n` +
                                `📁 *수정 대상 파일:* \`${this.escapeMarkdown(path.basename(firstPatch.filePath))}\`\n` +
                                `📝 *수정 및 추가될 코드 내용:* \n\n` +
                                `\`\`\`typescript\n${this.escapeMarkdown(diffSnippet)}\n\`\`\`\n\n` +
                                `👇 변경 대기 중인 코드가 위와 같습니다\\. 지금 바로 원격 승인 처리를 진행하시겠습니까?`;

                const replyMarkup = {
                    inline_keyboard: [[
                        { text: "🟢 최종 승인 (Apply)", callback_data: `apply:${firstPatchId}` },
                        { text: "🔴 거절 (Cancel)", callback_data: `reject:${firstPatchId}` }
                    ]]
                };

                await this.sendTelegramPost('sendMessage', {
                    chat_id: chatId,
                    text: message,
                    parse_mode: 'MarkdownV2',
                    reply_markup: replyMarkup
                }, token);
                return;
            }

            // [시나리오 2] 대기 중인 패치가 없다면, 원본 코드를 보여주고 코다리 분석 버튼 연동
            const rawSnippet = currentCode.split('\n').slice(0, 20).join('\n');
            const message = `🔍 *[AXIOS AI 현재 IDE 화면 조회]*\n\n` +
                            `📁 *조회된 파일:* \`${this.escapeMarkdown(fileName)}\`\n\n` +
                            `\`\`\`typescript\n${this.escapeMarkdown(rawSnippet)}\n\`\`\`\n\n` +
                            `현재 수정 대기 상태인 패치가 없습니다\\. 코다리에게 이 코드를 리팩토링하도록 명령하시겠습니까?`;

            const replyMarkup = {
                inline_keyboard: [[
                    { text: "⚡ 코다리에게 UI 자동 수정 명령하기", callback_data: `trigger_ai:${filePath}` }
                ]]
            };

            await this.sendTelegramPost('sendMessage', {
                chat_id: chatId,
                text: message,
                parse_mode: 'MarkdownV2',
                reply_markup: replyMarkup
            }, token);
        } catch (e: any) {
            console.error('[AXIOS AI Telegram] forceShowCurrentPatchOrContext failed:', e);
        }
    }

    private escapeMarkdown(text: string): string {
        return text.replace(/[_*\[\]()~`>#+\-=|{}.!]/g, '\\$&');
    }

    /**
     * 로컬 AI 모델(Ollama/LM Studio)을 원격에서 호출하여 완전 무료로 코드 리팩토링 수행
     */
    private async generateRefactoredCode(filePath: string, originalCode: string): Promise<string> {
        const systemPrompt = `You are Codari, a high-performance AI developer agent in the AXIOS AI suite.
Your task is to refactor and optimize the user's code for premium design aesthetics, modern styling, clean code structure, and error-free execution.
Return ONLY the complete refactored source code. Do not include markdown code block formatting (like \`\`\`typescript), explanations, or notes.
Your response must be directly writeable to a file.`;

        const userPrompt = `Refactor the following source code to improve its visual UI design, premium HSL/CSS color harmony, micro-animations, layout aesthetics, and overall performance.
Keep the same core logic and exports, but make the aesthetics look professional and modern.

[Original Source Code]
${originalCode}
[End of Original Source Code]`;

        const cfg = vscode.workspace.getConfiguration('axiosAi');
        let ollamaBase = (cfg.get<string>('ollamaUrl') || 'http://127.0.0.1:11434').trim();
        if (!/^https?:\/\//i.test(ollamaBase)) ollamaBase = 'http://127.0.0.1:11434';
        
        let defaultModel = (cfg.get<string>('defaultModel') || '').trim();
        
        const isLMStudio = ollamaBase.includes('1234') || ollamaBase.includes('v1');
        const apiUrl = isLMStudio ? `${ollamaBase}/v1/chat/completions` : `${ollamaBase}/api/chat`;

        // 1. 모델 리스트 조회하여 defaultModel 없으면 첫 번째 모델 자동 지정 (완전 무료/자동 감지)
        if (!defaultModel) {
            try {
                if (isLMStudio) {
                    const res = await axios.get(`${ollamaBase}/v1/models`, { timeout: 2000 });
                    if (res.data?.data?.length > 0) {
                        defaultModel = res.data.data[0].id;
                    }
                } else {
                    const res = await axios.get(`${ollamaBase}/api/tags`, { timeout: 5000 });
                    if (res.data?.models?.length > 0) {
                        defaultModel = res.data.models[0].name;
                    }
                }
            } catch { /* ignore */ }
            if (!defaultModel) defaultModel = 'gemma2:2b'; // 최후 폴백
        }

        const messages = [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
        ];

        // 60초 타임아웃 주입 (로컬 LLM은 시간이 걸릴 수 있음)
        const tmo = 60000;
        let responseText = '';
        
        if (isLMStudio) {
            const body = { model: defaultModel, messages, stream: false, temperature: 0.2 };
            const r = await axios.post(apiUrl, body, { timeout: tmo });
            responseText = r.data?.choices?.[0]?.message?.content?.toString() || '';
        } else {
            const body = { model: defaultModel, messages, stream: false, options: { temperature: 0.2 } };
            const r = await axios.post(apiUrl, body, { timeout: tmo });
            responseText = r.data?.message?.content?.toString() || '';
        }

        let cleanCode = responseText.trim();
        if (cleanCode.startsWith('```')) {
            const lines = cleanCode.split('\n');
            if (lines[0].startsWith('```')) {
                lines.shift();
            }
            if (lines[lines.length - 1].startsWith('```')) {
                lines.pop();
            }
            cleanCode = lines.join('\n').trim();
        }

        return cleanCode;
    }

    /**
     * 리소스 정리
     */
    public dispose(): void {
        this.pendingPatches.clear();
        this._onDidChange.dispose();
    }
}

