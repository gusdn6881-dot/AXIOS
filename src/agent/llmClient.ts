import * as vscode from 'vscode';

export interface LLMRequestPayload {
    systemPrompt: string;
    userCode: string;
    contextFiles?: string[];
}

export class AxiosAIClient {
    private readonly maxTokenLimit = 4096;

    constructor() {}

    /**
     * 입력 데이터를 새니타이징하여 시스템 명령어 오인을 유발하는 메타 텍스트 및 프롬프트 인젝션을 방지합니다.
     */
    public sanitizeInput(input: string): string {
        if (!input) return '';
        // 1. HTML 태그 제거
        // 2. system, administrator, authority, root 와 같은 역할을 강제하려는 프롬프트 우회 정밀 대체
        return input
            .replace(/<\/?[^>]+(>|$)/g, "") // HTML 태그 제거
            .replace(/(system|administrator|authority|root)\s*:/gi, "[REDACTED_ROLE]:"); 
    }

    /**
     * 시스템 명령어 영역과 유저 컨텍스트 영역을 엄격하게 구분하는 보안 컨텍스트 구조를 반환합니다.
     */
    public buildSecurePrompt(system: string, code: string): string {
        return `[SYSTEM_INSTRUCTION]\n${system}\n[END_SYSTEM_INSTRUCTION]\n\n[USER_CODE_CONTEXT]\n${code}\n[END_USER_CODE_CONTEXT]`;
    }

    /**
     * 스트리밍 진행 중 수집된 텍스트 초반부에서 거절 응답 조기 감지 여부를 스캔합니다.
     * (첫 100~250자 이내에 나타나는 권한 거부 반응 차단용)
     */
    public isEarlyRefusalCandidate(partialText: string): boolean {
        if (!partialText || partialText.length < 15) return false;
        
        const refusalKeywords = [
            '접근할 수 있는 권한',
            '시스템 관리자 권한',
            'LLM으로서',
            '권한 변경',
            '권한이 국한',
            '메타적인 질문'
        ];
        
        // 초반 스트리밍 내용 중 거절 키워드가 하나라도 관찰되면 얼리 리젝션 의심
        const matched = refusalKeywords.filter(keyword => partialText.includes(keyword));
        return matched.length >= 1;
    }

    /**
     * 모델의 최종 응답 텍스트 전체에 권한 및 시스템 제한 거절 답변이 포함되어 있는지 최종 검증합니다.
     */
    public isMetaRefusalResponse(text: string): boolean {
        if (!text) return false;
        
        const refusalKeywords = ['접근할 수 있는 권한', '시스템 관리자 권한', 'LLM으로서', '권한 변경'];
        
        // 원본 청사진의 strict 규칙 (모든 단어가 들어가는 경우)
        const strictMatch = refusalKeywords.every(keyword => text.includes(keyword));
        
        // 실무적 복합 규칙: 핵심 키워드 중 2개 이상이 겹치는 경우
        const fuzzyCount = refusalKeywords.filter(keyword => text.includes(keyword)).length;
        
        return strictMatch || fuzzyCount >= 2;
    }
}
