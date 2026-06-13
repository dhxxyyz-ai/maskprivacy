/**
 * banner.js — 쿠팡 파트너스 다이나믹 배너
 *
 * PartnersCoupang.G()는 "현재 실행 중인 <script> 태그 바로 앞"에 배너를 삽입합니다.
 * 외부 JS에서 호출하면 위치를 잡지 못하므로,
 * .coupang-dynamic 컨테이너 내부에 <script> 태그를 동적으로 삽입해서 해결합니다.
 *
 * PC  (> 640px): data-width / data-height 속성에 지정된 사이즈
 * 모바일 (≤ 640px): 320 × 50 고정
 */
(function () {
  const PARTNER_ID    = 996719;
  const TRACKING_CODE = 'AF9398669';

  function injectBanner(container) {
    const isMobile = window.innerWidth <= 640;

    const pcWidth  = parseInt(container.dataset.width  || '728', 10);
    const pcHeight = parseInt(container.dataset.height || '120', 10);

    const width  = isMobile ? 320 : pcWidth;
    const height = isMobile ? 50  : pcHeight;

    // 컨테이너 크기를 배너에 맞게 고정 (넘침 방지)
    container.style.width    = width + 'px';
    container.style.maxWidth = '100%';
    container.style.overflow = 'hidden';

    // g.js 로드 후 배너 script 삽입 함수
    function doInsert() {
      // PartnersCoupang.G()는 실행 시점의 currentScript 앞에 배너를 삽입합니다.
      // 따라서 container 안에 <script> 태그를 만들어서 실행해야 정확한 위치에 들어갑니다.
      const inlineScript = document.createElement('script');
      inlineScript.textContent = [
        'new PartnersCoupang.G({',
        '  id:           ' + PARTNER_ID + ',',
        '  template:     "carousel",',
        '  trackingCode: "' + TRACKING_CODE + '",',
        '  width:        "' + width + '",',
        '  height:       "' + height + '",',
        '  tsource:      ""',
        '});'
      ].join('\n');
      container.appendChild(inlineScript);
    }

    // g.js 중복 로드 방지
    if (window._coupangGLoaded) {
      doInsert();
    } else if (window._coupangGLoading) {
      // 이미 로딩 중이면 콜백 큐에 추가
      window._coupangGCallbacks = window._coupangGCallbacks || [];
      window._coupangGCallbacks.push(doInsert);
    } else {
      window._coupangGLoading   = true;
      window._coupangGCallbacks = [doInsert];

      const gjs = document.createElement('script');
      gjs.src   = 'https://ads-partners.coupang.com/g.js';
      gjs.onload = function () {
        window._coupangGLoaded  = true;
        window._coupangGLoading = false;
        (window._coupangGCallbacks || []).forEach(function (cb) { cb(); });
        window._coupangGCallbacks = [];
      };
      document.head.appendChild(gjs);
    }
  }

  function init() {
    document.querySelectorAll('.coupang-dynamic').forEach(injectBanner);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
