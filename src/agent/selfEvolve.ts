/* ============================================================================
 * [초보자 안내] selfEvolve.ts — AXIOS AI 2.0 '안전한 자율 진화 엔진'
 *
 * 이 모듈은 코다리(시니어 풀스택 엔지니어)가 소스 코드를 자율적으로 수정할 때
 * 시스템이 죽지 않도록 '격리 검증(Sandbox Verification)' 로직을 구현합니다.
 *
 * 핵심 흐름:
 *   1. 원본 파일 내용을 메모리에 백업합니다 (롤백 대비).
 *   2. 수정본을 임시 파일(.tmp.ts)로 먼저 디스크에 기록합니다.
 *   3. child_process로 컴파일 명령어를 백그라운드에서 실행합니다 (격리 검증).
 *   4. 문법 에러가 없으면 → 원본 파일에 안전하게 덮어씁니다.
 *   5. 컴파일 실패 → 임시 파일을 파기하고 이전 상태를 복구(Rollback)합니다.
 *   6. CEO가 변경 내역을 취합하여 사용자에게 브리핑합니다.
 *
 * 안전 장치:
 *   - 컴파일 프로세스 타임아웃 (15초)
 *   - 좀비 프로세스 방지 (타임아웃 시 강제 kill)
 *   - 동시 실행 방지 뮤텍스 (_evolveRunning)
 *   - 임시 파일은 항상 finally 블록에서 정리
 *
 * 사용처: extension.ts에서 import하여 자율 사이클 중 코다리가 코드 수정 시 호출.
 * ============================================================================ */

import * as fs from 'fs';
import * as path from 'path';
import { spawn } from 'child_process';

// ============================================================================
// [초보자 안내] 자율 진화 결과를 나타내는 인터페이스입니다.
// 각 수정 작업이 성공했는지, 실패했는지, 에러 메시지는 무엇인지를 담습니다.
// ============================================================================
export interface EvolveResult {
  /** 이번 진화 작업이 성공했는지 여부 */
  success: boolean;
  /** 수정된 파일의 절대 경로 */
  filePath: string;
  /** 사람이 읽을 수 있는 변경 목적 요약 (한글) */
  purpose: string;
  /** 성공/실패 사유 메시지 (한글) */
  message: string;
  /** 컴파일러가 뱉은 에러 메시지 (실패 시에만) */
  compileErrors?: string;
  /** 변경 전 원본 코드의 줄 수 */
  originalLineCount?: number;
  /** 변경 후 수정 코드의 줄 수 */
  modifiedLineCount?: number;
}

// ============================================================================
// [초보자 안내] CEO가 사용자에게 보고할 브리핑 데이터 인터페이스입니다.
// 코다리의 수정 건을 CEO가 취합하여 대시보드와 로그 창으로 전달합니다.
// ============================================================================
export interface CeoBriefing {
  /** 브리핑 생성 시각 (ISO 문자열) */
  timestamp: string;
  /** 이번 진화 세션에서 시도한 수정 건의 전체 결과 목록 */
  results: EvolveResult[];
  /** CEO의 종합 코멘트 (한글) */
  summary: string;
  /** 전체 수정 건 중 성공한 건수 */
  successCount: number;
  /** 전체 수정 건 중 실패한 건수 */
  failCount: number;
}

// ============================================================================
// [초보자 안내] 모듈 레벨 뮤텍스(잠금) 변수입니다.
// 이 변수가 true인 동안은 자율 진화 파이프라인이 이미 가동 중이므로
// 중복 실행을 원천 차단합니다. 동시에 두 개의 수정이 같은 파일을
// 건드려서 충돌하는 사고를 방지하는 핵심 안전장치입니다.
// ============================================================================
let _evolveRunning = false;

// [초보자 안내] 컴파일 검증에 사용할 타임아웃 값 (밀리초).
// 15초 안에 컴파일이 끝나지 않으면 프로세스를 강제 종료합니다.
const COMPILE_TIMEOUT_MS = 15_000;

// [초보자 안내] 임시 파일 확장자 접미사. 원본 파일명 뒤에 붙여서 격리합니다.
const TMP_SUFFIX = '.tmp.ts';

/**
 * ============================================================================
 * [초보자 안내] 격리 컴파일 검증 함수
 *
 * 임시 파일에 대해 TypeScript 컴파일러를 백그라운드 하위 프로세스로 실행하여
 * 문법 에러가 있는지 없는지만 확인합니다 (실제 .js 출력은 하지 않음).
 *
 * @param tmpFilePath - 검증할 임시 파일의 절대 경로
 * @param projectRoot - 프로젝트 루트 (tsconfig.json이 있는 경로)
 * @returns 컴파일 성공 여부(success)와 에러 메시지(errors)
 * ============================================================================
 */
async function _sandboxCompileCheck(
  tmpFilePath: string,
  projectRoot: string
): Promise<{ success: boolean; errors: string }> {
  return new Promise((resolve) => {
    // [초보자 안내] npx tsc를 사용하여 임시 파일의 문법만 검증합니다.
    // --noEmit: .js 파일을 실제로 생성하지 않음 (검증만 수행)
    // --strict: 엄격한 타입 체크로 잠재적 버그까지 잡아냄
    const compileCmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';
    const args = ['tsc', '--noEmit', '--strict', '--target', 'ES2022', '--module', 'commonjs', tmpFilePath];

    const child = spawn(compileCmd, args, {
      cwd: projectRoot,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],  // stdin 무시, stdout/stderr 캡처
    });

    let stdout = '';
    let stderr = '';
    let timedOut = false;

    // [초보자 안내] stdout과 stderr를 모두 수집합니다.
    // TypeScript 컴파일러는 에러를 stdout으로 보내는 경우도 있습니다.
    child.stdout?.on('data', (d: Buffer) => {
      if (stdout.length < 10_000) {
        stdout += d.toString();
        // [안전장치] 출력이 너무 길면 앞부분만 유지합니다 (메모리 보호 및 컴파일 에러 보존)
        if (stdout.length > 10_000) stdout = stdout.slice(0, 10_000);
      }
    });

    child.stderr?.on('data', (d: Buffer) => {
      if (stderr.length < 10_000) {
        stderr += d.toString();
        if (stderr.length > 10_000) stderr = stderr.slice(0, 10_000);
      }
    });

    // [초보자 안내] 타임아웃 타이머를 설정합니다.
    // 컴파일이 15초 안에 끝나지 않으면 프로세스를 강제 종료합니다.
    // 이는 좀비 프로세스를 원천 차단하는 핵심 안전장치입니다.
    const killTimer = setTimeout(() => {
      timedOut = true;
      try {
        // [초보자 안내] Windows에서는 taskkill로 프로세스 트리 전체를 종료합니다.
        if (process.platform === 'win32' && child.pid) {
          spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' }).unref();
        } else {
          child.kill('SIGKILL');
        }
      } catch { /* 이미 종료된 프로세스 — 무시 */ }
    }, COMPILE_TIMEOUT_MS);

    child.on('close', (code) => {
      clearTimeout(killTimer);

      if (timedOut) {
        resolve({
          success: false,
          errors: `⏱ 컴파일 검증 타임아웃 (${COMPILE_TIMEOUT_MS / 1000}초 초과). 프로세스를 강제 종료했습니다.`,
        });
        return;
      }

      // [초보자 안내] exit code가 0이면 문법 에러 없음 = 성공
      if (code === 0) {
        resolve({ success: true, errors: '' });
      } else {
        const combinedErrors = (stdout + '\n' + stderr).trim().slice(0, 3000);
        resolve({
          success: false,
          errors: combinedErrors || `컴파일 실패 (종료 코드: ${code})`,
        });
      }
    });

    child.on('error', (err) => {
      clearTimeout(killTimer);
      resolve({
        success: false,
        errors: `컴파일 프로세스 실행 실패: ${err.message}`,
      });
    });
  });
}

/**
 * ============================================================================
 * [초보자 안내] 안전한 자율 진화 실행 함수 (핵심 엔트리포인트)
 *
 * 코다리가 파일을 수정하려고 할 때 이 함수를 통해 실행합니다.
 * 원본 파일을 안전하게 백업 → 임시 파일로 격리 검증 → 성공 시 덮어쓰기,
 * 실패 시 롤백하는 전체 파이프라인을 수행합니다.
 *
 * @param filePath - 수정 대상 파일의 절대 경로
 * @param newContent - 코다리가 작성한 새로운 파일 내용
 * @param purpose - 이 수정의 목적 (한글 설명, CEO 브리핑에 포함됨)
 * @param projectRoot - 프로젝트 루트 디렉토리 (tsconfig.json 위치)
 * @returns EvolveResult — 성공/실패 결과
 * ============================================================================
 */
export async function safeEvolveFile(
  filePath: string,
  newContent: string,
  purpose: string,
  projectRoot: string
): Promise<EvolveResult> {
  // ── 1단계: 동시 실행 방지 (뮤텍스 잠금) ──
  // [초보자 안내] 이미 다른 자율 진화가 가동 중이면 즉시 거부합니다.
  // 두 개의 수정이 동시에 같은 파일을 건드리는 충돌을 원천 차단합니다.
  if (_evolveRunning) {
    return {
      success: false,
      filePath,
      purpose,
      message: '⚠️ 자율 진화 파이프라인이 이미 가동 중입니다. 이전 작업이 끝날 때까지 대기해 주세요.',
    };
  }

  _evolveRunning = true;

  // [초보자 안내] 임시 파일 경로를 생성합니다.
  // 예: /src/extension.ts → /src/extension.ts.tmp.ts
  const tmpPath = filePath + TMP_SUFFIX;
  let originalContent: string | null = null;

  try {
    // ── 2단계: 원본 백업 ──
    // [초보자 안내] 수정 대상 파일의 현재 내용을 메모리에 저장합니다.
    // 컴파일 실패 시 이 내용으로 롤백(복원)합니다.
    if (fs.existsSync(filePath)) {
      originalContent = await fs.promises.readFile(filePath, 'utf-8');
    }

    const originalLineCount = originalContent ? originalContent.split('\n').length : 0;
    const modifiedLineCount = newContent.split('\n').length;

    // ── 3단계: 임시 파일에 수정본 기록 ──
    // [초보자 안내] 원본 파일을 직접 건드리지 않고, 임시 파일에 먼저 씁니다.
    // 이것이 '격리(Sandbox)'의 핵심입니다.
    await fs.promises.writeFile(tmpPath, newContent, 'utf-8');
    console.log(`[코다리 자율진화] 임시 파일 생성 완료: ${tmpPath}`);

    // ── 4단계: 격리 컴파일 검증 ──
    // [초보자 안내] 임시 파일에 대해 TypeScript 컴파일러를 실행합니다.
    // 이 과정은 백그라운드 하위 프로세스에서 실행되므로 메인 스레드를 차단하지 않습니다.
    console.log(`[코다리 자율진화] 격리 컴파일 검증 시작...`);
    const compileResult = await _sandboxCompileCheck(tmpPath, projectRoot);

    if (compileResult.success) {
      // ── 5단계 (성공): 원본 파일에 안전하게 덮어쓰기 ──
      // [초보자 안내] 컴파일 통과! 문법 에러가 없으므로 원본에 반영해도 안전합니다.
      await fs.promises.writeFile(filePath, newContent, 'utf-8');
      console.log(`[코다리 자율진화] ✅ 검증 통과 → 원본 반영 완료: ${filePath}`);

      return {
        success: true,
        filePath,
        purpose,
        message: `✅ 격리 검증 통과 → 원본 파일에 안전하게 반영 완료.`,
        originalLineCount,
        modifiedLineCount,
      };
    } else {
      // ── 5단계 (실패): 즉시 롤백 ──
      // [초보자 안내] 컴파일 실패! 문법 에러가 발견되었으므로 원본 파일은 건드리지 않습니다.
      // 임시 파일만 파기하고, 에러 내용을 보고합니다.
      console.error(`[코다리 자율진화] ❌ 컴파일 실패 — 원본 유지 (롤백):`, compileResult.errors);

      return {
        success: false,
        filePath,
        purpose,
        message: `❌ 격리 검증 실패 — 원본 파일을 건드리지 않았습니다. 코드를 파기하고 이전 상태를 유지합니다.`,
        compileErrors: compileResult.errors,
        originalLineCount,
        modifiedLineCount,
      };
    }
  } catch (err: any) {
    // ── 예외 처리: 예상치 못한 에러 발생 시 ──
    // [초보자 안내] 파일 I/O 실패, 디스크 꽉 참 등의 예상치 못한 오류가 발생했습니다.
    // 원본이 백업되어 있다면 즉시 복원합니다.
    console.error(`[코다리 자율진화] 치명적 예외:`, err?.message || err);

    // 원본 복원 시도
    if (originalContent !== null) {
      try {
        await fs.promises.writeFile(filePath, originalContent, 'utf-8');
        console.log(`[코다리 자율진화] 원본 복원 완료 (비상 롤백): ${filePath}`);
      } catch (restoreErr: any) {
        console.error(`[코다리 자율진화] ⚠️ 원본 복원마저 실패:`, restoreErr?.message || restoreErr);
      }
    }

    return {
      success: false,
      filePath,
      purpose,
      message: `⚠️ 자율 진화 중 예상치 못한 에러 발생: ${err?.message || String(err)}. 원본 파일은 복원되었습니다.`,
    };
  } finally {
    // ── 항상 실행: 임시 파일 정리 & 뮤텍스 해제 ──
    // [초보자 안내] finally 블록은 성공이든 실패든 예외든 무조건 실행됩니다.
    // 임시 파일이 디스크에 남아 공간을 차지하는 것을 원천 차단합니다.
    try {
      if (fs.existsSync(tmpPath)) {
        await fs.promises.unlink(tmpPath);
        console.log(`[코다리 자율진화] 임시 파일 정리 완료: ${tmpPath}`);
      }
    } catch (cleanupErr: any) {
      console.warn(`[코다리 자율진화] 임시 파일 삭제 실패 (무시 가능):`, cleanupErr?.message);
    }

    // [초보자 안내] 뮤텍스를 해제하여 다음 자율 진화가 가동될 수 있게 합니다.
    _evolveRunning = false;
  }
}

/**
 * ============================================================================
 * [초보자 안내] CEO 검수 브리핑 생성 함수
 *
 * 코다리의 자율 진화 작업이 끝나면 CEO가 결과를 취합하여
 * 사용자에게 보고할 브리핑 데이터를 생성합니다.
 *
 * 이 데이터는 두 가지 경로로 사용자에게 전달됩니다:
 *   1. vscode.postMessage → 대시보드 웹뷰 토스트 알림
 *   2. VS Code Output Channel → 상세 로그 기록
 *
 * @param results - 이번 세션에서 수행된 모든 EvolveResult 배열
 * @returns CeoBriefing — CEO가 보고할 브리핑 객체
 * ============================================================================
 */
export function buildCeoBriefing(results: EvolveResult[]): CeoBriefing {
  const successCount = results.filter(r => r.success).length;
  const failCount = results.filter(r => !r.success).length;

  // [초보자 안내] CEO가 종합적으로 판단한 코멘트를 생성합니다.
  let summary: string;

  if (results.length === 0) {
    summary = '📋 CEO 보고: 이번 자율 진화 세션에서 수정된 파일이 없습니다.';
  } else if (failCount === 0) {
    summary = `✅ CEO 검수 완료: 코다리의 수정 ${successCount}건 전부 격리 검증을 통과했습니다. 원본에 안전하게 반영되었습니다.`;
  } else if (successCount === 0) {
    summary = `❌ CEO 검수 결과: 코다리의 수정 ${failCount}건 모두 문법 에러로 실패했습니다. 원본 파일은 건드리지 않았습니다.`;
  } else {
    summary = `⚠️ CEO 검수 결과: 전체 ${results.length}건 중 ${successCount}건 성공, ${failCount}건 실패. 실패한 수정은 롤백되었습니다.`;
  }

  return {
    timestamp: new Date().toISOString(),
    results,
    summary,
    successCount,
    failCount,
  };
}

/**
 * ============================================================================
 * [초보자 안내] CEO 브리핑 메시지 포맷터
 *
 * CeoBriefing 객체를 사람이 읽기 쉬운 한글 문자열로 변환합니다.
 * Output Channel과 대시보드 토스트에 표시할 내용을 생성합니다.
 *
 * @param briefing - buildCeoBriefing()이 반환한 브리핑 객체
 * @returns 포맷된 한글 보고 문자열
 * ============================================================================
 */
export function formatBriefingForDisplay(briefing: CeoBriefing): string {
  const lines: string[] = [];
  lines.push('═══════════════════════════════════════════');
  lines.push('🧭 CEO 자율 진화 검수 보고서');
  lines.push(`📅 시각: ${briefing.timestamp}`);
  lines.push('───────────────────────────────────────────');
  lines.push(briefing.summary);
  lines.push('');

  for (const r of briefing.results) {
    const icon = r.success ? '✅' : '❌';
    const fileName = path.basename(r.filePath);
    lines.push(`${icon} [${fileName}] ${r.purpose}`);
    lines.push(`   → ${r.message}`);

    if (r.originalLineCount != null && r.modifiedLineCount != null) {
      lines.push(`   📊 변경 전: ${r.originalLineCount}줄 → 변경 후: ${r.modifiedLineCount}줄`);
    }

    if (r.compileErrors) {
      lines.push(`   🐛 컴파일 에러 요약:`);
      // [초보자 안내] 에러 메시지가 너무 길면 앞부분만 잘라서 표시합니다.
      const errorPreview = r.compileErrors.slice(0, 500);
      for (const errorLine of errorPreview.split('\n').slice(0, 10)) {
        lines.push(`      ${errorLine}`);
      }
      if (r.compileErrors.length > 500) {
        lines.push(`      ... (${r.compileErrors.length - 500}자 더 있음)`);
      }
    }
    lines.push('');
  }

  lines.push('═══════════════════════════════════════════');
  return lines.join('\n');
}

/**
 * ============================================================================
 * [초보자 안내] 자율 진화 파이프라인 상태 확인 함수
 *
 * 현재 자율 진화가 가동 중인지 확인합니다.
 * extension.ts에서 중복 가동을 방지하기 위해 사용합니다.
 *
 * @returns 현재 자율 진화가 실행 중이면 true
 * ============================================================================
 */
export function isEvolving(): boolean {
  return _evolveRunning;
}
