import * as fs from 'fs';
import * as path from 'path';
import { spawn } from 'child_process';

/**
 * [초보자 안내] 나레이션 음성 세그먼트 정보를 담는 인터페이스입니다.
 * 각 자막 문장이 시작하는 시간(start)과 끝나는 시간(end), 그리고 대사 내용(text)을 포함합니다.
 */
export interface NarrationSegment {
  start: number; // 시작 시간 (초 단위, 예: 1.5)
  end: number;   // 종료 시간 (초 단위, 예: 4.2)
  text: string;  // 대사 텍스트
}

/**
 * [초보자 안내] 오디오 매칭 결과 모델입니다.
 * 분석 결과에 따라 선택된 BGM 파일 경로와 최적의 TTS 성우 목소리 톤을 반환합니다.
 */
export interface AudioMatchResult {
  bgmPath: string;       // 매칭된 BGM 파일의 로컬 상대/절대 경로
  voicePersona: string;  // 매칭된 TTS 성우 보이스 ID
  mood: string;          // 분석된 분위기 카테고리
}

/**
 * [초보자 안내] 오디오 덕킹(Audio Ducking) 볼륨 설정 결과입니다.
 * FFmpeg에서 사용할 복합 오디오 필터 그래프 문자열을 포함합니다.
 */
export interface DuckingFilterResult {
  filterString: string; // FFmpeg 오디오 필터 명령어로 직접 주입할 스트링
  attenuationDb: number; // 감쇄 정도 (-15dB)
}

/**
 * ============================================================================
 * 1. analyzeAndMatchAudio
 * 레오(YouTube 에이전트)가 기획한 텍스트 대본의 분위기를 분석하여
 * 어울리는 배경음악(BGM)과 TTS 성우 페르소나를 스마트하게 매핑해 줍니다.
 * ============================================================================
 */
export async function analyzeAndMatchAudio(
  scriptJsonText: string
): Promise<AudioMatchResult> {
  // [초보자 안내] 대본 텍스트를 읽고 분위기(Lo-fi, 비즈니스, 테크 등)를 감지합니다.
  const lowerText = scriptJsonText.toLowerCase();
  
  let mood = 'lofi'; // 기본값은 편안한 로파이 감성
  let bgmPath = 'assets/media/bgm/lofi_relax.mp3';
  let voicePersona = 'warm_friendly'; // 기본값: 따뜻하고 감성적인 목소리

  if (
    lowerText.includes('business') || 
    lowerText.includes('비즈니스') || 
    lowerText.includes('성공') || 
    lowerText.includes('수익') || 
    lowerText.includes('마케팅')
  ) {
    mood = 'business';
    bgmPath = 'assets/media/bgm/business_elevate.mp3';
    voicePersona = 'standard_calm'; // 신뢰감 있고 명확한 성우 톤
  } else if (
    lowerText.includes('tech') || 
    lowerText.includes('테크') || 
    lowerText.includes('인공지능') || 
    lowerText.includes('ai') || 
    lowerText.includes('코드') || 
    lowerText.includes('개발')
  ) {
    mood = 'tech';
    bgmPath = 'assets/media/bgm/tech_future.mp3';
    voicePersona = 'confident_bold'; // 자신감 넘치고 지적인 미래형 톤
  } else if (
    lowerText.includes('chill') || 
    lowerText.includes('휴식') || 
    lowerText.includes('감성') || 
    lowerText.includes('lofi') || 
    lowerText.includes('일상')
  ) {
    mood = 'lofi';
    bgmPath = 'assets/media/bgm/lofi_relax.mp3';
    voicePersona = 'warm_friendly'; // 포근하고 나긋나긋한 일상 톤
  }

  // [초보자 안내] 매핑이 완료된 최종 오디오 설정 데이터를 반환합니다.
  return {
    bgmPath,
    voicePersona,
    mood
  };
}

/**
 * ============================================================================
 * 2. applyAudioDucking
 * 목소리가 나오는 구간에는 배경음악 볼륨을 자동으로 -15dB 낮추고,
 * 목소리가 안 나오는 무음 구간에는 원래 볼륨(1.0)으로 복귀시켜
 * TTS 전달력을 비약적으로 끌어올리는 지능형 덕킹 필터를 연산합니다.
 * ============================================================================
 */
export function applyAudioDucking(
  segments: NarrationSegment[],
  bgmVolumeDefault: number = 0.35 // 기본 배경음악 기본 볼륨 (너무 크지 않게 조절)
): DuckingFilterResult {
  // [초보자 안내] -15dB 감쇄를 선형 배율로 환산한 수치입니다.
  // 공식: 10^(dB / 20) -> 10^(-15 / 20) ≒ 0.1778
  // 따라서 원래 볼륨에 0.1778을 곱하면 정확히 15데시벨만큼 작아집니다.
  const duckVolumeFactor = 0.1778; 
  const activeVolume = bgmVolumeDefault;
  const duckedVolume = bgmVolumeDefault * duckVolumeFactor;

  // Validate and filter narration segments (non-negative, chronological start < end)
  const validSegments = segments.filter(
    seg => typeof seg.start === 'number' &&
           typeof seg.end === 'number' &&
           seg.start >= 0 &&
           seg.end > seg.start
  );

  if (validSegments.length === 0) {
    // 나레이션이 없는 경우, 감쇄 없이 기본 볼륨으로 전체 구간을 재생합니다.
    return {
      filterString: `volume=${activeVolume}`,
      attenuationDb: 0
    };
  }

  // [초보자 안내] FFmpeg의 volume filter 내 timeline expression('between')을 활용합니다.
  // 예: volume='if(between(t,1.2,4.5)+between(t,6.0,8.3), 0.06, 0.35)':eval=frame
  // t(현재 재생 시간초)가 나레이션 구간 내에 있으면 작아진 볼륨을, 아니면 기본 볼륨을 적용하게 합니다.
  const betweenConditions = validSegments
    .map(seg => `between(t,${seg.start.toFixed(2)},${seg.end.toFixed(2)})`)
    .join('+');

  const filterString = `volume='if(${betweenConditions}, ${duckedVolume.toFixed(4)}, ${activeVolume.toFixed(4)})':eval=frame`;

  return {
    filterString,
    attenuationDb: -15
  };
}

/**
 * ============================================================================
 * 3. executeFinalAVMerge
 * 가공된 나레이션/BGM 오디오와 영상 소스를 하나로 결합합니다.
 * 안티그래비티 메인 스레드 프리징을 방지하기 위해 child_process.spawn을 이용해
 * 백그라운드 프로세스로 FFmpeg 인코딩을 호출하며, 완료 후 임시 파일을 청소합니다.
 * ============================================================================
 */
export function executeFinalAVMerge(options: {
  videoPath: string;            // 원본 무음 비디오 경로
  narrationPath: string;        // 생성된 나레이션 음성(.wav/.mp3) 경로
  bgmPath: string;              // 매칭된 로컬 배경음악 경로
  outputPath: string;           // 최종 출력 비디오 저장 경로 (.mp4)
  duckingFilter: string;        // applyAudioDucking에서 생성된 FFmpeg 오디오 필터식
  tempAudioPaths: string[];     // 인코딩 완료 후 자동 삭제할 임시 오디오 파일 경로 목록
  onProgress?: (progress: string) => void; // 인코딩 진행 상황을 보고받는 콜백 함수
}): Promise<string> {
  return new Promise((resolve, reject) => {
    // [초보자 안내] FFmpeg 명령어가 잘 작동할 수 있도록 파일들이 실제 존재하는지 사전 체크합니다.
    if (!fs.existsSync(options.videoPath)) {
      return reject(new Error(`원본 비디오 파일이 존재하지 않습니다: ${options.videoPath}`));
    }
    if (!fs.existsSync(options.narrationPath)) {
      return reject(new Error(`나레이션 음성 파일이 존재하지 않습니다: ${options.narrationPath}`));
    }

    // BGM 파일이 없을 시 예외처리 또는 무음 대처 (안정성 확보)
    const hasBgm = options.bgmPath && fs.existsSync(options.bgmPath);

    // [초보자 안내] FFmpeg 프로세스에 전달할 매개변수 배열을 구성합니다.
    // 0번 입력: 비디오, 1번 입력: 나레이션, 2번 입력: 배경음악(있을 경우)
    const args: string[] = ['-y']; // 기존 출력파일이 있다면 묻지 않고 덮어쓰기

    args.push('-i', options.videoPath);
    args.push('-i', options.narrationPath);
    if (hasBgm) {
      args.push('-i', options.bgmPath);
    }

    // [초보자 안내] 오디오 필터 그래프를 설계합니다.
    // 1번 입력(나레이션)의 오디오는 [1:a]로 칭하고, 2번 입력(BGM)의 오디오는 [2:a]로 지정합니다.
    // BGM이 있다면 덕킹 필터를 통과시킨 후 나레이션과 amix 필터로 혼합(mix)합니다.
    let filterGraph = '';
    if (hasBgm) {
      filterGraph = `[2:a]${options.duckingFilter}[bgm_ducked];[1:a][bgm_ducked]amix=inputs=2:duration=first[a]`;
    } else {
      // BGM이 없는 경우 그냥 나레이션 오디오만 통과시킵니다.
      filterGraph = `[1:a]anull[a]`;
    }

    args.push('-filter_complex', filterGraph);
    args.push('-map', '0:v'); // 0번 입력 비디오 소스를 가져옴
    args.push('-map', '[a]'); // 최종 믹싱된 오디오 스트림 '[a]'를 매핑함

    // [초보자 안내] 하드웨어 프리징을 피하고 호환성을 확보하기 위해 표준 비디오/오디오 코덱을 설정합니다.
    args.push('-c:v', 'libx264'); // 가장 호환성이 뛰어난 H.264 인코더
    args.push('-pix_fmt', 'yuv420p'); // 대부분의 플레이어에서 재생되도록 하는 픽셀 포맷
    args.push('-c:a', 'aac'); // 오디오는 고성능 AAC 포맷
    args.push('-shortest'); // 비디오 길이에 맞춰 오디오를 자름 (무한 루프 방지)
    args.push(options.outputPath);

    console.log(`[루나 엔진] 백그라운드 FFmpeg 합성 시작: ffmpeg ${args.join(' ')}`);

    // [초보자 안내] child_process.spawn을 통해 비동기 하위 프로세스로 FFmpeg을 띄웁니다.
    // 이로 인해 안티그래비티 IDE의 메인 윈도우 스레드가 멈추거나 렉이 걸리지 않습니다.
    const ffmpegProcess = spawn('ffmpeg', args);

    let stderrData = '';

    ffmpegProcess.stderr.on('data', (data) => {
      const text = data.toString();
      stderrData += text;
      // FFmpeg은 표준 에러 스트림(stderr)으로 작업 상태(프레임 수, 시간 등)를 주기적으로 뿜어냅니다.
      if (options.onProgress) {
        options.onProgress(text);
      }
    });

    ffmpegProcess.on('close', async (code) => {
      // [초보자 안내] 인코딩 프로세스가 종료되었을 때 호출되는 구간입니다.
      if (code === 0) {
        console.log(`[루나 엔진] 비디오 사운드 합성 성공: ${options.outputPath}`);

        // ============================================================================
        // 4. 가비지 컬렉션 (Garbage Collection)
        // 디스크 용량이 고갈되는 문제를 예방하기 위해, 합성용 임시 오디오 에셋들을 정밀 삭제합니다.
        // ============================================================================
        for (const tempPath of options.tempAudioPaths) {
          try {
            await fs.promises.unlink(tempPath);
            console.log(`[루나 엔진 GC] 임시 오디오 자원 자동 삭제 완료: ${tempPath}`);
          } catch (gcErr: any) {
            if (gcErr.code !== 'ENOENT') {
              console.error(`[루나 엔진 GC 경고] 임시 파일(${tempPath}) 삭제 중 예외 발생:`, gcErr);
            }
          }
        }

        resolve(options.outputPath);
      } else {
        console.error(`[루나 엔진 에러] FFmpeg 합성 실패 (종료 코드: ${code})`);
        console.error(`[FFmpeg stderr 로그]:\n${stderrData}`);
        reject(new Error(`FFmpeg 인코더 프로세스가 코드 ${code}로 비정상 종료되었습니다.`));
      }
    });

    ffmpegProcess.on('error', (err) => {
      // 시스템 내에 FFmpeg 실행 파일이 아예 안 깔려있거나 경로 설정 에러가 날 때 잡히는 핸들러입니다.
      console.error('[루나 엔진 치명적 에러] FFmpeg 프로세스를 실행할 수 없습니다.', err);
      reject(new Error(`FFmpeg 실행 실패. 시스템 환경 변수 PATH에 ffmpeg가 등록되어 있는지 확인해 주세요. 원인: ${err.message}`));
    });
  });
}
