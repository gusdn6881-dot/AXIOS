import { Sandbox } from '@e2b/code-interpreter';

export class E2BValidationAutomator {
    /**
     * 에이전트가 코딩을 완료한 직후, 마스터에게 가짜 결과물을 보고하지 못하도록 실시간 무결성 빌드 검증 수행
     */
    public static async runRigorousBuildCheck(sandbox: Sandbox, path: string): Promise<{ clean: boolean; errorMessage?: string }> {
        try {
            console.log(`[AXIOS AI Validator] E2B 가상 샌드박스 내부 환경 무결 정적 빌드 체크 시작...`);
            
            // 1. 패키지락 복구 및 모듈 종속성 강제 주입
            const installCheck = await sandbox.commands.run(`cd ${path} && npm install`);
            if (installCheck.exitCode !== 0) {
                return { clean: false, errorMessage: `프로젝트 패키지 설치 단계(npm install) 컴파일 에러 발생:\n${installCheck.stderr}` };
            }

            // 2. 프로젝트 정적 빌더 파이프라인 트리거 구동
            const buildCheck = await sandbox.commands.run(`cd ${path} && npm run build`);
            if (buildCheck.exitCode !== 0) {
                return { clean: false, errorMessage: `타입스크립트/웹 컴포넌트 정적 런타임 오류 검출:\n${buildCheck.stderr}` };
            }

            return { clean: true };
        } catch (err: any) {
            return { clean: false, errorMessage: `자율 빌드 검증 모듈 제어 중 하드웨어 익셉션 유발: ${err.message}` };
        }
    }
}
