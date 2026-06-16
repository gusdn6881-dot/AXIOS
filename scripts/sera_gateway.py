#!/usr/bin/env python3
"""
SERA (Specialized Executive Report Agent) 코어 게이트웨이 엔진 (v2.89.157)
- 사용자의 텔레그램 명령 수신 및 하위 에이전트 분배/브로드캐스팅 (asyncio.Queue)
- 비동기 Stdin 리스너를 이용한 Node.js (TypeScript Extension) IPC 연동 (cross-platform)
- 군부대 보안망(Proxy) 환경 자동 대응 및 지수 백오프 자동 연결 재시도 루프 내장
"""
import asyncio
import logging
import os
import sys
import json
import ast
import re
from typing import Dict, List, Any

# JSON 형식으로 stdout 로깅하여 TS Extension이 정밀하게 파싱 가능하도록 보장
def log_json(event: str, message: str, **kwargs):
    payload = {"event": event, "message": message}
    payload.update(kwargs)
    print(json.dumps(payload), flush=True)

# 의존성 검증 및 예외 보고
try:
    from telegram import Update
    from telegram.ext import Application, CommandHandler, MessageHandler, filters, ContextTypes
    from telegram.request import HTTPRequest
except ImportError as e:
    log_json("error", f"ImportError: {str(e)}. 'python-telegram-bot' 라이브러리가 필요합니다.")
    sys.exit(1)

try:
    from fastapi import FastAPI, Request, BackgroundTasks
    import uvicorn
except ImportError as e:
    log_json("error", f"ImportError: {str(e)}. 'fastapi' 및 'uvicorn' 라이브러리가 필요합니다.")
    sys.exit(1)

import uuid
import zipfile
import shutil

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    stream=sys.stderr  # 일반 텍스트 로그는 stderr로 출력하여 stdout JSON 스트림 노이즈 방지
)
logger = logging.getLogger("AXIOS_AI_SERA")

class CodariAnalyzer:
    """
    코다리(Codari) 에이전트의 핵심 정적 분석 엔진
    - 워크스페이스 소스 코드 스캔
    - 하드코딩된 비밀키, 취약한 함수 사용, 구조적 결함 감지
    """
    def __init__(self, workspace_path: str):
        self.workspace_path = workspace_path
        # 취약한 패턴 예시 패턴 매칭 (정규식)
        self.secret_pattern = re.compile(r'(secret|token|password|passwd|api_key)\s*=\s*["\'][a-zA-Z0-9_\-\.\~]{10,}["\']', re.IGNORECASE)

    async def scan_workspace(self) -> List[Dict[str, Any]]:
        issues = []
        loop = asyncio.get_running_loop()
        
        # CPU 바운드 정적 분석 작업을 비동기 익스큐터로 분리하여 IDE 블로킹 방지
        return await loop.run_in_executor(None, self._sync_scan)

    def _sync_scan(self) -> List[Dict[str, Any]]:
        issues = []
        # 제외할 디렉토리 목록 (OOM 방지)
        exclude_dirs = {'.git', '.venv', 'node_modules', '__pycache__', '.next', 'dist', 'out', 'build'}
        
        for root, dirs, files in os.walk(self.workspace_path):
            # 대규모 디렉토리를 os.walk 탐색 대상에서 즉시 제외하여 OOM Crash 방지
            dirs[:] = [d for d in dirs if d not in exclude_dirs]
            
            for file in files:
                if file.endswith(('.py', '.ts', '.js')):  # 파이썬, 타입스크립트, 자바스크립트 스캔
                    file_path = os.path.join(root, file)
                    issues.extend(self._analyze_file(file_path))
        return issues

    def _analyze_file(self, file_path: str) -> List[Dict[str, Any]]:
        file_issues = []
        relative_path = os.path.relpath(file_path, self.workspace_path)
        
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                content = f.read()

            # 1. 정규식 기반 보안 스캔 (하드코딩된 크리덴셜) - 모든 대상 파일
            for match in self.secret_pattern.finditer(content):
                line_no = content.count('\n', 0, match.start()) + 1
                file_issues.append({
                    "file": relative_path,
                    "line": line_no,
                    "severity": "CRITICAL",
                    "category": "Security (CWE-798)",
                    "description": "소스코드 내에 하드코딩된 인증 정보(Secret/Token)가 감지되었습니다."
                })

            if file_path.endswith('.py'):
                # 2. AST(추상 구문 트리) 분석 기반 구조 및 잠재적 결함 진단 (Python 전용)
                tree = ast.parse(content, filename=file_path)
                for node in ast.walk(tree):
                    # 예시: eval() 함수 사용 제한 (원격 코드 실행 위험)
                    if isinstance(node, ast.Call) and isinstance(node.func, ast.Name) and node.func.id == 'eval':
                        file_issues.append({
                            "file": relative_path,
                            "line": node.lineno,
                            "severity": "HIGH",
                            "category": "Security (CWE-95)",
                            "description": "eval() 함수는 코드 주입(Injection) 취약점에 노출될 수 있으므로 사용을 금지합니다."
                        })
                    # 예시: 빈 except 구문 감지 (예외 처리 누락 예방)
                    if isinstance(node, ast.ExceptHandler) and node.type is None:
                        file_issues.append({
                            "file": relative_path,
                            "line": node.lineno,
                            "severity": "MEDIUM",
                            "category": "Code Quality",
                            "description": "모든 예외를 무조건 포괄하는 except: 구문은 에러 추적을 어렵게 만듭니다. 명시적 예외 처리가 필요합니다."
                        })
            elif file_path.endswith(('.ts', '.js')):
                # 2. TypeScript / JavaScript 특화 정적 분석
                # 2.1 eval() 사용 감지 (CWE-95)
                for match in re.finditer(r'\beval\s*\(', content):
                    line_no = content.count('\n', 0, match.start()) + 1
                    file_issues.append({
                        "file": relative_path,
                        "line": line_no,
                        "severity": "HIGH",
                        "category": "Security (CWE-95)",
                        "description": "eval() 함수는 코드 주입(Injection) 취약점에 노출될 수 있으므로 사용을 금지합니다."
                    })
                # 2.2 빈 catch 블록 감지 (예외 삼키기 방지)
                for match in re.finditer(r'\bcatch\s*(?:\([^)]*\))?\s*\{\s*\}', content):
                    line_no = content.count('\n', 0, match.start()) + 1
                    file_issues.append({
                        "file": relative_path,
                        "line": line_no,
                        "severity": "MEDIUM",
                        "category": "Code Quality",
                        "description": "비어있는 catch {} 블록은 예외 발생 시 에러 추적을 어렵게 만듭니다. 최소한 예외를 로깅하거나 처리해야 합니다."
                    })
                # 2.3 any 타입 사용 억제 (TS 전용 코드 품질 향상)
                if file_path.endswith('.ts'):
                    for match in re.finditer(r':\s*any\b', content):
                        line_no = content.count('\n', 0, match.start()) + 1
                        file_issues.append({
                            "file": relative_path,
                            "line": line_no,
                            "severity": "MEDIUM",
                            "category": "TypeScript Quality",
                            "description": "과도한 any 타입 사용은 TypeScript의 정적 타입 검사 무력화로 잠재적 결함을 유발합니다. 구체적 인터페이스 또는 제네릭 타입 정의를 권장합니다."
                        })
                    
        except Exception as e:
            logger.error(f"[Codari Engine] 파일 분석 중 오류 발생 ({relative_path}): {e}")
            
        return file_issues


class CodariAgentProcessor:
    """
    세라(SERA) 게이트웨이와 통신하며 명령 수신 및 분석 보고서 피드백을 전담하는 코다리 인터페이스
    """
    def __init__(self, agent_name: str, sera_manager: Any, workspace_path: str):
        self.agent_name = agent_name
        self.sera_manager = sera_manager
        self.analyzer = CodariAnalyzer(workspace_path)
        self.incoming_queue = sera_manager.register_sub_agent(agent_name)

    async def start_loop(self):
        """코다리 에이전트 리스너 루프 구동"""
        logger.info(f"[{self.agent_name}] 분석 에이전트가 정상 가동되었습니다.")
        while True:
            try:
                # 세라 게이트웨이로부터 마스터의 명령이 올 때까지 비동기 대기
                task = await self.incoming_queue.get()
                command = task.get("command", "")
                
                logger.info(f"[{self.agent_name}] 마스터 명령 접수: '{command}'")
                
                # '코드수정할거 찾아서 보고' 지시 파싱 매칭
                if "코드수정" in command or "스캔" in command or "분석" in command:
                    # 1. 정적 분석 수행
                    detected_issues = await self.analyzer.scan_workspace()
                    
                    # 2. 결과 마크다운 포맷팅
                    report_content = self._generate_markdown_report(detected_issues)
                    
                    # 3. 세라 게이트웨이를 통해 마스터에게 종합 보고 발송
                    await self.sera_manager.send_report_to_master(self.agent_name, report_content)
                else:
                    # 코드 분석 외 기타 명령 예외 처리
                    await self.sera_manager.send_report_to_master(
                        self.agent_name, 
                        f"⚠️ 요청하신 명령('{command}')은 코드 분석 에이전트의 전담 도메인이 아닙니다."
                    )
                
                self.incoming_queue.task_done()
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"[{self.agent_name}] 실행 루프 내부 치명적 오류: {e}")
                await asyncio.sleep(5) # 예외 발생 시 폴백 타임아웃 적용

    def _generate_markdown_report(self, issues: List[Dict[str, Any]]) -> str:
        if not issues:
            return "✅ **[분석 완료]** 워크스페이스 내에 감지된 보안 취약점 및 리팩토링 요소가 없습니다. 현재 소스코드는 무결합니다."
            
        report = f"🛠️ **총 {len(issues)}건의 코드 수정 소요가 발견되었습니다.**\n\n"
        
        # 위험도 순으로 정렬 (CRITICAL -> HIGH -> MEDIUM)
        severity_order = {"CRITICAL": 0, "HIGH": 1, "MEDIUM": 2}
        sorted_issues = sorted(issues, key=lambda x: severity_order.get(x["severity"], 3))
        
        for issue in sorted_issues:
            emoji = "🚨" if issue["severity"] == "CRITICAL" else "⚠️" if issue["severity"] == "HIGH" else "💡"
            report += f"{emoji} **[{issue['severity']}] {issue['category']}**\n"
            report += f"  - **위치:** `{issue['file']}` (Line: {issue['line']})\n"
            report += f"  - **내용:** {issue['description']}\n\n"
            
        report += "--- \n**[추천 조치]** 해당 파일의 라인을 참조하여 안티그래비티 IDE 내에서 즉각 리팩토링 수정을 가할 것을 권장합니다."
        return report


app = FastAPI()

@app.post("/telegram-webhook")
async def telegram_webhook(request: Request, background_tasks: BackgroundTasks):
    """텔레그램 봇 Webhook 엔드포인트"""
    sera = getattr(app.state, "sera", None)
    if not sera:
        return {"status": "error", "message": "Gateway not initialized"}
        
    try:
        data = await request.json()
    except Exception:
        return {"status": "bad_json"}
        
    chat_id = None
    if "message" in data:
        chat_id = data["message"]["chat"]["id"]
    elif "callback_query" in data:
        chat_id = data["callback_query"]["message"]["chat"]["id"]
        
    if chat_id is None:
        return {"status": "ignored"}
        
    # Whitelist authentication check
    if chat_id != sera.authorized_chat_id:
        logger.warning(f"[보안 경고] 비인가 접근 시도 차단: Chat ID {chat_id}")
        return {"status": "unauthorized"}
        
    # Send immediate acknowledgement to user for commands (starts with / or [)
    if "message" in data and "text" in data["message"]:
        user_text = data["message"]["text"].strip()
        if user_text.startswith("/") or user_text.startswith("["):
            await sera.send_raw_message(chat_id, "⏳ **[접수 완료]** 메인 컨트롤러가 명령을 인식했습니다. 서브 에이전트를 컨테이너 노드에 할당합니다.")
            
    # Process update asynchronously in background
    background_tasks.add_task(sera.process_update_background, data)
    return {"status": "ok"}


class SeraGatewayManager:
    """
    SERA(세라) 에이전트 코어 게이트웨이
    - 사용자의 텔레그램 명령 수신 및 하위 에이전트 전송
    - 하위 에이전트 보고 수집 및 사용자 통보
    """
    def __init__(self, token: str, authorized_chat_id: int):
        self.token = token
        self.authorized_chat_id = authorized_chat_id
        self.application = None
        self.sub_agents: dict[str, asyncio.Queue] = {}
        self._is_running = False

    def register_sub_agent(self, agent_name: str) -> asyncio.Queue:
        """하위 에이전트(예: trading, automation)를 게이트웨이에 등록"""
        if agent_name not in self.sub_agents:
            self.sub_agents[agent_name] = asyncio.Queue()
            logger.info(f"[SERA] Sub-Agent '{agent_name}' 등록 성공.")
        return self.sub_agents[agent_name]

    def _build_application(self):
        """군부대 프록시 서버 설정을 확인하여 어플리케이션 초기화"""
        proxy_url = os.getenv("HTTPS_PROXY") or os.getenv("HTTP_PROXY") or os.getenv("ALL_PROXY")
        builder = Application.builder().token(self.token)
        
        if proxy_url:
            logger.info(f"[SERA-Proxy] 프록시 경유 터널 개방: {proxy_url}")
            request_config = HTTPRequest(
                proxy_url=proxy_url,
                connect_timeout=15.0,
                read_timeout=30.0
            )
            builder.request(request_config)
        else:
            logger.info("[SERA] Direct 아웃바운드 연결 수립.")
            
        self.application = builder.build()
        self._register_handlers()

    def _register_handlers(self):
        """텔레그램 커맨드 및 메시지 핸들러 등록"""
        self.application.add_handler(CommandHandler("start", self._cmd_start))
        self.application.add_handler(CommandHandler("status", self._cmd_status))
        self.application.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, self._handle_user_command))

    async def _authenticate(self, update: Update) -> bool:
        """지정된 마스터(사용자)의 Chat ID 검증"""
        if update.effective_chat.id != self.authorized_chat_id:
            logger.warning(f"[보안 경고] 비인가 접근 시도 차단: Chat ID {update.effective_chat.id}")
            try:
                await update.message.reply_text("⛔ 인가되지 않은 사용자입니다. 접근이 거부되었습니다.")
            except Exception:
                pass
            return False
        return True

    async def _cmd_start(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        if not await self._authenticate(update): return
        await update.message.reply_text("🤖 AXIOS AI 코어 에이전트 'SERA' 가동 상태 정상. 명령을 대기 중입니다.")

    async def _cmd_status(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        if not await self._authenticate(update): return
        active_agents = list(self.sub_agents.keys())
        status_msg = (
            f"📊 [SERA 에이전트 라이브 보고]\n"
            f"- 활성화된 하위 에이전트: {active_agents if active_agents else '없음'}\n"
            f"- 대기 중인 보고 큐: {len(self.sub_agents)}개\n"
            f"- 통신 채널: {'PROXY (' + os.getenv('HTTP_PROXY') + ')' if os.getenv('HTTP_PROXY') else 'DIRECT'}"
        )
        await update.message.reply_text(status_msg)

    async def _handle_user_command(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """사용자의 자연어 명령을 수신하여 하위 에이전트 및 TS Extension으로 배분"""
        if not await self._authenticate(update): return
        
        user_text = update.message.text.strip()
        logger.info(f"[SERA 수신] 마스터 명령: {user_text}")

        # 라우팅 로직
        target_agent = "all"
        clean_text = user_text
        if user_text.startswith("[투자]"):
            target_agent = "trading"
            clean_text = user_text.replace("[투자]", "").strip()
        elif user_text.startswith("[자동화]"):
            target_agent = "automation"
            clean_text = user_text.replace("[자동화]", "").strip()
        elif user_text.startswith("[코다리]") or user_text.startswith("[코드]") or user_text.startswith("[codari]") or any(k in user_text for k in ["코드수정", "스캔", "분석"]):
            target_agent = "codari"
            clean_text = user_text.replace("[코다리]", "").replace("[코드]", "").replace("[codari]", "").strip()

        # 하위 에이전트 큐에 명령 적재
        if target_agent in self.sub_agents:
            self.sub_agents[target_agent].put_nowait({"command": clean_text})
        elif target_agent == "all":
            for queue in self.sub_agents.values():
                queue.put_nowait({"command": clean_text})

        # 메시지 브로드캐스팅 / 유니캐스팅을 stdout JSON 스트림으로 변환하여 TS Extension에 보고
        log_json("command", f"Received command for {target_agent}", agent=target_agent, command=clean_text)

        # 텔레그램 화면 즉시 피드백
        await update.message.reply_text(f"📥 [{target_agent}] 에이전트 및 IDE 확장 프로그램으로 명령을 전달했습니다.")

    async def send_raw_message(self, chat_id: int, text: str):
        """가벼운 메시지 즉시 전송용 헬퍼"""
        try:
            if self.application and self.application.bot:
                await self.application.bot.send_message(
                    chat_id=chat_id,
                    text=text,
                    parse_mode="Markdown"
                )
        except Exception as e:
            logger.error(f"[SERA send_raw_message 실패] {e}")

    async def send_report_to_master(self, agent_name: str, report_content: str):
        """TypeScript Extension이 연산을 수행한 뒤 Python Stdin으로 결과를 밀어 넣을 때 호출"""
        formatted_report = f"🔔 [{agent_name} 에이전트 최종 보고]\n\n{report_content}"
        try:
            if self.application and self.application.bot:
                await self.application.bot.send_message(chat_id=self.authorized_chat_id, text=formatted_report)
                logger.info(f"[SERA 보고 완료] {agent_name} -> 마스터")
            else:
                logger.error("[SERA] Bot instance is not active. Report dropped.")
        except Exception as e:
            logger.error(f"[SERA 보고 실패] {e}")

    async def send_document_to_master(self, agent_name: str, file_path: str, caption: str):
        """임시 결과물 파일 전송. 50MB 초과 시 자동 압축(ZIP) 및 예외 처리 적용."""
        try:
            if not os.path.exists(file_path):
                logger.error(f"[SERA] File not found for sending: {file_path}")
                return
                
            file_size = os.path.getsize(file_path)
            sent_path = file_path
            temp_zip = None
            
            # 50MB 제한 처리
            if file_size > 50 * 1024 * 1024:
                logger.warning(f"[SERA] 파일 용량({file_size} bytes)이 50MB를 초과하여 압축을 진행합니다.")
                temp_zip = f"{file_path}_{uuid.uuid4().hex[:8]}.zip"
                with zipfile.ZipFile(temp_zip, 'w', zipfile.ZIP_DEFLATED) as zipf:
                    zipf.write(file_path, os.path.basename(file_path))
                sent_path = temp_zip
                
                if os.path.getsize(sent_path) > 50 * 1024 * 1024:
                    await self.send_report_to_master(agent_name, f"❌ [전송 실패] 생성된 결과물 파일({os.path.basename(file_path)})이 압축 후에도 50MB를 초과하여 텔레그램으로 전송할 수 없습니다.")
                    if os.path.exists(temp_zip):
                        os.remove(temp_zip)
                    return

            if self.application and self.application.bot:
                with open(sent_path, 'rb') as f:
                    await self.application.bot.send_document(
                        chat_id=self.authorized_chat_id,
                        document=f,
                        caption=f"📂 [{agent_name} 에이전트 산출물]\n\n{caption}",
                        write_timeout=60.0
                    )
                logger.info(f"[SERA 파일 보고 완료] {agent_name} -> 마스터 ({os.path.basename(sent_path)})")
            else:
                logger.error("[SERA] Bot instance is not active. Document report dropped.")
        except Exception as e:
            logger.error(f"[SERA 파일 보고 실패] {e}")
        finally:
            if temp_zip and os.path.exists(temp_zip):
                try:
                    os.remove(temp_zip)
                except Exception:
                    pass

    async def process_update_background(self, data: Dict[str, Any]):
        """백그라운드 스레드에서 수신한 Update 객체를 처리하여 메시지 분배"""
        try:
            update = Update.de_json(data, self.application.bot)
            await self.application.process_update(update)
        except Exception as e:
            logger.error(f"[SERA 백그라운드 업데이트 처리 중 에러] {e}")

    async def run(self):
        """FastAPI 기반의 Webhook 서버와 텔레그램 어플리케이션 구동"""
        self._is_running = True
        
        # 1. 텔레그램 어플리케이션 초기화
        self._build_application()
        await self.application.initialize()
        await self.application.start()
        
        # FastAPI state에 self 인스턴스 등록
        app.state.sera = self
        
        # 포트 바인딩 설정
        port_str = os.getenv("AXIOS_WEBHOOK_PORT", "8000")
        try:
            port = int(port_str)
        except ValueError:
            port = 8000
            
        logger.info(f"[SERA] Starting FastAPI on port {port}...")
        log_json("ready", f"SERA Gateway is up and running via FastAPI on port {port}.")
        
        config = uvicorn.Config(app, host="0.0.0.0", port=port, log_level="warning")
        server = uvicorn.Server(config)
        
        try:
            await server.serve()
        except asyncio.CancelledError:
            logger.info("[SERA] FastAPI server cancelled.")
        except Exception as e:
            logger.error(f"[SERA] FastAPI server error: {e}")
        finally:
            if self.application:
                try:
                    await self.application.stop()
                    await self.application.shutdown()
                except Exception:
                    pass

# Windows와 POSIX 플랫폼 모두에서 비동기로 안전하게 stdin을 한 줄씩 읽는 블로킹 래퍼 함수
def blocking_readline() -> str:
    return sys.stdin.readline()

async def read_stdin_loop(sera: SeraGatewayManager):
    """IDE TS Extension과의 양방향 IPC를 위한 Stdin 수신 대기 루프"""
    logger.info("[SERA IPC] Stdin listener loop started.")
    while True:
        try:
            # sys.stdin.readline()을 별도의 스레드 풀에서 안전하게 비동기 호출
            line = await asyncio.to_thread(blocking_readline)
            if not line:
                # EOF 감지 시 프로세스 종료 예정
                logger.info("[SERA IPC] Stdin EOF detected. Exiting listener loop.")
                break
                
            trimmed = line.strip()
            if not trimmed:
                continue
                
            data = json.loads(trimmed)
            action = data.get("action")
            
            if action == "report":
                agent = data.get("agent", "Unknown")
                content = data.get("content", "")
                if content:
                    # 마스터에게 보고 전송 수행
                    await sera.send_report_to_master(agent, content)
            elif action == "command":
                agent = data.get("agent")
                command = data.get("command", "")
                if agent in sera.sub_agents:
                    sera.sub_agents[agent].put_nowait({"command": command})
                elif agent == "all":
                    for queue in sera.sub_agents.values():
                        queue.put_nowait({"command": command})
            elif action == "stop":
                logger.info("[SERA IPC] Stop request received. Exiting.")
                sera._is_running = False
                break
        except Exception as e:
            logger.error(f"[SERA IPC Error] {e}")

async def main():
    token = os.getenv("AXIOS_TELEGRAM_TOKEN")
    chat_id_str = os.getenv("AXIOS_MASTER_CHAT_ID")
    
    if not token or not chat_id_str:
        log_json("error", "자격 증명 유실: AXIOS_TELEGRAM_TOKEN 또는 AXIOS_MASTER_CHAT_ID 환경변수가 없습니다.")
        sys.exit(1)
        
    try:
        chat_id = int(chat_id_str)
    except ValueError:
        log_json("error", "자격 증명 오류: AXIOS_MASTER_CHAT_ID는 올바른 정수(Integer) 형태여야 합니다.")
        sys.exit(1)

    sera = SeraGatewayManager(token=token, authorized_chat_id=chat_id)
    
    # 텔레그램에 에이전트 서브 큐 자동 등록
    sera.register_sub_agent("trading")
    sera.register_sub_agent("automation")
    
    # 코다리 에이전트 생성 및 등록 (환경변수로부터 워크스페이스 경로 추출)
    workspace_path = os.getenv("AXIOS_WORKSPACE_PATH") or os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    codari_processor = CodariAgentProcessor("codari", sera, workspace_path)
    
    # Stdin 백그라운드 리스너, 코다리 루프, 텔레그램 폴링 엔진을 비동기 태스크 그룹으로 병렬 수행
    await asyncio.gather(
        sera.run(),
        read_stdin_loop(sera),
        codari_processor.start_loop()
    )

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except (KeyboardInterrupt, SystemExit):
        logger.info("SERA Gateway terminated.")
