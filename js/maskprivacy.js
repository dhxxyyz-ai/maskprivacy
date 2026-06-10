/* ============================
   MaskPrivacy — maskprivacy.js
   개인정보 자동 마스킹 도구
============================ */

// ============================
// 1. 요소 참조
// ============================
const uploadZone    = document.getElementById('uploadZone');
const fileInput     = document.getElementById('fileInput');
const uploadContent = document.getElementById('uploadContent');
const progressWrap  = document.getElementById('progressWrap');
const progressFill  = document.getElementById('progressFill');
const progressLabel = document.getElementById('progressLabel');
const previewWrap   = document.getElementById('previewWrap');
const originalCanvas = document.getElementById('originalCanvas');
const maskedCanvas  = document.getElementById('maskedCanvas');
const detectedWrap  = document.getElementById('detectedWrap');
const detectedList  = document.getElementById('detectedList');
const actionWrap    = document.getElementById('actionWrap');
const downloadBtn   = document.getElementById('downloadBtn');
const resetBtn      = document.getElementById('resetBtn');

// ============================
// 2. 상태 관리
// ============================
let originalImage = null;   // 업로드된 원본 Image 객체
let maskRegions   = [];     // 마스킹 영역 목록 [{ x, y, w, h, type, active }]
let isDrawing     = false;  // 수동 마스킹 드래그 중 여부
let dragStart     = { x: 0, y: 0 };  // 드래그 시작 좌표

// ============================
// 3. 정규식 패턴
// ============================
const PATTERNS = [
  {
    type: '주민등록번호',
    regex: /\d{6}-[1-4]\d{6}/g,
  },
  {
    type: '전화번호',
    regex: /01[0-9]-\d{3,4}-\d{4}/g,
  },
  {
    type: '이메일',
    regex: /[\w.-]+@[\w.-]+\.\w{2,}/g,
  },
  {
    type: '계좌번호',
    // 은행별 패턴: 10~14자리 숫자 (하이픈 포함)
    regex: /\d{3,6}-\d{2,6}-\d{4,6}(-\d{2})?/g,
  },
];

// ============================
// 4. 업로드 존 이벤트
// ============================

// 클릭 → 파일 선택
uploadZone.addEventListener('click', () => fileInput.click());

// 파일 선택
fileInput.addEventListener('change', (e) => {
  if (e.target.files[0]) handleFile(e.target.files[0]);
});

// 드래그앤드롭
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

// ============================
// 5. 파일 처리 메인 흐름
// ============================
async function handleFile(file) {
  // 업로드 존 숨기고 진행 바 표시
  uploadZone.style.display = 'none';
  showProgress(0, '이미지 불러오는 중...');

  try {
    // 원본 이미지 로드
    originalImage = await loadImage(file);

    // 원본 Canvas 렌더링
    drawOriginal();
    showProgress(10, '개인정보 탐지 중...');

    // Tesseract OCR 실행
    const words = await runOCR(originalImage, (p) => {
      showProgress(10 + Math.floor(p * 80), `개인정보 탐지 중... ${Math.floor(p * 100)}%`);
    });

    showProgress(90, '마스킹 적용 중...');

    // 정규식으로 개인정보 탐지
    detectPrivateInfo(words);

    // 마스킹 Canvas 렌더링
    drawMasked();
    renderDetectedList();

    showProgress(100, '완료!');

    // UI 전환
    setTimeout(() => {
      progressWrap.style.display = 'none';
      previewWrap.style.display  = 'grid';
      detectedWrap.style.display = maskRegions.length > 0 ? 'block' : 'none';
      actionWrap.style.display   = 'flex';
    }, 500);

  } catch (err) {
    console.error('처리 중 오류 발생:', err);
    progressLabel.textContent = '오류가 발생했습니다. 다시 시도해주세요.';
  }
}

// ============================
// 6. 이미지 로드
// ============================
function loadImage(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
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

  // 원본 이미지 그리기
  ctx.drawImage(originalImage, 0, 0);

  // 활성화된 마스킹 영역 적용
  maskRegions.forEach((region, index) => {
    if (!region.active) return;

    // fade-in 효과를 위한 requestAnimationFrame
    animateMask(ctx, region, index);
  });
}

function animateMask(ctx, region, index) {
  let opacity = 0;
  const duration = 300; // ms
  const start = performance.now();

  function step(now) {
    opacity = Math.min((now - start) / duration, 1);
    ctx.save();
    ctx.globalAlpha = opacity;
    ctx.fillStyle = '#000000';
    ctx.fillRect(region.x, region.y, region.w, region.h);
    ctx.restore();
    if (opacity < 1) requestAnimationFrame(step);
  }

  // 순차적 딜레이 (탐지 항목이 여러 개일 때 순서대로 나타남)
  setTimeout(() => requestAnimationFrame(step), index * 80);
}

// ============================
// 8. Tesseract OCR 실행
// ============================
async function runOCR(img, onProgress) {
  const worker = await Tesseract.createWorker('kor+eng', {
    logger: (m) => {
      if (m.status === 'recognizing text') {
        onProgress(m.progress);
      }
    },
  });

  const { data } = await worker.recognize(img);
  await worker.terminate();

  return data.words;
}

// ============================
// 9. 개인정보 탐지 (줄 단위 보완)
// ============================
function detectPrivateInfo(words) {
  maskRegions = [];

  // words를 line_num 기준으로 줄 단위로 묶기
  const lines = {};
  words.forEach((word) => {
    const lineNum = word.line_num ?? word.bbox.y0; // line_num 없으면 y좌표로 그루핑
    if (!lines[lineNum]) lines[lineNum] = [];
    lines[lineNum].push(word);
  });

  // 줄 단위로 텍스트 합치고 정규식 매칭
  Object.values(lines).forEach((lineWords) => {
    const lineText = lineWords.map(w => w.text).join(' ');

    PATTERNS.forEach((pattern) => {
      pattern.regex.lastIndex = 0;
      let match;

      while ((match = pattern.regex.exec(lineText)) !== null) {
        // 매칭된 텍스트가 포함된 단어들의 bbox를 합산
        const matchedText = match[0];
        const matchedWords = lineWords.filter(w =>
          matchedText.includes(w.text.trim()) && w.text.trim().length > 0
        );

        if (matchedWords.length === 0) return;

        // 매칭된 단어들의 전체 bbox 계산
        const x0 = Math.min(...matchedWords.map(w => w.bbox.x0));
        const y0 = Math.min(...matchedWords.map(w => w.bbox.y0));
        const x1 = Math.max(...matchedWords.map(w => w.bbox.x1));
        const y1 = Math.max(...matchedWords.map(w => w.bbox.y1));

        // 패딩 추가 (마스킹 영역을 살짝 넓게)
        const padding = 4;
        maskRegions.push({
          x:      x0 - padding,
          y:      y0 - padding,
          w:      (x1 - x0) + padding * 2,
          h:      (y1 - y0) + padding * 2,
          type:   pattern.type,
          value:  matchedText,
          active: true,
        });
      }
    });
  });
}

// ============================
// 10. 탐지 항목 목록 렌더링
// ============================
function renderDetectedList() {
  detectedList.innerHTML = '';

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

  // 토글 이벤트
  detectedList.querySelectorAll('input[type="checkbox"]').forEach((checkbox) => {
    checkbox.addEventListener('change', (e) => {
      const idx = parseInt(e.target.dataset.index);
      maskRegions[idx].active = e.target.checked;
      redrawMasked();
    });
  });
}

// 개인정보 값 부분 마스킹 표시 (목록용)
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
  const pos = getCanvasPos(maskedCanvas, e);
  dragStart = pos;
});

maskedCanvas.addEventListener('mousemove', (e) => {
  if (!isDrawing) return;
  const pos = getCanvasPos(maskedCanvas, e);

  // 드래그 중 실시간 미리보기
  redrawMasked();
  const ctx = maskedCanvas.getContext('2d');
  ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
  ctx.fillRect(
    dragStart.x,
    dragStart.y,
    pos.x - dragStart.x,
    pos.y - dragStart.y
  );
});

maskedCanvas.addEventListener('mouseup', (e) => {
  if (!isDrawing) return;
  isDrawing = false;
  const pos = getCanvasPos(maskedCanvas, e);

  const w = pos.x - dragStart.x;
  const h = pos.y - dragStart.y;

  // 너무 작은 영역 무시
  if (Math.abs(w) < 5 || Math.abs(h) < 5) return;

  // 수동 마스킹 영역 추가
  maskRegions.push({
    x:      Math.min(dragStart.x, pos.x),
    y:      Math.min(dragStart.y, pos.y),
    w:      Math.abs(w),
    h:      Math.abs(h),
    type:   '수동 마스킹',
    value:  '직접 지정',
    active: true,
  });

  redrawMasked();
  renderDetectedList();
  detectedWrap.style.display = 'block';
});

// Canvas 내 실제 좌표 계산 (CSS 크기 vs 실제 크기 보정)
function getCanvasPos(canvas, e) {
  const rect  = canvas.getBoundingClientRect();
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
  const link = document.createElement('a');
  link.download = 'maskprivacy_result.png';
  link.href = maskedCanvas.toDataURL('image/png');
  link.click();

  // pulse 효과
  downloadBtn.style.animation = 'none';
  requestAnimationFrame(() => {
    downloadBtn.style.animation = 'pulse 0.3s ease';
  });
});

// ============================
// 14. 초기화 (처음부터)
// ============================
resetBtn.addEventListener('click', () => {
  originalImage = null;
  maskRegions   = [];
  isDrawing     = false;

  // Canvas 초기화
  [originalCanvas, maskedCanvas].forEach((c) => {
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, c.width, c.height);
  });

  // UI 초기화
  fileInput.value       = '';
  detectedList.innerHTML = '';
  uploadZone.style.display  = 'block';
  progressWrap.style.display = 'none';
  previewWrap.style.display  = 'none';
  detectedWrap.style.display = 'none';
  actionWrap.style.display   = 'none';
});

// ============================
// 15. 진행 바 업데이트
// ============================
function showProgress(percent, label) {
  progressWrap.style.display = 'block';
  progressFill.style.width   = `${percent}%`;
  progressLabel.textContent  = label;
}