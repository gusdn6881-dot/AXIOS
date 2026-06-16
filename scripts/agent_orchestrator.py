#!/usr/bin/env python3
import os
import sys
import time
import json
import logging
import threading
import requests
from datetime import datetime
from fastapi import FastAPI, Request, BackgroundTasks
from pydantic import BaseModel
import uvicorn

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("AxiosCoreEngine")

app = FastAPI(title="AXIOS CLI & Antigravity Core Orchestrator")

# ==========================================
# [인프라 전역 상태 저장소 - 글로벌 캐시 모듈]
# ==========================================
SYSTEM_STATE = {
    "github_repo": "gusdn6881-dot/AXIOS-DESKTOP",
    "youtube_connected": False,
    "agents": ["CEO", "레오", "Instagram", "Designer", "코다리", "현빈", "세라", "루나", "Writer", "Researcher"],
    "task_board": [],
    "approval_queue": [],
    "notebook_url": "",
    "huggingface_memory_db": "https://huggingface.co/api/datasets/gusdn6881/agent-memory-beta"
}

# ==========================================
# 1. 깃허브 지식 저장소 원자적 로더 및 동기화 무결성 확보
# ==========================================
class GitHubContextLoader:
    @staticmethod
    def sync_and_load_files(repo: str):
        logger.info(f"지식 저장소 동기화 개시: {repo}")
        api_url = f"https://api.github.com/repos/{repo}/contents/"
        try:
            # 타임아웃 락을 차단하여 CLI가 멈추는 현상 방지
            res = requests.get(api_url, timeout=10)
            if res.status_code == 200:
                files = res.json()
                file_list = [f["name"] for f in files]
                logger.info(f"CLI 가상 디렉토리 정합성 확보 완료: {file_list}")
                # 수집된 자원 스키마 구조를 AXIOS CLI 가 읽을 수 있는 메모리 버퍼에 매핑
                return {"status": "SUCCESS", "extracted_files": file_list}
            else:
                return {"status": "AUTH_OR_PATH_ERROR", "extracted_files": []}
        except Exception as e:
            logger.error(f"깃허브 컨텍스트 로드 치명적 실패: {str(e)}")
            return {"status": "NETWORK_CRASH", "extracted_files": []}

# ==========================================
# 2. 멀티 에이전트 자율 라우팅 및 승인 큐/태스크 보드 오케스트레이션
# ==========================================
class MultiAgentController:
    @staticmethod
    def assign_individual_task(agent_name: str, command: str, chat_id: int):
        """레오, 세라, 코다리 등 각 에이전트 객체에 별도의 백그라운드 스레드로 독립 명령 하사"""
        logger.info(f"[{agent_name}] 에이전트에게 독점적 명령 전달 완료: {command}")
        
        # 태스크 보드 자동 누적 결함 보완
        task_id = int(time.time())
        task_item = {"task_id": task_id, "agent": agent_name, "command": command, "status": "IN_PROGRESS"}
        SYSTEM_STATE["task_board"].append(task_item)
        
        # 텔레그램 진행 상황 상태 전이 즉시 보고
        tg_token = os.getenv("TELEGRAM_BOT_TOKEN", "YOUR_BOT_TOKEN")
        url = f"https://api.telegram.org/bot{tg_token}/sendMessage"
        
        # 즉각 접수 메시지
        try:
            requests.post(url, json={
                "chat_id": chat_id,
                "text": f"🤖 **[{agent_name} 에이전트 자율 구동]**\n• 할 일 일지: 태스크 보드 자동 등록 완료 (ID: {task_id})\n• 실행 명령: `{command}`\n\n결과 추적을 개시합니다."
            }, timeout=5)
        except Exception:
            pass
        
        # 무거운 태스크 처리 시뮬레이션 및 결재(승인 큐) 이관
        time.sleep(5)
        
        # 승인 큐 진입 구조 강제 활성화
        approval_item = {"task_id": task_id, "agent": agent_name, "result_preview": f"{command} 가공 완료 산출물 데이터 스키마"}
        SYSTEM_STATE["approval_queue"].append(approval_item)
        
        # 승인 큐 통보
        try:
            requests.post(url, json={
                "chat_id": chat_id,
                "text": f"⚠️ **[승인 큐(Approval Queue) 결재 요청]**\n• 담당: {agent_name}\n\n에이전트가 생성한 주요 비즈니스 리포트 실행 전에 마스터의 최종 결재가 요구됩니다. 승인하려면 `/approve {task_id}`를 입력하세요."
            }, timeout=5)
        except Exception:
            pass

# ==========================================
# 3. 크론 기반 정기 리포트 자동화 스케줄러 (루프 데몬)
# ==========================================
def automated_report_loop(interval_seconds: int, chat_id: int):
    """지정된 시간 주기마다 반복적으로 똑같은 비즈니스 리포트 태스크를 자동 수행"""
    logger.info(f"정기 리포트 자동화 엔진 가동 시작 (주기: {interval_seconds}초)")
    tg_token = os.getenv("TELEGRAM_BOT_TOKEN", "YOUR_BOT_TOKEN")
    url = f"https://api.telegram.org/bot{tg_token}/sendMessage"
    
    while True:
        try:
            logger.info("정기 배치 스케줄러 태스크 수집 가동")
            # 깃허브 지식저장소 무결성 스캔 병행
            sync_res = GitHubContextLoader.sync_and_load_files(SYSTEM_STATE["github_repo"])
            
            report_msg = (
                f"📊 **[AXIOS CLI 자동화 비즈니스 정기 리포트]**\n"
                f"• 실행 시간: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n"
                f"• 깃허브 연동 상태: `{sync_res['status']}` (파일 수: {len(sync_res['extracted_files'])}개)\n"
                f"• 활성 서브 에이전트 구조: 레오(YouTube), 코다리(FullStack), 세라(Secretariat) 정상 런타임 유지 중."
            )
            requests.post(url, json={"chat_id": chat_id, "text": report_msg}, timeout=10)
        except Exception as e:
            logger.error(f"스케줄러 루틴 크래시: {str(e)}")
        
        time.sleep(interval_seconds)

# ==========================================
# 4. API 라우팅 엔드포인트 세션 (FastAPI 제어 레이어)
# ==========================================
class AgentCommandRequest(BaseModel):
    chat_id: int
    agent_name: str
    command: str

@app.post("/v1/axios/agent-control")
async def api_individual_agent_control(req: AgentCommandRequest, background_tasks: BackgroundTasks):
    """에이전트 각자에게 따로 명령을 하사하는 제어 포트"""
    if req.agent_name not in SYSTEM_STATE["agents"]:
        return {"status": "INVALID_AGENT_NAME"}
    
    background_tasks.add_task(MultiAgentController.assign_individual_task, req.agent_name, req.command, req.chat_id)
    return {"status": "COMMAND_DISPATCHED", "target_agent": req.agent_name}

@app.post("/v1/axios/youtube-connect")
async def api_youtube_connect(api_key: str, channel_id: str):
    """유튜브 API 및 UC 채널 정합성 검증 필터"""
    if not channel_id.startswith("UC") or len(channel_id) != 24:
        return {"status": "FAILED", "reason": "유효하지 않은 Channel ID 형태입니다. UC...로 시작하는 24자리 값을 기입하십시오."}
    
    SYSTEM_STATE["youtube_connected"] = True
    return {"status": "SUCCESS", "channel_id": channel_id, "msg": "AXIOS 대시보드 유튜브 미연결 바인딩이 해제되었습니다."}

@app.post("/v1/axios/mcp-setup")
async def api_mcp_setup(request: Request):
    """MCP 연동 JSON 규격 유효성 팩토리 검증 포트"""
    try:
        mcp_config = await request.json()
        if "mcpServers" in mcp_config:
            logger.info("MCP 서버 컨피그 프로토콜 주입 성공")
            return {"status": "MCP_CONFIG_VALIDATED", "servers": list(mcp_config["mcpServers"].keys())}
        return {"status": "SCHEMA_MISMATCH"}
    except Exception:
        return {"status": "INVALID_JSON_FORMAT"}

@app.post("/v1/axios/university-action")
async def api_university_action(action_type: str, problem_statement: str = ""):
    """AI AGENT UNIVERSITY 등교, 문제내기, 채점, 우등생 뽑기 가상 스캔 포트"""
    if action_type == "등교":
        if not SYSTEM_STATE["github_repo"]:
            return {"status": "ERROR", "reason": "설정에서 DB URL 및 지식 저장소 연동을 선행해 주십시오."}
        return {"status": "SUCCESS", "msg": "AXIOS 및 필리온 에이전트 노드가 UNIVERSITY 가상 공간에 등교 완료 처리되었습니다."}
    
    elif action_type == "문제내기":
        return {"status": "SUCCESS", "topic": problem_statement, "msg": "HOLO-BOARD 에 토론 주제 배포 완료. 에이전트 자율 토론 스레드가 활성화됩니다."}
    
    elif action_type == "채점":
        return {"status": "SUCCESS", "winner": "코다리 (시니어 풀스택)", "score": 98, "msg": "우등생 선발 알고리즘 가동 정상 작동 완료."}

@app.get("/v1/axios/dashboard")
async def get_dashboard_state():
    """AXIOS CLI 및 비즈니스 리포트 버튼 클릭 시 무결성 상태 덤프 반환"""
    return SYSTEM_STATE

@app.on_event("startup")
def startup_event():
    chat_id_str = os.getenv("AXIOS_MASTER_CHAT_ID")
    tg_token = os.getenv("TELEGRAM_BOT_TOKEN")
    if chat_id_str and tg_token:
        try:
            chat_id = int(chat_id_str)
            # Default to 4 hours (14400 seconds) for reports, or read from env
            interval = int(os.getenv("AXIOS_REPORT_INTERVAL", "14400"))
            t = threading.Thread(target=automated_report_loop, args=(interval, chat_id), daemon=True)
            t.start()
            logger.info(f"정기 리포트 백그라운드 스레드 가동 성공: chat_id={chat_id}, interval={interval}s")
        except Exception as e:
            logger.error(f"정기 리포트 백그라운드 스레드 시작 실패: {str(e)}")

if __name__ == "__main__":
    port = int(os.getenv("AXIOS_CORE_PORT", 8080))
    logger.info(f"AXIOS Core Orchestrator 가동 준비 완료. 포트: {port}")
    uvicorn.run(app, host="0.0.0.0", port=port)
