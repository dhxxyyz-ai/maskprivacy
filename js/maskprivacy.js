/* ============================
   MaskPrivacy — maskprivacy.js
   개인정보 자동 마스킹 도구
============================ */

// ============================
// 1. 요소 참조
// ============================
const uploadZone     = document.getElementById('uploadZone');
const fileInput      = document.getElementById('fileInput');
const uploadContent  = document.getElementById('uploadContent');
const progressWrap   = document.getElementById('progressWrap');
const progressFill   = document.getElementById('progressFill');
const progressLabel  = document.getElementById('progressLabel');
const previewWrap    = document.getElementById('previewWrap');
const originalCanvas = document.getElementById('originalCanvas');
const maskedCanvas   = document.getElementById('maskedCanvas');
const detectedWrap   = document.getElementById('detectedWrap');
const detectedList   = document.getElementById('detectedList');
const actionWrap     = document.getElementById('actionWrap');
const downloadBtn    = document.getElementById('downloadBtn');
const resetBtn       = document.getElementById('resetBtn');
const rrnOptionWrap  = document.getElementById('rrnOptionWrap');
const addrOptionWrap = document.getElementById('addrOptionWrap');

// ============================
// 2. 상태 관리
// ============================
let originalImage = null;
let maskRegions   = [];
let isDrawing     = false;
let dragStart     = { x: 0, y: 0 };
let rrnMode       = 'full';
let addrMode      = 'full';

// ============================
// 3. 정규식 패턴
// ============================
const PATTERNS = [
  { type: '주민등록번호', regex: /\d{6}-[1-4]\d{6}/g },
  { type: '전화번호',     regex: /01[0-9]-\d{3,4}-\d{4}/g },
  { type: '이메일',       regex: /[\w.-]+@[\w.-]+\.\w{2,}/g },
  { type: '계좌번호',     regex: /\d{3,6}-\d{2,6}-\d{4,6}(-\d{2})?/g },
];

// ============================
// 3-1. 주소 탐지용 상수
// ============================
const SIDO_KEYWORDS = [
  '서울특별시', '서울시', '서울',
  '부산광역시', '부산시', '부산',
  '대구광역시', '대구시', '대구',
  '인천광역시', '인천시', '인천',
  '광주광역시', '광주시', '광주',
  '대전광역시', '대전시', '대전',
  '울산광역시', '울산시', '울산',
  '세종특별자치시', '세종시', '세종',
  '경기도', '경기',
  '강원특별자치도', '강원도', '강원',
  '충청북도', '충북',
  '충청남도', '충남',
  '전북특별자치도', '전라북도', '전북',
  '전라남도', '전남',
  '경상북도', '경북',
  '경상남도', '경남',
  '제주특별자치도', '제주도', '제주',
];

const SIGUNGU_SUFFIXES = ['시', '구', '군'];
const ADDR_SUFFIXES    = ['읍', '면', '동', '로', '길', '가'];
const ADDR_MAX_LINES   = 3;

// 오탐 방지 키워드 — 이 단어가 줄에 포함되면 주소로 판단하지 않음
const ADDR_EXCLUDE_KEYWORDS = [
  '구청', '시청', '경찰청', '경찰서', '주민센터', '동사무소',
  '소방서', '법원', '검찰청', '교육청', '보건소',
];

// ============================
// 4. 업로드 존 이벤트
// ============================
uploadZone.addEventListener('click', () => fileInput.click());

fileInput.addEventListener('change', (e) => {
  if (e.target.files[0]) handleFile(e.target.files[0]);
});

uploadZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  uploadZone.classList.add('drag-over');
});

uploadZone.addEventListener('dragleave', () => {
  uploadZone.classList.remove('drag-over');
});

uploadZone.addEventListener('drop', (e) => {
  e.preventDefault();
  uploadZone.classList.remove('drag-over');
  const file = e.dataTransfer.files[0];
  if (file && file.type.startsWith('image/')) handleFile(file);
});

document.querySelectorAll('.rrn-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.rrn-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    rrnMode = btn.dataset.mode;
    applyRrnMode();
    redrawMasked();
  });
});

document.querySelectorAll('.addr-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.addr-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    addrMode = btn.dataset.mode;
    applyAddrMode();
    redrawMasked();
  });
});

// ============================
// 5. 파일 처리 메인 흐름
// ============================
async function handleFile(file) {
  uploadZone.style.display = 'none';
  showProgress(0, '이미지 불러오는 중...');

  try {
    originalImage = await loadImage(file);
    drawOriginal();
    showProgress(10, '개인정보 탐지 중...');

    const words = await runOCR(file, (p) => {
      showProgress(10 + Math.floor(p * 80), `개인정보 탐지 중... ${Math.floor(p * 100)}%`);
    });

    showProgress(90, '마스킹 적용 중...');
    detectPrivateInfo(words);
    drawMasked();
    renderDetectedList();
    showProgress(100, '완료!');

    setTimeout(() => {
      progressWrap.style.display = 'none';
      previewWrap.style.display  = 'grid';
      detectedWrap.style.display = maskRegions.length > 0 ? 'block' : 'none';
      actionWrap.style.display   = 'flex';
    }, 500);

  } catch (err) {
    console.error('처리 중 오류 발생:', err);
    progressLabel.textContent  = '오류가 발생했습니다. 다시 시도해주세요.';
    uploadZone.style.display   = 'block';
    progressWrap.style.display = 'none';
  }
}

// ============================
// 6. 이미지 로드
// ============================
function loadImage(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = reject;
    img.src = url;
  });
}

// ============================
// 7. Canvas 렌더링
// ============================
function drawOriginal() {
  const ctx = originalCanvas.getContext('2d');
  originalCanvas.width  = originalImage.width;
  originalCanvas.height = originalImage.height;
  ctx.drawImage(originalImage, 0, 0);
}

function drawMasked() {
  const ctx = maskedCanvas.getContext('2d');
  maskedCanvas.width  = originalImage.width;
  maskedCanvas.height = originalImage.height;
  ctx.drawImage(originalImage, 0, 0);
  maskRegions.forEach((region, index) => {
    if (!region.active) return;
    animateMask(ctx, region, index);
  });
}

function animateMask(ctx, region, index) {
  const duration = 300;
  const start    = performance.now();
  function step(now) {
    const opacity = Math.min((now - start) / duration, 1);
    ctx.save();
    ctx.globalAlpha = opacity;
    ctx.fillStyle   = '#000000';
    ctx.fillRect(region.x, region.y, region.w, region.h);
    ctx.restore();
    if (opacity < 1) requestAnimationFrame(step);
  }
  setTimeout(() => requestAnimationFrame(step), index * 80);
}

// ============================
// 8. Tesseract OCR
// ============================
async function runOCR(file, onProgress) {
  let fakeProgress = 0;
  const interval = setInterval(() => {
    fakeProgress = Math.min(fakeProgress + 4, 92);
    onProgress(fakeProgress / 100);
  }, 400);
  try {
    const { data } = await Tesseract.recognize(file, 'kor+eng');
    clearInterval(interval);
    onProgress(1);
    return data.words;
  } catch (err) {
    clearInterval(interval);
    throw err;
  }
}

// ============================
// 9. 개인정보 탐지
// ============================
function detectPrivateInfo(words) {
  maskRegions = [];

  const lines = {};
  words.forEach((word) => {
    const lineNum = word.line_num ?? word.bbox.y0;
    if (!lines[lineNum]) lines[lineNum] = [];
    lines[lineNum].push(word);
  });

  const lineList = Object.values(lines);

  lineList.forEach((lineWords) => {
    const lineText = lineWords.map(w => w.text).join(' ');
    PATTERNS.forEach((pattern) => {
      pattern.regex.lastIndex = 0;
      let match;
      while ((match = pattern.regex.exec(lineText)) !== null) {
        const matchedText  = match[0];
        const matchedWords = lineWords.filter(w =>
          matchedText.includes(w.text.trim()) && w.text.trim().length > 0
        );
        if (matchedWords.length === 0) return;

        const x0 = Math.min(...matchedWords.map(w => w.bbox.x0));
        const y0 = Math.min(...matchedWords.map(w => w.bbox.y0));
        const x1 = Math.max(...matchedWords.map(w => w.bbox.x1));
        const y1 = Math.max(...matchedWords.map(w => w.bbox.y1));
        const padding = 4;
        maskRegions.push({
          x: x0 - padding, y: y0 - padding,
          w: (x1 - x0) + padding * 2, h: (y1 - y0) + padding * 2,
          type: pattern.type, value: matchedText, active: true,
          maskMode: pattern.type === '주민등록번호' ? rrnMode : 'full',
          origX0: x0, origY0: y0, origX1: x1, origY1: y1,
        });
      }
    });
  });

  detectAddress(lineList);

  console.table(lineList.map((lw, i) => ({ 줄: i, 텍스트: lw.map(w => w.text).join(' ') })));

}

// ============================
// 9-1. 주소 탐지 (최대 3줄 병합 + 오탐 방지)
// ============================
function detectAddress(lineList) {
  const usedLineIdx = new Set();

  lineList.forEach((lineWords, lineIdx) => {
    if (usedLineIdx.has(lineIdx)) return;
    if (lineWords.length === 0) return;

    const lineText = lineWords.map(w => w.text).join(' ');

    // 오탐 방지: 제외 키워드 포함 줄 스킵
    const hasExclude = ADDR_EXCLUDE_KEYWORDS.some(k => lineText.includes(k));
    if (hasExclude) return;

    // 시/도 키워드 단어 단위 탐지
    let sidoWordIdx = -1;
    for (let i = 0; i < lineWords.length; i++) {
      const wordText = lineWords[i].text.trim();
      const found    = SIDO_KEYWORDS.find(k =>
        wordText.includes(k) ||
        k.includes(wordText) ||
        wordText.replace(/\s/g, '').includes(k.replace(/\s/g, ''))
      );
      if (found && wordText.length >= 2) {
        sidoWordIdx = i;
        break;
      }
    }

    if (sidoWordIdx === -1) return;
    if (lineWords.length < 2) return;

    // 최대 3줄 연속 병합
    const mergedLines = [lineWords];
    usedLineIdx.add(lineIdx);

    const firstLineH       = Math.max(...lineWords.map(w => w.bbox.y1))
                           - Math.min(...lineWords.map(w => w.bbox.y0));
    const lineGapThreshold = firstLineH * 2.5;

    for (let next = lineIdx + 1; next < lineList.length; next++) {
      if (mergedLines.length >= ADDR_MAX_LINES) break;
      const nextWords = lineList[next];
      if (!nextWords || nextWords.length === 0) break;

      const nextText = nextWords.map(w => w.text.trim()).join('').trim();
      if (!nextText) break;

      // 제외 키워드 포함 줄은 병합하지 않음
      const nextHasExclude = ADDR_EXCLUDE_KEYWORDS.some(k => nextText.includes(k));
      if (nextHasExclude) break;

      // 새로운 시/도 키워드 발견 시 중단
      const hasNewSido = nextWords.some(w =>
        SIDO_KEYWORDS.some(k => w.text.includes(k) || k.includes(w.text)) && w.text.length >= 2
      );
      if (hasNewSido) break;

      // y좌표 간격 초과 시 중단
      const prevLastY  = Math.max(...mergedLines[mergedLines.length - 1].map(w => w.bbox.y1));
      const nextFirstY = Math.min(...nextWords.map(w => w.bbox.y0));
      if (nextFirstY - prevLastY > lineGapThreshold) break;

      mergedLines.push(nextWords);
      usedLineIdx.add(next);
    }

    const allWords = mergedLines.flat();
    const x0 = Math.min(...allWords.map(w => w.bbox.x0));
    const y0 = Math.min(...allWords.map(w => w.bbox.y0));
    const x1 = Math.max(...allWords.map(w => w.bbox.x1));
    const y1 = Math.max(...allWords.map(w => w.bbox.y1));
    const padding = 4;

    // 시/구/군 단어 위치 (첫 줄 기준)
    const sigunguWordIdx = lineWords.findIndex((w, i) =>
      i > sidoWordIdx && SIGUNGU_SUFFIXES.some(s => w.text.trim().endsWith(s))
    );

    maskRegions.push({
      x: x0 - padding, y: y0 - padding,
      w: (x1 - x0) + padding * 2, h: (y1 - y0) + padding * 2,
      type:           '주소',
      value:          allWords.map(w => w.text).join(' ').trim(),
      active:         true,
      maskMode:       addrMode,
      // 모드 전환용 데이터
      addrFirstLine:  lineWords,          // 첫 줄 단어
      addrExtraLines: mergedLines.slice(1), // 2번째 줄 이후
      addrAllWords:   allWords,
      addrSidoIdx:    sidoWordIdx,
      addrSigunguIdx: sigunguWordIdx,
      origX0: x0, origY0: y0, origX1: x1, origY1: y1,
    });
  });
}

// ============================
// 9-2. 주민번호 모드 재적용
// ============================
function applyRrnMode() {
  maskRegions.forEach((region) => {
    if (region.type !== '주민등록번호') return;
    region.maskMode = rrnMode;
    const fullW = region.origX1 - region.origX0;
    const p     = 4;
    if (rrnMode === 'full') {
      region.x = region.origX0 - p;
      region.w = fullW + p * 2;
    } else if (rrnMode === 'back') {
      const bw = Math.floor(fullW * (8 / 14));
      region.x = region.origX1 - bw - p;
      region.w = bw + p * 2;
    } else if (rrnMode === 'back6') {
      const bw = Math.floor(fullW * (6 / 14));
      region.x = region.origX1 - bw - p;
      region.w = bw + p * 2;
    }
  });
}

// ============================
// 9-3. 주소 모드 재적용
// ============================
function applyAddrMode() {
  const p = 4;

  maskRegions.forEach((region) => {
    if (region.type !== '주소') return;
    region.maskMode = addrMode;

    const firstLine  = region.addrFirstLine;   // 첫 줄 단어
    const extraLines = region.addrExtraLines;  // 2번째 줄 이후 단어 배열
    const sidoIdx    = region.addrSidoIdx;
    const sigunguIdx = region.addrSigunguIdx;

    // 2번째 줄 이후 모든 단어 합치기
    const extraWords = extraLines.flat();

    if (addrMode === 'full') {
      // 전체 가리기 — 병합된 전체 bbox 그대로
      region.x = region.origX0 - p;
      region.y = region.origY0 - p;
      region.w = (region.origX1 - region.origX0) + p * 2;
      region.h = (region.origY1 - region.origY0) + p * 2;

    } else if (addrMode === 'sigungu') {
      // 시/도 이후 가리기
      // → 첫 줄: 시/도 단어 다음부터
      // → 2번째 줄 이후: 전체
      const firstLineMask = firstLine.slice(sidoIdx + 1);
      const maskWords     = [...firstLineMask, ...extraWords];
      if (maskWords.length === 0) return;

      const mx0 = Math.min(...maskWords.map(w => w.bbox.x0));
      const my0 = Math.min(...maskWords.map(w => w.bbox.y0));
      const mx1 = Math.max(...maskWords.map(w => w.bbox.x1));
      const my1 = Math.max(...maskWords.map(w => w.bbox.y1));
      region.x = mx0 - p;
      region.y = my0 - p;
      region.w = (mx1 - mx0) + p * 2;
      region.h = (my1 - my0) + p * 2;

    } else if (addrMode === 'dong') {
      // 시/구/군 이후 가리기
      // → 첫 줄: 시/구/군 단어 다음부터 (없으면 시/도 다음부터)
      // → 2번째 줄 이후: 전체
      const startIdx      = sigunguIdx >= 0 ? sigunguIdx + 1 : sidoIdx + 1;
      const firstLineMask = firstLine.slice(startIdx);
      const maskWords     = [...firstLineMask, ...extraWords];
      if (maskWords.length === 0) return;

      const mx0 = Math.min(...maskWords.map(w => w.bbox.x0));
      const my0 = Math.min(...maskWords.map(w => w.bbox.y0));
      const mx1 = Math.max(...maskWords.map(w => w.bbox.x1));
      const my1 = Math.max(...maskWords.map(w => w.bbox.y1));
      region.x = mx0 - p;
      region.y = my0 - p;
      region.w = (mx1 - mx0) + p * 2;
      region.h = (my1 - my0) + p * 2;
    }
  });
}

// ============================
// 10. 탐지 항목 목록 렌더링
// ============================
function renderDetectedList() {
  detectedList.innerHTML = '';

  const hasRRN  = maskRegions.some(r => r.type === '주민등록번호');
  const hasAddr = maskRegions.some(r => r.type === '주소');
  rrnOptionWrap.style.display  = hasRRN  ? 'block' : 'none';
  addrOptionWrap.style.display = hasAddr ? 'block' : 'none';

  if (maskRegions.length === 0) {
    detectedList.innerHTML = '<li style="color:var(--subtext);font-size:14px;">탐지된 개인정보가 없습니다.</li>';
    return;
  }

  maskRegions.forEach((region, index) => {
    const li = document.createElement('li');
    li.className = 'detected-item';
    li.innerHTML = `
      <div class="detected-item-left">
        <span class="detected-type">${region.type}</span>
        <span class="detected-value">${maskValue(region.value)}</span>
      </div>
      <label class="toggle">
        <input type="checkbox" checked data-index="${index}" />
        <span class="toggle-slider"></span>
      </label>
    `;
    detectedList.appendChild(li);
  });

  detectedList.querySelectorAll('input[type="checkbox"]').forEach((checkbox) => {
    checkbox.addEventListener('change', (e) => {
      const idx = parseInt(e.target.dataset.index);
      maskRegions[idx].active = e.target.checked;
      redrawMasked();
    });
  });
}

function maskValue(value) {
  if (value.length <= 4) return '****';
  return value.slice(0, 2) + '*'.repeat(value.length - 4) + value.slice(-2);
}

// ============================
// 11. 마스킹 재렌더링
// ============================
function redrawMasked() {
  const ctx = maskedCanvas.getContext('2d');
  ctx.clearRect(0, 0, maskedCanvas.width, maskedCanvas.height);
  ctx.drawImage(originalImage, 0, 0);
  maskRegions.forEach((region) => {
    if (!region.active) return;
    ctx.fillStyle = '#000000';
    ctx.fillRect(region.x, region.y, region.w, region.h);
  });
}

// ============================
// 12. 수동 마스킹 (드래그)
// ============================
maskedCanvas.addEventListener('mousedown', (e) => {
  isDrawing = true;
  dragStart = getCanvasPos(maskedCanvas, e);
});

maskedCanvas.addEventListener('mousemove', (e) => {
  if (!isDrawing) return;
  const pos = getCanvasPos(maskedCanvas, e);
  redrawMasked();
  const ctx = maskedCanvas.getContext('2d');
  ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
  ctx.fillRect(dragStart.x, dragStart.y, pos.x - dragStart.x, pos.y - dragStart.y);
});

maskedCanvas.addEventListener('mouseup', (e) => {
  if (!isDrawing) return;
  isDrawing = false;
  const pos = getCanvasPos(maskedCanvas, e);
  const w   = pos.x - dragStart.x;
  const h   = pos.y - dragStart.y;
  if (Math.abs(w) < 5 || Math.abs(h) < 5) return;

  maskRegions.push({
    x: Math.min(dragStart.x, pos.x), y: Math.min(dragStart.y, pos.y),
    w: Math.abs(w), h: Math.abs(h),
    type: '수동 마스킹', value: '직접 지정', active: true,
  });

  redrawMasked();
  renderDetectedList();
  detectedWrap.style.display = 'block';
});

function getCanvasPos(canvas, e) {
  const rect   = canvas.getBoundingClientRect();
  const scaleX = canvas.width  / rect.width;
  const scaleY = canvas.height / rect.height;
  return {
    x: (e.clientX - rect.left) * scaleX,
    y: (e.clientY - rect.top)  * scaleY,
  };
}

// ============================
// 13. 다운로드
// ============================
downloadBtn.addEventListener('click', () => {
  const link    = document.createElement('a');
  link.download = 'maskprivacy_result.png';
  link.href     = maskedCanvas.toDataURL('image/png');
  link.click();
  downloadBtn.style.animation = 'none';
  requestAnimationFrame(() => {
    downloadBtn.style.animation = 'pulse 0.3s ease';
  });
});

// ============================
// 14. 초기화
// ============================
resetBtn.addEventListener('click', () => {
  originalImage = null;
  maskRegions   = [];
  isDrawing     = false;
  rrnMode       = 'full';
  addrMode      = 'full';

  [originalCanvas, maskedCanvas].forEach((c) => {
    c.getContext('2d').clearRect(0, 0, c.width, c.height);
  });

  fileInput.value              = '';
  detectedList.innerHTML       = '';
  uploadZone.style.display     = 'block';
  progressWrap.style.display   = 'none';
  previewWrap.style.display    = 'none';
  detectedWrap.style.display   = 'none';
  rrnOptionWrap.style.display  = 'none';
  addrOptionWrap.style.display = 'none';
  actionWrap.style.display     = 'none';

  document.querySelectorAll('.rrn-btn').forEach(b => b.classList.remove('active'));
  document.querySelector('.rrn-btn[data-mode="full"]').classList.add('active');
  document.querySelectorAll('.addr-btn').forEach(b => b.classList.remove('active'));
  document.querySelector('.addr-btn[data-mode="full"]').classList.add('active');
});

// ============================
// 15. 진행 바
// ============================
function showProgress(percent, label) {
  progressWrap.style.display = 'block';
  progressFill.style.width   = `${percent}%`;
  progressLabel.textContent  = label;
}
