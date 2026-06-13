/**
 * banner.js — 쿠팡 파트너스 다이나믹 배너 분기 삽입
 * PC(>640px): 페이지 data-* 속성에 지정된 사이즈로 삽입
 * 모바일(≤640px): 320×50 고정
 */
(function () {
  const PARTNER_ID    = 996719;
  const TRACKING_CODE = 'AF9398669';

  function loadCoupangBanner(container, width, height) {
    // g.js 중복 로드 방지
    if (!window._coupangGjsLoaded) {
      const script = document.createElement('script');
      script.src = 'https://ads-partners.coupang.com/g.js';
      script.onload = function () {
        window._coupangGjsLoaded = true;
        insertBanner(container, width, height);
      };
      document.head.appendChild(script);
    } else {
      insertBanner(container, width, height);
    }
  }

  function insertBanner(container, width, height) {
    // 이미 삽입된 경우 스킵
    if (container.dataset.bannerInserted) return;
    container.dataset.bannerInserted = '1';

    new PartnersCoupang.G({
      id:           PARTNER_ID,
      template:     'carousel',
      trackingCode: TRACKING_CODE,
      width:        String(width),
      height:       String(height),
      tsource:      ''
    });
  }

  function init() {
    const containers = document.querySelectorAll('.coupang-dynamic');
    if (!containers.length) return;

    const isMobile = window.innerWidth <= 640;

    containers.forEach(function (container) {
      // PC 사이즈: data-width / data-height 속성에서 읽음
      const pcWidth  = parseInt(container.dataset.width  || '728', 10);
      const pcHeight = parseInt(container.dataset.height || '120', 10);

      const width  = isMobile ? 320 : pcWidth;
      const height = isMobile ? 50  : pcHeight;

      // 높이를 배너 높이에 맞게 예약 (레이아웃 깨짐 방지)
      container.style.minHeight = height + 'px';

      loadCoupangBanner(container, width, height);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
