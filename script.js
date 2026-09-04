(function() {
  "use strict";

  // ============================================================
  //  图床门禁：关键图片资源（主图床 + 备用图床）
  // ============================================================
  const CRITICAL_IMAGE_URLS = [
    'https://free.picui.cn/free/2026/08/11/6a7a7bd8363ce.jpg',
    'https://free.picui.cn/free/2026/08/11/6a7a7c74e04ca.jpg',
    'https://free.picui.cn/free/2026/08/13/6a7d0bd296999.png',
    'https://pic.imgdd.cc/i/0345tgsOexc7lBC0qPIz8n.png',
    'https://pic.imgdd.cc/i/0345tgWcwr2l5scSYRh7Ch.jpg',
    'https://pic.imgdd.cc/i/0345tgWq0ULTHvT2facl03.png'
  ];

  // ============================================================
  //  精灵图点击特效配置（与独立演示版一致）
  // ============================================================
  const SPRITE_CONFIG = {
    imageUrl: 'https://free.picui.cn/free/2026/08/13/6a7d0bd296999.png',
    fallbackUrl: 'https://pic.imgdd.cc/i/0345tgWq0ULTHvT2facl03.png',
    frameWidth: 256,
    frameHeight: 256,
    totalFrames: 30,
    fps: 60,
    scale: 0.5,
    offset: [0, 0],
    autoRemove: true,
    allowMultiple: true,
    whiteThreshold: 160,
    paleFactors: {
      yellow: 0.7,
      red: 0.7,
      blue: 0.4,
    }
  };

  const BASE_COLORS = {
    YELLOW: { r: 240, g: 237, b: 105 },
    BLUE:   { r: 10,  g: 195, b: 255 },
    RED:    { r: 254, g: 67,  b: 101 },
  };

  function applyPale(baseColor, factor) {
    const white = 255;
    return {
      r: Math.round(baseColor.r * factor + white * (1 - factor)),
      g: Math.round(baseColor.g * factor + white * (1 - factor)),
      b: Math.round(baseColor.b * factor + white * (1 - factor)),
    };
  }

  const COLORS = {
    LEFT:     applyPale(BASE_COLORS.YELLOW, SPRITE_CONFIG.paleFactors.yellow),
    RIGHT:    applyPale(BASE_COLORS.BLUE,   SPRITE_CONFIG.paleFactors.blue),
    FORBIDDEN: applyPale(BASE_COLORS.RED,    SPRITE_CONFIG.paleFactors.red),
  };

  let spriteImg = new Image();
  let isSpriteReady = false;
  let activeSpriteAnimations = [];
  const frameCache = new Map();

  function getFrameCacheKey(color) {
    return `${color.r},${color.g},${color.b}`;
  }

  function createColoredFrame(img, frameIndex, frameWidth, frameHeight, targetColor, threshold) {
    const offscreen = document.createElement('canvas');
    offscreen.width = frameWidth;
    offscreen.height = frameHeight;
    const offCtx = offscreen.getContext('2d');
    offCtx.imageSmoothingEnabled = true;
    const sy = frameIndex * frameHeight;
    offCtx.drawImage(img, 0, sy, frameWidth, frameHeight, 0, 0, frameWidth, frameHeight);
    const imageData = offCtx.getImageData(0, 0, frameWidth, frameHeight);
    const data = imageData.data;
    const { r, g, b } = targetColor;
    for (let i = 0; i < data.length; i += 4) {
      const cr = data[i];
      const cg = data[i + 1];
      const cb = data[i + 2];
      if (cr > threshold && cg > threshold && cb > threshold && data[i + 3] > 0) {
        data[i] = r;
        data[i + 1] = g;
        data[i + 2] = b;
      }
    }
    offCtx.putImageData(imageData, 0, 0);
    return offscreen;
  }

  function preprocessFrames(img, color, frameWidth, frameHeight, totalFrames, threshold) {
    const key = getFrameCacheKey(color);
    if (frameCache.has(key)) {
      return frameCache.get(key);
    }
    const frames = [];
    for (let i = 0; i < totalFrames; i++) {
      const canvas = createColoredFrame(img, i, frameWidth, frameHeight, color, threshold);
      const imgData = canvas.getContext('2d').getImageData(0, 0, frameWidth, frameHeight);
      frames.push(imgData);
    }
    frameCache.set(key, frames);
    return frames;
  }

  function createSpriteAnimation(clientX, clientY, color, colorName) {
    if (!isSpriteReady) {
      console.warn('精灵图尚未加载完成');
      return;
    }

    const { frameWidth, frameHeight, totalFrames, fps, offset, autoRemove, allowMultiple, scale, whiteThreshold } = SPRITE_CONFIG;

    const displayWidth = frameWidth * scale;
    const displayHeight = frameHeight * scale;
    const posX = clientX + offset[0] - displayWidth / 2;
    const posY = clientY + offset[1] - displayHeight / 2;

    const canvas = document.createElement('canvas');
    canvas.className = 'effect-canvas';
    canvas.width = frameWidth;
    canvas.height = frameHeight;
    canvas.style.width = displayWidth + 'px';
    canvas.style.height = displayHeight + 'px';
    canvas.style.left = posX + 'px';
    canvas.style.top = posY + 'px';
    canvas.style.position = 'fixed';
    canvas.style.pointerEvents = 'none';
    canvas.style.zIndex = '9999';
    canvas.style.imageSmoothingEnabled = 'true';
    document.body.appendChild(canvas);

    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    if (ctx.imageSmoothingQuality !== undefined) {
      ctx.imageSmoothingQuality = 'high';
    }

    let frames = null;
    let useColor = true;

    try {
      frames = preprocessFrames(spriteImg, color, frameWidth, frameHeight, totalFrames, whiteThreshold);
    } catch (e) {
      console.warn('颜色替换处理失败，降级为原图', e);
      useColor = false;
      frames = null;
    }

    let currentFrame = 0;
    let startTime = performance.now();
    let animationId = null;
    let isFinished = false;

    const instance = {
      canvas,
      ctx,
      currentFrame,
      startTime,
      isFinished,
      destroy
    };

    if (!allowMultiple) {
      activeSpriteAnimations.forEach(a => a.destroy());
      activeSpriteAnimations = [];
    }
    activeSpriteAnimations.push(instance);

    function drawFrame(frameIndex) {
      const idx = Math.min(frameIndex, totalFrames - 1);
      if (useColor && frames && frames[idx]) {
        ctx.putImageData(frames[idx], 0, 0);
      } else {
        const sy = idx * frameHeight;
        ctx.clearRect(0, 0, frameWidth, frameHeight);
        ctx.drawImage(spriteImg, 0, sy, frameWidth, frameHeight, 0, 0, frameWidth, frameHeight);
      }
    }

    function animate(timestamp) {
      if (isFinished) return;
      const elapsed = timestamp - startTime;
      const frameDuration = 1000 / fps;
      const frameIndex = Math.floor(elapsed / frameDuration);

      if (frameIndex >= totalFrames) {
        drawFrame(totalFrames - 1);
        finishAnimation();
        return;
      }
      drawFrame(frameIndex);
      currentFrame = frameIndex;
      animationId = requestAnimationFrame(animate);
    }

    function finishAnimation() {
      if (isFinished) return;
      isFinished = true;
      if (animationId) { cancelAnimationFrame(animationId); animationId = null; }
      const idx = activeSpriteAnimations.indexOf(instance);
      if (idx !== -1) activeSpriteAnimations.splice(idx, 1);
      if (autoRemove) {
        setTimeout(() => { destroy(); }, 80);
      }
    }

    function destroy() {
      if (canvas.parentNode) canvas.remove();
      if (animationId) cancelAnimationFrame(animationId);
      isFinished = true;
      const idx = activeSpriteAnimations.indexOf(instance);
      if (idx !== -1) activeSpriteAnimations.splice(idx, 1);
    }

    drawFrame(0);
    animationId = requestAnimationFrame(animate);
  }

  // ============================================================
  //  粒子系统（与独立演示版参数一致：30~50px起始，190~210速度，0.3~0.6s寿命，12~32px大小，互异角度）
  // ============================================================
  let particles = [];
  let particleAnimId = null;
  let lastParticleTime = 0;

  function generateDistinctAngles(count, minDiffDeg) {
    const minDiff = minDiffDeg * Math.PI / 180;
    let angles = [];
    let attempts = 0;
    while (angles.length < count && attempts < 200) {
      const angle = Math.random() * 2 * Math.PI;
      let ok = true;
      for (let a of angles) {
        let diff = Math.abs(angle - a);
        diff = Math.min(diff, 2 * Math.PI - diff);
        if (diff < minDiff) {
          ok = false;
          break;
        }
      }
      if (ok) {
        angles.push(angle);
      }
      attempts++;
    }
    while (angles.length < count) {
      angles.push(Math.random() * 2 * Math.PI);
    }
    return angles;
  }

  function createParticles(x, y, color) {
    const count = 2 + Math.floor(Math.random() * 3); // 2,3,4
    const angles = generateDistinctAngles(count, 50);

    for (let i = 0; i < count; i++) {
      const size = 12 + Math.random() * 20; // 12~32px
      const angle = angles[i];
      const baseSpeed = 190 + Math.random() * 20; // 190~210
      const life = 0.3 + Math.random() * 0.3; // 0.3~0.6s

      const startRadius = 30 + Math.random() * 20; // 30~50px
      const startX = x + Math.cos(angle) * startRadius;
      const startY = y + Math.sin(angle) * startRadius;

      const variation = 0.8 + Math.random() * 0.4;
      const r = Math.min(255, Math.round(color.r * variation));
      const g = Math.min(255, Math.round(color.g * variation));
      const b = Math.min(255, Math.round(color.b * variation));
      const colorStr = `rgb(${r},${g},${b})`;

      const el = document.createElement('div');
      el.className = 'particle';
      el.style.cssText = `
        position: fixed;
        pointer-events: none;
        z-index: 10000;
        border-radius: 2px;
        width: ${size}px;
        height: ${size}px;
        background: ${colorStr};
        left: ${startX - size/2}px;
        top: ${startY - size/2}px;
        opacity: 1;
        transform: rotate(0deg);
        will-change: transform, opacity;
      `;
      document.body.appendChild(el);

      particles.push({
        el,
        x: startX,
        y: startY,
        angle,
        speed: baseSpeed,
        size,
        life,
        age: 0,
        alpha: 1,
      });
    }

    if (!particleAnimId) {
      particleAnimId = requestAnimationFrame(updateParticles);
    }
  }

  function updateParticles(timestamp) {
    if (!lastParticleTime) lastParticleTime = timestamp;
    const dt = Math.min((timestamp - lastParticleTime) / 1000, 0.05);
    lastParticleTime = timestamp;

    let anyAlive = false;

    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.age += dt;

      const progress = p.age / p.life;
      let speedMult;
      if (progress < 0.33) {
        speedMult = 1.0;
      } else {
        const t2 = (progress - 0.33) / 0.67;
        speedMult = 1.0 - t2 * 0.95;
      }
      const currentSpeed = p.speed * speedMult;

      p.x += Math.cos(p.angle) * currentSpeed * dt;
      p.y += Math.sin(p.angle) * currentSpeed * dt;

      p.alpha = Math.max(0, 1 - progress * progress);

      const el = p.el;
      const half = p.size / 2;
      el.style.left = (p.x - half) + 'px';
      el.style.top = (p.y - half) + 'px';
      el.style.opacity = p.alpha;

      if (p.age >= p.life || p.alpha <= 0.01) {
        if (el.parentNode) el.remove();
        particles.splice(i, 1);
      } else {
        anyAlive = true;
      }
    }

    if (anyAlive) {
      particleAnimId = requestAnimationFrame(updateParticles);
    } else {
      particleAnimId = null;
      lastParticleTime = 0;
      particles = [];
    }
  }

  // ---------- 触发完整动画 ----------
  function triggerClickEffect(clientX, clientY, color, colorName) {
    createSpriteAnimation(clientX, clientY, color, colorName);
    createParticles(clientX, clientY, color);
  }

  // ---------- 加载精灵图 ----------
  function loadSpriteImage() {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = function() {
      spriteImg = img;
      isSpriteReady = true;
      console.log('[精灵图] 加载成功');
    };
    img.onerror = function() {
      console.warn('[精灵图] 主图床加载失败，尝试备用图床');
      const fallbackImg = new Image();
      fallbackImg.crossOrigin = 'anonymous';
      fallbackImg.onload = function() {
        spriteImg = fallbackImg;
        isSpriteReady = true;
        console.log('[精灵图] 备用图床加载成功');
      };
      fallbackImg.onerror = function() {
        console.error('[精灵图] 所有图床加载失败');
      };
      fallbackImg.src = SPRITE_CONFIG.fallbackUrl;
    };
    img.src = SPRITE_CONFIG.imageUrl;
  }

  // ---------- API 基址 ----------
  const API_CANDIDATES = [
    (typeof window !== 'undefined' && window.MAXSUI_API_BASE) ? String(window.MAXSUI_API_BASE).replace(/\/+$/, '') : null,
    'https://maxsui-api.maxsui.workers.dev/api'
  ].filter(Boolean);

  let API_BASE_URL = API_CANDIDATES[0];

  async function probeApiHealth(base, timeoutMs) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs || 4500);
    try {
      const res = await fetch(`${base}/health`, {
        method: 'GET',
        signal: ctrl.signal,
        cache: 'no-store',
        credentials: 'omit'
      });
      clearTimeout(timer);
      if (!res.ok) return false;
      const data = await res.json().catch(() => null);
      return !!(data && (data.success || data.status === 'ok'));
    } catch {
      clearTimeout(timer);
      return false;
    }
  }

  /** @returns {Promise<boolean>} 是否有可用 API */
  async function resolveApiBase() {
    for (const base of API_CANDIDATES) {
      if (await probeApiHealth(base, 4500)) {
        API_BASE_URL = base;
        return true;
      }
    }
    API_BASE_URL = API_CANDIDATES[0];
    return false;
  }

  let apiOfflineLocked = false;

  /** API 不可达：不卡门禁；顶栏灵动岛；只保留居中头像（去掉简介等） */
  function applyApiOfflineHomeMode() {
    apiOfflineLocked = true;
    document.body.classList.add('api-offline-lock');
    const nav = document.getElementById('mainNav');
    if (nav) {
      nav.classList.add('is-api-island');
      nav.setAttribute('aria-live', 'polite');
      let island = nav.querySelector('.nav-api-island');
      if (!island) {
        island = document.createElement('div');
        island.className = 'nav-api-island';
        island.innerHTML =
          `<span class="nav-api-island-icon" aria-hidden="true"><i class="fas fa-globe"></i></span>` +
          `<span class="nav-api-island-text">您所在的国家/地区暂时不支持连接到后台接口</span>`;
        nav.appendChild(island);
      }
    }
    const profile = document.getElementById('profileContainer');
    if (profile) {
      profile.setAttribute('hidden', '');
      profile.classList.add('is-offline-hidden');
    }
    document.querySelectorAll(
      '#home .home-text, #home .home-name, #home .home-bio, #home .home-meta, #home .home-interests, #home .home-actions, #home .interest-tags'
    ).forEach((el) => {
      el.setAttribute('hidden', '');
      el.classList.add('is-offline-hidden');
    });
    const home = document.getElementById('home');
    if (scrollContainer && home) {
      scrollContainer.scrollTo({ left: home.offsetLeft, behavior: 'auto' });
    }
    document.querySelectorAll('.nav-btn').forEach((b) => {
      b.classList.toggle('active', b.getAttribute('data-section') === 'home');
    });

    requestAnimationFrame(() => {
      centerAvatarForOffline();
      updateGlobalAvatarPosition();
    });
  }

  function centerAvatarForOffline() {
    const globalAvatar = document.getElementById('globalAvatar');
    if (!globalAvatar || !apiOfflineLocked) return;
    const size = Math.min(200, Math.max(132, Math.round(window.innerWidth * 0.24)));
    globalAvatar.style.width = size + 'px';
    globalAvatar.style.height = size + 'px';
    globalAvatar.style.opacity = '1';
    globalAvatar.style.transform =
      `translate(calc(${window.innerWidth / 2}px - 50%), calc(${window.innerHeight / 2}px - 50%))`;
    globalAvatar.classList.add('is-offline-center');
  }

  // ---------- 文章公开链接：https://suixiuliang.github.io/blog/{slug} ----------
  const SITE_PUBLIC_ORIGIN = 'https://suixiuliang.github.io';
  function articlePublicPath(slug) {
    const s = String(slug || '').replace(/^\/+|\/+$/g, '');
    return `/blog/${encodeURIComponent(s)}`;
  }
  function articlePublicUrl(slug) {
    return SITE_PUBLIC_ORIGIN + articlePublicPath(slug);
  }
  function parseBlogSlugFromLocation() {
    try {
      const path = String(location.pathname || '');
      let m = path.match(/\/blog\/([^/]+)\/?$/i);
      if (m) return decodeURIComponent(m[1]);
      const hash = String(location.hash || '');
      m = hash.match(/#\/?blog\/([^/]+)\/?/i);
      if (m) return decodeURIComponent(m[1]);
    } catch (_) {}
    return null;
  }
  function setArticleUrl(slug, { replace = false } = {}) {
    if (!slug) return;
    const path = articlePublicPath(slug);
    try {
      if (replace) history.replaceState({ blogSlug: slug }, '', path);
      else history.pushState({ blogSlug: slug }, '', path);
    } catch (_) {
      try {
        if (replace) history.replaceState({ blogSlug: slug }, '', `#/blog/${encodeURIComponent(slug)}`);
        else history.pushState({ blogSlug: slug }, '', `#/blog/${encodeURIComponent(slug)}`);
      } catch (__) {}
    }
  }
  function clearArticleUrl() {
    try {
      history.pushState({}, '', '/');
    } catch (_) {
      try { history.pushState({}, '', '#'); } catch (__) {}
    }
  }

  function showBootApiIsland() {
    applyApiOfflineHomeMode();
  }

  function formatDateUTC8(input) {
    if (!input) return '';
    let d;
    if (input instanceof Date) {
      d = input;
    } else {
      const s = String(input).trim();
      if (/^\d{4}-\d{2}-\d{2}T/.test(s) && !/[zZ]|[+-]\d{2}:?\d{2}$/.test(s)) {
        d = new Date(s + 'Z');
      } else if (/^\d{4}-\d{2}-\d{2} /.test(s) && !/[zZ]|[+-]\d{2}/.test(s)) {
        d = new Date(s.replace(' ', 'T') + 'Z');
      } else {
        d = new Date(s);
      }
    }
    if (Number.isNaN(d.getTime())) {
      return String(input).replace('T', ' ').slice(0, 16);
    }
    try {
      const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Shanghai',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      }).formatToParts(d);
      const get = (t) => (parts.find(p => p.type === t) || {}).value || '';
      return `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')}`;
    } catch (_) {
      const offset = 8 * 60;
      const utc = d.getTime() + d.getTimezoneOffset() * 60000;
      const cn = new Date(utc + offset * 60000);
      const pad = (n) => String(n).padStart(2, '0');
      return `${cn.getFullYear()}-${pad(cn.getMonth() + 1)}-${pad(cn.getDate())} ${pad(cn.getHours())}:${pad(cn.getMinutes())}`;
    }
  }

  function dateOnlyUTC8(input) {
    return (formatDateUTC8(input) || '').slice(0, 10);
  }

  function escapeHtml(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  const nav = document.getElementById('mainNav');
  const scrollContainer = document.getElementById('scrollContainer');
  function getSections() { return document.querySelectorAll('.panel'); }
  function getNavLinks() { return document.querySelectorAll('.nav-btn[data-section]'); }

  let adminUnlocked = false;
  let authRole = null;
  let authedCreateSecret = null;
  let guestCodeTimer = null;
  let guestCodeExpireAt = 0;
  let guestCodeValue = '';

  const defaultProfile = {
    name: "MaxSui",
    age: 16,
    grade: "高二",
    bio: "热爱计算机底层与系统编程，熟悉 C / C# / C++，喜欢探索新的算法。",
    interests: ["C", "C#", "C++", "OIer", "Minecraft", "CR-中国铁路", "Airbus"],
    avatar: null,
    status: "在线",
    statusType: "online",
    statusSummary: ""
  };

  let profileData = { ...defaultProfile };
  let blogPosts = [];

  let avatarClickCount = 0;
  let avatarClickTimer = null;

  let navCapsule = null;
  let lastScrollLeft = 0;
  let lastScrollTime = performance.now();
  let capsuleScale = 1;
  let capsuleScaleVel = 0;
  let capsuleScaleRaf = null;
  let capsuleX = 0;
  let capsuleW = 0;
  const CAPSULE_SCALE_MAX = 1.12;
  const CAPSULE_SPRING_K = 220;
  const CAPSULE_SPRING_D = 16;

  let calCurrentDate = new Date();
  let calSelectedDateStr = null;

  const blogPanel = document.getElementById('blog');
  const blogContent = document.querySelector('.panel-blog-content');
  const blogCover = document.getElementById('blogCover');
  const blogWhiteBox = document.getElementById('blogWhiteBox');
  const blogStageDuo = document.getElementById('blogStageDuo');
  const blogThemeRail = document.getElementById('blogThemeRail');

  const STAGE1_RATIO = 0.72;
  const STAGE2_RATIO = 0.45;
  /* 移动端：很短滚动距离即可跑完三阶段视差 */
  const STAGE1_RATIO_MOBILE = 0.26;
  const STAGE2_RATIO_MOBILE = 0.16;
  let stage1Height = 0;
  let stage2Height = 0;
  let stage3Extra = 0;
  let isBlogActive = false;

  function isMobileBlogLayout() {
    try {
      if (document.documentElement.classList.contains('is-phone')) return true;
    } catch (_) {}
    return !!(window.matchMedia && window.matchMedia('(max-width: 480px)').matches
      && window.matchMedia('(pointer: coarse)').matches);
  }
  let activeCategory = '';
  const BLOG_PAGE_SIZE = 5;
  let blogCurrentPage = 1;
  let blogFilteredCache = [];
  let blogFilterKeyword = '';
  let blogFilterDate = null;
  let blogSortKey = 'date';   // date | title | category | readTime
  let blogSortDir = 'desc';   // asc | desc

  const blogSearchInput = document.getElementById('blogSearchInput');
  const calendarBtn = document.getElementById('calendarBtn');
  const calendarModal = document.getElementById('calendarModal');
  const closeCalendarBtn = document.getElementById('closeCalendarBtn');
  const searchByDateBtn = document.getElementById('searchByDateBtn');
  const clearDateBtn = document.getElementById('clearDateBtn');

  function renderAppleCalendar() {
    const calendarEl = document.getElementById('appleCalendar');
    if (!calendarEl) return;
    const year = calCurrentDate.getFullYear();
    const month = calCurrentDate.getMonth();
    const firstDayIndex = new Date(year, month, 1).getDay();
    const totalDays = new Date(year, month + 1, 0).getDate();
    const monthNames = ["1月", "2月", "3月", "4月", "5月", "6月", "7月", "8月", "9月", "10月", "11月", "12月"];

    let html = `
      <div class="apple-cal-header">
        <button class="apple-cal-nav" id="calPrevBtn" type="button"><i class="fas fa-chevron-left"></i></button>
        <span>${year}年 ${monthNames[month]}</span>
        <button class="apple-cal-nav" id="calNextBtn" type="button"><i class="fas fa-chevron-right"></i></button>
      </div>
      <div class="apple-cal-weekdays">
        <span>日</span><span>一</span><span>二</span><span>三</span><span>四</span><span>五</span><span>六</span>
      </div>
      <div class="apple-cal-days">
    `;
    for (let i = 0; i < firstDayIndex; i++) {
      html += `<div class="apple-cal-day empty"></div>`;
    }
    for (let day = 1; day <= totalDays; day++) {
      const monthStr = String(month + 1).padStart(2, '0');
      const dayStr = String(day).padStart(2, '0');
      const dateVal = `${year}-${monthStr}-${dayStr}`;
      const isSelected = (calSelectedDateStr === dateVal);
      html += `<div class="apple-cal-day ${isSelected ? 'selected' : ''}" data-date="${dateVal}">${day}</div>`;
    }
    html += `</div>`;
    calendarEl.innerHTML = html;

    document.getElementById('calPrevBtn').addEventListener('click', (e) => {
      e.stopPropagation();
      calCurrentDate.setMonth(calCurrentDate.getMonth() - 1);
      renderAppleCalendar();
    });
    document.getElementById('calNextBtn').addEventListener('click', (e) => {
      e.stopPropagation();
      calCurrentDate.setMonth(calCurrentDate.getMonth() + 1);
      renderAppleCalendar();
    });
    calendarEl.querySelectorAll('.apple-cal-day:not(.empty)').forEach(dayEl => {
      dayEl.addEventListener('click', () => {
        calendarEl.querySelectorAll('.apple-cal-day').forEach(d => d.classList.remove('selected'));
        dayEl.classList.add('selected');
        calSelectedDateStr = dayEl.dataset.date;
      });
    });
  }

  function setupBlogToolbarInteractions() {
    if (calendarBtn && calendarModal) {
      calendarBtn.addEventListener('click', () => {
        renderAppleCalendar();
        calendarModal.classList.add('active');
      });
      closeCalendarBtn.addEventListener('click', () => {
        calendarModal.classList.remove('active');
      });
      calendarModal.addEventListener('click', (e) => {
        if (e.target === calendarModal) calendarModal.classList.remove('active');
      });
    }
    if (blogSearchInput) {
      blogSearchInput.addEventListener('input', (e) => {
        const keyword = e.target.value.trim().toLowerCase();
        filterAndRenderBlogs(keyword, null);
      });
    }
    if (searchByDateBtn) {
      searchByDateBtn.addEventListener('click', () => {
        if (!calSelectedDateStr) {
          alert('请先选择日期');
          return;
        }
        filterAndRenderBlogs('', calSelectedDateStr);
        calendarModal.classList.remove('active');
      });
    }
    if (clearDateBtn) {
      clearDateBtn.addEventListener('click', () => {
        calSelectedDateStr = null;
        if (blogSearchInput) blogSearchInput.value = '';
        filterAndRenderBlogs('', null);
        calendarModal.classList.remove('active');
      });
    }
  }

  function renderThemeRail(categories) {
    const rail = document.getElementById('themeRailList');
    if (!rail) return;
    const raw = categories && categories.length
      ? categories
      : blogPosts.map(p => p.category).filter(Boolean);
    const seen = new Set();
    const cats = [];
    raw.forEach(c => {
      const name = typeof c === 'string' ? c : (c.name || c.slug || '');
      const key = String(name || '').trim();
      if (!key) return;
      const norm = key.toLowerCase();
      if (seen.has(norm)) return;
      seen.add(norm);
      cats.push(key);
    });
    let html = `<button type="button" class="theme-chip ${!activeCategory ? 'active' : ''}" data-category="">全部</button>`;
    cats.forEach(name => {
      html += `<button type="button" class="theme-chip ${activeCategory === name ? 'active' : ''}" data-category="${name.replace(/"/g, '&quot;')}">${name}</button>`;
    });
    rail.innerHTML = html;
    rail.querySelectorAll('.theme-chip').forEach(btn => {
      btn.addEventListener('click', () => {
        activeCategory = btn.dataset.category || '';
        rail.querySelectorAll('.theme-chip').forEach(b => b.classList.toggle('active', b === btn));
        const kw = (blogSearchInput && blogSearchInput.value.trim().toLowerCase()) || '';
        filterAndRenderBlogs(kw, null);
      });
    });
  }

  function getBlogTotalPages(total) {
    return Math.max(1, Math.ceil((total || 0) / BLOG_PAGE_SIZE));
  }

  function renderBlogPagination(total) {
    const pager = document.getElementById('blogPagination');
    if (!pager) return;
    const totalPages = getBlogTotalPages(total);
    if (!total || totalPages <= 1) {
      pager.innerHTML = total
        ? `<div class="blog-page-info">共 ${total} 篇 · 每页 ${BLOG_PAGE_SIZE} 篇</div>`
        : '';
      return;
    }

    const page = Math.min(Math.max(1, blogCurrentPage), totalPages);
    blogCurrentPage = page;

    const buttons = [];
    buttons.push(`<button type="button" class="blog-page-btn" data-page="prev" ${page <= 1 ? 'disabled' : ''} title="上一页"><i class="fas fa-chevron-left"></i></button>`);

    const pushPage = (n) => {
      buttons.push(`<button type="button" class="blog-page-btn${n === page ? ' is-active' : ''}" data-page="${n}" ${n === page ? 'aria-current="page"' : ''}>${n}</button>`);
    };

    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) pushPage(i);
    } else {
      pushPage(1);
      if (page > 3) buttons.push('<span class="blog-page-ellipsis">…</span>');
      const start = Math.max(2, page - 1);
      const end = Math.min(totalPages - 1, page + 1);
      for (let i = start; i <= end; i++) pushPage(i);
      if (page < totalPages - 2) buttons.push('<span class="blog-page-ellipsis">…</span>');
      pushPage(totalPages);
    }

    buttons.push(`<button type="button" class="blog-page-btn" data-page="next" ${page >= totalPages ? 'disabled' : ''} title="下一页"><i class="fas fa-chevron-right"></i></button>`);
    buttons.push(`<div class="blog-page-info">第 ${page} / ${totalPages} 页 · 共 ${total} 篇</div>`);
    pager.innerHTML = buttons.join('');

    pager.querySelectorAll('.blog-page-btn[data-page]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const key = btn.getAttribute('data-page');
        let next = page;
        if (key === 'prev') next = page - 1;
        else if (key === 'next') next = page + 1;
        else next = parseInt(key, 10) || page;
        if (next === page || next < 1 || next > totalPages) return;
        blogCurrentPage = next;
        renderBlogPage();
      });
    });
  }

  function renderBlogPage() {
    const list = document.getElementById('blogList');
    const countEl = document.getElementById('postCount');
    if (!list) return;

    const filtered = blogFilteredCache;
    const total = filtered.length;
    const totalPages = getBlogTotalPages(total);
    if (blogCurrentPage > totalPages) blogCurrentPage = totalPages;
    if (blogCurrentPage < 1) blogCurrentPage = 1;

    if (!total) {
      list.innerHTML = '<p class="loading-placeholder">没有找到匹配的文章</p>';
      if (countEl) countEl.textContent = '0 篇文章';
      renderBlogPagination(0);
      setupBlogScrollHeights();
      return;
    }

    const startIdx = (blogCurrentPage - 1) * BLOG_PAGE_SIZE;
    const pageItems = filtered.slice(startIdx, startIdx + BLOG_PAGE_SIZE);

    let html = '';
    pageItems.forEach(post => {
      const displayDate = post.date || formatDateUTC8(post.rawDate) || '';
      const slug = post.slug || post.id;
      const id = escapeHtml(slug);
      const href = articlePublicUrl(slug);
      html += `
        <a class="blog-card" href="${escapeHtml(href)}" data-id="${id}" data-slug="${id}">
          <div class="blog-icon"><i class="fas ${post.icon || 'fa-pen'}"></i></div>
          <h3>${escapeHtml(post.title || '无标题')}</h3>
          <p>${escapeHtml(post.summary || '')}</p>
          <div class="blog-meta">
            <span><i class="far fa-calendar"></i> ${escapeHtml(displayDate)} <small style="opacity:.7">UTC+8</small></span>
            <span><i class="far fa-clock"></i> ${escapeHtml(post.readTime || '3 min')}</span>
          </div>
          <div class="blog-card-actions">
            ${post.status === 'hidden' ? '<span class="blog-hidden-badge" title="同志，这个你可以看"><i class="fas fa-lock"></i><span class="blog-hidden-badge-text blog-hidden-badge-desktop">同志，这个你可以看</span><span class="blog-hidden-badge-text blog-hidden-badge-mobile">已授权</span></span>' : ''}
            <span class="read-more" aria-hidden="true">阅读 <i class="fas fa-arrow-right"></i></span>
          </div>
        </a>
      `;
    });
    list.innerHTML = html;
    if (countEl) countEl.textContent = `${total} 篇文章`;
    renderBlogPagination(total);

    list.querySelectorAll('.blog-card[data-id]').forEach(card => {
      const open = (e) => {
        if (e) e.preventDefault();
        openArticleReader(card.dataset.slug || card.dataset.id);
      };
      card.addEventListener('click', open);
      card.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          open(e);
        }
      });
    });

    requestAnimationFrame(() => {
      setupBlogScrollHeights();
      updateBlogScroll();
      updateGlobalAvatarPosition();
    });
  }

  function parseReadTimeMinutes(v) {
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    const m = String(v || '').match(/(\d+(?:\.\d+)?)/);
    return m ? parseFloat(m[1]) : 0;
  }

  function postSortValue(post, key) {
    if (key === 'title') return String(post.title || '').toLowerCase();
    if (key === 'category') return String(post.category || '').toLowerCase();
    if (key === 'readTime') return parseReadTimeMinutes(post.readTime);
    // date: prefer rawDate timestamp
    const raw = post.rawDate || post.date || '';
    const t = Date.parse(raw);
    if (!Number.isNaN(t)) return t;
    return String(raw);
  }

  function sortBlogCache(list) {
    const key = blogSortKey || 'date';
    const dir = blogSortDir === 'asc' ? 1 : -1;
    return list.slice().sort((a, b) => {
      const va = postSortValue(a, key);
      const vb = postSortValue(b, key);
      let cmp = 0;
      if (typeof va === 'number' && typeof vb === 'number') cmp = va - vb;
      else cmp = String(va).localeCompare(String(vb), 'zh-CN', { sensitivity: 'base', numeric: true });
      if (cmp === 0) {
        // stable tie-break by date then title
        const ta = postSortValue(a, 'date');
        const tb = postSortValue(b, 'date');
        if (typeof ta === 'number' && typeof tb === 'number') cmp = ta - tb;
        else cmp = String(ta).localeCompare(String(tb));
        if (cmp === 0) cmp = String(a.title || '').localeCompare(String(b.title || ''), 'zh-CN');
      }
      return cmp * dir;
    });
  }

  function updateBlogSortUI() {
    const labelMap = { date: '发布时间', title: '名称', category: '分类', readTime: '阅读时长' };
    const labelEl = document.getElementById('blogSortLabel');
    if (labelEl) labelEl.textContent = labelMap[blogSortKey] || '发布时间';
    const dirBtn = document.getElementById('blogSortDirBtn');
    const dirIcon = document.getElementById('blogSortDirIcon');
    if (dirBtn) {
      dirBtn.classList.toggle('is-asc', blogSortDir === 'asc');
      dirBtn.title = blogSortDir === 'asc' ? '当前升序，点击切换为降序' : '当前降序，点击切换为升序';
    }
    if (dirIcon) {
      dirIcon.className = blogSortDir === 'asc' ? 'fas fa-arrow-up' : 'fas fa-arrow-down';
    }
    document.querySelectorAll('#blogSortMenu .blog-sort-item').forEach((btn) => {
      btn.classList.toggle('is-active', btn.getAttribute('data-sort') === blogSortKey);
    });
  }

  function setupBlogSortUI() {
    const wrap = document.getElementById('blogSortWrap');
    const btn = document.getElementById('blogSortBtn');
    const menu = document.getElementById('blogSortMenu');
    const dirBtn = document.getElementById('blogSortDirBtn');
    if (!btn || !menu) return;

    const closeMenu = () => {
      menu.classList.remove('is-open');
      menu.hidden = true;
      btn.classList.remove('is-open');
      btn.setAttribute('aria-expanded', 'false');
    };

    const openMenu = () => {
      document.querySelectorAll('.blog-sort-menu.is-open').forEach((el) => {
        if (el !== menu) {
          el.classList.remove('is-open');
          el.hidden = true;
        }
      });
      // 清除可能残留的 fixed 坐标，交由 CSS absolute 锚定到 .blog-sort-wrap
      menu.style.left = '';
      menu.style.top = '';
      menu.hidden = false;
      menu.classList.add('is-open');
      btn.classList.add('is-open');
      btn.setAttribute('aria-expanded', 'true');
    };

    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (menu.classList.contains('is-open')) closeMenu();
      else openMenu();
    });

    menu.addEventListener('click', (e) => e.stopPropagation());

    menu.querySelectorAll('.blog-sort-item').forEach((item) => {
      item.addEventListener('click', () => {
        const key = item.getAttribute('data-sort') || 'date';
        if (key !== blogSortKey) {
          blogSortKey = key;
          blogCurrentPage = 1;
          updateBlogSortUI();
          filterAndRenderBlogs(blogFilterKeyword, blogFilterDate, true);
        }
        closeMenu();
      });
    });

    if (dirBtn) {
      dirBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        blogSortDir = blogSortDir === 'asc' ? 'desc' : 'asc';
        blogCurrentPage = 1;
        updateBlogSortUI();
        filterAndRenderBlogs(blogFilterKeyword, blogFilterDate, true);
      });
    }

    document.addEventListener('click', closeMenu);
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeMenu();
    });
    if (scrollContainer) scrollContainer.addEventListener('scroll', closeMenu, { passive: true });
    if (blogPanel) blogPanel.addEventListener('scroll', closeMenu, { passive: true });

    updateBlogSortUI();
  }

  function filterAndRenderBlogs(keyword = '', dateStr = null, resetPage = true) {
    blogFilterKeyword = keyword || '';
    blogFilterDate = dateStr || null;

    const filtered = blogPosts.filter(post => {
      const titleMatch = (post.title || '').toLowerCase().includes(blogFilterKeyword);
      const summaryMatch = (post.summary || post.content || '').toLowerCase().includes(blogFilterKeyword);
      const matchesKeyword = !blogFilterKeyword || titleMatch || summaryMatch;
      let matchesDate = true;
      if (blogFilterDate) {
        const postDate = dateOnlyUTC8(post.rawDate || post.date) || (post.date || '').split(' ')[0];
        matchesDate = postDate === blogFilterDate;
      }
      const matchesCat = !activeCategory || (post.category || '') === activeCategory;
      return matchesKeyword && matchesDate && matchesCat;
    });

    blogFilteredCache = sortBlogCache(filtered);

    if (resetPage) blogCurrentPage = 1;
    renderBlogPage();
  }

  function setReadingToolbarMeta(title, metaHtml) {
    const titleEl = document.getElementById('blogReadingTitle');
    const track = document.getElementById('blogReadingTitleTrack');
    const metaEl = document.getElementById('blogReadingMeta');
    const t = String(title || '无标题');
    if (titleEl) titleEl.textContent = t;
    if (metaEl) metaEl.innerHTML = metaHtml || '';
    if (track) {
      track.classList.remove('is-marquee');
      track.style.removeProperty('--marquee-duration');
      track.innerHTML = `<span class="blog-reading-title">${escapeHtml(t)}</span>`;
    }
    const wrapEl = document.getElementById('blogReadingTitleWrap');
    if (wrapEl) wrapEl.classList.remove('is-marquee');
    requestAnimationFrame(() => {
      updateReadingTitleMarquee();
    });
  }

  function updateReadingTitleMarquee() {
    const track = document.getElementById('blogReadingTitleTrack');
    const wrap = document.getElementById('blogReadingTitleWrap');
    if (!track || !wrap) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    track.classList.remove('is-marquee');
    wrap.classList.remove('is-marquee');
    const titleSpan = track.querySelector('.blog-reading-title');
    if (!titleSpan) return;
    track.querySelectorAll('.blog-reading-title').forEach((el, idx) => {
      if (idx > 0) el.remove();
    });
    if (reduce) return;
    const need = titleSpan.scrollWidth > wrap.clientWidth + 4;
    if (!need) return;
    const clone = titleSpan.cloneNode(true);
    track.appendChild(clone);
    const distance = titleSpan.scrollWidth;
    const duration = Math.max(6, Math.min(22, distance / 40));
    track.style.setProperty('--marquee-duration', duration + 's');
    track.classList.add('is-marquee');
    wrap.classList.add('is-marquee');
  }

  function showReadingToolbar(on) {
    if (!nav) return;
    nav.classList.toggle('is-reading-toolbar', !!on);
    const list = document.getElementById('blogToolbarList');
    const reading = document.getElementById('blogToolbarReading');
    if (list) list.hidden = !!on;
    if (reading) reading.hidden = !on;
    if (on) {
      requestAnimationFrame(() => updateReadingTitleMarquee());
    }
  }

  function detectContentType(article) {
    if (!article) return 'markdown';
    const raw = (
      article.content_type ||
      article.contentType ||
      article.format ||
      article.type ||
      ''
    ).toString().toLowerCase();
    if (raw === 'html' || raw === 'text/html') return 'html';
    if (raw === 'markdown' || raw === 'md' || raw === 'text/markdown') return 'markdown';
    const c = String(article.content || article.body || '');
    // 完整 HTML 文档 / 明显标签
    if (/<!doctype\s+html/i.test(c) || /<html[\s>]/i.test(c) || /<body[\s>]/i.test(c)) return 'html';
    if (/^\s*<(?:div|section|article|p|h[1-6]|audio|video|figure)\b/i.test(c)) return 'html';
    return 'markdown';
  }

  /**
   * 安全提取可嵌入片段：
   * - 完整文档只取 body 内部
   * - 去掉 style/script/link/meta，避免污染整站
   * - 去掉事件属性与 javascript: URL
   * - 去掉会破坏深色玻璃阅读的 color/background 内联样式
   */
  const IFRAME_HOST_ALLOW = [
    'player.bilibili.com',
    'www.bilibili.com',
    'bilibili.com',
    'www.youtube.com',
    'youtube.com',
    'www.youtube-nocookie.com',
    'youtu.be',
    'player.youku.com',
    'v.qq.com',
    'open.spotify.com',
    'w.soundcloud.com',
    'embed.music.apple.com',
    'codepen.io',
    'codesandbox.io',
    'stackblitz.com',
    'player.vimeo.com'
  ];

  function isAllowedIframeSrc(src) {
    // 按需求：直接放行 iframe（仅拦 javascript: / data:）
    const s = String(src || '').trim();
    if (!s || /^\s*javascript:/i.test(s) || /^\s*data:/i.test(s)) return false;
    return true;
  }

  function normalizeIframeSrc(src) {
    const s = String(src || '').trim();
    if (s.startsWith('//')) return 'https:' + s;
    return s;
  }

  function sanitizeAdminHtml(html) {
    const raw = String(html || '').trim();
    if (!raw) return '';

    let fragmentHtml = '';
    const looksFullDoc = /<!doctype\s+html/i.test(raw) || /<html[\s>]/i.test(raw) || /<body[\s>]/i.test(raw);

    try {
      if (looksFullDoc && typeof DOMParser !== 'undefined') {
        const doc = new DOMParser().parseFromString(raw, 'text/html');
        // 注意：不要在这里删 iframe，后面白名单处理
        doc.querySelectorAll('script, style, link, meta, title, noscript, object, embed').forEach((n) => n.remove());
        fragmentHtml = (doc.body && doc.body.innerHTML) ? doc.body.innerHTML : '';
      } else {
        const tpl = document.createElement('template');
        tpl.innerHTML = raw;
        tpl.content.querySelectorAll('script, style, link, meta, title, noscript, object, embed').forEach((n) => n.remove());
        fragmentHtml = tpl.innerHTML;
      }
    } catch (_) {
      fragmentHtml = raw
        .replace(/<!doctype[^>]*>/gi, '')
        .replace(/<\/?(html|head|body)[^>]*>/gi, '')
        .replace(/<style[\s\S]*?<\/style>/gi, '')
        .replace(/<script[\s\S]*?<\/script>/gi, '');
    }

    const wrap = document.createElement('div');
    wrap.innerHTML = fragmentHtml;

    // 危险节点（iframe 单独处理）
    wrap.querySelectorAll('script, style, link, meta, title, noscript, object, embed, form').forEach((n) => n.remove());

    // iframe：直接渲染（含 //player.bilibili.com 协议相对地址）
    wrap.querySelectorAll('iframe').forEach((iframe) => {
      let src = iframe.getAttribute('src') || '';
      if (!isAllowedIframeSrc(src)) {
        iframe.remove();
        return;
      }
      src = normalizeIframeSrc(src);
      [...iframe.attributes].forEach((attr) => {
        const name = attr.name.toLowerCase();
        if (name.startsWith('on') || name === 'srcdoc') iframe.removeAttribute(attr.name);
      });
      iframe.setAttribute('src', src);
      iframe.setAttribute('loading', 'lazy');
      iframe.setAttribute('allowfullscreen', 'true');
      if (!iframe.getAttribute('allow')) {
        iframe.setAttribute('allow', 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen');
      }
      iframe.setAttribute('frameborder', '0');
      iframe.setAttribute('scrolling', iframe.getAttribute('scrolling') || 'no');
      iframe.classList.add('md-embed-iframe');
      if (!iframe.parentElement || !iframe.parentElement.classList.contains('md-embed')) {
        const box = document.createElement('div');
        box.className = 'md-embed';
        iframe.parentNode.insertBefore(box, iframe);
        box.appendChild(iframe);
      }
    });

    wrap.querySelectorAll('*').forEach((el) => {
      if (el.tagName === 'IFRAME') return; // 已处理
      [...el.attributes].forEach((attr) => {
        const name = attr.name.toLowerCase();
        const val = String(attr.value || '');
        if (name.startsWith('on') || name === 'srcdoc') {
          el.removeAttribute(attr.name);
          return;
        }
        if ((name === 'href' || name === 'src' || name === 'xlink:href') && /^\s*javascript:/i.test(val)) {
          el.removeAttribute(attr.name);
          return;
        }
        if (name === 'style') {
          const cleaned = val
            .replace(/(?:^|;)\s*(?:color|background|background-color|background-image|font-family)\s*:[^;]*/gi, '')
            .replace(/^;+|;+$/g, '')
            .trim();
          if (cleaned) el.setAttribute('style', cleaned);
          else el.removeAttribute('style');
        }
      });

      if (el.classList.contains('audio-player')) {
        el.classList.remove('audio-player');
        el.classList.add('md-audio-player');
      }
    });

    return wrap.innerHTML;
  }

  function renderArticleBodyHtml(content, contentType) {
    if ((contentType || '').toLowerCase() === 'html') {
      return sanitizeAdminHtml(content) || '';
    }
    return simpleMarkdownToHtml(content) || '';
  }

  function formatPlayerTime(sec) {
    if (!isFinite(sec) || sec < 0) return '0:00';
    const s = Math.floor(sec % 60);
    const m = Math.floor(sec / 60);
    return m + ':' + String(s).padStart(2, '0');
  }

  /** 自研液态玻璃音乐播放器（替换原生 controls） */
  /** 仿 HTML5 audio 控件：播放/暂停（仅图标）+ 进度 + 时间，无标题/音量条 */

  function parseLrcText(text) {
    const out = [];
    const lines = String(text || '').split(/\r?\n/);
    const tagRe = /\[(\d{1,2}):(\d{2})(?:\.(\d{1,3}))?\]/g;
    for (const raw of lines) {
      const line = String(raw || '');
      const times = [];
      let m;
      tagRe.lastIndex = 0;
      let last = 0;
      while ((m = tagRe.exec(line)) !== null) {
        const sec =
          parseInt(m[1], 10) * 60 +
          parseInt(m[2], 10) +
          (m[3] ? parseInt(String(m[3]).padEnd(3, '0').slice(0, 3), 10) / 1000 : 0);
        times.push(sec);
        last = tagRe.lastIndex;
      }
      const content = line.slice(last).trim();
      if (!times.length || !content) continue;
      times.forEach((t) => out.push({ t, text: content }));
    }
    out.sort((a, b) => a.t - b.t);
    return out;
  }

  function bindLyricsToAudio(lyricsEl, audio, cues) {
    if (!lyricsEl || !audio || !cues.length) return;
    const nodes = Array.from(lyricsEl.querySelectorAll('.md-lyrics-line'));
    if (!nodes.length) return;
    let active = -1;

    // 歌词滚动区域本身就是“播放条下界 → 歌词面板下界”的独立可滚动区域。
    // 不再给播放器区域预留覆盖层，因此歌词永远不会滚到播放条后面。
    const scrollLineIntoCenter = (node, smooth) => {
      if (!node || !lyricsEl) return;
      const box = lyricsEl.getBoundingClientRect();
      const line = node.getBoundingClientRect();
      const visibleCenter = box.top + box.height / 2;
      const lineCenter = line.top + line.height / 2;
      const delta = lineCenter - visibleCenter;
      const top = Math.max(0, lyricsEl.scrollTop + delta);

      try {
        if (smooth && typeof lyricsEl.scrollTo === 'function') {
          lyricsEl.scrollTo({ top, behavior: 'smooth' });
        } else {
          lyricsEl.scrollTop = top;
        }
      } catch (_) {
        lyricsEl.scrollTop = top;
      }
    };

    const tick = (opts) => {
      const smooth = !(opts && opts.instant);
      const forceScroll = !!(opts && opts.forceScroll);
      const t = audio.currentTime || 0;
      let idx = 0;
      for (let i = 0; i < cues.length; i++) {
        if (cues[i].t <= t + 0.08) idx = i;
        else break;
      }
      const changed = idx !== active;
      if (changed) {
        if (active >= 0 && nodes[active]) nodes[active].classList.remove('is-active');
        active = idx;
        if (nodes[active]) nodes[active].classList.add('is-active');
      }
      if (nodes[active] && (changed || forceScroll)) {
        const allowSync = (typeof lyricsSyncEnabled === 'undefined' || lyricsSyncEnabled !== false) && lyricsEl.dataset.syncScroll !== '0';
        if (allowSync) {
          const phone = (typeof isCoarseOrPhone === 'function' && isCoarseOrPhone());
          scrollLineIntoCenter(nodes[active], phone ? false : (smooth && !forceScroll));
        }
      }
    };

    audio.addEventListener('timeupdate', function() { tick({ instant: false }); });
    audio.addEventListener('seeked', function() { tick({ instant: true, forceScroll: true }); });
    audio.addEventListener('play', function() { tick({ instant: true, forceScroll: true }); });

    let keepAlive = null;
    audio.addEventListener('play', function() {
      if (keepAlive) clearInterval(keepAlive);
      keepAlive = setInterval(function() {
        if (audio.paused || audio.ended) {
          clearInterval(keepAlive);
          keepAlive = null;
          return;
        }
        if (active >= 0 && nodes[active] && (typeof lyricsSyncEnabled === 'undefined' || lyricsSyncEnabled !== false) && lyricsEl.dataset.syncScroll !== '0') {
          const phone = (typeof isCoarseOrPhone === 'function' && isCoarseOrPhone());
          scrollLineIntoCenter(nodes[active], !phone);
        }
      }, (typeof isCoarseOrPhone === 'function' && isCoarseOrPhone()) ? 2000 : 1200);
    });

    audio.addEventListener('pause', function() {
      if (keepAlive) { clearInterval(keepAlive); keepAlive = null; }
    });

    tick({ instant: true, forceScroll: true });
  }

  async function hydrateMdLyrics(root) {
    if (!root) return;
    const blocks = root.querySelectorAll('.md-lyrics[data-lyrics-src]');
    for (const el of blocks) {
      if (el.dataset.lyricsReady === '1') continue;
      el.dataset.lyricsReady = '1';
      const src = el.getAttribute('data-lyrics-src') || '';
      if (!src) {
        el.innerHTML = '<p class="md-lyrics-error">无效歌词链接</p>';
        continue;
      }
      try {
        const res = await fetch(src, { credentials: 'omit', cache: 'no-store' });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const text = await res.text();
        const cues = parseLrcText(text);
        if (cues.length) {
          el.innerHTML = cues.map((c, i) =>
            '<div class="md-lyrics-line" data-t="' + c.t + '" data-i="' + i + '">' + escapeHtml(c.text) + '</div>'
          ).join('');
          const song = el.closest('.md-song-block');
          const audio = song ? song.querySelector('audio') : null;
          const player = song ? song.querySelector('.glass-audio-player') : null;
          if (audio) bindLyricsToAudio(el, audio, cues);
          if (player && audio) ensureLyricsTools(el, player, audio);
        } else {
          const plain = String(text || '').trim();
          el.innerHTML = plain
            ? '<pre class="md-lyrics-plain">' + escapeHtml(plain) + '</pre>'
            : '<p class="md-lyrics-error">歌词为空</p>';
          // 纯文本歌词也挂工具栏（全屏/音量）
          const song = el.closest('.md-song-block');
          const audio = song ? song.querySelector('audio') : null;
          const player = song ? song.querySelector('.glass-audio-player') : null;
          if (player && audio) ensureLyricsTools(el, player, audio);
        }
      } catch (e) {
        console.warn('[md-lyrics]', src, e);
        // 失败时保留链接提示，不误伤其它功能
        el.innerHTML = '<p class="md-lyrics-error">歌词加载失败</p>';
      }
    }
  }


  const FADE_MS = 320;
  const audioFadeMap = new WeakMap();

  function cancelAudioFade(audio) {
    const prev = audioFadeMap.get(audio);
    if (prev && prev.id) cancelAnimationFrame(prev.id);
    audioFadeMap.delete(audio);
  }

  function fadeAudioVolume(audio, to, ms) {
    if (!audio) return Promise.resolve();
    cancelAudioFade(audio);
    const from = Math.max(0, Math.min(1, Number(audio.volume) || 0));
    const target = Math.max(0, Math.min(1, to));
    if (ms <= 0 || Math.abs(from - target) < 0.01) {
      audio.volume = target;
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      const start = performance.now();
      const state = { id: 0 };
      const step = (now) => {
        const t = Math.min(1, (now - start) / ms);
        // smoothstep
        const e = t * t * (3 - 2 * t);
        audio.volume = from + (target - from) * e;
        if (t < 1) {
          state.id = requestAnimationFrame(step);
        } else {
          audio.volume = target;
          audioFadeMap.delete(audio);
          resolve();
        }
      };
      audioFadeMap.set(audio, state);
      state.id = requestAnimationFrame(step);
    });
  }

  function isCoarseOrPhone() {
    try {
      if (document.documentElement.classList.contains('is-phone')) return true;
      if (window.matchMedia && window.matchMedia('(max-width: 480px)').matches) return true;
      if (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) return true;
    } catch (_) {}
    return false;
  }

  async function playWithFade(audio) {
    if (!audio) return;
    cancelAudioFade(audio);
    // 移动端跳过音量淡入，避免 timeupdate/主线程抢占导致一卡一卡
    if (isCoarseOrPhone()) {
      try { audio.volume = 1; } catch (_) {}
      try { await audio.play(); } catch (e) {
        try { audio.volume = 1; await audio.play(); } catch (_) {}
      }
      return;
    }
    try {
      audio.volume = 0;
      await audio.play();
      await fadeAudioVolume(audio, 1, FADE_MS);
    } catch (e) {
      try { audio.volume = 1; } catch (_) {}
    }
  }

  async function pauseWithFade(audio) {
    if (!audio) return;
    if (audio.paused) return;
    if (isCoarseOrPhone()) {
      try { audio.pause(); } catch (_) {}
      try { audio.volume = 1; } catch (_) {}
      return;
    }
    try {
      await fadeAudioVolume(audio, 0, FADE_MS);
    } catch (_) {}
    try { audio.pause(); } catch (_) {}
    try { audio.volume = 1; } catch (_) {}
  }


  function appleSpinnerHtml(sizeClass) {
    const cls = sizeClass ? ('apple-spinner ' + sizeClass) : 'apple-spinner';
    const bars = Array.from({ length: 12 }, () => '<span class="bar"></span>').join('');
    return '<span class="' + cls + '" aria-hidden="true">' + bars + '</span>';
  }
  function loadingPlaceholderHtml(text) {
    return '<div class="loading-placeholder">' + appleSpinnerHtml('is-sm') + '<span>' + String(text || '加载中…') + '</span></div>';
  }




  // ============================================================
  //  音频迷你坞 / 播放列表 / 全屏 / 磁吸
  // ============================================================
  let dockedPlayerEl = null;       // 文内原始 glass-audio-player（可能已从 DOM 摘掉）
  let dockedAudioEl = null;        // 正在坞里控制的 audio
  let dockedArticleSlug = null;
  let miniDockEl = null;           // 独立正圆形迷你坞按钮
  let audioFsBackdrop = null;
  let lyricsSyncEnabled = true;
  let dockAnimPromise = null;

  function getCurrentArticleSlug() {
    try {
      return (history.state && history.state.blogSlug) || parseBlogSlugFromLocation() || null;
    } catch (_) {
      return null;
    }
  }

  let fsRestoreParent = null;
  let fsRestoreNext = null;
  let fsPlaceholder = null;

  function ensureAudioFsBackdrop() {
    if (audioFsBackdrop && audioFsBackdrop.isConnected) return audioFsBackdrop;
    audioFsBackdrop = document.createElement('div');
    audioFsBackdrop.className = 'audio-player-fs-backdrop';
    audioFsBackdrop.addEventListener('click', () => exitAudioFullscreen());
    document.body.appendChild(audioFsBackdrop);
    return audioFsBackdrop;
  }

  function syncFsToolButtons(active) {
    document.querySelectorAll('.md-lyrics-tool-btn[data-tool="fs"]').forEach((btn) => {
      const icon = btn.querySelector('i');
      if (active) {
        btn.title = '退出全屏';
        btn.setAttribute('aria-label', '缩小');
        btn.classList.add('is-fs-active');
        if (icon) icon.className = 'fas fa-compress';
      } else {
        btn.title = '全屏放大';
        btn.setAttribute('aria-label', '全屏');
        btn.classList.remove('is-fs-active');
        if (icon) icon.className = 'fas fa-expand';
      }
    });
  }

  function exitAudioFullscreen() {
    const host = document.querySelector('.md-song-block.is-fs-host');
    if (host) {
      host.classList.remove('is-fs-host', 'is-fs-zoom');
      host.style.removeProperty('--fs-w');
      if (fsPlaceholder && fsPlaceholder.parentNode) {
        fsPlaceholder.parentNode.insertBefore(host, fsPlaceholder);
        fsPlaceholder.remove();
      } else if (fsRestoreParent) {
        if (fsRestoreNext && fsRestoreNext.parentNode === fsRestoreParent) {
          fsRestoreParent.insertBefore(host, fsRestoreNext);
        } else {
          fsRestoreParent.appendChild(host);
        }
      }
    }
    fsPlaceholder = null;
    fsRestoreParent = null;
    fsRestoreNext = null;
    document.querySelectorAll('.glass-audio-player.is-fs-zoom').forEach((p) => {
      p.classList.remove('is-fs-zoom');
    });
    if (audioFsBackdrop) audioFsBackdrop.classList.remove('is-open');
    document.body.classList.remove('audio-fs-open');
    syncFsToolButtons(false);
  }

  function enterAudioFullscreen(player) {
    if (!player) return;
    const block = player.closest('.md-song-block');
    if (!block) return;
    // 已在全屏则忽略
    if (block.classList.contains('is-fs-zoom')) return;

    ensureAudioFsBackdrop();

    // 确保展开（内部：播放条 + 歌词面板 + 滚动区 结构不变）
    if (!player.classList.contains('is-expanded') && !player.classList.contains('is-expanding')) {
      player.classList.remove('is-collapsed', 'is-collapsing');
      player.classList.add('is-expanding', 'is-expanded');
      player.setAttribute('data-player-state', 'expanded');
      const lyrics = block.querySelector('.md-lyrics');
      if (lyrics) lyrics.classList.add('is-expanded');
      block.classList.add('is-player-open');
    }

    // 记下原位置，把整块挂到 body，避免祖先 stacking context 让蒙版盖住播放器
    fsRestoreParent = block.parentNode;
    fsRestoreNext = block.nextSibling;
    fsPlaceholder = document.createElement('div');
    fsPlaceholder.className = 'md-song-fs-placeholder';
    fsPlaceholder.style.cssText = 'height:' + Math.round(block.getBoundingClientRect().height) + 'px;margin:0.9rem 0 1.1rem;';
    if (fsRestoreParent) {
      fsRestoreParent.insertBefore(fsPlaceholder, block);
    }

    const w = Math.min(Math.max(block.getBoundingClientRect().width, 280), window.innerWidth * 0.86);
    block.style.setProperty('--fs-w', w + 'px');
    block.classList.add('is-fs-host', 'is-fs-zoom');
    // 不改内部 DOM，不给 player 单独加破坏布局的 fixed
    player.classList.remove('is-fs-zoom');

    // 顺序：先 backdrop，再 block，保证 z-index 同层时 block 在上
    document.body.appendChild(audioFsBackdrop);
    document.body.appendChild(block);
    document.body.classList.add('audio-fs-open');
    syncFsToolButtons(true);

    requestAnimationFrame(() => {
      if (audioFsBackdrop) audioFsBackdrop.classList.add('is-open');
    });
  }

  function getArticlePlaylist(root) {
    if (!root) return [];
    return Array.from(root.querySelectorAll('.glass-audio-player audio')).filter(Boolean);
  }

  function playNextInPlaylist(currentAudio) {
    // 已取消自动连播：播完即停
    return;
  }

  function syncMiniDockIcon() {
    if (!miniDockEl || !dockedAudioEl) return;
    const icon = miniDockEl.querySelector('i');
    if (!icon) return;
    const playing = !dockedAudioEl.paused && !dockedAudioEl.ended;
    icon.className = playing ? 'fas fa-pause' : 'fas fa-play';
    miniDockEl.classList.toggle('is-playing', playing);
    miniDockEl.classList.toggle('is-loading', !!(dockedAudioEl && dockedAudioEl.readyState < 2 && !dockedAudioEl.error));
  }

  function ensureMiniDock() {
    if (miniDockEl && miniDockEl.isConnected) return miniDockEl;
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'audio-mini-dock';
    el.setAttribute('aria-label', '播放/暂停');
    el.innerHTML = '<i class="fas fa-pause"></i><span class="audio-mini-dock-ring" aria-hidden="true"></span>';
    el.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (!dockedAudioEl) return;
      if (dockedAudioEl.paused) {
        playWithFade(dockedAudioEl).then(syncMiniDockIcon).catch(() => {
          try { dockedAudioEl.play(); } catch (_) {}
          syncMiniDockIcon();
        });
      } else {
        pauseWithFade(dockedAudioEl).then(syncMiniDockIcon).catch(() => {
          try { dockedAudioEl.pause(); } catch (_) {}
          syncMiniDockIcon();
        });
      }
    });
    document.body.appendChild(el);
    miniDockEl = el;
    return el;
  }

  /**
   * 先把播放中的音频收成正圆迷你坞，平滑飞到左下角，完成后再 resolve。
   * 不暂停；坞仅播放按钮。
   */
  function dockPlayingAudioOnExit() {
    exitAudioFullscreen();
    // 已有迷你坞在飞或已落位：直接完成
    if (miniDockEl && miniDockEl.classList.contains('is-visible') && dockedAudioEl && !dockedAudioEl.paused) {
      return Promise.resolve();
    }

    const players = Array.from(document.querySelectorAll('#blogArticleBody .glass-audio-player'));
    let playing = null;
    players.forEach((pl) => {
      const a = pl.querySelector('audio');
      if (a && !a.paused && !a.ended) playing = pl;
    });
    if (!playing) {
      players.forEach((pl) => {
        if (typeof pl._hardSnapCollapsed === 'function') pl._hardSnapCollapsed(pl);
      });
      return Promise.resolve();
    }

    const audio = playing.querySelector('audio');
    if (!audio) return Promise.resolve();

    dockedArticleSlug = getCurrentArticleSlug();
    dockedPlayerEl = playing;
    dockedAudioEl = audio;

    // 文内播放器硬收起（视觉），音频继续播
    if (typeof playing._setExpandedState === 'function') {
      playing._setExpandedState(false);
    } else {
      playing.classList.remove('is-expanding', 'is-expanded');
      playing.classList.add('is-collapsed');
      playing.setAttribute('data-player-state', 'collapsed');
      const block = playing.closest('.md-song-block');
      if (block) {
        block.classList.remove('is-player-open');
        const ly = block.querySelector('.md-lyrics');
        if (ly) ly.classList.remove('is-expanded');
      }
    }

    const rect = playing.getBoundingClientRect();
    // 圆形尺寸与收起态播放器一致
    const size = Math.round(rect.height || 50) || 50;
    const dock = ensureMiniDock();
    dock.classList.remove('is-visible', 'is-settled');
    dock.style.width = size + 'px';
    dock.style.height = size + 'px';
    dock.style.left = rect.left + 'px';
    dock.style.top = rect.top + 'px';
    dock.style.bottom = 'auto';
    dock.style.right = 'auto';
    dock.style.transform = 'none';
    dock.style.transition = 'none';
    dock.classList.add('is-visible', 'is-flying');
    syncMiniDockIcon();

    // 绑定 audio 事件刷新图标
    const onPlay = () => syncMiniDockIcon();
    const onPause = () => syncMiniDockIcon();
    const onEnded = () => {
      syncMiniDockIcon();
      // 结束后可保留坞（暂停态），不强拆
    };
    audio.addEventListener('play', onPlay);
    audio.addEventListener('pause', onPause);
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('waiting', onPlay);
    audio.addEventListener('playing', onPlay);
    dock._cleanupAudioListeners = () => {
      audio.removeEventListener('play', onPlay);
      audio.removeEventListener('pause', onPause);
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('waiting', onPlay);
      audio.removeEventListener('playing', onPlay);
    };

    // 把 audio 节点挪到 body，避免文章 body 被清空时中断播放
    // （仍挂在 dock 旁隐藏）
    if (audio.parentNode !== document.body) {
      // 保留在原 player 内也可以，只要 player 所在 song-block 不被 destroy
      // 关文会清空 blogArticleBody —— 必须移出
      const holder = document.createElement('div');
      holder.className = 'audio-dock-audio-holder';
      holder.style.cssText = 'position:fixed;left:-9999px;width:0;height:0;overflow:hidden;';
      holder.appendChild(audio);
      document.body.appendChild(holder);
      dock._audioHolder = holder;
    }

    dockAnimPromise = new Promise((resolve) => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const destLeft = 16;
          const destBottom = 18;
          dock.style.transition =
            'left 0.58s cubic-bezier(0.32, 0.72, 0, 1), top 0.58s cubic-bezier(0.32, 0.72, 0, 1), bottom 0.58s cubic-bezier(0.32, 0.72, 0, 1), width 0.4s ease, height 0.4s ease';
          dock.style.left = destLeft + 'px';
          dock.style.top = 'auto';
          dock.style.bottom = destBottom + 'px';
          dock.style.width = '50px';
          dock.style.height = '50px';
          const done = () => {
            dock.classList.remove('is-flying');
            dock.classList.add('is-settled');
            dock.style.transition = '';
            resolve();
          };
          dock.addEventListener('transitionend', done, { once: true });
          setTimeout(done, 700);
        });
      });
    });
    return dockAnimPromise;
  }

  function destroyMiniDock() {
    if (miniDockEl && miniDockEl._cleanupAudioListeners) {
      try { miniDockEl._cleanupAudioListeners(); } catch (_) {}
    }
    if (miniDockEl && miniDockEl._audioHolder) {
      try { miniDockEl._audioHolder.remove(); } catch (_) {}
    }
    if (miniDockEl) {
      miniDockEl.classList.remove('is-visible', 'is-settled', 'is-flying');
      try { miniDockEl.remove(); } catch (_) {}
    }
    miniDockEl = null;
    dockedAudioEl = null;
    dockedPlayerEl = null;
    dockedArticleSlug = null;
    dockAnimPromise = null;
  }

  /** 回到同一篇文章：把「正在播」的同一个 audio 节点移回播放器，不 pause/不新建，避免卡顿 */
  function restoreDockedPlayerOnEnter(slug) {
    if (!dockedAudioEl || !miniDockEl || !miniDockEl.classList.contains('is-visible')) return;
    if (!(slug && dockedArticleSlug && String(slug) === String(dockedArticleSlug))) {
      return; // 其它文章：坞继续播
    }

    const body = document.getElementById('blogArticleBody');
    if (!body) return;
    const src = dockedAudioEl.src || dockedAudioEl.getAttribute('src') || '';
    let targetPlayer = null;
    let staleAudio = null;
    body.querySelectorAll('.glass-audio-player').forEach((pl) => {
      if (targetPlayer) return;
      const a = pl.querySelector('audio');
      if (!a) return;
      const s = a.src || a.getAttribute('src') || '';
      if (src && (s === src || (s && src.indexOf(s.split('?')[0]) !== -1) || (src && s.indexOf(src.split('?')[0]) !== -1))) {
        targetPlayer = pl;
        staleAudio = a;
      }
    });
    if (!targetPlayer) return;

    // 关键：不新建、不 pause —— 把坞里那个还在播的 audio 直接塞回目标播放器
    try {
      if (staleAudio && staleAudio !== dockedAudioEl) {
        // 文内新渲染的空壳 audio 删掉
        staleAudio.remove();
      }
      if (dockedAudioEl.parentNode !== targetPlayer) {
        targetPlayer.appendChild(dockedAudioEl);
      }
      dockedAudioEl.dataset.glassPlayer = '1';
      // 若被浏览器挂起，尝试 resume（多数情况仍在播）
      if (dockedAudioEl.paused && !dockedAudioEl.ended) {
        dockedAudioEl.play().catch(() => {});
      }
    } catch (_) {}

    if (miniDockEl._cleanupAudioListeners) {
      try { miniDockEl._cleanupAudioListeners(); } catch (_) {}
    }
    const holder = miniDockEl._audioHolder;
    miniDockEl.classList.remove('is-visible', 'is-settled', 'is-flying');
    try { miniDockEl.remove(); } catch (_) {}
    miniDockEl = null;
    if (holder) {
      try { holder.remove(); } catch (_) {}
    }

    const liveAudio = dockedAudioEl;
    dockedAudioEl = null;
    dockedPlayerEl = null;
    dockedArticleSlug = null;

    // 重新绑定该播放器的 UI 到这个仍在播的 audio
    if (typeof targetPlayer._rebindAudio === 'function') {
      try { targetPlayer._rebindAudio(liveAudio); } catch (_) {}
    }

    if (targetPlayer._setExpandedState) targetPlayer._setExpandedState(true);
    else {
      targetPlayer.classList.remove('is-collapsed', 'is-collapsing');
      targetPlayer.classList.add('is-expanded');
      targetPlayer.setAttribute('data-player-state', 'expanded');
      const block = targetPlayer.closest('.md-song-block');
      if (block) {
        block.classList.add('is-player-open');
        const ly = block.querySelector('.md-lyrics');
        if (ly) ly.classList.add('is-expanded');
      }
    }
  }

  /** 歌词工具栏挂在 song-block 上（不在可滚动歌词区内），右下角常驻 */
  function ensureLyricsTools(lyricsEl, player, audio) {
    if (!lyricsEl || !player || !audio) return;
    const song = lyricsEl.closest('.md-song-block') || player.closest('.md-song-block');
    if (!song) return;
    if (song.querySelector(':scope > .md-lyrics-tools')) return;

    const tools = document.createElement('div');
    tools.className = 'md-lyrics-tools';
    tools.innerHTML =
      `<button type="button" class="md-lyrics-tool-btn" data-tool="fs" title="全屏放大" aria-label="全屏"><i class="fas fa-expand"></i></button>` +
      `<button type="button" class="md-lyrics-tool-btn" data-tool="vol" title="音量" aria-label="音量"><i class="fas fa-volume-up"></i>` +
        `<div class="md-volume-popover" hidden><div class="md-volume-track"><div class="md-volume-fill"></div></div></div>` +
      `</button>` +
      `<button type="button" class="md-lyrics-tool-btn is-on" data-tool="sync" title="歌词同步滚动" aria-label="同步滚动"><i class="fas fa-align-left"></i></button>`;
    song.appendChild(tools);

    const volBtn = tools.querySelector('[data-tool="vol"]');
    const pop = tools.querySelector('.md-volume-popover');
    const volTrack = tools.querySelector('.md-volume-track');
    const volFill = tools.querySelector('.md-volume-fill');

    const syncVolUi = () => {
      const v = Math.min(1, Math.max(0, Number(audio.volume) || 0));
      if (volFill) volFill.style.height = (v * 100) + '%';
    };
    syncVolUi();

    tools.querySelector('[data-tool="fs"]').addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const block = player.closest('.md-song-block');
      if ((block && block.classList.contains('is-fs-zoom')) || player.classList.contains('is-fs-zoom')) exitAudioFullscreen();
      else enterAudioFullscreen(player);
    });

    tools.querySelector('[data-tool="sync"]').addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      lyricsSyncEnabled = !lyricsSyncEnabled;
      e.currentTarget.classList.toggle('is-on', lyricsSyncEnabled);
      lyricsEl.dataset.syncScroll = lyricsSyncEnabled ? '1' : '0';
    });

    volBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const open = !pop.classList.contains('is-open');
      pop.hidden = false;
      requestAnimationFrame(() => pop.classList.toggle('is-open', open));
      if (!open) setTimeout(() => { if (!pop.classList.contains('is-open')) pop.hidden = true; }, 220);
    });

    const setVolFromClientY = (clientY) => {
      const r = volTrack.getBoundingClientRect();
      const ratio = 1 - Math.min(1, Math.max(0, (clientY - r.top) / Math.max(1, r.height)));
      try { audio.volume = ratio; } catch (_) {}
      syncVolUi();
    };
    let volDragging = false;
    volTrack.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      volDragging = true;
      try { volTrack.setPointerCapture(e.pointerId); } catch (_) {}
      setVolFromClientY(e.clientY);
    });
    volTrack.addEventListener('pointermove', (e) => {
      if (!volDragging) return;
      setVolFromClientY(e.clientY);
    });
    const endVol = () => { volDragging = false; };
    volTrack.addEventListener('pointerup', endVol);
    volTrack.addEventListener('pointercancel', endVol);
    document.addEventListener('click', (e) => {
      if (!pop.contains(e.target) && e.target !== volBtn && !volBtn.contains(e.target)) {
        pop.classList.remove('is-open');
      }
    });
  }

  function buildGlassAudioPlayer(audio) {
    audio.removeAttribute('controls');
    audio.preload = audio.preload || 'metadata';
    audio.style.display = 'none';

    const player = document.createElement('div');
    player.className = 'md-audio-player glass-audio-player h5-like is-collapsed';
    player.setAttribute('data-player-state', 'collapsed');
    player.innerHTML =
      `<div class="gap-load-ring" aria-hidden="true"></div>` +
      `<div class="gap-main">` +
        `<button type="button" class="gap-play" aria-label="播放/暂停"><i class="fas fa-play"></i>` +
          appleSpinnerHtml('is-sm') +
        `</button>` +
        `<span class="gap-time gap-cur">0:00</span>` +
        `<div class="gap-seek" role="slider" tabindex="0" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">` +
          `<div class="gap-seek-track"><div class="gap-seek-fill"></div></div>` +
        `</div>` +
        `<span class="gap-time gap-dur">0:00</span>` +
      `</div>`;

    if (audio.parentNode) {
      const oldShell = audio.closest('.md-audio-player');
      if (oldShell && oldShell !== player) {
        oldShell.parentNode.insertBefore(player, oldShell);
        player.appendChild(audio);
        oldShell.remove();
      } else {
        audio.parentNode.insertBefore(player, audio);
        player.appendChild(audio);
      }
    }

    const song = player.closest('.md-song-block');
    const lyrics = song ? song.querySelector('.md-lyrics') : null;
    const playBtn = player.querySelector('.gap-play');
    const playIcon = playBtn.querySelector('i');
    const curEl = player.querySelector('.gap-cur');
    const durEl = player.querySelector('.gap-dur');
    const seek = player.querySelector('.gap-seek');
    const fill = player.querySelector('.gap-seek-fill');
    const loadRing = player.querySelector('.gap-load-ring');

    let seeking = false;
    let collapseTimer = null;
    let expandTimer = null;
    let magnetCooldownUntil = 0;
    let magnetHoldTimer = null;
    let magnetActive = false;
    let magnetLastPos = null;
    let magnetLastMoveAt = 0;

    const clearCollapseTimer = () => {
      if (collapseTimer) {
        clearTimeout(collapseTimer);
        collapseTimer = null;
      }
    };

    const clearExpandTimer = () => {
      if (expandTimer) {
        clearTimeout(expandTimer);
        expandTimer = null;
      }
    };

    const setSongBlockOpen = (open) => {
      if (!song) return;
      song.classList.toggle('is-player-open', !!open);
    };

    const setExpandedState = (expanded) => {
      clearExpandTimer();
      if (expanded) {
        player.classList.remove('is-collapsing');
        player.classList.add('is-expanding');
        player.classList.remove('is-collapsed');
        player.setAttribute('data-player-state', 'expanding');
        setSongBlockOpen(true);

        // 第一阶段：圆形播放按钮缩小；第二阶段：播放条向右展开；
        // 第三阶段：歌词面板从播放条下方展开。
        expandTimer = setTimeout(() => {
          player.classList.add('is-expanded');
          player.setAttribute('data-player-state', 'expanded');
          if (lyrics) lyrics.classList.add('is-expanded');
          expandTimer = null;
        }, 180);
      } else {
        clearCollapseTimer();
        // 收起前必须先释放磁吸，否则进度条消失后自定义光标会卡在吸附态
        try {
          if (typeof releaseMagnet === 'function' && magnetActive) releaseMagnet(true);
        } catch (_) {}
        player.classList.remove('is-expanding', 'is-expanded');
        player.classList.add('is-collapsing');
        player.setAttribute('data-player-state', 'collapsing');
        if (lyrics) lyrics.classList.remove('is-expanded');

        // 等歌词面板收起后，再把播放条缩回圆形（与 CSS 0.52s 对齐）。
        expandTimer = setTimeout(() => {
          player.classList.remove('is-collapsing');
          player.classList.add('is-collapsed');
          player.setAttribute('data-player-state', 'collapsed');
          setSongBlockOpen(false);
          expandTimer = null;
        }, 520);
      }
    };

    const hardSnapCollapsed = (el) => {
      if (!el) return;
      if (el._collapseTimer) {
        clearTimeout(el._collapseTimer);
        el._collapseTimer = null;
      }
      delete el.dataset.collapseToken;
      // 禁止过渡，避免 width 从错误值动画回圆形
      el.classList.add('is-no-motion');
      el.classList.remove('is-expanding', 'is-expanded', 'is-collapsing');
      el.classList.add('is-collapsed');
      el.setAttribute('data-player-state', 'collapsed');
      el.style.width = '';
      el.style.minWidth = '';
      el.style.maxWidth = '';
      el.style.padding = '';
      const block = el.closest('.md-song-block');
      if (block) {
        block.classList.remove('is-player-open');
        const ly = block.querySelector('.md-lyrics');
        if (ly) ly.classList.remove('is-expanded');
      }
      // 下一帧再允许过渡（仅对真正展开的实例有意义）
      requestAnimationFrame(() => {
        requestAnimationFrame(() => el.classList.remove('is-no-motion'));
      });
    };

    const collapseOtherPlayers = () => {
      const circleMax = 72; // 圆形播放器视觉上限（player-h≈50，留余量）
      document.querySelectorAll('.glass-audio-player').forEach((other) => {
        if (other === player) return;

        const otherAudio = other.querySelector('audio');
        if (otherAudio && !otherAudio.paused) {
          pauseWithFade(otherAudio);
        }

        // 以「实际渲染宽度」为准，不信任可能不同步的 class
        let visualW = 0;
        try { visualW = other.getBoundingClientRect().width || 0; } catch (_) {}
        const looksExpanded = visualW > circleMax;

        if (!looksExpanded) {
          // 看起来就是圆：硬重置为收起，绝不走 is-collapsing（否则会先变宽再缩回）
          hardSnapCollapsed(other);
          return;
        }

        // 确实是展开的宽条：做一次收起动画
        if (other._collapseTimer) {
          clearTimeout(other._collapseTimer);
          other._collapseTimer = null;
        }
        other.classList.remove('is-no-motion', 'is-expanding', 'is-expanded', 'is-collapsed');
        other.classList.add('is-collapsing');
        other.setAttribute('data-player-state', 'collapsing');
        const otherBlock = other.closest('.md-song-block');
        const otherLyrics = otherBlock ? otherBlock.querySelector('.md-lyrics') : null;
        if (otherLyrics) otherLyrics.classList.remove('is-expanded');
        const collapseToken = String(Date.now()) + Math.random();
        other.dataset.collapseToken = collapseToken;
        other._collapseTimer = setTimeout(() => {
          other._collapseTimer = null;
          if (other.dataset.collapseToken !== collapseToken) return;
          hardSnapCollapsed(other);
        }, 520);
      });
    };

    const expandAndPlay = () => {
      clearCollapseTimer();
      collapseOtherPlayers();
      setExpandedState(true);
      playWithFade(audio);
    };

    const scheduleCollapseAfterPause = () => {
      clearCollapseTimer();
      collapseTimer = setTimeout(() => {
        collapseTimer = null;
        if (!audio.paused || audio.ended) return;
        // 全屏 / 展开态下若鼠标仍磁吸在进度条上，不收起；否则收起后进度条消失，光标圆球会卡死
        const inFs = !!(document.body.classList.contains('audio-fs-open')
          || (song && song.classList.contains('is-fs-zoom')));
        if (magnetActive || (inFs && document.body.classList.contains('is-seek-magnet'))) {
          // 仍吸附：稍后再检查，不强制收起
          scheduleCollapseAfterPause();
          return;
        }
        setExpandedState(false);
      }, 10000);
    };

    const scheduleCollapseAfterEnded = () => {
      clearCollapseTimer();
      collapseTimer = setTimeout(() => {
        if (audio.ended) setExpandedState(false);
        collapseTimer = null;
      }, 3000);
    };

    const syncLoadingUi = () => {
      const loading = !audio.error && (
        audio.readyState < 2 ||
        (player._waiting === true)
      );
      player.classList.toggle('is-loading', loading);
      if (loading) {
        playBtn.setAttribute('aria-busy', 'true');
      } else {
        playBtn.removeAttribute('aria-busy');
      }
      // 收起态：用 buffered 进度驱动扇形 0～360
      try {
        let pct = 0;
        if (audio.buffered && audio.buffered.length && audio.duration && isFinite(audio.duration) && audio.duration > 0) {
          const end = audio.buffered.end(audio.buffered.length - 1);
          pct = Math.min(1, Math.max(0, end / audio.duration));
        } else if (audio.readyState >= 4) {
          pct = 1;
        } else if (audio.readyState >= 2) {
          pct = 0.55;
        } else if (audio.readyState >= 1) {
          pct = 0.2;
        }
        if (loadRing) loadRing.style.setProperty('--load-progress', String(Math.round(pct * 360)));
      } catch (_) {}
    };

    const syncPlayUi = () => {
      const playing = !audio.paused && !audio.ended;
      playIcon.className = playing ? 'fas fa-pause' : 'fas fa-play';
      player.classList.toggle('is-playing', playing);
      syncLoadingUi();
    };

    const syncProgress = () => {
      const d = audio.duration || 0;
      const t = audio.currentTime || 0;
      const p = d > 0 ? (t / d) * 100 : 0;
      if (!seeking) {
        fill.style.width = p + '%';
        seek.setAttribute('aria-valuenow', String(Math.round(p)));
      }
      curEl.textContent = formatPlayerTime(t);
      durEl.textContent = formatPlayerTime(d);
    };

    // 左键：展开并播放 / 暂停；右键收起态：仅展开不播放
    playBtn.addEventListener('click', (e) => {
      if (e.button !== 0) return;
      // 收起态加载中：不可展开
      if (player.classList.contains('is-collapsed') && player.classList.contains('is-loading')) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      if (player.classList.contains('is-docked') && player.classList.contains('is-loading')) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      if (audio.paused) {
        expandAndPlay();
      } else {
        pauseWithFade(audio);
      }
    });
    playBtn.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (player.classList.contains('is-collapsed') && player.classList.contains('is-loading')) return;
      // 收起态右键：展开但不播放；已展开则仅保持展开
      if (player.classList.contains('is-collapsed') || player.classList.contains('is-collapsing')) {
        collapseOtherPlayers();
        setExpandedState(true);
      }
    });

    const seekFromEvent = (clientX) => {
      const rect = seek.getBoundingClientRect();
      const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / Math.max(1, rect.width)));
      if (audio.duration) audio.currentTime = ratio * audio.duration;
      fill.style.width = (ratio * 100) + '%';
    };

    seek.addEventListener('pointerdown', (e) => {
      seeking = true;
      seek.setPointerCapture(e.pointerId);
      seekFromEvent(e.clientX);
    });
    seek.addEventListener('pointermove', (e) => {
      if (!seeking) return;
      seekFromEvent(e.clientX);
    });
    seek.addEventListener('pointerup', (e) => {
      seeking = false;
      try { seek.releasePointerCapture(e.pointerId); } catch (_) {}
    });
    seek.addEventListener('pointercancel', () => { seeking = false; });

    audio.addEventListener('play', () => {
      clearCollapseTimer();
      syncPlayUi();
    });
    audio.addEventListener('pause', () => {
      player._waiting = false;
      syncPlayUi();
      if (!audio.ended) scheduleCollapseAfterPause();
    });
    audio.addEventListener('ended', () => {
      player._waiting = false;
      syncPlayUi();
      // 播完立即挣脱磁吸，小白点回到真实鼠标位置
      try {
        if (magnetActive) releaseMagnet(true);
        const mx = (typeof lastPointerX === 'number' && lastPointerX) ? lastPointerX : (window.innerWidth / 2);
        const my = (typeof lastPointerY === 'number' && lastPointerY) ? lastPointerY : (window.innerHeight / 2);
        if (typeof moveCustomCursor === 'function') moveCustomCursor(mx, my);
        else if (typeof window.__maxsuiMoveCustomCursor === 'function') window.__maxsuiMoveCustomCursor(mx, my);
      } catch (_) {}
      // 全屏中播完：退出全屏，回到展开态（无自动连播）
      const block = player.closest('.md-song-block');
      const inFs = !!(document.body.classList.contains('audio-fs-open') || (block && block.classList.contains('is-fs-zoom')));
      if (inFs) {
        try { exitAudioFullscreen(); } catch (_) {}
        try {
          if (typeof setExpandedState === 'function') setExpandedState(true);
          else {
            player.classList.remove('is-collapsed', 'is-collapsing');
            player.classList.add('is-expanded');
            player.setAttribute('data-player-state', 'expanded');
            if (block) {
              block.classList.add('is-player-open');
              const ly = block.querySelector('.md-lyrics');
              if (ly) ly.classList.add('is-expanded');
            }
          }
        } catch (_) {}
        scheduleCollapseAfterEnded();
        return;
      }
      scheduleCollapseAfterEnded();
    });
    audio.addEventListener('waiting', () => {
      player._waiting = true;
      syncLoadingUi();
    });
    audio.addEventListener('loadstart', () => {
      player._waiting = true;
      syncLoadingUi();
    });
    audio.addEventListener('stalled', () => {
      player._waiting = true;
      syncLoadingUi();
    });
    audio.addEventListener('progress', () => { syncLoadingUi(); });
    audio.addEventListener('canplay', () => {
      player._waiting = false;
      syncLoadingUi();
      syncProgress();
    });
    audio.addEventListener('canplaythrough', () => {
      player._waiting = false;
      syncLoadingUi();
    });
    audio.addEventListener('playing', () => {
      player._waiting = false;
      syncPlayUi();
    });
    let _progRaf = 0;
    const syncProgressThrottled = () => {
      if (_progRaf) return;
      _progRaf = requestAnimationFrame(() => {
        _progRaf = 0;
        syncProgress();
      });
    };
    audio.addEventListener('timeupdate', isCoarseOrPhone() ? syncProgressThrottled : syncProgress);
    audio.addEventListener('loadedmetadata', () => {
      syncProgress();
      syncLoadingUi();
    });
    audio.addEventListener('durationchange', syncProgress);
    audio.addEventListener('error', () => {
      player._waiting = false;
      player.classList.remove('is-loading');
      syncPlayUi();
    });

    // 暴露给迷你坞 / 外部控制
    player._setExpandedState = setExpandedState;
    player._hardSnapCollapsed = hardSnapCollapsed;
    player._expandAndPlay = expandAndPlay;

    // ---------- 磁吸：整块播放+歌词卡片内停留 ≥2s → 吸到进度点并跟随；剧烈晃动挣脱冷却 10s ----------
    const MAGNET_HOLD_MS = 2000;
    const MAGNET_COOLDOWN_MS = 10000;
    const MAGNET_SHAKE_PX = 14;

    let magnetFollowRaf = 0;
    let magnetCursorX = 0;
    let magnetCursorY = 0;
    let magnetAnimRaf = 0;
    const songBlock = player.closest('.md-song-block');

    function getProgressPoint() {
      if (!audio.duration || !seek) return null;
      const track = seek.querySelector('.gap-seek-track') || seek;
      const rect = track.getBoundingClientRect();
      if (rect.width <= 0) return null;
      const ratio = Math.min(1, Math.max(0, (audio.currentTime || 0) / audio.duration));
      return {
        x: rect.left + ratio * rect.width,
        y: rect.top + rect.height / 2
      };
    }

    function setMagnetCursorVisual(on) {
      if (songBlock) songBlock.classList.toggle('is-magnet-active', !!on);
      document.body.classList.toggle('is-seek-magnet', !!on);
      try {
        if (on) {
          document.documentElement.style.cursor = 'none';
          document.body.style.cursor = 'none';
          if (typeof setCursorVisible === 'function') setCursorVisible(true);
          if (typeof clearAllTrailDots === 'function') clearAllTrailDots();
        } else {
          document.documentElement.style.cursor = '';
          document.body.style.cursor = '';
        }
      } catch (_) {}
    }

    function moveCursorSmooth(toX, toY, durationMs) {
      return new Promise((resolve) => {
        const fromX = magnetCursorX || toX;
        const fromY = magnetCursorY || toY;
        const start = performance.now();
        const dur = Math.max(160, durationMs || 360);
        if (magnetAnimRaf) cancelAnimationFrame(magnetAnimRaf);
        const step = (now) => {
          const t = Math.min(1, (now - start) / dur);
          const e = t * t * (3 - 2 * t);
          const x = fromX + (toX - fromX) * e;
          const y = fromY + (toY - fromY) * e;
          magnetCursorX = x;
          magnetCursorY = y;
          if (typeof window.__maxsuiMoveCustomCursor === 'function') {
            window.__maxsuiMoveCustomCursor(x, y);
          }
          if (t < 1) magnetAnimRaf = requestAnimationFrame(step);
          else {
            magnetAnimRaf = 0;
            resolve();
          }
        };
        magnetAnimRaf = requestAnimationFrame(step);
      });
    }

    function magnetFollowLoop() {
      if (!magnetActive) {
        magnetFollowRaf = 0;
        return;
      }
      const pt = getProgressPoint();
      if (pt) {
        magnetCursorX = pt.x;
        magnetCursorY = pt.y;
        if (typeof window.__maxsuiMoveCustomCursor === 'function') {
          window.__maxsuiMoveCustomCursor(pt.x, pt.y);
        }
      }
      magnetFollowRaf = requestAnimationFrame(magnetFollowLoop);
    }

    function magnetSeekToProgress() {
      if (!audio.duration || !seek) return;
      const pt = getProgressPoint();
      if (!pt) return;
      seek.classList.add('is-magnet');
      fill.classList.add('is-magnet-glow');
      magnetActive = true;
      setMagnetCursorVisual(true);
      try { if (typeof clearAllTrailDots === 'function') clearAllTrailDots(); } catch (_) {}
      moveCursorSmooth(pt.x, pt.y, 380).then(() => {
        if (!magnetActive) return;
        if (magnetFollowRaf) cancelAnimationFrame(magnetFollowRaf);
        magnetFollowLoop();
      });
    }

    function releaseMagnet(cooldown) {
      magnetActive = false;
      if (magnetHoldTimer) {
        clearTimeout(magnetHoldTimer);
        magnetHoldTimer = null;
      }
      if (magnetFollowRaf) {
        cancelAnimationFrame(magnetFollowRaf);
        magnetFollowRaf = 0;
      }
      if (magnetAnimRaf) {
        cancelAnimationFrame(magnetAnimRaf);
        magnetAnimRaf = 0;
      }
      if (seek) seek.classList.remove('is-magnet');
      if (fill) fill.classList.remove('is-magnet-glow');
      setMagnetCursorVisual(false);
      // 小白点立即回到真实鼠标
      try {
        const mx = (typeof lastPointerX === 'number') ? lastPointerX : 0;
        const my = (typeof lastPointerY === 'number') ? lastPointerY : 0;
        if (typeof moveCustomCursor === 'function') moveCustomCursor(mx, my);
        else if (typeof window.__maxsuiMoveCustomCursor === 'function') window.__maxsuiMoveCustomCursor(mx, my);
        if (typeof setCursorVisible === 'function') setCursorVisible(true);
      } catch (_) {}
      if (cooldown) magnetCooldownUntil = performance.now() + MAGNET_COOLDOWN_MS;
    }

    // 范围：整块播放条 + 歌词卡片；停留 ≥2s 触发
    const magnetHost = songBlock || player;
    let magnetHoldOrigin = null;

    magnetHost.addEventListener('pointermove', (e) => {
      if (player.classList.contains('is-collapsed')) return;
      if (typeof isCoarseOrPhone === 'function' && isCoarseOrPhone()) return;
      if (performance.now() < magnetCooldownUntil) return;

      const cur = { x: e.clientX, y: e.clientY };

      // 剧烈晃动 → 挣脱
      if (magnetLastPos && magnetActive) {
        const speed = Math.hypot(cur.x - magnetLastPos.x, cur.y - magnetLastPos.y);
        if (speed > MAGNET_SHAKE_PX) {
          releaseMagnet(true);
          magnetLastPos = cur;
          magnetHoldOrigin = cur;
          return;
        }
      }
      magnetLastPos = cur;
      magnetLastMoveAt = performance.now();

      if (magnetActive) return; // 跟随循环接管光标

      magnetCursorX = cur.x;
      magnetCursorY = cur.y;

      if (!magnetHoldOrigin) {
        magnetHoldOrigin = cur;
      } else if (Math.hypot(cur.x - magnetHoldOrigin.x, cur.y - magnetHoldOrigin.y) > 8) {
        // 挪动了 → 重置停留计时
        magnetHoldOrigin = cur;
        if (magnetHoldTimer) {
          clearTimeout(magnetHoldTimer);
          magnetHoldTimer = null;
        }
      }

      if (!magnetHoldTimer) {
        const ox = magnetHoldOrigin.x;
        const oy = magnetHoldOrigin.y;
        magnetHoldTimer = setTimeout(() => {
          magnetHoldTimer = null;
          if (performance.now() < magnetCooldownUntil) return;
          if (player.classList.contains('is-collapsed')) return;
          if (!magnetLastPos) return;
          if (Math.hypot(magnetLastPos.x - ox, magnetLastPos.y - oy) > 10) return;
          magnetSeekToProgress();
        }, MAGNET_HOLD_MS);
      }
    }, { passive: true });

    magnetHost.addEventListener('pointerleave', () => {
      magnetHoldOrigin = null;
      if (magnetHoldTimer) {
        clearTimeout(magnetHoldTimer);
        magnetHoldTimer = null;
      }
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && magnetActive) releaseMagnet(true);
    });

    // 磁吸后：拖动 = 从「当前进度」起按位移相对调节；单击 = 播放/暂停（不 seek，避免倒退）
    let magnetDrag = false;
    let magnetDownX = 0;
    let magnetDownY = 0;
    let magnetMoved = false;
    let magnetStartTime = 0;
    const MAGNET_CLICK_PX = 6;

    document.addEventListener('pointerdown', (e) => {
      if (!magnetActive || e.button !== 0) return;
      if (e.target && e.target.closest && e.target.closest('.md-lyrics-tools, .md-lyrics-tool-btn, .gap-play')) return;
      magnetDrag = true;
      magnetMoved = false;
      magnetDownX = e.clientX;
      magnetDownY = e.clientY;
      magnetStartTime = Number(audio.currentTime) || 0;
      // 按下不 seek，避免一点击就跳进度（看起来像倒退）
      e.preventDefault();
      e.stopPropagation();
    }, true);

    document.addEventListener('pointermove', (e) => {
      if (!magnetActive || !magnetDrag) return;
      const dist = Math.hypot(e.clientX - magnetDownX, e.clientY - magnetDownY);
      if (dist > MAGNET_CLICK_PX) magnetMoved = true;
      if (!magnetMoved) return;
      seeking = true;
      const d = Number(audio.duration) || 0;
      const rect = seek.getBoundingClientRect();
      const w = Math.max(1, rect.width);
      // 相对拖动：从按下时的进度 + 水平位移比例
      const deltaRatio = (e.clientX - magnetDownX) / w;
      let t = magnetStartTime + deltaRatio * d;
      if (d > 0) t = Math.min(d, Math.max(0, t));
      try { audio.currentTime = t; } catch (_) {}
      const p = d > 0 ? (t / d) * 100 : 0;
      fill.style.width = p + '%';
      magnetCursorX = e.clientX;
      const pt = getProgressPoint();
      if (pt) magnetCursorY = pt.y;
      try { if (typeof moveCustomCursor === 'function') moveCustomCursor(magnetCursorX, magnetCursorY); } catch (_) {}
    }, true);

    document.addEventListener('pointerup', (e) => {
      if (!magnetDrag) return;
      magnetDrag = false;
      seeking = false;
      if (!magnetMoved && magnetActive) {
        // 纯单击：只切换播放，绝不改 currentTime
        if (audio.paused) {
          playWithFade(audio).catch(() => { try { audio.play(); } catch (_) {} });
        } else {
          pauseWithFade(audio).catch(() => { try { audio.pause(); } catch (_) {} });
        }
        syncPlayUi();
      }
      if (magnetActive && !magnetFollowRaf) magnetFollowLoop();
    }, true);

    document.addEventListener('pointercancel', () => {
      magnetDrag = false;
      seeking = false;
    }, true);

    // 歌词工具栏改在 hydrateMdLyrics 成功后挂载（ensureLyricsTools）

    syncPlayUi();
    syncLoadingUi();
    syncProgress();
    return player;
  }

  function enhanceArticleMedia(root) {
    if (!root) return;
    root.querySelectorAll('audio').forEach((audio) => {
      if (audio.dataset.glassPlayer === '1') return;
      audio.dataset.glassPlayer = '1';
      buildGlassAudioPlayer(audio);
    });
    // 文章内图片 / iframe 懒加载
    root.querySelectorAll('img').forEach((img) => {
      if (!img.getAttribute('loading')) img.setAttribute('loading', 'lazy');
      if (!img.getAttribute('decoding')) img.setAttribute('decoding', 'async');
    });
    root.querySelectorAll('iframe').forEach((iframe) => {
      if (!iframe.getAttribute('loading')) iframe.setAttribute('loading', 'lazy');
    });
    hydrateMdLyrics(root);
  }

  function simpleMarkdownToHtml(md) {
    if (!md) return '';
    const slots = [];
    const hold = (html) => {
      const i = slots.length;
      slots.push(html);
      return `\uE000${i}\uE001`;
    };
    const esc = (t) => String(t)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    let s = String(md).replace(/\r\n/g, '\n');

    // 代码块（先保护，避免内部 $ / # 被误解析）
    // 支持 ```cpp / ``` cpp / ```cpp\n 等写法
    // macOS 红绿灯标题栏 + 右上角语言标签 + 复制按钮
    s = s.replace(/```[ \t]*([a-zA-Z0-9_+#.-]*)[ \t]*\r?\n([\s\S]*?)```/g, (_, lang, code) => {
      const langClean = (lang || '').trim().toLowerCase();
      const langLabel = langClean || 'text';
      const cls = langClean ? `language-${esc(langClean)}` : 'language-text';
      const body = esc(code.replace(/^\n+|\n+$/g, ''));
      return hold(
        `<div class="md-code-window" data-lang="${esc(langLabel)}">` +
          `<div class="md-code-titlebar">` +
            `<div class="md-code-traffic" aria-hidden="true">` +
              `<span class="md-code-dot md-code-dot-red"></span>` +
              `<span class="md-code-dot md-code-dot-yellow"></span>` +
              `<span class="md-code-dot md-code-dot-green"></span>` +
            `</div>` +
            `<div class="md-code-titlebar-right">` +
              `<span class="md-code-lang">${esc(langLabel)}</span>` +
              `<button type="button" class="md-code-copy" title="复制代码" aria-label="复制代码">` +
                `<i class="far fa-copy"></i><span>复制</span>` +
              `</button>` +
            `</div>` +
          `</div>` +
          `<pre class="md-code"><code class="${cls}">${body}</code></pre>` +
        `</div>`
      );
    });
    // 兜底：单行 ```code``` 或无换行写法
    s = s.replace(/```[ \t]*([a-zA-Z0-9_+#.-]*)[ \t]+([\s\S]*?)```/g, (_, lang, code) => {
      const langClean = (lang || '').trim().toLowerCase();
      const langLabel = langClean || 'text';
      const cls = langClean ? `language-${esc(langClean)}` : 'language-text';
      const body = esc(String(code).replace(/^\n+|\n+$/g, ''));
      return hold(
        `<div class="md-code-window" data-lang="${esc(langLabel)}">` +
          `<div class="md-code-titlebar">` +
            `<div class="md-code-traffic" aria-hidden="true">` +
              `<span class="md-code-dot md-code-dot-red"></span>` +
              `<span class="md-code-dot md-code-dot-yellow"></span>` +
              `<span class="md-code-dot md-code-dot-green"></span>` +
            `</div>` +
            `<div class="md-code-titlebar-right">` +
              `<span class="md-code-lang">${esc(langLabel)}</span>` +
              `<button type="button" class="md-code-copy" title="复制代码" aria-label="复制代码">` +
                `<i class="far fa-copy"></i><span>复制</span>` +
              `</button>` +
            `</div>` +
          `</div>` +
          `<pre class="md-code"><code class="${cls}">${body}</code></pre>` +
        `</div>`
      );
    });

    // 行内代码
    s = s.replace(/`([^`\n]+)`/g, (_, c) => hold(`<code>${esc(c)}</code>`));

    // 自定义：@[音频链接][歌词链接]@ 或 @[音频链接]@
    // 例：@[https://cdn.example.com/a.mp3][https://cdn.example.com/a.lrc]@
    s = s.replace(/@\[([^\]\n]+)\](?:\[([^\]\n]*)\])?@/g, (full, audioUrl, lyricsUrl) => {
      const a = String(audioUrl || '').trim();
      const l = String(lyricsUrl || '').trim();
      const okAudio = /^(https?:\/\/|\/)/i.test(a);
      if (!okAudio) return full;
      let html = '<div class="md-song-block">';
      html += '<audio controls preload="metadata" src="' + esc(a) + '"></audio>';
      if (l && /^(https?:\/\/|\/)/i.test(l)) {
        html += '<div class="md-lyrics" data-lyrics-src="' + esc(l) + '">' +
          '<p class="md-lyrics-loading">歌词加载中…</p></div>';
      }
      html += '</div>';
      return hold(html);
    });

    // 自定义：@...@ 插入 HTML 片段（需含标签；完整文档会经 sanitize 抽 body）
    // 例：@<audio controls src="https://xxx.mp3"></audio>@
    s = s.replace(/@([\s\S]+?)@/g, (full, inner) => {
      const t = String(inner || '').trim();
      if (!t || !/<[a-zA-Z]/.test(t)) return full; // 非 HTML，原样保留（如邮箱）
      return hold(sanitizeAdminHtml(t) || '');
    });

    // 图片：![alt](url) / ![alt](url "title") —— 须在链接规则之前保护
    s = s.replace(/!\[([^\]]*)\]\((https?:[^)\s]+)(?:\s+"([^"]*)")?\)/g, (_, alt, url, title) => {
      const tAttr = title ? ` title="${esc(title)}"` : '';
      return hold(
        `<img class="md-img" src="${esc(url)}" alt="${esc(alt)}"${tAttr} loading="lazy" decoding="async">`
      );
    });
    // 相对路径 / 同站图片
    s = s.replace(/!\[([^\]]*)\]\((\/[^)\s]+)(?:\s+"([^"]*)")?\)/g, (_, alt, url, title) => {
      const tAttr = title ? ` title="${esc(title)}"` : '';
      return hold(
        `<img class="md-img" src="${esc(url)}" alt="${esc(alt)}"${tAttr} loading="lazy" decoding="async">`
      );
    });

    // $$...$$：含换行 / 独占一行 → 块级；夹在文字中间 → 行内（避免打断段落）
    s = s.replace(/\$\$([\s\S]+?)\$\$/g, (full, m, offset, src) => {
      const formula = m.trim();
      const hasNewline = /\n/.test(m);
      let lineStart = offset;
      while (lineStart > 0 && src[lineStart - 1] !== '\n') lineStart--;
      let lineEnd = offset + full.length;
      while (lineEnd < src.length && src[lineEnd] !== '\n') lineEnd++;
      const before = src.slice(lineStart, offset);
      const after = src.slice(offset + full.length, lineEnd);
      const aloneOnLine = !hasNewline && /^\s*$/.test(before) && /^\s*$/.test(after);
      if (hasNewline || aloneOnLine) {
        return hold(`<div class="md-math-display">$$${formula}$$</div>`);
      }
      return hold(`<span class="md-math-inline">\\(${formula}\\)</span>`);
    });

    // \[...\] 块级、\(...\) 行内
    s = s.replace(/\\\[([\s\S]+?)\\\]/g, (_, m) =>
      hold(`<div class="md-math-display">\\[${m.trim()}\\]</div>`));
    s = s.replace(/\\\((.+?)\\\)/g, (_, m) =>
      hold(`<span class="md-math-inline">\\(${m}\\)</span>`));

    // 单 $...$ 行内（排除 $$ 与金额类）
    s = s.replace(/(^|[^\\$])\$([^\s$][^$\n]*?[^\s$])\$(?!\d)/g, (_, pre, m) =>
      pre + hold(`<span class="md-math-inline">\\(${m}\\)</span>`));

    s = esc(s);

    // 标题：从深到浅，支持 h1–h6
    s = s.replace(/^######[ \t]+(.+)$/gm, '<h6>$1</h6>');
    s = s.replace(/^#####[ \t]+(.+)$/gm, '<h5>$1</h5>');
    s = s.replace(/^####[ \t]+(.+)$/gm, '<h4>$1</h4>');
    s = s.replace(/^###[ \t]+(.+)$/gm, '<h3>$1</h3>');
    s = s.replace(/^##[ \t]+(.+)$/gm, '<h2>$1</h2>');
    s = s.replace(/^#[ \t]+(.+)$/gm, '<h1>$1</h1>');

    s = s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    // 斜体：避免吃掉列表标记行首的 *
    s = s.replace(/(^|[^*\n])\*([^*\n]+)\*(?!\*)/g, '$1<em>$2</em>');
    // 删除线 ~~text~~
    s = s.replace(/~~(.+?)~~/g, '<del>$1</del>');
    s = s.replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g,
      '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');

    // 分割线：--- / *** / ___（独占一行）
    s = s.replace(/^[ \t]*([-*_])(?:[ \t]*\1){2,}[ \t]*$/gm, '<hr class="md-hr">');

    // 多行引用：连续 > 合并；空 > 不产生额外空行
    s = convertMarkdownBlockquotes(s);

    // Tab：加宽约 5 倍（专用 span，避免空格折叠）
    s = s.replace(/\t/g, '<span class="md-tab" aria-hidden="true"></span>');

    // 嵌套无序/有序列表（支持缩进子列表）
    s = convertMarkdownLists(s);

    // 换行：
    //   a\n\nb     → a / b 紧挨（一个换行）
    //   a\n\n\nb   → a / 空行 / b
    s = convertMarkdownParagraphs(s);

    s = s.replace(/\uE000(\d+)\uE001/g, (_, i) => slots[+i] || '');
    return s;
  }

  /** 连续 > 合并；空的 > 行忽略，内容行用 <br> 连接 → | a / | b */
  function convertMarkdownBlockquotes(text) {
    const lines = String(text).split('\n');
    const out = [];
    let i = 0;
    const bqRe = /^&gt;(?:[ \t]+(.*))?$/;
    while (i < lines.length) {
      const m = lines[i].match(bqRe);
      if (!m) {
        out.push(lines[i]);
        i += 1;
        continue;
      }
      const parts = [];
      while (i < lines.length) {
        const lm = lines[i].match(bqRe);
        if (!lm) break;
        const content = (lm[1] != null ? lm[1] : '').trim();
        if (content) parts.push(content);
        i += 1;
      }
      if (parts.length) {
        out.push(`<blockquote>${parts.join('<br>')}</blockquote>`);
      }
    }
    return out.join('\n');
  }

  /**
   * 段落/换行：
   * - 恰好 2 个连续换行 → 软换行（同一段 <br>，无额外空行）
   * - 3 个及以上连续换行 → 插入可见空行
   */
  function convertMarkdownParagraphs(text) {
    const chunks = String(text).split(/(\n{2,})/);
    const out = [];
    let pending = null;

    const isBlockHtml = (t) =>
      /^<(h[1-6]|ul|ol|pre|blockquote|div|img|hr|table)/.test(t)
      || /^\uE000\d+\uE001$/.test(t);

    const flush = () => {
      if (pending == null) return;
      const t = pending.trim();
      if (!t) {
        pending = null;
        return;
      }
      if (isBlockHtml(t)) {
        out.push(t);
      } else {
        out.push(`<p>${pending.replace(/\n/g, '<br>')}</p>`);
      }
      pending = null;
    };

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      if (/^\n+$/.test(chunk)) {
        if (chunk.length >= 3) {
          flush();
          out.push('<div class="md-blank-line" aria-hidden="true"></div>');
        } else if (pending != null) {
          pending += '\n';
        }
        continue;
      }
      const t = chunk.trim();
      if (!t) continue;
      if (isBlockHtml(t)) {
        flush();
        out.push(t);
      } else if (pending != null) {
        pending += '\n' + chunk;
      } else {
        pending = chunk;
      }
    }
    flush();
    return out.join('\n');
  }

  /**
   * 将 Markdown 无序/有序列表（含任意层缩进子列表）转为嵌套 <ul>/<ol>。
   * 识别：- * + 以及 1. 2. 等；缩进以 2 空格或 1 tab 为一层。
   */
  function convertMarkdownLists(text) {
    const lines = String(text).split('\n');
    const out = [];
    let i = 0;
    const listRe = /^([ \t]*)([-*+]|\d+\.)[ \t]+(.*)$/;

    function indentWidth(ws) {
      let n = 0;
      for (let k = 0; k < ws.length; k++) {
        n += ws[k] === '\t' ? 2 : 1;
      }
      return n;
    }

    while (i < lines.length) {
      const m = lines[i].match(listRe);
      if (!m) {
        out.push(lines[i]);
        i += 1;
        continue;
      }

      const blockLines = [];
      while (i < lines.length) {
        const line = lines[i];
        const lm = line.match(listRe);
        if (lm) {
          blockLines.push({
            indent: indentWidth(lm[1]),
            ordered: /^\d+\./.test(lm[2]),
            content: lm[3]
          });
          i += 1;
          continue;
        }
        if (blockLines.length && /^[ \t]+\S/.test(line) && !listRe.test(line)) {
          const last = blockLines[blockLines.length - 1];
          last.content += '<br>' + line.replace(/^[ \t]+/, '');
          i += 1;
          continue;
        }
        break;
      }

      out.push(renderNestedList(blockLines));
    }

    return out.join('\n');
  }

  function renderNestedList(items) {
    if (!items.length) return '';

    let html = '';
    const stack = []; // { indent, ordered }

    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      const tag = it.ordered ? 'ol' : 'ul';

      while (stack.length && stack[stack.length - 1].indent > it.indent) {
        const top = stack.pop();
        html += `</li></${top.ordered ? 'ol' : 'ul'}>`;
      }

      if (stack.length && stack[stack.length - 1].indent === it.indent) {
        if (stack[stack.length - 1].ordered !== it.ordered) {
          const top = stack.pop();
          html += `</li></${top.ordered ? 'ol' : 'ul'}>`;
          html += `<${tag}><li>${it.content}`;
          stack.push({ indent: it.indent, ordered: it.ordered });
        } else {
          html += `</li><li>${it.content}`;
        }
      } else {
        html += `<${tag}><li>${it.content}`;
        stack.push({ indent: it.indent, ordered: it.ordered });
      }
    }

    while (stack.length) {
      const top = stack.pop();
      html += `</li></${top.ordered ? 'ol' : 'ul'}>`;
    }
    return html;
  }

  function bindCodeCopyButtons(root) {
    if (!root) return;
    root.querySelectorAll('.md-code-window .md-code-copy').forEach((btn) => {
      if (btn.dataset.bound === '1') return;
      btn.dataset.bound = '1';
      btn.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        const win = btn.closest('.md-code-window');
        const codeEl = win && win.querySelector('pre code');
        const text = codeEl ? codeEl.textContent : '';
        const label = btn.querySelector('span');
        const icon = btn.querySelector('i');
        const ok = async () => {
          if (label) label.textContent = '已复制';
          if (icon) icon.className = 'fas fa-check';
          btn.classList.add('is-copied');
          setTimeout(() => {
            if (label) label.textContent = '复制';
            if (icon) icon.className = 'far fa-copy';
            btn.classList.remove('is-copied');
          }, 1600);
        };
        try {
          if (navigator.clipboard && navigator.clipboard.writeText) {
            await navigator.clipboard.writeText(text);
            await ok();
            return;
          }
        } catch (_) { /* fallback */ }
        try {
          const ta = document.createElement('textarea');
          ta.value = text;
          ta.setAttribute('readonly', '');
          ta.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0';
          document.body.appendChild(ta);
          ta.select();
          document.execCommand('copy');
          ta.remove();
          await ok();
        } catch (err) {
          if (label) label.textContent = '失败';
          setTimeout(() => { if (label) label.textContent = '复制'; }, 1200);
        }
      });
    });
  }

  function highlightArticleCode(root) {
    if (!root) return;
    bindCodeCopyButtons(root);
    const run = () => {
      if (typeof window.hljs === 'undefined') return false;
      const blocks = root.querySelectorAll('pre code');
      if (!blocks.length) return true;
      blocks.forEach((block) => {
        if (block.dataset.hljsDone === '1') return;
        try {
          // 从 class="language-xxx" 取语言；兼容 c++ / cpp
          let lang = '';
          const m = (block.className || '').match(/language-([a-zA-Z0-9_+#.-]+)/);
          if (m) lang = m[1].toLowerCase();
          if (lang === 'c++') lang = 'cpp';
          if (lang === 'c#') lang = 'csharp';
          if (lang === 'text' || lang === 'plain') lang = '';

          if (lang && window.hljs.getLanguage && window.hljs.getLanguage(lang) && window.hljs.highlight) {
            const src = block.textContent || '';
            const result = window.hljs.highlight(src, { language: lang, ignoreIllegals: true });
            block.innerHTML = result.value;
            block.classList.add('hljs');
            if (!block.classList.contains('language-' + lang)) {
              block.classList.add('language-' + lang);
            }
          } else if (typeof window.hljs.highlightElement === 'function') {
            window.hljs.highlightElement(block);
          } else if (typeof window.hljs.highlightBlock === 'function') {
            window.hljs.highlightBlock(block);
          }
          block.dataset.hljsDone = '1';
        } catch (err) {
          console.warn('[hljs]', err);
        }
      });
      return true;
    };
    if (!run() || (typeof window.hljs === 'undefined')) {
      let n = 0;
      const timer = setInterval(() => {
        n += 1;
        if ((typeof window.hljs !== 'undefined' && run()) || n > 60) clearInterval(timer);
      }, 50);
    }
  }

  function renderArticleMath(root) {
    if (!root) return;
    const tryRender = () => {
      if (typeof window.renderMathInElement === 'function') {
        try {
          window.renderMathInElement(root, {
            delimiters: [
              { left: '$$', right: '$$', display: true },
              { left: '\\[', right: '\\]', display: true },
              { left: '\\(', right: '\\)', display: false },
              { left: '$', right: '$', display: false }
            ],
            throwOnError: false,
            strict: 'ignore',
            trust: false,
            ignoredTags: ['script', 'noscript', 'style', 'textarea', 'pre', 'code'],
            ignoredClasses: ['md-code']
          });
        } catch (e) {
          console.warn('[KaTeX] render error', e);
        }
        return true;
      }
      return false;
    };
    if (!tryRender()) {
      let n = 0;
      const timer = setInterval(() => {
        n += 1;
        if (tryRender() || n > 40) clearInterval(timer);
      }, 50);
    }
  }

  // ---- 博客框内阅读（向左扩展，停用三阶段视差）----
  // 外层钉死在 readingBaseScroll；正文在 .blog-article-view 内滚动
  let isArticleReading = false;
  let readingBaseScroll = 0;
  let readingDimLayer = null;
  let articleResizeObserver = null;
  let articleImageHandlers = [];
  let readingOuterLockRaf = null;
  let readingArticleScrollHandler = null;

  function getArticleScrollEl() {
    return document.getElementById('blogArticleView');
  }

  function ensureReadingDimLayer() {
    if (readingDimLayer) return readingDimLayer;
    readingDimLayer = document.createElement('div');
    readingDimLayer.className = 'reading-dim-layer';
    readingDimLayer.setAttribute('aria-hidden', 'true');
    document.body.appendChild(readingDimLayer);
    return readingDimLayer;
  }

  function updateReadingDim(/* optional */ scrollHint) {
    const layer = ensureReadingDimLayer();
    if (!isArticleReading) {
      layer.style.opacity = '0';
      layer.style.backdropFilter = 'blur(0px)';
      layer.style.webkitBackdropFilter = 'blur(0px)';
      layer.classList.remove('is-active');
      return;
    }
    const el = getArticleScrollEl();
    const maxScroll = el ? Math.max(1, el.scrollHeight - el.clientHeight) : 1;
    const top = el ? el.scrollTop : (typeof scrollHint === 'number' ? scrollHint : 0);
    const progress = Math.min(1, Math.max(0, top / Math.max(70, maxScroll * 0.18, window.innerHeight * 0.16)));
    const opacity = 0.22 + progress * 0.58;
    const blur = 3 + progress * 16;
    layer.classList.add('is-active');
    layer.style.opacity = String(opacity);
    layer.style.backdropFilter = `blur(${blur.toFixed(1)}px) saturate(${(120 - progress * 30).toFixed(0)}%)`;
    layer.style.webkitBackdropFilter = layer.style.backdropFilter;
  }

  let readingListBoxHeight = 0;
  let readingHeightAnimating = false;
  let readingHeightRaf = null;
  const READING_TRANSITION_MS = 500;

  function getReadingBoxTargetHeight() {
    if (!blogPanel) return Math.max(240, window.innerHeight - 96);
    const topMargin = typeof getBlogTopMargin === 'function' ? getBlogTopMargin() : 72;
    const bottomPad = getBlogGapPx();
    return Math.max(240, Math.round((blogPanel.clientHeight || window.innerHeight) - topMargin - bottomPad));
  }

  function setWhiteBoxHeightPx(px) {
    if (!blogWhiteBox) return;
    const h = Math.max(0, Math.round(px));
    blogWhiteBox.style.boxSizing = 'border-box';
    blogWhiteBox.style.overflow = 'hidden';
    blogWhiteBox.style.flex = '0 0 auto';
    blogWhiteBox.style.alignSelf = 'flex-start';
    blogWhiteBox.style.height = h + 'px';
    blogWhiteBox.style.maxHeight = h + 'px';
    blogWhiteBox.style.minHeight = h + 'px';
  }

  function clearWhiteBoxHeightInline() {
    if (!blogWhiteBox) return;
    blogWhiteBox.style.height = '';
    blogWhiteBox.style.maxHeight = '';
    blogWhiteBox.style.minHeight = '';
    blogWhiteBox.style.flex = '';
    blogWhiteBox.style.overflow = '';
    blogWhiteBox.style.overflowY = '';
    blogWhiteBox.style.alignSelf = '';
  }

  function applyReadingBoxMetrics() {
    if (!blogPanel || !blogWhiteBox || !isArticleReading) return;
    const maxH = getReadingBoxTargetHeight();
    document.documentElement.style.setProperty('--reading-box-max-h', maxH + 'px');
    if (readingHeightAnimating) return;
    setWhiteBoxHeightPx(maxH);
  }

  /** cubic-bezier(0.4, 0, 0.2, 1) 近似，与左边 CSS 扩展同节奏 */
  function easeReadingHeight(t) {
    const c1 = 0.4, c2 = 0.0, c3 = 0.2, c4 = 1.0;
    const cx = 3 * c1;
    const bx = 3 * (c3 - c1) - cx;
    const ax = 1 - cx - bx;
    const cy = 3 * c2;
    const by = 3 * (c4 - c2) - cy;
    const ay = 1 - cy - by;
    const sampleX = (u) => ((ax * u + bx) * u + cx) * u;
    const sampleY = (u) => ((ay * u + by) * u + cy) * u;
    const sampleDX = (u) => (3 * ax * u + 2 * bx) * u + cx;
    let u = t;
    for (let i = 0; i < 5; i++) {
      const x = sampleX(u) - t;
      const d = sampleDX(u);
      if (Math.abs(d) < 1e-6) break;
      u -= x / d;
      if (u < 0) u = 0;
      else if (u > 1) u = 1;
    }
    return sampleY(u);
  }

  /** 下边界：rAF 插值高度（不依赖 CSS height transition，避免 auto→px 瞬跳） */
  function animateWhiteBoxHeight(fromH, toH, duration) {
    duration = duration == null ? READING_TRANSITION_MS : duration;
    return new Promise((resolve) => {
      if (!blogWhiteBox) {
        resolve();
        return;
      }
      if (readingHeightRaf) {
        cancelAnimationFrame(readingHeightRaf);
        readingHeightRaf = null;
      }
      readingHeightAnimating = true;
      const a = Math.round(fromH);
      const b = Math.round(toH);
      blogWhiteBox.style.transition = 'max-width 0.5s cubic-bezier(0.4, 0, 0.2, 1), width 0.5s cubic-bezier(0.4, 0, 0.2, 1), box-shadow 0.5s cubic-bezier(0.4, 0, 0.2, 1)';
      setWhiteBoxHeightPx(a);
      void blogWhiteBox.offsetHeight;
      const t0 = performance.now();

      const step = (now) => {
        const t = Math.min(1, (now - t0) / Math.max(1, duration));
        setWhiteBoxHeightPx(a + (b - a) * easeReadingHeight(t));
        if (t < 1) {
          readingHeightRaf = requestAnimationFrame(step);
        } else {
          readingHeightRaf = null;
          setWhiteBoxHeightPx(b);
          readingHeightAnimating = false;
          resolve();
        }
      };
      readingHeightRaf = requestAnimationFrame(step);
    });
  }

  function lockOuterScrollToBase() {
    if (!isArticleReading || !blogPanel) return;
    const base = readingBaseScroll;
    if (Math.abs((blogPanel.scrollTop || 0) - base) > 0.5) {
      blogPanel.scrollTop = base;
    }
    if (readingOuterLockRaf) cancelAnimationFrame(readingOuterLockRaf);
    readingOuterLockRaf = requestAnimationFrame(() => {
      readingOuterLockRaf = null;
      if (!isArticleReading || !blogPanel) return;
      if (Math.abs((blogPanel.scrollTop || 0) - readingBaseScroll) > 0.5) {
        blogPanel.scrollTop = readingBaseScroll;
      }
    });
  }

  function updateBackBtnOnArticleScroll(view) {
    // 返回按钮已移入顶部导航标题栏，滚动时保持常显（不再淡出）
    const btn = document.getElementById('blogArticleBack');
    if (!btn) return;
    btn.style.opacity = '1';
    btn.style.transform = '';
    btn.classList.remove('is-faded');
  }

  function bindArticleInnerScroll() {
    const view = getArticleScrollEl();
    if (!view) return;
    if (readingArticleScrollHandler) {
      view.removeEventListener('scroll', readingArticleScrollHandler);
    }
    readingArticleScrollHandler = () => {
      if (!isArticleReading) return;
      updateReadingDim(view.scrollTop);
      updateBackBtnOnArticleScroll(view);
      updateGlobalAvatarPosition();
    };
    view.addEventListener('scroll', readingArticleScrollHandler, { passive: true });
    // 初始复位
    updateBackBtnOnArticleScroll(view);
  }

  function unbindArticleInnerScroll() {
    const view = getArticleScrollEl();
    if (view && readingArticleScrollHandler) {
      view.removeEventListener('scroll', readingArticleScrollHandler);
    }
    readingArticleScrollHandler = null;
    const btn = document.getElementById('blogArticleBack');
    if (btn) {
      btn.style.opacity = '';
      btn.style.transform = '';
      btn.classList.remove('is-faded');
    }
  }

  function stopArticleLayoutObserver() {
    if (articleResizeObserver) {
      articleResizeObserver.disconnect();
      articleResizeObserver = null;
    }
    articleImageHandlers.forEach(({ img, handler }) => img.removeEventListener('load', handler));
    articleImageHandlers = [];
  }

  function stabilizeArticleLayout(bodyEl) {
    if (!bodyEl || !blogPanel) return;
    stopArticleLayoutObserver();

    const recalc = () => {
      if (!isArticleReading) return;
      applyReadingBoxMetrics();
      lockOuterScrollToBase();
      updateBlogScroll();
      const view = getArticleScrollEl();
      updateReadingDim(view ? view.scrollTop : 0);
      updateGlobalAvatarPosition();
    };

    bodyEl.querySelectorAll('img').forEach(img => {
      const handler = () => {
        if (typeof img.decode === 'function') {
          img.decode().catch(() => {}).finally(recalc);
        } else {
          recalc();
        }
      };
      img.addEventListener('load', handler, { passive: true });
      articleImageHandlers.push({ img, handler });
      if (img.complete) handler();
    });

    if (typeof ResizeObserver !== 'undefined') {
      articleResizeObserver = new ResizeObserver(() => recalc());
      articleResizeObserver.observe(bodyEl);
      const view = getArticleScrollEl();
      if (view) articleResizeObserver.observe(view);
    }
    requestAnimationFrame(recalc);
  }

  let readingExitTimer = null;

  function enterArticleReadingLayout(premeasuredListHeight) {
    if (!blogPanel || !blogWhiteBox) return;
    if (readingExitTimer) {
      clearTimeout(readingExitTimer);
      readingExitTimer = null;
    }
    if (readingHeightRaf) {
      cancelAnimationFrame(readingHeightRaf);
      readingHeightRaf = null;
    }

    // —— 先在「纯列表」高度上锁死下边界，再切换阅读 class（避免列表/正文切换造成高度瞬跳）——
    let startH = Math.round(premeasuredListHeight || 0);
    if (!startH) {
      startH = Math.round(blogWhiteBox.getBoundingClientRect().height) || 0;
    }
    readingListBoxHeight = startH || readingListBoxHeight || 360;
    blogWhiteBox.style.transition = 'max-width 0.5s cubic-bezier(0.4, 0, 0.2, 1), width 0.5s cubic-bezier(0.4, 0, 0.2, 1), box-shadow 0.5s cubic-bezier(0.4, 0, 0.2, 1)';
    setWhiteBoxHeightPx(readingListBoxHeight);
    void blogWhiteBox.offsetHeight;

    isArticleReading = true;
    document.body.classList.remove('is-exiting-article');
    document.body.classList.add('is-reading-article');
    blogPanel.classList.remove('is-exiting-article');
    blogPanel.classList.add('is-reading-article');
    nav && nav.classList.add('blog-mode');
    showReadingToolbar(true);
    railGapLocked = true;

    setupBlogScrollHeights();
    readingBaseScroll = (stage1Height || 0) + (stage2Height || 0);
    blogPanel.scrollTop = readingBaseScroll;
    blogPanel.style.overscrollBehaviorY = 'none';

    // 再钉一次起始高度（class 切换后内容会折叠，但外框必须仍是列表高度）
    setWhiteBoxHeightPx(readingListBoxHeight);
    void blogWhiteBox.offsetHeight;

    const endH = getReadingBoxTargetHeight();
    document.documentElement.style.setProperty('--reading-box-max-h', endH + 'px');

    // 下边界：0.5s rAF 插值（与左边 CSS 扩展同曲线）
    animateWhiteBoxHeight(readingListBoxHeight, endH, READING_TRANSITION_MS).then(() => {
      if (isArticleReading) applyReadingBoxMetrics();
    });

    const view = getArticleScrollEl();
    if (view) view.scrollTop = 0;
    bindArticleInnerScroll();

    ensureReadingDimLayer();
    updateReadingDim(0);
    updateBlogScroll();
    updateGlobalAvatarPosition();
    lockOuterScrollToBase();
  }

  function exitArticleReadingLayout() {
    if (!blogPanel || !blogWhiteBox) return;
    if (readingExitTimer) {
      clearTimeout(readingExitTimer);
      readingExitTimer = null;
    }
    if (readingHeightRaf) {
      cancelAnimationFrame(readingHeightRaf);
      readingHeightRaf = null;
    }
    isArticleReading = false;
    stopArticleLayoutObserver();
    unbindArticleInnerScroll();
    if (readingOuterLockRaf) {
      cancelAnimationFrame(readingOuterLockRaf);
      readingOuterLockRaf = null;
    }
    showReadingToolbar(false);

    const startH = Math.round(blogWhiteBox.getBoundingClientRect().height) || getReadingBoxTargetHeight();
    setWhiteBoxHeightPx(startH);
    void blogWhiteBox.offsetHeight;

    // 先进入 exiting（列表仍收起），再去掉 reading，避免列表瞬间撑开下边界
    document.body.classList.add('is-exiting-article');
    blogPanel.classList.add('is-exiting-article');
    document.body.classList.remove('is-reading-article');
    blogPanel.classList.remove('is-reading-article');
    blogPanel.style.overscrollBehaviorY = '';
    setWhiteBoxHeightPx(startH);

    const endH = readingListBoxHeight > 0
      ? readingListBoxHeight
      : Math.max(280, Math.round(startH * 0.55));

    // 下边界收回（与左边 CSS 同节奏）
    animateWhiteBoxHeight(startH, endH, READING_TRANSITION_MS).then(() => {
      document.documentElement.style.removeProperty('--reading-box-max-h');
    });
    updateReadingDim(0);
    updateBlogScroll();
    updateGlobalAvatarPosition();

    readingExitTimer = setTimeout(() => {
      readingExitTimer = null;
      const bodyEl = document.getElementById('blogArticleBody');
      if (bodyEl) bodyEl.innerHTML = '';
      const titleEl = document.getElementById('blogArticleTitle');
      const metaEl = document.getElementById('blogArticleMeta');
      if (titleEl) titleEl.textContent = '';
      if (metaEl) metaEl.innerHTML = '';
      const view = document.getElementById('blogArticleView');
      if (view) {
        view.hidden = true;
        view.style.display = '';
        view.scrollTop = 0;
      }
      clearWhiteBoxHeightInline();
      document.body.classList.remove('is-exiting-article');
      if (blogPanel) blogPanel.classList.remove('is-exiting-article');
      setupBlogScrollHeights();
      updateBlogScroll();
      updateGlobalAvatarPosition();
    }, READING_TRANSITION_MS + 20);
  }

  async function openArticleReader(idOrSlug) {
    const titleEl = document.getElementById('blogArticleTitle');
    const metaEl = document.getElementById('blogArticleMeta');
    const bodyEl = document.getElementById('blogArticleBody');
    const view = document.getElementById('blogArticleView');
    if (!titleEl || !bodyEl || !view) return;
    // 深链/直接打开文章时，先懒加载博客列表（标题元信息本地缓存）
    try { await loadBlogRoute(); } catch (_) {}

    // 旧弹窗若还在，关掉
    const legacyModal = document.getElementById('articleReaderModal');
    if (legacyModal) legacyModal.classList.remove('active');

    const local = blogPosts.find(p => String(p.slug) === String(idOrSlug) || String(p.id) === String(idOrSlug));
    const slugForUrl = (local && local.slug) || idOrSlug;
    if (slugForUrl) setArticleUrl(slugForUrl);

    // 打开文章时滚到博客面板
    const blogEl = document.getElementById('blog');
    if (blogEl && scrollContainer) {
      scrollContainer.scrollTo({ left: blogEl.offsetLeft, behavior: 'smooth' });
    }

    const loadingTitle = (local && local.title) || '加载中…';
    titleEl.textContent = loadingTitle;
    const loadingMeta = local
      ? `<span><i class="far fa-calendar"></i> ${escapeHtml(local.date || '')} UTC+8</span>` +
        (local.category ? `<span><i class="fas fa-tag"></i> ${escapeHtml(local.category)}</span>` : '') +
        `<span><i class="far fa-clock"></i> ${escapeHtml(local.readTime || '')}</span>`
      : '';
    if (metaEl) metaEl.innerHTML = loadingMeta;
    setReadingToolbarMeta(loadingTitle, loadingMeta);
    bodyEl.innerHTML = loadingPlaceholderHtml('加载正文…');
    // 先测纯列表高度，再露出正文（否则列表+正文叠高会让下边界起跑点偏高并瞬跳）
    const listHeightBeforeRead = blogWhiteBox
      ? Math.round(blogWhiteBox.getBoundingClientRect().height)
      : 0;
    view.hidden = false;
    view.style.display = 'flex';
    enterArticleReadingLayout(listHeightBeforeRead);

    let article = local;
    try {
      const res = await fetch(`${API_BASE_URL}/articles/${encodeURIComponent(idOrSlug)}`, { credentials: 'include' });
      const data = await res.json().catch(() => null);
      if (res.ok && data && (data.article || data.content || data.title)) {
        article = data.article || data;
      }
    } catch (_) {}

    if (!article) {
      bodyEl.innerHTML = '<p>无法加载文章内容</p>';
      setupBlogScrollHeights();
      updateBlogScroll();
      return;
    }

    const finalTitle = article.title || (local && local.title) || '无标题';
    titleEl.textContent = finalTitle;
    const finalSlug = article.slug || (local && local.slug) || idOrSlug;
    if (finalSlug) setArticleUrl(finalSlug, { replace: true });
    const rawDate = article.published_at || article.created_at || article.date || (local && local.rawDate) || '';
    const displayDate = formatDateUTC8(rawDate) || (local && local.date) || '';
    const finalMeta =
      `<span><i class="far fa-calendar"></i> ${escapeHtml(displayDate)} UTC+8</span>` +
      (article.category || (local && local.category)
        ? `<span><i class="fas fa-tag"></i> ${escapeHtml(article.category || local.category)}</span>`
        : '') +
      (article.reading_time || (local && local.readTime)
        ? `<span><i class="far fa-clock"></i> ${escapeHtml(article.reading_time ? article.reading_time + ' min' : local.readTime)}</span>`
        : '');
    if (metaEl) metaEl.innerHTML = finalMeta;
    setReadingToolbarMeta(finalTitle, finalMeta);
    const content = article.content || article.body || (local && local.content) || article.summary || article.excerpt || '';
    const ctype = detectContentType(article) || detectContentType(local) || 'markdown';
    bodyEl.innerHTML = renderArticleBodyHtml(content, ctype) || '<p>（无正文）</p>';
    enhanceArticleMedia(bodyEl);
    if (ctype !== 'html') {
      highlightArticleCode(bodyEl);
      renderArticleMath(bodyEl);
    } else {
      highlightArticleCode(bodyEl);
    }

    stabilizeArticleLayout(bodyEl);
    try { restoreDockedPlayerOnEnter(idOrSlug); } catch (_) {}
  }

  async function closeArticleReader() {
    // 先让迷你坞滑到左下角，再执行退出博客动画
    try {
      await dockPlayingAudioOnExit();
    } catch (_) {}

    const legacyModal = document.getElementById('articleReaderModal');
    if (legacyModal) legacyModal.classList.remove('active');
    if (!isArticleReading) return;
    exitArticleReadingLayout();
    clearArticleUrl();
    if (blogPanel) {
      const pin = (stage1Height || 0) + (stage2Height || 0);
      blogPanel.scrollTop = pin;
      updateBlogScroll();
    }
  }

  function setupArticleReaderUI() {
    const backBtn = document.getElementById('blogArticleBack');
    if (backBtn) backBtn.addEventListener('click', closeArticleReader);

    // 兼容旧弹窗关闭按钮
    const legacyClose = document.getElementById('articleReaderClose');
    const legacyModal = document.getElementById('articleReaderModal');
    if (legacyClose) legacyClose.addEventListener('click', closeArticleReader);
    if (legacyModal) {
      legacyModal.addEventListener('click', (e) => {
        if (e.target === legacyModal) closeArticleReader();
      });
    }

    document.addEventListener('keydown', (e) => {
      const inFs = !!(document.body.classList.contains('audio-fs-open') || document.querySelector('.md-song-block.is-fs-zoom'));
      // 全屏播放时：方向键 / Esc 不离开文章、不切标签
      if (inFs) {
        if (e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          exitAudioFullscreen();
          return;
        }
        if (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'Backspace') {
          e.preventDefault();
          e.stopPropagation();
          return;
        }
      }
      if (e.key === 'Escape' && isArticleReading) {
        closeArticleReader();
      }
    }, true);
  }

  function openAdminLoginModal() {
    const modal = document.getElementById('adminLoginModal');
    const err = document.getElementById('adminLoginError');
    const user = document.getElementById('adminUsername');
    const pass = document.getElementById('adminPassword');
    const fields = document.getElementById('authedRegisterFields');
    const loginFields = document.getElementById('adminLoginFields');
    const hint = document.getElementById('adminLoginHint');
    const submit = document.getElementById('adminLoginSubmit');
    authedCreateSecret = null;
    if (err) { err.hidden = true; err.textContent = ''; }
    if (hint) { hint.hidden = true; hint.textContent = ''; }
    if (fields) fields.hidden = true;
    if (loginFields) loginFields.hidden = false;
    if (user) { user.value = ''; user.setAttribute('required', ''); }
    if (pass) { pass.value = ''; pass.setAttribute('required', ''); }
    if (submit) submit.textContent = '登录';
    ['authedRegisterUsername','authedRegisterPassword','authedRegisterConfirm'].forEach(id => { const el=document.getElementById(id); if(el) el.value=''; });
    if (modal) modal.classList.add('active');
    setTimeout(() => user && user.focus(), 50);
  }

  function closeAdminLoginModal() {
    const modal = document.getElementById('adminLoginModal');
    if (modal) modal.classList.remove('active');
  }

  function bindNavLinkClick(link) {
    link.setAttribute('draggable', 'false');
    link.addEventListener('dragstart', (e) => { e.preventDefault(); });
    link.addEventListener('click', (e) => {
      e.preventDefault();
      if (apiOfflineLocked) {
        // 离线模式只允许停在首页
        const home = document.getElementById('home');
        if (home && scrollContainer) scrollContainer.scrollTo({ left: home.offsetLeft, behavior: 'smooth' });
        return;
      }
      const sectionId = (link.getAttribute('data-section') || link.getAttribute('href') || '').replace(/^#/, '');
      // 点击导航时预热对应路由数据（懒加载）
      if (sectionId) ensureRouteLoaded(sectionId);
      const target = document.getElementById(link.getAttribute('href').substring(1));
      if (target) scrollContainer.scrollTo({ left: target.offsetLeft, behavior: 'smooth' });
    });
  }

  async function adminLogout() {
    try {
      await fetch(`${API_BASE_URL}/auth/logout`, {
        method: 'POST',
        credentials: 'include'
      });
    } catch (e) { /* silent */ }
    lockAdminPanel();
  }

  function stopGuestCodeTimer() {
    if (guestCodeTimer) {
      clearInterval(guestCodeTimer);
      guestCodeTimer = null;
    }
    guestCodeExpireAt = 0;
    guestCodeValue = '';
  }

  function lockAdminPanel() {
    if (!adminUnlocked) return;
    adminUnlocked = false;
    authRole = null;
    stopGuestCodeTimer();
    const adminNav = document.querySelector('.nav-btn[data-section="admin"]');
    if (adminNav) adminNav.remove();
    const adminSection = document.getElementById('admin');
    if (adminSection) adminSection.remove();
    requestAnimationFrame(() => {
      updateActiveNavFromScroll();
      updateCapsuleFromScroll();
      updateGlobalAvatarPosition();
    });
  }

  function buildAdminPanelHTML() {
    const st = profileData.status || '在线';
    const stType = profileData.statusType || 'online';
    return `
      <div class="panel-content">
        <div class="section-title"><i class="fas fa-user-shield"></i><span>管理员</span></div>
        <div class="admin-panel-wrap">
          <div class="admin-tabs" role="tablist">
            <button type="button" class="admin-tab-btn active" data-tab="status"><i class="fas fa-circle"></i> 状态</button>
            <button type="button" class="admin-tab-btn" data-tab="status-retention"><i class="fas fa-history"></i> 历史</button>
            <button type="button" class="admin-tab-btn" data-tab="articles"><i class="fas fa-newspaper"></i> 文章</button>
            <button type="button" class="admin-tab-btn" data-tab="editor"><i class="fas fa-pen"></i> 写文章</button>
            <button type="button" class="admin-tab-btn" data-tab="session"><i class="fas fa-sign-out-alt"></i> 会话</button>
          </div>
          <div class="admin-tab-panel active" data-panel="status">
            <div class="glass-card admin-card">
              <h3><i class="fas fa-user"></i> 主页状态（QQ 风格）</h3>
              <div class="admin-form-grid">
                <div class="admin-form-row">
                  <label>状态文案</label>
                  <input type="text" id="adminStatusText" value="${escapeHtml(st)}" maxlength="32" placeholder="例如：在线 / 写代码中">
                </div>
                <div class="admin-form-row">
                  <label>状态简述</label>
                  <textarea id="adminStatusSummary" maxlength="300" rows="3" placeholder="例如：正在研究 Worker + D1 的状态历史功能">${escapeHtml(profileData.statusSummary || '')}</textarea>
                  <small class="admin-field-hint">点击主页状态标签后显示；显示时间会根据文字长度自动估算。</small>
                </div>
                <div class="admin-form-row">
                  <label>状态类型</label>
                  <div class="apple-select" id="adminStatusSelect" data-value="${escapeHtml(stType)}">
                    <button type="button" class="apple-select-trigger" aria-haspopup="listbox" aria-expanded="false">
                      <span class="apple-select-dot home-status-dot ${escapeHtml(stType)}"></span>
                      <span class="apple-select-label">加载中…</span>
                      <i class="fas fa-chevron-down apple-select-chevron"></i>
                    </button>
                    <div class="apple-select-menu" role="listbox">
                      <button type="button" class="apple-select-option" data-value="online" data-label="在线" data-default-text="在线"><span class="home-status-dot online"></span><span>在线</span></button>
                      <button type="button" class="apple-select-option" data-value="busy" data-label="忙碌" data-default-text="忙碌"><span class="home-status-dot busy"></span><span>忙碌</span></button>
                      <button type="button" class="apple-select-option" data-value="away" data-label="离开" data-default-text="离开"><span class="home-status-dot away"></span><span>离开</span></button>
                      <button type="button" class="apple-select-option" data-value="dnd" data-label="请勿打扰" data-default-text="请勿打扰"><span class="home-status-dot dnd"></span><span>请勿打扰</span></button>
                      <button type="button" class="apple-select-option" data-value="invisible" data-label="隐身" data-default-text="隐身"><span class="home-status-dot invisible"></span><span>隐身</span></button>
                      <button type="button" class="apple-select-option" data-value="offline" data-label="离线" data-default-text="离线"><span class="home-status-dot offline"></span><span>离线</span></button>
                      <button type="button" class="apple-select-option" data-value="custom" data-label="自定义" data-default-text="自定义"><span class="home-status-dot custom"></span><span>自定义</span></button>
                    </div>
                    <input type="hidden" id="adminStatusType" value="${escapeHtml(stType)}">
                  </div>
                </div>
                <div class="admin-form-row">
                  <label>预览</label>
                  <div class="admin-status-preview">
                    <span class="home-status-dot ${stType}" id="adminStatusDot"></span>
                    <span id="adminStatusPreviewText">${escapeHtml(st)}</span>
                  </div>
                </div>
                <div class="admin-form-actions">
                  <button type="button" class="nav-btn apple-primary-btn" id="adminSaveStatusBtn">保存状态</button>
                </div>
                <p class="admin-msg" id="adminStatusMsg"></p>
              </div>
            </div>
          </div>
          <div class="admin-tab-panel" data-panel="status-retention">
            <div class="glass-card admin-card">
              <h3><i class="fas fa-database"></i> 状态历史保存时间</h3>
              <div class="admin-form-grid">
                <div class="admin-form-row">
                  <label>保存周期</label>
                  <div class="apple-select" id="adminStatusRetentionSelect" data-value="1y">
                    <button type="button" class="apple-select-trigger" aria-haspopup="listbox" aria-expanded="false">
                      <span class="apple-select-dot home-status-dot custom"></span>
                      <span class="apple-select-label">1年</span>
                      <i class="fas fa-chevron-down apple-select-chevron"></i>
                    </button>
                    <div class="apple-select-menu" role="listbox">
                      <button type="button" class="apple-select-option" data-value="1w" data-label="1周"><span class="home-status-dot away"></span><span>1周</span></button>
                      <button type="button" class="apple-select-option" data-value="1m" data-label="1个月"><span class="home-status-dot online"></span><span>1个月</span></button>
                      <button type="button" class="apple-select-option" data-value="3m" data-label="3个月"><span class="home-status-dot custom"></span><span>3个月</span></button>
                      <button type="button" class="apple-select-option" data-value="6m" data-label="6个月"><span class="home-status-dot busy"></span><span>6个月</span></button>
                      <button type="button" class="apple-select-option" data-value="1y" data-label="1年"><span class="home-status-dot offline"></span><span>1年</span></button>
                    </div>
                  </div>
                </div>
                <div class="admin-form-actions">
                  <button type="button" class="nav-btn apple-primary-btn" id="adminSaveStatusRetentionBtn">保存保存周期</button>
                </div>
                <p class="admin-msg" id="adminStatusRetentionMsg"></p>
              </div>
            </div>
            <div class="glass-card admin-card" style="margin-top:1rem">
              <div class="admin-toolbar">
                <h3 style="margin:0"><i class="fas fa-stream"></i> 全部状态历史</h3>
                <div class="admin-articles-toolbar">
                  <button type="button" class="nav-btn apple-secondary-btn" id="adminRefreshStatusHistoryBtn"><i class="fas fa-sync"></i> 刷新</button>
                </div>
              </div>
              <p class="admin-field-hint" style="margin:0.5rem 0 0.75rem">可删除任意历史条目。当前进行中的状态（无结束时间）删除后不会改 site_profile，请用「状态」页修改当前状态。</p>
              <div id="adminStatusHistoryList"><p class="admin-msg">加载中…</p></div>
              <p class="admin-msg" id="adminStatusHistoryMsg"></p>
            </div>
          </div>
          <div class="admin-tab-panel" data-panel="articles">
            <div class="glass-card admin-card">
              <div class="admin-toolbar">
                <h3 style="margin:0"><i class="fas fa-list"></i> 文章管理</h3>
                <div class="admin-articles-toolbar">
                  <input type="search" id="adminArticlesSearch" placeholder="搜索标题 / slug / 分类…" autocomplete="off">
                  <button type="button" class="nav-btn apple-secondary-btn" id="adminRefreshArticlesBtn"><i class="fas fa-sync"></i> 刷新</button>
                </div>
              </div>
              <div id="adminArticlesList"><p class="admin-msg">加载中…</p></div>
              <p class="admin-msg" id="adminArticlesMsg"></p>
            </div>
          </div>
          <div class="admin-tab-panel" data-panel="editor">
            <div class="glass-card admin-card">
              <h3><i class="fas fa-pen-nib"></i> <span id="adminEditorTitle">新建文章</span></h3>
              <input type="hidden" id="adminEditArticleId" value="">
              <div class="admin-form-grid">
                <div class="admin-form-row">
                  <label>标题</label>
                  <input type="text" id="adminArticleTitle" maxlength="200" placeholder="文章标题">
                </div>
                <div class="admin-form-row">
                  <label>Slug（URL 标识，英文/数字/-_）</label>
                  <input type="text" id="adminArticleSlug" maxlength="200" placeholder="hello-world">
                </div>
                <div class="admin-form-row">
                  <label>分类</label>
                  <input type="text" id="adminArticleCategory" maxlength="80" placeholder="随笔">
                </div>
                <div class="admin-form-row">
                  <label>摘要</label>
                  <input type="text" id="adminArticleExcerpt" maxlength="1000" placeholder="一句话简介">
                </div>
                <div class="admin-form-row">
                  <label>正文格式</label>
                  <div class="apple-select" id="adminArticleFormatSelect" data-value="markdown">
                    <button type="button" class="apple-select-trigger" aria-haspopup="listbox" aria-expanded="false">
                      <span class="apple-select-dot home-status-dot custom"></span>
                      <span class="apple-select-label">Markdown</span>
                      <i class="fas fa-chevron-down apple-select-chevron"></i>
                    </button>
                    <div class="apple-select-menu" role="listbox">
                      <button type="button" class="apple-select-option" data-value="markdown" data-label="Markdown"><span class="home-status-dot online"></span><span>Markdown</span></button>
                      <button type="button" class="apple-select-option" data-value="html" data-label="HTML（可嵌音频）"><span class="home-status-dot custom"></span><span>HTML（可嵌音频）</span></button>
                    </div>
                  </div>
                  <input type="hidden" id="adminArticleFormat" value="markdown">
                </div>
                <div class="admin-form-row admin-form-row-editor">
                  <label id="adminArticleContentLabel">正文（Markdown）</label>
                  <div class="admin-editor-split">
                    <div class="admin-editor-pane">
                      <div class="admin-editor-pane-head">源码</div>
                      <textarea id="adminArticleContent" placeholder="# 标题&#10;&#10;正文…"></textarea>
                    </div>
                    <div class="admin-editor-pane">
                      <div class="admin-editor-pane-head">预览</div>
                      <div class="admin-editor-preview blog-article-body" id="adminArticlePreview"><p class="admin-msg">在左侧输入后实时预览…</p></div>
                    </div>
                  </div>
                </div>
                <div class="admin-form-row">
                  <label>状态</label>
                  <div class="apple-select" id="adminArticleStatusSelect" data-value="published">
                    <button type="button" class="apple-select-trigger" aria-haspopup="listbox" aria-expanded="false">
                      <span class="apple-select-dot home-status-dot online"></span>
                      <span class="apple-select-label">发布</span>
                      <i class="fas fa-chevron-down apple-select-chevron"></i>
                    </button>
                    <div class="apple-select-menu" role="listbox">
                      <button type="button" class="apple-select-option" data-value="published" data-label="发布"><span class="home-status-dot online"></span><span>发布</span></button>
                      <button type="button" class="apple-select-option" data-value="hidden" data-label="隐藏（需认证）"><span class="home-status-dot busy"></span><span>隐藏（需认证）</span></button>
                      <button type="button" class="apple-select-option" data-value="draft" data-label="草稿"><span class="home-status-dot away"></span><span>草稿</span></button>
                      <button type="button" class="apple-select-option" data-value="archived" data-label="归档"><span class="home-status-dot offline"></span><span>归档</span></button>
                    </div>
                  </div>
                  <input type="hidden" id="adminArticleStatus" value="published">
                </div>
                <div class="admin-form-actions">
                  <button type="button" class="nav-btn apple-primary-btn" id="adminSaveArticleBtn">保存</button>
                  <button type="button" class="nav-btn apple-secondary-btn" id="adminResetEditorBtn">清空 / 新建</button>
                </div>
                <p class="admin-msg" id="adminEditorMsg"></p>
              </div>
            </div>
          </div>
          <div class="admin-tab-panel" data-panel="session">
            <div class="glass-card admin-card">
              <h3><i class="fas fa-shield-alt"></i> 会话</h3>
              <p style="opacity:0.75;font-size:0.92rem;margin-bottom:1rem;">已通过 API Session Cookie 登录。退出后需重新验证。</p>
              <div class="admin-guest-code-card" id="adminGuestCodeCard">
                <div><strong><i class="fas fa-ticket-alt"></i> Guest 邀请码</strong><p id="adminGuestCodeMeta">每 10 分钟自动更新</p></div>
                <code id="adminGuestCode">加载中…</code>
                <div class="admin-guest-code-actions">
                  <button type="button" class="nav-btn apple-secondary-btn" id="adminCopyGuestCodeBtn" title="复制邀请码"><i class="fas fa-copy"></i> 复制</button>
                  <button type="button" class="nav-btn apple-secondary-btn" id="adminRefreshGuestCodeBtn" title="手动刷新邀请码"><i class="fas fa-sync"></i> 刷新</button>
                </div>
              </div>
              <button type="button" class="nav-btn apple-secondary-btn" id="adminLogoutBtn">
                <i class="fas fa-sign-out-alt"></i> 退出登录
              </button>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  function bindAdminPanelEvents(section) {
    section.querySelectorAll('.admin-tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const tab = btn.dataset.tab;
        section.querySelectorAll('.admin-tab-btn').forEach(b => b.classList.toggle('active', b === btn));
        section.querySelectorAll('.admin-tab-panel').forEach(p => {
          p.classList.toggle('active', p.dataset.panel === tab);
        });
        if (tab === 'articles') loadAdminArticles();
        if (tab === 'status') syncAdminStatusFormFromProfile();
        if (tab === 'status-retention') setupAdminStatusRetention(section);
        if (tab === 'editor') updateAdminArticlePreview();
      });
    });
    syncAdminStatusFormFromProfile();

    const statusText = section.querySelector('#adminStatusText');
    const statusSummary = section.querySelector('#adminStatusSummary');
    const statusType = section.querySelector('#adminStatusType');
    const statusSelect = section.querySelector('#adminStatusSelect');
    const selectTrigger = statusSelect?.querySelector('.apple-select-trigger');
    const selectLabel = statusSelect?.querySelector('.apple-select-label');
    const selectDot = statusSelect?.querySelector('.apple-select-dot');
    const previewText = section.querySelector('#adminStatusPreviewText');
    const previewDot = section.querySelector('#adminStatusDot');

    const statusLabels = {
      online: '在线', busy: '忙碌', away: '离开', dnd: '请勿打扰',
      invisible: '隐身', offline: '离线', custom: '自定义'
    };

    const syncPreview = () => {
      const type = statusType?.value || 'online';
      if (previewText) previewText.textContent = statusText?.value || statusLabels[type] || '在线';
      if (previewDot) previewDot.className = 'home-status-dot ' + type;
      if (statusSelect) statusSelect.dataset.value = type;
      if (selectLabel) selectLabel.textContent = statusLabels[type] || '在线';
      if (selectDot) selectDot.className = 'apple-select-dot home-status-dot ' + type;
    };

    statusText?.addEventListener('input', syncPreview);

    statusSelect?.querySelectorAll('.apple-select-option').forEach(option => {
      option.addEventListener('click', (event) => {
        event.stopPropagation();
        const type = option.dataset.value || 'online';
        const defaultText = option.dataset.defaultText || statusLabels[type] || '在线';
        if (statusType) statusType.value = type;
        if (statusText && (!statusText.value.trim() || Object.values(statusLabels).includes(statusText.value.trim()))) {
          statusText.value = defaultText;
        }
        statusSelect.classList.remove('open');
        selectTrigger?.setAttribute('aria-expanded', 'false');
        syncPreview();
      });
    });

    selectTrigger?.addEventListener('click', (event) => {
      event.stopPropagation();
      const open = statusSelect.classList.toggle('open');
      selectTrigger.setAttribute('aria-expanded', open ? 'true' : 'false');
    });

    document.addEventListener('click', (event) => {
      if (!statusSelect || statusSelect.contains(event.target)) return;
      statusSelect.classList.remove('open');
      selectTrigger?.setAttribute('aria-expanded', 'false');
    });

    syncPreview();

    section.querySelector('#adminSaveStatusBtn')?.addEventListener('click', async () => {
      const text = (statusText?.value || '').trim() || '在线';
      const type = statusType?.value || 'online';
      const msg = section.querySelector('#adminStatusMsg');
      const btn = section.querySelector('#adminSaveStatusBtn');
      if (btn) { btn.disabled = true; btn.textContent = '保存中…'; }
      try {
        const res = await fetch(`${API_BASE_URL}/admin/profile/status`, {
          method: 'PUT',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            status_type: type,
            status_text: text,
            status_summary: (statusSummary?.value || '').trim()
          })
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.success) throw new Error(data.error || '状态保存失败');
        const p = data.profile || {};
        profileData.status = p.status_text || p.status || text;
        profileData.statusType = String(p.status_type || p.statusType || type).toLowerCase();
        profileData.statusSummary = String(p.status_summary || p.statusSummary || '');
        renderProfile();
        if (msg) { msg.textContent = '状态已保存到服务器，并已同步到主页'; msg.className = 'admin-msg ok'; }
      } catch (e) {
        if (msg) { msg.textContent = String(e.message || e); msg.className = 'admin-msg err'; }
      } finally {
        if (btn) { btn.disabled = false; btn.textContent = '保存状态'; }
      }
    });

    section.querySelector('#adminLogoutBtn')?.addEventListener('click', adminLogout);
    section.querySelector('#adminCopyGuestCodeBtn')?.addEventListener('click', copyGuestCode);
    section.querySelector('#adminRefreshGuestCodeBtn')?.addEventListener('click', () => loadGuestCode());
    loadGuestCode();
    section.querySelector('#adminRefreshArticlesBtn')?.addEventListener('click', loadAdminArticles);
    section.querySelector('#adminArticlesSearch')?.addEventListener('input', (e) => {
      renderAdminArticlesTable(filterAdminArticles(e.target.value));
    });
    section.querySelector('#adminSaveArticleBtn')?.addEventListener('click', saveAdminArticle);
    section.querySelector('#adminResetEditorBtn')?.addEventListener('click', resetAdminEditor);
    const contentTa = section.querySelector('#adminArticleContent');
    let previewTimer = null;
    contentTa?.addEventListener('input', () => {
      clearTimeout(previewTimer);
      previewTimer = setTimeout(updateAdminArticlePreview, 180);
    });
    wireAppleSelect(section.querySelector('#adminArticleFormatSelect'), {
      onChange: () => {
        syncAdminFormatUI();
        updateAdminArticlePreview();
      }
    });
    wireAppleSelect(section.querySelector('#adminArticleStatusSelect'), {
      onChange: (value) => {
        const hidden = document.getElementById('adminArticleStatus');
        if (hidden) hidden.value = value;
      }
    });
    syncAdminFormatUI();
    updateAdminArticlePreview();

    section.querySelector('#adminArticleTitle')?.addEventListener('input', (e) => {
      const id = section.querySelector('#adminEditArticleId')?.value;
      if (id) return;
      const slugEl = section.querySelector('#adminArticleSlug');
      if (!slugEl || slugEl.dataset.touched === '1') return;
      slugEl.value = String(e.target.value || '')
        .toLowerCase()
        .trim()
        .replace(/\s+/g, '-')
        .replace(/[^a-z0-9_-]/g, '')
        .slice(0, 80);
    });
    section.querySelector('#adminArticleSlug')?.addEventListener('input', (e) => {
      e.target.dataset.touched = '1';
    });

    loadAdminArticles();
  }

  let adminArticlesCache = [];

  function renderAdminArticlesTable(list) {
    const box = document.getElementById('adminArticlesList');
    if (!box) return;
    if (!list.length) {
      box.innerHTML = '<p class="admin-msg">没有匹配的文章</p>';
      return;
    }
    const rows = list.map(a => `
      <tr>
        <td>${escapeHtml(a.title)}</td>
        <td><code>${escapeHtml(a.slug)}</code></td>
        <td>${escapeHtml(a.category || '—')}</td>
        <td>${escapeHtml(a.status || 'draft')}</td>
        <td>${escapeHtml(dateOnlyUTC8(a.published_at || a.created_at || '') || (a.published_at || a.created_at || '').slice(0, 10))}</td>
        <td class="admin-article-actions">
          <button type="button" class="admin-mini-btn" data-edit-id="${a.id}" data-slug="${escapeHtml(a.slug)}">编辑</button>
          <button type="button" class="admin-mini-btn danger" data-del-id="${a.id}">删除</button>
        </td>
      </tr>
    `).join('');
    box.innerHTML = `
      <table class="admin-article-table">
        <thead><tr><th>标题</th><th>Slug</th><th>分类</th><th>状态</th><th>日期</th><th>操作</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>`;
    box.querySelectorAll('[data-edit-id]').forEach(btn => {
      btn.addEventListener('click', () => editAdminArticle(btn.dataset.editId, btn.dataset.slug));
    });
    box.querySelectorAll('[data-del-id]').forEach(btn => {
      btn.addEventListener('click', () => deleteAdminArticle(btn.dataset.delId));
    });
  }

  function filterAdminArticles(keyword) {
    const kw = String(keyword || '').trim().toLowerCase();
    if (!kw) return adminArticlesCache.slice();
    return adminArticlesCache.filter((a) => {
      const blob = [a.title, a.slug, a.category, a.excerpt].map((x) => String(x || '').toLowerCase()).join(' ');
      return blob.includes(kw);
    });
  }

  function updateGuestCodeMetaDisplay() {
    const metaEl = document.getElementById('adminGuestCodeMeta');
    if (!metaEl) return;
    if (!guestCodeExpireAt) {
      metaEl.textContent = '每 10 分钟自动更新';
      return;
    }
    const left = Math.max(0, Math.ceil((guestCodeExpireAt - Date.now()) / 1000));
    const mins = Math.floor(left / 60);
    const secs = left % 60;
    metaEl.textContent = `本轮剩余 ${mins} 分 ${String(secs).padStart(2, '0')} 秒 · 到期后自动刷新`;
  }

  function startGuestCodeCountdown() {
    if (guestCodeTimer) {
      clearInterval(guestCodeTimer);
      guestCodeTimer = null;
    }
    updateGuestCodeMetaDisplay();
    guestCodeTimer = setInterval(() => {
      if (!guestCodeExpireAt) return;
      const left = Math.ceil((guestCodeExpireAt - Date.now()) / 1000);
      updateGuestCodeMetaDisplay();
      if (left <= 0) {
        loadGuestCode({ silent: true });
      }
    }, 1000);
  }

  async function copyGuestCode() {
    const code = guestCodeValue || (document.getElementById('adminGuestCode')?.textContent || '').trim();
    if (!code || code === '加载中…' || code === '获取失败' || code === '暂不可用') return;
    const ok = await copyTextToClipboard(code);
    const btn = document.getElementById('adminCopyGuestCodeBtn');
    if (btn) {
      const prev = btn.innerHTML;
      btn.innerHTML = ok ? '<i class="fas fa-check"></i> 已复制' : '<i class="fas fa-times"></i> 失败';
      setTimeout(() => { btn.innerHTML = prev; }, 1400);
    }
  }

  async function loadGuestCode(options = {}) {
    const { silent = false } = options;
    const codeEl = document.getElementById('adminGuestCode');
    const metaEl = document.getElementById('adminGuestCodeMeta');
    const card = document.getElementById('adminGuestCodeCard');
    if (!codeEl) return;
    if (!silent) codeEl.textContent = '加载中…';
    try {
      const res = await fetch(`${API_BASE_URL}/admin/guest-code`, { credentials: 'include', cache: 'no-store' });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.code) throw new Error(data?.error || '获取失败');
      guestCodeValue = String(data.code);
      codeEl.textContent = guestCodeValue;
      if (card) card.hidden = false;
      const sec = Number(data.valid_for_seconds || 0);
      if (sec > 0) {
        guestCodeExpireAt = Date.now() + sec * 1000;
      } else if (data.expires_at) {
        const t = new Date(data.expires_at).getTime();
        guestCodeExpireAt = Number.isFinite(t) ? t : Date.now() + 10 * 60 * 1000;
      } else {
        guestCodeExpireAt = Date.now() + 10 * 60 * 1000;
      }
      startGuestCodeCountdown();
    } catch (e) {
      // Guest 角色不展示邀请码；Admin / Authed User 展示错误
      if (authRole === 'guest') {
        if (card) card.hidden = true;
        stopGuestCodeTimer();
        return;
      }
      codeEl.textContent = '获取失败';
      guestCodeValue = '';
      if (metaEl) metaEl.textContent = String(e.message || e);
      if (card) card.hidden = false;
    }
  }

  async function loadAdminArticles() {
    const box = document.getElementById('adminArticlesList');
    const msg = document.getElementById('adminArticlesMsg');
    if (!box) return;
    box.innerHTML = '<p class="admin-msg">加载中…</p>';
    try {
      const res = await fetch(`${API_BASE_URL}/admin/articles?limit=200`, { credentials: 'include' });
      const data = await res.json().catch(() => null);
      adminArticlesCache = data?.articles || [];
      if (!adminArticlesCache.length) {
        box.innerHTML = '<p class="admin-msg">暂无文章</p>';
        return;
      }
      const kw = document.getElementById('adminArticlesSearch')?.value || '';
      renderAdminArticlesTable(filterAdminArticles(kw));
      if (msg) { msg.textContent = `共 ${adminArticlesCache.length} 篇`; msg.className = 'admin-msg'; }
    } catch (e) {
      box.innerHTML = '<p class="admin-msg err">加载失败</p>';
    }
  }

  function updateAdminArticlePreview() {
    const ta = document.getElementById('adminArticleContent');
    const preview = document.getElementById('adminArticlePreview');
    if (!ta || !preview) return;
    const fmt = (getAppleSelectValue('adminArticleFormatSelect', 'markdown') || 'markdown').toLowerCase();
    const raw = ta.value || '';
    if (!raw.trim()) {
      preview.innerHTML = '<p class="admin-msg">在左侧输入后实时预览…</p>';
      return;
    }
    preview.innerHTML = renderArticleBodyHtml(raw, fmt) || '<p class="admin-msg">（空）</p>';
    enhanceArticleMedia(preview);
    if (fmt !== 'html') {
      highlightArticleCode(preview);
      renderArticleMath(preview);
    } else {
      highlightArticleCode(preview);
    }
  }

  function syncAdminStatusFormFromProfile() {
    const st = profileData.status || '在线';
    const stType = String(profileData.statusType || 'online').toLowerCase();
    const statusText = document.getElementById('adminStatusText');
    const statusSummary = document.getElementById('adminStatusSummary');
    const statusType = document.getElementById('adminStatusType');
    const statusSelect = document.getElementById('adminStatusSelect');
    if (statusText) statusText.value = st;
    if (statusSummary) statusSummary.value = profileData.statusSummary || '';
    if (statusType) statusType.value = stType;
    if (statusSelect) {
      statusSelect.dataset.value = stType;
      const label = statusSelect.querySelector('.apple-select-label');
      const dot = statusSelect.querySelector('.apple-select-dot');
      const labels = {
        online: '在线', busy: '忙碌', away: '离开', dnd: '请勿打扰',
        invisible: '隐身', offline: '离线', custom: '自定义'
      };
      if (label) label.textContent = labels[stType] || stType;
      if (dot) dot.className = 'apple-select-dot home-status-dot ' + stType;
    }
    const previewText = document.getElementById('adminStatusPreviewText');
    const previewDot = document.getElementById('adminStatusDot');
    if (previewText) previewText.textContent = st;
    if (previewDot) previewDot.className = 'home-status-dot ' + stType;
  }

  async function editAdminArticle(id, slug) {
    const msg = document.getElementById('adminEditorMsg');
    try {
      const res = await fetch(`${API_BASE_URL}/articles/${encodeURIComponent(slug)}`, { credentials: 'include' });
      const data = await res.json().catch(() => null);
      const a = data?.article;
      if (!res.ok || !a) throw new Error(data?.error || '读取失败');
      document.getElementById('adminEditArticleId').value = id;
      document.getElementById('adminArticleTitle').value = a.title || '';
      const slugEl = document.getElementById('adminArticleSlug');
      slugEl.value = a.slug || '';
      slugEl.dataset.touched = '1';
      document.getElementById('adminArticleCategory').value = a.category || '';
      document.getElementById('adminArticleExcerpt').value = a.excerpt || '';
      document.getElementById('adminArticleContent').value = a.content || '';
      const fmt = detectContentType(a) === 'html' ? 'html' : 'markdown';
      setAppleSelectValue('adminArticleFormatSelect', fmt);
      const fmtHidden = document.getElementById('adminArticleFormat');
      if (fmtHidden) fmtHidden.value = fmt;
      setAppleSelectValue('adminArticleStatusSelect', a.status || 'published');
      const stHidden = document.getElementById('adminArticleStatus');
      if (stHidden) stHidden.value = a.status || 'published';
      syncAdminFormatUI();
      document.getElementById('adminEditorTitle').textContent = '编辑文章 #' + id;
      document.querySelectorAll('.admin-tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === 'editor'));
      document.querySelectorAll('.admin-tab-panel').forEach(p => p.classList.toggle('active', p.dataset.panel === 'editor'));
      updateAdminArticlePreview();
      if (msg) { msg.textContent = '已载入文章'; msg.className = 'admin-msg ok'; }
    } catch (e) {
      if (msg) { msg.textContent = String(e.message || e); msg.className = 'admin-msg err'; }
    }
  }

  function wireAppleSelect(root, { onChange } = {}) {
    if (!root || root.dataset.wired === '1') return;
    root.dataset.wired = '1';
    const trigger = root.querySelector('.apple-select-trigger');
    const label = root.querySelector('.apple-select-label');
    const dot = root.querySelector('.apple-select-dot');
    const menu = root.querySelector('.apple-select-menu');
    if (!trigger || !menu) return;

    const close = () => {
      root.classList.remove('open');
      trigger.setAttribute('aria-expanded', 'false');
    };
    const open = () => {
      document.querySelectorAll('.apple-select.open').forEach((el) => {
        if (el !== root) el.classList.remove('open');
      });
      root.classList.add('open');
      trigger.setAttribute('aria-expanded', 'true');
    };

    trigger.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (root.classList.contains('open')) close();
      else open();
    });

    menu.querySelectorAll('.apple-select-option').forEach((opt) => {
      opt.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const value = opt.getAttribute('data-value') || '';
        const text = opt.getAttribute('data-label') || opt.textContent.trim();
        root.dataset.value = value;
        if (label) label.textContent = text;
        const optDot = opt.querySelector('.home-status-dot');
        if (dot && optDot) {
          dot.className = 'apple-select-dot ' + optDot.className;
        }
        close();
        if (typeof onChange === 'function') onChange(value, text);
      });
    });

    if (!wireAppleSelect._docBound) {
      wireAppleSelect._docBound = true;
      document.addEventListener('click', () => {
        document.querySelectorAll('.apple-select.open').forEach((el) => el.classList.remove('open'));
      });
    }
  }

  function setAppleSelectValue(rootOrId, value) {
    const root = typeof rootOrId === 'string' ? document.getElementById(rootOrId) : rootOrId;
    if (!root) return;
    const val = String(value || '');
    root.dataset.value = val;
    const opt = root.querySelector(`.apple-select-option[data-value="${val}"]`);
    const label = root.querySelector('.apple-select-label');
    const dot = root.querySelector('.apple-select-dot');
    if (opt) {
      if (label) label.textContent = opt.getAttribute('data-label') || opt.textContent.trim();
      const optDot = opt.querySelector('.home-status-dot');
      if (dot && optDot) dot.className = 'apple-select-dot ' + optDot.className;
    }
  }

  function getAppleSelectValue(rootOrId, fallback) {
    const root = typeof rootOrId === 'string' ? document.getElementById(rootOrId) : rootOrId;
    if (!root) return fallback;
    return root.dataset.value || fallback;
  }

  function syncAdminFormatUI() {
    const fmt = (getAppleSelectValue('adminArticleFormatSelect', 'markdown') || 'markdown').toLowerCase();
    const hidden = document.getElementById('adminArticleFormat');
    if (hidden) hidden.value = fmt;
    const label = document.getElementById('adminArticleContentLabel');
    const ta = document.getElementById('adminArticleContent');
    if (label) {
      label.textContent = fmt === 'html' ? '正文（HTML）' : '正文（Markdown）';
    }
    if (ta) {
      ta.placeholder = fmt === 'html'
        ? '<!-- 片段 HTML 即可，勿贴完整 html/head/body -->\n<audio controls src="https://example.com/a.mp3"></audio>\n<p>说明文字</p>'
        : '# 标题\n\n正文…';
    }
  }

  function resetAdminEditor() {
    document.getElementById('adminEditArticleId').value = '';
    document.getElementById('adminArticleTitle').value = '';
    const slugEl = document.getElementById('adminArticleSlug');
    if (slugEl) { slugEl.value = ''; delete slugEl.dataset.touched; }
    document.getElementById('adminArticleCategory').value = '';
    document.getElementById('adminArticleExcerpt').value = '';
    document.getElementById('adminArticleContent').value = '';
    setAppleSelectValue('adminArticleFormatSelect', 'markdown');
    setAppleSelectValue('adminArticleStatusSelect', 'published');
    const fmtHidden = document.getElementById('adminArticleFormat');
    if (fmtHidden) fmtHidden.value = 'markdown';
    const stHidden = document.getElementById('adminArticleStatus');
    if (stHidden) stHidden.value = 'published';
    document.getElementById('adminEditorTitle').textContent = '新建文章';
    const msg = document.getElementById('adminEditorMsg');
    if (msg) { msg.textContent = ''; msg.className = 'admin-msg'; }
    syncAdminFormatUI();
  }

  async function saveAdminArticle() {
    const msg = document.getElementById('adminEditorMsg');
    const id = document.getElementById('adminEditArticleId')?.value;
    const contentType = (getAppleSelectValue('adminArticleFormatSelect', 'markdown') || 'markdown').toLowerCase() === 'html'
      ? 'html'
      : 'markdown';
    const statusVal = getAppleSelectValue('adminArticleStatusSelect', 'draft') || 'draft';
    const body = {
      title: (document.getElementById('adminArticleTitle')?.value || '').trim(),
      slug: (document.getElementById('adminArticleSlug')?.value || '').trim(),
      category: (document.getElementById('adminArticleCategory')?.value || '').trim() || null,
      excerpt: (document.getElementById('adminArticleExcerpt')?.value || '').trim(),
      content: document.getElementById('adminArticleContent')?.value || '',
      content_type: contentType,
      format: contentType,
      status: statusVal
    };
    if (!body.title || !body.slug || !body.content) {
      if (msg) { msg.textContent = '请填写标题、Slug 与正文'; msg.className = 'admin-msg err'; }
      return;
    }
    try {
      const url = id
        ? `${API_BASE_URL}/admin/articles/${id}`
        : `${API_BASE_URL}/admin/articles`;
      const res = await fetch(url, {
        method: id ? 'PUT' : 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || data?.success === false) {
        throw new Error(data?.error || `保存失败 (${res.status})`);
      }
      if (msg) { msg.textContent = id ? '已更新' : '已创建'; msg.className = 'admin-msg ok'; }
      await fetchAllData();
      loadAdminArticles();
      if (!id && data?.article_id) {
        document.getElementById('adminEditArticleId').value = data.article_id;
        document.getElementById('adminEditorTitle').textContent = '编辑文章 #' + data.article_id;
      }
    } catch (e) {
      if (msg) { msg.textContent = String(e.message || e); msg.className = 'admin-msg err'; }
    }
  }

  async function deleteAdminArticle(id) {
    if (!id || !confirm('确定删除文章 #' + id + '？此操作不可恢复。')) return;
    const msg = document.getElementById('adminArticlesMsg');
    try {
      const res = await fetch(`${API_BASE_URL}/admin/articles/${id}`, {
        method: 'DELETE',
        credentials: 'include'
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || data?.success === false) throw new Error(data?.error || '删除失败');
      if (msg) { msg.textContent = '已删除'; msg.className = 'admin-msg ok'; }
      await fetchAllData();
      loadAdminArticles();
    } catch (e) {
      if (msg) { msg.textContent = String(e.message || e); msg.className = 'admin-msg err'; }
    }
  }

  function normalizeAuthRole(role) {
    const r = String(role || '').toLowerCase().replace(/[\s-]+/g, '_');
    if (r === 'admin' || r === 'administrator') return 'admin';
    if (r === 'guest') return 'guest';
    if (r === 'authed_user' || r === 'authed' || r === 'user' || r === 'member') return 'authed_user';
    return r || 'authed_user';
  }

  function accountPanelTitle(role) {
    if (role === 'admin') return { icon: 'fa-user-shield', label: '管理员' };
    if (role === 'guest') return { icon: 'fa-user', label: 'Guest' };
    return { icon: 'fa-user-check', label: 'Authed User' };
  }

  function buildUserAccountPanelHTML(role) {
    const info = accountPanelTitle(role);
    const showInvite = role === 'authed_user'; // Guest 仅会话；Authed 可尝试查看邀请码
    return `
      <div class="panel-content">
        <div class="section-title"><i class="fas ${info.icon}"></i><span>${info.label}</span></div>
        <div class="admin-panel-wrap">
          <div class="admin-tabs" role="tablist">
            <button type="button" class="admin-tab-btn active" data-tab="session"><i class="fas fa-sign-out-alt"></i> 会话</button>
          </div>
          <div class="admin-tab-panel active" data-panel="session">
            <div class="glass-card admin-card">
              <h3><i class="fas fa-shield-alt"></i> 会话</h3>
              <p style="opacity:0.75;font-size:0.92rem;margin-bottom:1rem;">当前身份：${escapeHtml(info.label)}。已通过 API Session Cookie 登录，退出后需重新验证。</p>
              ${showInvite ? `
              <div class="admin-guest-code-card" id="adminGuestCodeCard">
                <div><strong><i class="fas fa-ticket-alt"></i> Guest 邀请码</strong><p id="adminGuestCodeMeta">每 10 分钟自动更新</p></div>
                <code id="adminGuestCode">加载中…</code>
                <div class="admin-guest-code-actions">
                  <button type="button" class="nav-btn apple-secondary-btn" id="adminCopyGuestCodeBtn" title="复制邀请码"><i class="fas fa-copy"></i> 复制</button>
                  <button type="button" class="nav-btn apple-secondary-btn" id="adminRefreshGuestCodeBtn" title="手动刷新邀请码"><i class="fas fa-sync"></i> 刷新</button>
                </div>
              </div>` : ''}
              <button type="button" class="nav-btn apple-secondary-btn" id="adminLogoutBtn">
                <i class="fas fa-sign-out-alt"></i> 退出登录
              </button>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  function bindUserAccountPanelEvents(section, role) {
    section.querySelector('#adminLogoutBtn')?.addEventListener('click', adminLogout);
    if (role === 'authed_user') {
      section.querySelector('#adminCopyGuestCodeBtn')?.addEventListener('click', copyGuestCode);
      section.querySelector('#adminRefreshGuestCodeBtn')?.addEventListener('click', () => loadGuestCode());
      loadGuestCode();
    }
  }

  function unlockAdminPanel(options = {}) {
    const { scrollToAdmin = true } = options;
    if (adminUnlocked) return;
    adminUnlocked = true;
    closeAdminLoginModal();

    const role = normalizeAuthRole(authRole);
    authRole = role;
    const info = accountPanelTitle(role);

    const linksWrap = document.querySelector('.nav-links');
    if (linksWrap && !document.querySelector('.nav-btn[data-section="admin"]')) {
      const a = document.createElement('a');
      a.href = '#admin';
      a.className = 'nav-btn';
      a.dataset.section = 'admin';
      a.innerHTML = `<i class="fas ${info.icon}"></i><span>${info.label}</span>`;
      linksWrap.insertBefore(a, linksWrap.firstChild);
      bindNavLinkClick(a);
    }

    if (scrollContainer && !document.getElementById('admin')) {
      const section = document.createElement('section');
      section.id = 'admin';
      section.className = 'panel';
      if (role === 'admin') {
        section.innerHTML = buildAdminPanelHTML();
        scrollContainer.insertBefore(section, scrollContainer.firstChild);
        bindAdminPanelEvents(section);
      } else {
        section.innerHTML = buildUserAccountPanelHTML(role);
        scrollContainer.insertBefore(section, scrollContainer.firstChild);
        bindUserAccountPanelEvents(section, role);
      }
    }

    requestAnimationFrame(() => {
      if (scrollToAdmin) {
        const adminEl = document.getElementById('admin');
        if (adminEl) scrollContainer.scrollTo({ left: adminEl.offsetLeft, behavior: 'smooth' });
      }
      updateActiveNavFromScroll();
      updateCapsuleFromScroll();
    });
  }

  async function checkAdminSession() {
    try {
      const res = await fetch(`${API_BASE_URL}/auth/me`, { credentials:'include', cache:'no-store' });
      const data = await res.json().catch(()=>null);
      if (res.ok && data?.authenticated) {
        authRole = normalizeAuthRole(data.role || (data.admin ? 'admin' : 'authed_user'));
        unlockAdminPanel({ scrollToAdmin: false });
        if (authRole !== 'admin') {
          await loadBlogRoute(true);
          filterAndRenderBlogs(blogFilterKeyword || '', blogFilterDate || null, false);
        }
        return true;
      }
    } catch (_) {}
    authRole = null;
    return false;
  }

  async function setupAdminStatusRetention(section) {
    const select = section?.querySelector('#adminStatusRetentionSelect');
    if (!select || select.dataset.ready === '1') return;
    select.dataset.ready = '1';
    const trigger = select.querySelector('.apple-select-trigger');
    const label = select.querySelector('.apple-select-label');
    const options = [...select.querySelectorAll('.apple-select-option')];
    const msg = section.querySelector('#adminStatusRetentionMsg');
    const setValue = (value, text) => {
      select.dataset.value = value;
      if (label) label.textContent = text;
    };
    options.forEach(opt => opt.addEventListener('click', e => {
      e.stopPropagation();
      setValue(opt.dataset.value || '1y', opt.dataset.label || opt.textContent.trim());
      select.classList.remove('open');
      trigger?.setAttribute('aria-expanded', 'false');
    }));
    trigger?.addEventListener('click', e => {
      e.stopPropagation();
      const open = select.classList.toggle('open');
      trigger.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    document.addEventListener('click', e => {
      if (!select.contains(e.target)) { select.classList.remove('open'); trigger?.setAttribute('aria-expanded','false'); }
    });
    try {
      const res = await fetch(`${API_BASE_URL}/admin/profile/status-retention`, { credentials: 'include' });
      const data = await res.json();
      if (res.ok && data.success) {
        const opt = options.find(o => o.dataset.value === data.retention);
        if (opt) setValue(data.retention, opt.dataset.label);
      }
    } catch (_) {}
    section.querySelector('#adminSaveStatusRetentionBtn')?.addEventListener('click', async () => {
      const btn = section.querySelector('#adminSaveStatusRetentionBtn');
      if (btn) { btn.disabled = true; btn.textContent = '保存中…'; }
      try {
        const res = await fetch(`${API_BASE_URL}/admin/profile/status-retention`, {
          method: 'PUT', credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ retention: select.dataset.value || '1y' })
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.success) throw new Error(data.error || '保存失败');
        if (msg) { msg.textContent = '保存周期已更新，过期的历史状态已清理。'; msg.className = 'admin-msg ok'; }
      } catch (e) {
        if (msg) { msg.textContent = String(e.message || e); msg.className = 'admin-msg err'; }
      } finally {
        if (btn) { btn.disabled = false; btn.textContent = '保存保存周期'; }
      }
    });

    document.getElementById('adminRefreshStatusHistoryBtn')?.addEventListener('click', () => loadAdminStatusHistory());
    loadAdminStatusHistory();
  }

  async function loadAdminStatusHistory() {
    const list = document.getElementById('adminStatusHistoryList');
    const msg = document.getElementById('adminStatusHistoryMsg');
    if (!list) return;
    list.innerHTML = '<p class="admin-msg">加载中…</p>';
    if (msg) { msg.textContent = ''; msg.className = 'admin-msg'; }
    try {
      const res = await fetch(`${API_BASE_URL}/admin/profile/status-history?limit=500`, { credentials: 'include', cache: 'no-store' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) throw new Error(data.error || ('HTTP ' + res.status));
      const rows = Array.isArray(data.history) ? data.history : [];
      if (!rows.length) {
        list.innerHTML = '<p class="admin-msg">暂无状态历史</p>';
        return;
      }
      // 新→旧
      const sorted = rows.slice().sort((a, b) => String(b.started_at || '').localeCompare(String(a.started_at || '')));
      list.innerHTML = '<div class="admin-status-history-table">' + sorted.map((h) => {
        const id = h.id;
        const type = escapeHtml(h.status_type || '');
        const text = escapeHtml(h.status_text || '');
        const summary = escapeHtml(h.status_summary || '');
        const start = escapeHtml(formatDateUTC8(h.started_at) || h.started_at || '');
        const end = h.ended_at ? escapeHtml(formatDateUTC8(h.ended_at) || h.ended_at) : '<em class="is-current-hist">进行中</em>';
        return `<div class="admin-status-history-row" data-id="${id}">
          <div class="admin-shh-main">
            <span class="home-status-dot ${type}"></span>
            <strong>${text}</strong>
            <span class="admin-shh-type">${type}</span>
          </div>
          <div class="admin-shh-meta">${start} → ${end}</div>
          ${summary ? `<div class="admin-shh-summary">${summary}</div>` : ''}
          <div class="admin-shh-actions">
            <button type="button" class="nav-btn apple-secondary-btn admin-shh-del" data-id="${id}" title="删除此条"><i class="fas fa-trash"></i> 删除</button>
          </div>
        </div>`;
      }).join('') + '</div>';
      list.querySelectorAll('.admin-shh-del').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const id = btn.getAttribute('data-id');
          if (!id || !confirm('确定删除这条状态历史？')) return;
          btn.disabled = true;
          try {
            const r = await fetch(`${API_BASE_URL}/admin/profile/status-history/${id}`, { method: 'DELETE', credentials: 'include' });
            const d = await r.json().catch(() => ({}));
            if (!r.ok || !d.success) throw new Error(d.error || ('HTTP ' + r.status));
            if (msg) { msg.textContent = '已删除 #' + id; msg.className = 'admin-msg ok'; }
            loadAdminStatusHistory();
            // 刷新主页时间线
            try { if (typeof loadStatusTimeline === 'function') loadStatusTimeline(); } catch (_) {}
          } catch (e) {
            if (msg) { msg.textContent = String(e.message || e); msg.className = 'admin-msg err'; }
            btn.disabled = false;
          }
        });
      });
    } catch (e) {
      list.innerHTML = '<p class="admin-msg err">' + escapeHtml(String(e.message || e)) + '</p>';
    }
  }

  function estimateStatusReadMs(text) {
    const value = String(text || '').trim();
    if (!value) return 1200;
    const cjk = (value.match(/[\u3400-\u9fff]/g) || []).length;
    const latinWords = (value.match(/[A-Za-z0-9]+(?:[’'_-][A-Za-z0-9]+)*/g) || []).length;
    const seconds = cjk / 5.5 + latinWords / 3.2;
    return Math.max(1800, Math.min(12000, seconds * 1000 + 900));
  }

  function setupHomeStatusDetail() {
    const button = document.getElementById('homeStatusButton');
    if (!button) return;
    const summaryRaw = String(profileData.statusSummary || '').trim();
    if (!summaryRaw) { button.removeAttribute('title'); return; }
    const summary = summaryRaw.replace(/\s+$/g, '');
    button.classList.add('has-summary');
    button.setAttribute('title', '点击查看状态简述');

    const row = button.closest('.home-name-row');
    const textEl = button.querySelector('.home-status-text');
    if (!textEl) return;

    let cursorEl = button.querySelector('.home-status-cursor');
    if (!cursorEl) {
      cursorEl = document.createElement('span');
      cursorEl.className = 'home-status-cursor';
      cursorEl.setAttribute('aria-hidden', 'true');
      button.appendChild(cursorEl);
    }

    const sleep = (ms) => new Promise((resolve) => window.setTimeout(resolve, ms));
    const nextFrame = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const prefersReduced = () => {
      try { return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (_) { return false; }
    };
    const statusLabel = () => String(profileData.status || '在线').trim();

    let runId = 0;
    let busy = false;
    let autoBackTimer = 0;
    let expanded = false;

    function showCursor(on) {
      cursorEl.classList.toggle('is-on', !!on);
      if (!on) {
        // 彻底去掉光标占位，避免末尾“幽灵空隙”
        cursorEl.style.display = 'none';
      } else {
        cursorEl.style.display = '';
      }
    }

    function measureTextWidth(str) {
      const probe = document.createElement('span');
      probe.style.cssText = 'position:absolute;left:-9999px;top:0;visibility:hidden;white-space:nowrap;pointer-events:none;font:inherit;letter-spacing:inherit;';
      const cs = window.getComputedStyle(button);
      probe.style.font = cs.font;
      probe.style.fontSize = cs.fontSize;
      probe.style.fontWeight = cs.fontWeight;
      probe.textContent = str || '';
      document.body.appendChild(probe);
      const w = probe.getBoundingClientRect().width;
      probe.remove();
      return w;
    }

    function needsExpandForDetail(detail) {
      // 仅当文案含换行，或宽度明显超出姓名行可用空间时，才落到下一行
      if (/[\n\r]/.test(detail)) return true;
      const rowW = row ? row.getBoundingClientRect().width : 480;
      const nameEl = row ? row.querySelector('.home-name') : null;
      const nameW = nameEl ? nameEl.getBoundingClientRect().width : 120;
      // 同行可用：整行宽 − 姓名 − gap − 安全边距
      const available = Math.max(120, rowW - nameW - 24);
      const detailW = measureTextWidth(detail) + 8 + 6 + 20; // dot + gap + padding
      return detailW > available;
    }

    /** 内容驱动宽度，避免 max-width 把玻璃条撑出空白 */
    function fitWidthToContent() {
      button.style.width = 'max-content';
      // 读一次布局让 max-content 生效
      const w = button.getBoundingClientRect().width;
      button.style.width = Math.ceil(w) + 'px';
    }

    function clearInlineSize() {
      button.style.width = '';
      button.style.height = '';
      button.style.minHeight = '';
      button.style.transform = '';
      button.style.transition = '';
    }

    async function typewriterDelete(fromText, token) {
      let t = String(fromText || '');
      // 清掉可能残留的尾部空白
      t = t.replace(/\s+$/g, '');
      if (t.length) {
        textEl.textContent = t.slice(0, -1);
        showCursor(true);
        fitWidthToContent();
        await sleep(prefersReduced() ? 40 : 70);
        if (token !== runId) return false;
        t = (textEl.textContent || '').replace(/\s+$/g, '');
      } else {
        showCursor(true);
      }
      while (t.length) {
        if (token !== runId) return false;
        t = t.slice(0, -1);
        textEl.textContent = t;
        fitWidthToContent();
        await sleep(prefersReduced() ? 8 : (10 + Math.random() * 10));
      }
      textEl.textContent = '';
      fitWidthToContent();
      return true;
    }

    async function typewriterType(full, token) {
      const s = String(full || '').replace(/\s+$/g, '');
      textEl.textContent = '';
      showCursor(true);
      fitWidthToContent();
      if (prefersReduced()) {
        textEl.textContent = s;
        fitWidthToContent();
        return token === runId;
      }
      for (let i = 0; i < s.length; i++) {
        if (token !== runId) return false;
        textEl.textContent = s.slice(0, i + 1);
        fitWidthToContent();
        const ch = s[i];
        let delay = 22 + Math.random() * 36;
        if (/[，。！？；、,.!?;:]/.test(ch)) delay += 28 + Math.random() * 36;
        if (ch === ' ' || ch === '\n') delay += 12;
        await sleep(delay);
      }
      return true;
    }

    /**
     * 删除文案后、打详情前：玻璃条 translate 移到 MaxSui 下方，同时像素宽度横向扩展。
     * 不用 scale，避免 backdrop-filter 错位。
     */
    async function flipLayout(toExpanded) {
      if (!row) {
        button.classList.toggle('is-detail', toExpanded);
        expanded = toExpanded;
        return;
      }
      const useMultiline = toExpanded && needsExpandForDetail(summary);
      if (prefersReduced()) {
        row.classList.toggle('is-status-expanded', toExpanded);
        row.classList.toggle('is-status-multiline', useMultiline);
        button.classList.toggle('is-detail', toExpanded);
        expanded = toExpanded;
        clearInlineSize();
        return;
      }

      // 空文案时保持高度，指示点仍居中
      const startRect = button.getBoundingClientRect();
      const startW = startRect.width;
      const startH = Math.max(startRect.height, 28);
      button.style.minHeight = startH + 'px';
      button.style.width = Math.ceil(startW) + 'px';
      button.style.boxSizing = 'border-box';

      const first = button.getBoundingClientRect();

      row.classList.toggle('is-status-expanded', toExpanded);
      row.classList.toggle('is-status-multiline', useMultiline);
      button.classList.toggle('is-detail', toExpanded);
      // 目标态先用 max-content 量一次
      button.style.width = 'max-content';
      void button.offsetWidth;
      let targetW = button.getBoundingClientRect().width;
      if (toExpanded) {
        const detailW = measureTextWidth(summary) + 8 + 6 + 16;
        const cap = useMultiline
          ? Math.min(32 * 16, (row.getBoundingClientRect().width || 480))
          : Math.min(28 * 16, (row.getBoundingClientRect().width || 480));
        targetW = Math.min(Math.max(targetW, detailW), cap);
      }
      targetW = Math.max(targetW, 40);

      void button.offsetWidth;
      const last = button.getBoundingClientRect();
      const dx = first.left - last.left;
      const dy = first.top - last.top;

      button.classList.add('is-flipping');
      button.style.transition = 'none';
      button.style.width = Math.ceil(first.width) + 'px';
      button.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
      await nextFrame();

      // 平滑缓出，无弹性过冲
      button.style.transition =
        'transform 0.58s cubic-bezier(0.25, 0.1, 0.25, 1), width 0.58s cubic-bezier(0.25, 0.1, 0.25, 1)';
      button.style.width = Math.ceil(targetW) + 'px';
      button.style.transform = 'translate(0px, 0px)';

      await new Promise((resolve) => {
        let done = false;
        const finish = () => {
          if (done) return;
          done = true;
          button.removeEventListener('transitionend', onEnd);
          resolve();
        };
        const onEnd = (e) => {
          if (e.target !== button) return;
          if (e.propertyName !== 'transform' && e.propertyName !== 'width') return;
          finish();
        };
        button.addEventListener('transitionend', onEnd);
        window.setTimeout(finish, 680);
      });

      button.classList.remove('is-flipping');
      button.style.transition = '';
      button.style.transform = '';
      button.style.width = Math.ceil(targetW) + 'px';
      expanded = toExpanded;
      if (!toExpanded) {
        row.classList.remove('is-status-multiline');
      }
    }

    async function playToDetail(token) {
      const okDel = await typewriterDelete(textEl.textContent || statusLabel(), token);
      if (!okDel || token !== runId) return;

      const willExpand = needsExpandForDetail(summary);
      if (willExpand && !expanded) {
        await flipLayout(true);
        if (token !== runId) return;
      } else if (!willExpand) {
        button.classList.add('is-detail');
      }

      const okType = await typewriterType(summary, token);
      if (!okType || token !== runId) return;
      showCursor(false);
      fitWidthToContent();
      if (token === runId) busy = false;

      window.clearTimeout(autoBackTimer);
      autoBackTimer = window.setTimeout(() => {
        if (token !== runId) return;
        if (busy) return;
        busy = true;
        button.classList.add('is-typing');
        playToStatus(token).finally(() => {
          if (token === runId) {
            button.classList.remove('is-typing');
            busy = false;
          }
        });
      }, estimateStatusReadMs(summary));
    }

    async function playToStatus(token) {
      const okDel = await typewriterDelete(textEl.textContent || summary, token);
      if (!okDel || token !== runId) return;

      if (expanded) {
        await flipLayout(false);
        if (token !== runId) return;
      } else {
        button.classList.remove('is-detail');
      }

      const label = statusLabel();
      const okType = await typewriterType(label, token);
      if (!okType || token !== runId) return;
      showCursor(false);
      clearInlineSize();
      button.classList.remove('is-detail');
      if (row) row.classList.remove('is-status-expanded');
      expanded = false;
    }

    button.addEventListener('click', async () => {
      if (busy) return;
      const summaryNow = String(profileData.statusSummary || '').trim();
      if (!summaryNow) return;
      busy = true;
      window.clearTimeout(autoBackTimer);
      runId += 1;
      const token = runId;
      button.classList.add('is-typing');
      try {
        if (button.classList.contains('is-detail') || expanded) {
          await playToStatus(token);
        } else {
          await playToDetail(token);
        }
      } catch (_) {
        /* ignore */
      } finally {
        if (token === runId) {
          button.classList.remove('is-typing');
          busy = false;
        }
      }
    });
  }

  function buildStatusTimelineItemHtml(item, labels, { isCurrent = false } = {}) {
    const type = labels[item.status_type] ? item.status_type : 'custom';
    return `<article class="status-timeline-item${isCurrent ? ' is-current' : ''}">
      <span class="status-timeline-dot ${type}"></span>
      <div class="status-timeline-card">
        <div class="status-timeline-status"><span class="status-timeline-dot-mini ${type}"></span>${escapeHtml(item.status_text || labels[type])}${isCurrent ? '<span class="status-timeline-now">现在</span>' : ''}</div>
        ${item.status_summary ? `<div class="status-timeline-summary">${escapeHtml(item.status_summary)}</div>` : ''}
        <div class="status-timeline-time">${escapeHtml(formatDateUTC8(item.started_at))}${item.ended_at ? ` — ${escapeHtml(formatDateUTC8(item.ended_at))}` : ' — 至今'}</div>
      </div>
    </article>`;
  }

  async function loadStatusTimeline() {
    const timeline = document.getElementById('statusTimeline');
    const track = document.getElementById('statusTimelineTrack');
    if (!timeline || !track) return;
    try {
      const res = await fetch(`${API_BASE_URL}/profile/status-history?limit=300`, { credentials: 'include' });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || '状态历史加载失败');
      const history = Array.isArray(data.history) ? data.history : [];
      const labels = { online:'在线', busy:'忙碌', away:'离开', dnd:'请勿打扰', invisible:'隐身', offline:'离线', custom:'自定义' };

      const currentItems = history.filter((item) => !item.ended_at);
      const pastItems = history.filter((item) => !!item.ended_at);
      // 历史按时间从新到旧，显示在当前状态右侧
      pastItems.sort((a, b) => {
        const ta = new Date(a.started_at || 0).getTime();
        const tb = new Date(b.started_at || 0).getTime();
        return tb - ta;
      });

      if (!history.length) {
        track.innerHTML = '<div class="status-timeline-empty">还没有可显示的状态历程</div>';
        return;
      }

      // 时间线：当前状态在左（1.2×），历史在右（0.8×）；不再单独画一份
      const currentHtml = currentItems.length
        ? buildStatusTimelineItemHtml(currentItems[0], labels, { isCurrent: true })
        : '';
      const pastHtml = pastItems.map((item) =>
        buildStatusTimelineItemHtml(item, labels, { isCurrent: false })
      ).join('');

      if (!currentHtml && !pastHtml) {
        track.innerHTML = '<div class="status-timeline-empty">还没有可显示的状态历程</div>';
        return;
      }

      track.innerHTML = `<div class="status-timeline-line"></div>` + currentHtml + pastHtml;
      requestAnimationFrame(() => { timeline.scrollLeft = 0; });
    } catch (e) {
      track.innerHTML = `<div class="status-timeline-empty">状态历程暂时无法加载</div>`;
      console.warn('[status-timeline]', e);
    }
  }

  function setupStatusTimelineWheel() {
    const timeline = document.getElementById('statusTimeline');
    if (!timeline || timeline.dataset.wheelReady === '1') return;
    timeline.dataset.wheelReady = '1';
    timeline.addEventListener('wheel', e => {
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
      if (timeline.scrollWidth <= timeline.clientWidth) return;
      e.preventDefault();
      timeline.scrollLeft += e.deltaY;
    }, { passive: false });
  }

  /** 主页禁止纵向滚动（内容一屏展示） */
  function setupHomeNoVerticalScroll() {
    const home = document.getElementById('home');
    if (!home || home.dataset.noVScroll === '1') return;
    home.dataset.noVScroll = '1';
    home.style.overflowY = 'hidden';
    home.addEventListener('wheel', (e) => {
      // 时间线横向滚已单独处理；其余纵向滚轮在主页吞掉
      const tl = document.getElementById('statusTimeline');
      if (tl && (e.target === tl || (tl.contains && tl.contains(e.target)))) return;
      if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
        e.preventDefault();
      }
    }, { passive: false });
    // 触控板/触摸：阻止主页纵向拖动
    home.addEventListener('touchmove', (e) => {
      const tl = document.getElementById('statusTimeline');
      if (tl && e.target && tl.contains(e.target)) return;
      // 仅当主页自身在滚时拦截
      if (home.scrollTop !== 0) home.scrollTop = 0;
    }, { passive: true });
  }

    function setupAdminLoginUI() {
    const modal = document.getElementById('adminLoginModal');
    const form = document.getElementById('adminLoginForm');
    const closeBtn = document.getElementById('closeAdminLoginBtn');
    const cancelBtn = document.getElementById('adminLoginCancel');
    const err = document.getElementById('adminLoginError');
    const hint = document.getElementById('adminLoginHint');
    const fields = document.getElementById('authedRegisterFields');
    const submit = document.getElementById('adminLoginSubmit');
    const userInput = document.getElementById('adminUsername');
    const passInput = document.getElementById('adminPassword');
    const showError = (text) => { if (err) { err.hidden = false; err.textContent = text; } };
    const loginFields = document.getElementById('adminLoginFields');
    const enterRegisterMode = (secret) => {
      authedCreateSecret = secret;
      if (userInput) { userInput.value = ''; userInput.removeAttribute('required'); }
      if (passInput) { passInput.value = ''; passInput.removeAttribute('required'); }
      if (loginFields) loginFields.hidden = true;
      if (fields) fields.hidden = false;
      if (hint) { hint.hidden = false; hint.textContent = '创建 Authed User：最多 20 个账户。请设置用户名和密码。'; }
      if (submit) submit.textContent = '创建账户';
      setTimeout(() => document.getElementById('authedRegisterUsername')?.focus(), 30);
    };
    const leaveRegisterMode = () => {
      authedCreateSecret = null;
      if (fields) fields.hidden = true;
      if (loginFields) loginFields.hidden = false;
      if (userInput) userInput.setAttribute('required', '');
      if (passInput) passInput.setAttribute('required', '');
      if (hint) hint.hidden = true;
      if (submit) submit.textContent = '登录';
    };
    if (closeBtn) closeBtn.addEventListener('click', closeAdminLoginModal);
    if (cancelBtn) cancelBtn.addEventListener('click', closeAdminLoginModal);
    if (modal) modal.addEventListener('click', (e) => { if (e.target === modal) closeAdminLoginModal(); });
    if (!form) return;
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (err) err.hidden = true;
      if (authedCreateSecret) {
        const username = (document.getElementById('authedRegisterUsername')?.value || '').trim();
        const password = document.getElementById('authedRegisterPassword')?.value || '';
        const confirm = document.getElementById('authedRegisterConfirm')?.value || '';
        if (!username || !password || !confirm) return showError('请完整填写三个字段');
        if (password !== confirm) return showError('两次密码不一致');
        if (password.length < 8) return showError('密码至少需要 8 位');
        if (submit) { submit.disabled = true; submit.textContent = '创建中…'; }
        try {
          const res = await fetch(`${API_BASE_URL}/auth/register-authed-user`, { method:'POST', credentials:'include', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ secret: authedCreateSecret, username, password }) });
          const data = await res.json().catch(()=>null);
          if (!res.ok || data?.success === false) throw new Error(data?.error || '创建失败');
          leaveRegisterMode();
          if (hint) { hint.hidden = false; hint.textContent = `创建成功：${data.username}。现在可以使用新账户登录。`; }
          if (userInput) userInput.value = data.username || username;
          if (passInput) passInput.value = '';
          if (submit) submit.textContent = '登录';
          if (err) err.hidden = true;
          setTimeout(() => passInput?.focus(), 30);
        } catch (ex) { showError(String(ex.message || ex)); }
        finally { if (submit) submit.disabled = false; }
        return;
      }
      const username = (userInput?.value || '').trim();
      const password = passInput?.value || '';
      if (!username || !password) return showError('请输入用户名和密码');
      if (submit) { submit.disabled = true; submit.textContent = '校验中…'; }
      try {
        const res = await fetch(`${API_BASE_URL}/auth/login`, { method:'POST', credentials:'include', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ username, password }) });
        const data = await res.json().catch(()=>null);
        if (res.ok && data?.registration_mode) { enterRegisterMode(username); return; }
        if (res.ok && data?.success !== false) {
          authRole = normalizeAuthRole(data.role || (data.admin ? 'admin' : 'authed_user'));
          closeAdminLoginModal();
          unlockAdminPanel({ scrollToAdmin: true });
          if (authRole !== 'admin') {
            await loadBlogRoute(true);
            filterAndRenderBlogs(blogFilterKeyword || '', blogFilterDate || null, false);
          }
          return;
        }
        showError(data?.error || (res.status === 401 ? '用户名或密码错误' : '登录失败'));
      } catch (ex) { showError('网络错误，请稍后重试'); }
      finally { if (submit) { submit.disabled = false; if (!authedCreateSecret) submit.textContent = '登录'; } }
    });
  }

  function setupAvatarSecret() {
    const globalAvatar = document.getElementById('globalAvatar');
    if (!globalAvatar || globalAvatar.dataset.secretBound === '1') return;
    globalAvatar.dataset.secretBound = '1';
    globalAvatar.addEventListener('click', () => {
      if (adminUnlocked) return;
      avatarClickCount++;
      clearTimeout(avatarClickTimer);
      if (avatarClickCount >= 7) {
        avatarClickCount = 0;
        openAdminLoginModal();
      } else {
        avatarClickTimer = setTimeout(() => { avatarClickCount = 0; }, 2000);
      }
    });
  }

  /** 连续点 7 次导航 Logo（终端 FA 图标 + MaxSui）切换鼠标拖尾 */
  function setupLogoTrailToggle() {
    const logo = document.querySelector('.glass-nav .logo');
    if (!logo || logo.dataset.trailToggleBound === '1') return;
    logo.dataset.trailToggleBound = '1';
    logo.style.cursor = 'pointer';
    logo.title = '连续点击 7 次可开关拖尾';
    let n = 0;
    let timer = null;
    logo.addEventListener('click', (e) => {
      e.preventDefault();
      n += 1;
      clearTimeout(timer);
      if (n >= 7) {
        n = 0;
        setTrailEffectEnabled(!trailEffectEnabled);
        // 轻提示：标题闪一下
        const prev = logo.title;
        logo.title = trailEffectEnabled ? '拖尾已开启' : '拖尾已关闭';
        setTimeout(() => { logo.title = prev; }, 1600);
      } else {
        timer = setTimeout(() => { n = 0; }, 2000);
      }
    });
  }

  let avatarPosRaf = 0;
  let avatarPosPending = false;
  function scheduleGlobalAvatarPosition() {
    if (avatarPosRaf) {
      avatarPosPending = true;
      return;
    }
    avatarPosRaf = requestAnimationFrame(() => {
      avatarPosRaf = 0;
      try { updateGlobalAvatarPositionNow(); } catch (_) {}
      if (avatarPosPending) {
        avatarPosPending = false;
        scheduleGlobalAvatarPosition();
      }
    });
  }

  function updateGlobalAvatarPosition() {
    scheduleGlobalAvatarPosition();
  }

  function updateGlobalAvatarPositionNow() {
    const globalAvatar = document.getElementById('globalAvatar');
    if (apiOfflineLocked) {
      centerAvatarForOffline();
      return;
    }
    const homePlaceholder = document.getElementById('homeAvatarPlaceholder');
    const blogPlaceholder = document.getElementById('coverAvatarPlaceholder');
    const worksPlaceholder = document.getElementById('worksAvatarPlaceholder');
    const contactPlaceholder = document.getElementById('contactAvatarPlaceholder');
    if (!globalAvatar || !homePlaceholder || !blogPlaceholder || !worksPlaceholder || !contactPlaceholder) return;

    const phone = document.documentElement.classList.contains('is-phone')
      || (window.matchMedia && window.matchMedia('(max-width: 480px)').matches);

    const vw = scrollContainer.clientWidth || window.innerWidth || 1;
    const scrollLeft = scrollContainer.scrollLeft;
    let p = scrollLeft / vw;
    if (adminUnlocked) p = p - 1;
    if (p < 0) {
      globalAvatar.style.opacity = Math.max(0, 1 + p);
      const r = homePlaceholder.getBoundingClientRect();
      globalAvatar.style.transition = 'none';
      globalAvatar.style.width = r.width + 'px';
      globalAvatar.style.height = r.height + 'px';
      globalAvatar.style.transform =
        `translate3d(${r.left}px, ${r.top}px, 0)`;
      return;
    }
    if (p > 3) p = 3;

    let targetRect, startRect;
    let localP = 0;
    if (p <= 1) {
      startRect = homePlaceholder.getBoundingClientRect();
      targetRect = blogPlaceholder.getBoundingClientRect();
      localP = p;
    } else if (p <= 2) {
      startRect = blogPlaceholder.getBoundingClientRect();
      targetRect = worksPlaceholder.getBoundingClientRect();
      localP = p - 1;
    } else {
      startRect = worksPlaceholder.getBoundingClientRect();
      targetRect = contactPlaceholder.getBoundingClientRect();
      localP = p - 2;
    }

    const startCX = startRect.left + startRect.width / 2;
    const startCY = startRect.top + startRect.height / 2;
    const targetCX = targetRect.left + targetRect.width / 2;
    const targetCY = targetRect.top + targetRect.height / 2;
    const cx = startCX * (1 - localP) + targetCX * localP;
    const cy = startCY * (1 - localP) + targetCY * localP;
    const size = startRect.width * (1 - localP) + targetRect.width * localP;

    globalAvatar.style.transition = 'none';
    globalAvatar.style.width = size + 'px';
    globalAvatar.style.height = size + 'px';
    // translate3d 走合成层；作品/名片纵滑时直接跟占位，无动画
    globalAvatar.style.transform = `translate3d(${cx - size / 2}px, ${cy - size / 2}px, 0)`;

    if (blogPanel && isBlogActive) {
      const blogScrollTop = blogPanel.scrollTop;
      const vh = blogPanel.clientHeight || window.innerHeight || 1;
      let p1 = Math.min(1, Math.max(0, blogScrollTop / (stage1Height || vh)));
      globalAvatar.style.opacity = String(Math.max(0, 1 - p1 * 1.2));
    } else {
      globalAvatar.style.opacity = '1';
    }
  }

  // 作品 / 名片：纵向滚动时头像直接跟占位框走（无额外动画）
  (function bindPanelAvatarFollow() {
    const ids = ['works', 'contact'];
    ids.forEach((id) => {
      const panel = document.getElementById(id);
      if (!panel || panel.dataset.avatarFollowBound === '1') return;
      panel.dataset.avatarFollowBound = '1';
      panel.addEventListener('scroll', () => {
        scheduleGlobalAvatarPosition();
      }, { passive: true });
    });
  })();

  let rafId = null;

  /** 水平滑动途中不切换文案，仅接近吸附或停稳后切换 active */
  let navSettledSectionId = null;
  let navScrollEndTimer = null;

  function updateActiveNavFromScroll() {
    if (rafId) cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(() => {
      const sections = getSections();
      const scrollLeft = scrollContainer.scrollLeft;
      const containerWidth = scrollContainer.clientWidth || 1;
      const viewportCenter = scrollLeft + containerWidth / 2;
      let closestIndex = 0;
      let closestDist = Infinity;
      sections.forEach((section, index) => {
        const center = section.offsetLeft + section.offsetWidth / 2;
        const dist = Math.abs(center - viewportCenter);
        if (dist < closestDist) { closestDist = dist; closestIndex = index; }
      });
      const maxScroll = scrollContainer.scrollWidth - scrollContainer.clientWidth;
      if (scrollLeft <= 5) closestIndex = 0;
      else if (scrollLeft >= maxScroll - 5) closestIndex = sections.length - 1;

      const snapThreshold = containerWidth * 0.22;
      const nearSnap = closestDist <= snapThreshold
        || scrollLeft <= 5
        || scrollLeft >= maxScroll - 5;

      const applyActive = (activeId) => {
        if (!activeId) return;
        navSettledSectionId = activeId;
        getNavLinks().forEach(link => {
          link.classList.toggle('active', link.dataset.section === activeId);
        });
        const wasBlog = isBlogActive;
        isBlogActive = (activeId === 'blog');
        if (isBlogActive !== wasBlog) {
          if (!isBlogActive) {
            nav.classList.remove('blog-mode');
            if (isArticleReading) closeArticleReader();
            scheduleCapsuleRefresh();
          } else {
            if (blogPanel && !isArticleReading) blogPanel.scrollTop = 0;
            updateBlogScroll();
          }
        }
        ensureRouteLoaded(activeId);
      };

      if (nearSnap) {
        applyActive(sections[closestIndex]?.getAttribute('id'));
      }

      if (navScrollEndTimer) clearTimeout(navScrollEndTimer);
      navScrollEndTimer = setTimeout(() => {
        applyActive(sections[closestIndex]?.getAttribute('id'));
      }, 120);

      rafId = null;
    });
  }

  function ensureNavCapsule() {
    const links = document.querySelector('.nav-links');
    if (!links) return null;
    let el = links.querySelector('.nav-capsule');
    if (!el) {
      el = document.createElement('div');
      el.className = 'nav-capsule';
      links.insertBefore(el, links.firstChild);
    }
    navCapsule = el;
    return el;
  }

  function applyCapsuleTransform() {
    if (!navCapsule) return;
    navCapsule.style.width = Math.max(0, capsuleW) + 'px';
    navCapsule.style.transform =
      `translateY(-50%) translateX(${capsuleX}px) scale(${capsuleScale})`;
  }

  function tickCapsuleScaleSpring() {
    const target = 1;
    const disp = capsuleScale - target;
    const accel = -CAPSULE_SPRING_K * disp - CAPSULE_SPRING_D * capsuleScaleVel;
    const dt = 1 / 60;
    capsuleScaleVel += accel * dt;
    capsuleScale += capsuleScaleVel * dt;
    if (Math.abs(disp) < 0.001 && Math.abs(capsuleScaleVel) < 0.002) {
      capsuleScale = 1;
      capsuleScaleVel = 0;
      applyCapsuleTransform();
      capsuleScaleRaf = null;
      return;
    }
    applyCapsuleTransform();
    capsuleScaleRaf = requestAnimationFrame(tickCapsuleScaleSpring);
  }

  function bumpCapsuleScaleFromVelocity(velocityPxPerSec) {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    if (!navCapsule || nav.classList.contains('blog-mode')) return;
    const t = Math.min(1, velocityPxPerSec / 2600);
    const next = 1 + (CAPSULE_SCALE_MAX - 1) * t;
    if (next > capsuleScale) {
      capsuleScale = next;
      capsuleScaleVel = 0;
      applyCapsuleTransform();
    }
    if (!capsuleScaleRaf) {
      capsuleScaleRaf = requestAnimationFrame(tickCapsuleScaleSpring);
    }
  }

  let capsuleDragging = false;
  let capsuleRefreshTimer = null;

  function scheduleCapsuleRefresh() {
    ensureNavCapsule();
    const run = () => {
      if (capsuleDragging) return;
      if (nav && nav.classList.contains('blog-mode')) return;
      if (navCapsule) navCapsule.style.opacity = '1';
      updateCapsuleFromScroll();
    };
    run();
    requestAnimationFrame(() => requestAnimationFrame(run));
    if (capsuleRefreshTimer) clearTimeout(capsuleRefreshTimer);
    // nav-links 从 blog-mode 收回时 width/opacity 有 ~0.42s 过渡，分几拍重测
    setTimeout(run, 80);
    setTimeout(run, 240);
    capsuleRefreshTimer = setTimeout(run, 520);
  }

  function updateCapsuleFromScroll() {
    if (capsuleDragging) return;
    ensureNavCapsule();
    if (!navCapsule) return;
    // 博客工具栏展开时，指示器随 .nav-links 一起被 CSS 隐藏。
    // 切勿在这里写死 opacity:0 —— 收回工具栏后指示器会再也回不来。
    if (nav && nav.classList.contains('blog-mode')) return;
    navCapsule.style.opacity = '1';

    const links = document.querySelector('.nav-links');
    const btns = Array.from(document.querySelectorAll('.nav-btn[data-section]'));
    if (!links || btns.length < 2) return;

    const vw = scrollContainer.clientWidth || 1;
    const maxScroll = Math.max(1, scrollContainer.scrollWidth - vw);
    let progress = (scrollContainer.scrollLeft / maxScroll) * (btns.length - 1);
    progress = Math.max(0, Math.min(btns.length - 1, progress));

    const i0 = Math.floor(progress);
    const i1 = Math.min(btns.length - 1, i0 + 1);
    const t = progress - i0;

    const parentRect = links.getBoundingClientRect();
    const r0 = btns[i0].getBoundingClientRect();
    const r1 = btns[i1].getBoundingClientRect();
    // 过渡期宽度为 0 时不要把胶囊量成 0，否则看起来像「指示器没了」
    if (r0.width < 8 || r1.width < 8 || parentRect.width < 8) return;

    const x0 = r0.left - parentRect.left;
    const x1 = r1.left - parentRect.left;
    const w0 = r0.width;
    const w1 = r1.width;

    capsuleX = x0 + (x1 - x0) * t;
    capsuleW = w0 + (w1 - w0) * t;
    applyCapsuleTransform();
  }

  /** 拖动导航指示器（胶囊）切换面板 */
  function setupNavCapsuleDrag() {
    const links = document.querySelector('.nav-links');
    if (!links || links.dataset.capsuleDragBound === '1') return;
    links.dataset.capsuleDragBound = '1';
    ensureNavCapsule();
    if (!navCapsule) return;

    navCapsule.style.pointerEvents = 'auto';
    navCapsule.style.cursor = 'grab';
    navCapsule.style.zIndex = '2';
    navCapsule.setAttribute('aria-label', '拖动切换栏目');
    navCapsule.setAttribute('role', 'slider');
    links.style.touchAction = 'none';

    function armNavButtons() {
      Array.from(document.querySelectorAll('.nav-btn[data-section]')).forEach((btn) => {
        btn.setAttribute('draggable', 'false');
      });
    }
    armNavButtons();

    let dragPointerId = null;
    let dragStartX = 0;
    let dragStartY = 0;
    let dragStartProgress = 0;
    let dragMoved = false;
    let pending = false;
    let lastDragProgress = 0;
    const DRAG_THRESHOLD = 6;

    function getBtns() {
      const btns = Array.from(document.querySelectorAll('.nav-btn[data-section]'));
      btns.forEach((btn) => btn.setAttribute('draggable', 'false'));
      return btns;
    }

    function applyProgressToCapsuleAndScroll(progress, liveScroll) {
      const btns = getBtns();
      if (btns.length < 2) return;
      const parentRect = links.getBoundingClientRect();
      const i0 = Math.floor(progress);
      const i1 = Math.min(btns.length - 1, i0 + 1);
      const t = progress - i0;
      const r0 = btns[i0].getBoundingClientRect();
      const r1 = btns[i1].getBoundingClientRect();
      if (r0.width < 8 || r1.width < 8) return;
      const x0 = r0.left - parentRect.left;
      const x1 = r1.left - parentRect.left;
      capsuleX = x0 + (x1 - x0) * t;
      capsuleW = r0.width + (r1.width - r0.width) * t;
      applyCapsuleTransform();

      if (liveScroll && scrollContainer) {
        const vw = scrollContainer.clientWidth || 1;
        const maxScroll = Math.max(1, scrollContainer.scrollWidth - vw);
        scrollContainer.scrollLeft = (progress / (btns.length - 1)) * maxScroll;
      }
      lastDragProgress = progress;
    }

    function beginDrag(e) {
      capsuleDragging = true;
      pending = false;
      dragMoved = true;
      navCapsule.style.cursor = 'grabbing';
      navCapsule.classList.add('is-dragging');
      document.body.classList.add('is-nav-capsule-dragging');
      try { links.setPointerCapture(e.pointerId); } catch (_) {}
    }

    function onPointerDown(e) {
      if (apiOfflineLocked) return;
      if (nav.classList.contains('blog-mode')) return;
      if (e.button != null && e.button !== 0) return;
      if (!e.target || !links.contains(e.target)) return;

      dragPointerId = e.pointerId;
      dragStartX = e.clientX;
      dragStartY = e.clientY;
      dragMoved = false;
      pending = true;
      capsuleDragging = false;

      const btns = getBtns();
      const vw = scrollContainer.clientWidth || 1;
      const maxScroll = Math.max(1, scrollContainer.scrollWidth - vw);
      dragStartProgress = (scrollContainer.scrollLeft / maxScroll) * Math.max(1, btns.length - 1);
      lastDragProgress = dragStartProgress;

      const onCapsule = e.target === navCapsule || (e.target.closest && e.target.closest('.nav-capsule'));
      if (onCapsule) {
        e.preventDefault();
        e.stopPropagation();
        beginDrag(e);
      }
    }

    function onPointerMove(e) {
      if (e.pointerId !== dragPointerId) return;
      if (!pending && !capsuleDragging) return;

      const dx = e.clientX - dragStartX;
      const dy = e.clientY - dragStartY;

      if (pending && !capsuleDragging) {
        if (Math.abs(dx) < DRAG_THRESHOLD && Math.abs(dy) < DRAG_THRESHOLD) return;
        if (Math.abs(dx) < Math.abs(dy)) {
          pending = false;
          dragPointerId = null;
          return;
        }
        e.preventDefault();
        beginDrag(e);
      }

      if (!capsuleDragging) return;
      e.preventDefault();

      const btns = getBtns();
      if (btns.length < 2) return;
      const first = btns[0].getBoundingClientRect();
      const last = btns[btns.length - 1].getBoundingClientRect();
      const span = Math.max(1, (last.left + last.width / 2) - (first.left + first.width / 2));
      const delta = (dx / span) * (btns.length - 1);
      const progress = Math.max(0, Math.min(btns.length - 1, dragStartProgress + delta));
      applyProgressToCapsuleAndScroll(progress, true);
    }

    function endDrag(e) {
      if (e && e.pointerId != null && dragPointerId != null && e.pointerId !== dragPointerId) return;
      const wasDragging = capsuleDragging && dragMoved;
      const progressSnap = lastDragProgress;
      pending = false;
      capsuleDragging = false;
      dragPointerId = null;
      navCapsule.style.cursor = 'grab';
      navCapsule.classList.remove('is-dragging');
      document.body.classList.remove('is-nav-capsule-dragging');
      try { links.releasePointerCapture(e.pointerId); } catch (_) {}

      if (!wasDragging) {
        updateCapsuleFromScroll();
        return;
      }

      const suppressClick = (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
      };
      links.addEventListener('click', suppressClick, true);
      setTimeout(() => links.removeEventListener('click', suppressClick, true), 320);

      const btns = getBtns();
      if (btns.length < 2 || !scrollContainer) {
        updateCapsuleFromScroll();
        return;
      }
      const nearest = Math.round(progressSnap);
      const sectionId = btns[nearest] && btns[nearest].getAttribute('data-section');
      if (sectionId) ensureRouteLoaded(sectionId);
      const target = sectionId ? document.getElementById(sectionId) : null;
      if (target) {
        scrollContainer.scrollTo({ left: target.offsetLeft, behavior: 'smooth' });
      } else {
        const vw = scrollContainer.clientWidth || 1;
        const maxScroll = Math.max(1, scrollContainer.scrollWidth - vw);
        scrollContainer.scrollTo({
          left: (nearest / Math.max(1, btns.length - 1)) * maxScroll,
          behavior: 'smooth'
        });
      }
      requestAnimationFrame(() => updateCapsuleFromScroll());
    }

    // 禁止把选项卡当超链接拖出
    links.addEventListener('dragstart', (e) => { e.preventDefault(); }, true);
    links.addEventListener('pointerdown', onPointerDown, true);
    window.addEventListener('pointermove', onPointerMove, { passive: false });
    window.addEventListener('pointerup', endDrag, true);
    window.addEventListener('pointercancel', endDrag, true);

    links.addEventListener('transitionend', (e) => {
      if (!e) return;
      if (e.target !== links && e.target !== nav) return;
      scheduleCapsuleRefresh();
    });
  }

  setupNavCapsuleDrag();

  scrollContainer.addEventListener('scroll', () => {
    if (apiOfflineLocked) {
      const home = document.getElementById('home');
      if (home && Math.abs(scrollContainer.scrollLeft - home.offsetLeft) > 2) {
        scrollContainer.scrollLeft = home.offsetLeft;
      }
      requestAnimationFrame(centerAvatarForOffline);
      return;
    }
    updateActiveNavFromScroll();
    onHorizontalScrollForNav();
    requestAnimationFrame(updateGlobalAvatarPosition);
  }, { passive: true });

  window.addEventListener('resize', () => {
    updateActiveNavFromScroll();
    updateCapsuleFromScroll();
    setupBlogScrollHeights();
    if (isArticleReading) {
      applyReadingBoxMetrics();
      lockOuterScrollToBase();
      updateReadingTitleMarquee();
    }
    updateBlogScroll();
    updateGlobalAvatarPosition();
  });

  getNavLinks().forEach(bindNavLinkClick);

  function setupBlogScrollHeights() {
    if (!blogPanel || !blogContent || !blogWhiteBox) return;
    const vh = blogPanel.clientHeight || window.innerHeight;
    const mobile = isMobileBlogLayout();
    const r1 = mobile ? STAGE1_RATIO_MOBILE : STAGE1_RATIO;
    const r2 = mobile ? STAGE2_RATIO_MOBILE : STAGE2_RATIO;
    stage1Height = Math.round(vh * r1);
    stage2Height = Math.round(vh * r2);
    const gapPx = getBlogGapPx();
    const topMargin = typeof getBlogTopMargin === 'function' ? getBlogTopMargin() : (gapPx + (mobile ? 48 : 56));

    if (isArticleReading) {
      stage3Extra = 0;
      blogContent.style.height = (vh + stage1Height + stage2Height + 8) + 'px';
      blogWhiteBox.style.maxHeight = '';
      blogWhiteBox.style.overflowY = '';
      return;
    }
    const bottomPad = gapPx;
    const pinnedMax = Math.max(mobile ? 200 : 240, Math.round(vh - topMargin - bottomPad));
    blogWhiteBox.style.maxHeight = pinnedMax + 'px';
    blogWhiteBox.style.overflowY = 'auto';
    /* 移动端留足列表内滚区域：白盒可滚，外层在阶段结束后不再抢滚动 */
    stage3Extra = Math.round(vh * (mobile ? 0.06 : 0.35));
    blogContent.style.height = (vh + stage1Height + stage2Height + stage3Extra) + 'px';
    if (mobile) {
      blogWhiteBox.style.webkitOverflowScrolling = 'touch';
      blogWhiteBox.style.overscrollBehavior = 'contain';
    }
  }

  function getBlogGapPx() {
    return parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--blog-gap')) || 16;
  }

  function getBlogTopMargin() {
    const gapPx = getBlogGapPx();
    const navEl = document.getElementById('mainNav');
    if (!navEl || !blogPanel) return gapPx + 56;
    const navRect = navEl.getBoundingClientRect();
    const panelRect = blogPanel.getBoundingClientRect();
    return Math.max(gapPx, Math.round(navRect.bottom - panelRect.top) + gapPx);
  }

  let railGapLocked = false;

  function updateBlogScroll() {
    if (!blogPanel || !blogContent || !blogStageDuo) return;
    const scrollTop = blogPanel.scrollTop;
    const vh = blogPanel.clientHeight || window.innerHeight;
    const gapPx = getBlogGapPx();
    const topMargin = getBlogTopMargin();
    if (isArticleReading) {
      railGapLocked = true;
      const base = readingBaseScroll || ((stage1Height || 0) + (stage2Height || 0));
      if (Math.abs(scrollTop - base) > 0.5) {
        blogPanel.scrollTop = base;
        scrollTop = base;
      }
      applyReadingBoxMetrics();
      // 框体始终钉在 topMargin，不再参与 stage3 上移，避免上下硬裁切液态玻璃
      const desiredY = topMargin;
      blogStageDuo.style.top = (base + desiredY) + 'px';
      blogStageDuo.style.pointerEvents = 'none';
      blogStageDuo.style.gap = '0px';
      if (blogWhiteBox) {
        blogWhiteBox.style.pointerEvents = 'auto';
        blogWhiteBox.style.maxWidth = '100%';
      }
      if (blogThemeRail) {
        blogThemeRail.style.pointerEvents = 'none';
        blogThemeRail.style.opacity = '0';
        blogThemeRail.classList.remove('is-visible');
      }
      if (blogCover) {
        blogCover.style.opacity = '0';
        blogCover.style.visibility = 'hidden';
      }
      if (isBlogActive && nav) nav.classList.add('blog-mode');
      const articleEl = getArticleScrollEl();
      updateReadingDim(articleEl ? articleEl.scrollTop : 0);
      return;
    }

    if (blogCover) {
      blogCover.style.visibility = '';
    }

    let p1 = Math.min(1, Math.max(0, scrollTop / (stage1Height || 1)));
    let p2 = 0;
    let p3 = 0;
    if (scrollTop > stage1Height) {
      p2 = Math.min(1, (scrollTop - stage1Height) / (stage2Height || 1));
    }
    if (scrollTop > stage1Height + stage2Height) {
      p3 = Math.min(1, (scrollTop - stage1Height - stage2Height) / (stage3Extra || 1));
    }

    if (p2 >= 0.98) railGapLocked = true;
    if (p1 < 0.55) railGapLocked = false;

    const mobile = isMobileBlogLayout();
    const startY = vh + (mobile ? 16 : 28);
    const midY = vh * (mobile ? 0.42 : 0.48);
    let desiredY;
    if (p1 < 1) {
      desiredY = startY * (1 - p1) + midY * p1;
    } else if (p2 < 1) {
      desiredY = midY * (1 - p2) + topMargin * p2;
    } else {
      desiredY = topMargin;
    }

    blogStageDuo.style.top = (scrollTop + desiredY) + 'px';
    blogStageDuo.style.pointerEvents = 'none';
    if (blogWhiteBox) blogWhiteBox.style.pointerEvents = 'auto';

    const gap = gapPx;
    let t = easeOutCubic(p2);
    if (railGapLocked) t = 1;

    if (mobile) {
      if (blogWhiteBox) blogWhiteBox.style.maxWidth = '100%';
      if (blogThemeRail) {
        blogThemeRail.style.flex = '';
        blogThemeRail.style.width = '';
        blogThemeRail.style.maxWidth = '';
        blogThemeRail.style.marginRight = '';
        const inner = blogThemeRail.querySelector('.theme-rail-inner');
        if (inner) {
          inner.style.minHeight = '';
          inner.style.height = '';
        }
        // 第三阶段：主题栏从搜索栏上方平滑滑下
        const t3 = easeOutCubic(p3);
        const railH = Math.max(
          blogThemeRail.offsetHeight || 0,
          (inner && inner.offsetHeight) || 48,
          48
        );
        const slideDist = railH + 12;
        blogThemeRail.style.transform = `translate3d(0, ${(1 - t3) * -slideDist}px, 0)`;
        blogThemeRail.style.opacity = String(t3);
        blogThemeRail.style.marginBottom = `${(1 - t3) * -slideDist}px`;
        blogThemeRail.classList.toggle('is-visible', t3 > 0.08);
        blogThemeRail.style.pointerEvents = t3 > 0.45 ? 'auto' : 'none';
        blogStageDuo.style.gap = (t3 > 0.05 ? gap : 0) + 'px';
      } else {
        blogStageDuo.style.gap = gap + 'px';
      }
    } else if (blogThemeRail) {
      blogThemeRail.style.pointerEvents = (p2 > 0.2 || railGapLocked) ? 'auto' : 'none';
      const railW = window.matchMedia('(max-width: 720px)').matches ? 96 : 132;
      blogThemeRail.style.flex = `0 0 ${railW}px`;
      blogThemeRail.style.width = `${railW}px`;
      blogThemeRail.style.maxWidth = `${railW}px`;
      blogThemeRail.style.marginBottom = '';
      blogThemeRail.style.opacity = t <= 0 ? '0' : String(Math.min(1, t / 0.3));
      blogThemeRail.classList.toggle('is-visible', t > 0.12);

      if (t >= 1) {
        blogThemeRail.style.transform = 'translate3d(0,0,0)';
        blogThemeRail.style.marginRight = '0';
        blogStageDuo.style.gap = gap + 'px';
      } else {
        blogStageDuo.style.gap = '0px';
        const slide = (1 - t) * (railW + gap);
        blogThemeRail.style.transform = `translate3d(${-slide}px, 0, 0)`;
        blogThemeRail.style.marginRight = `${-railW + (railW + gap) * t}px`;
      }

      const inner = blogThemeRail.querySelector('.theme-rail-inner');
      if (inner && blogWhiteBox) {
        const targetH = Math.max(blogWhiteBox.offsetHeight || 0, Math.round(vh * 0.72));
        inner.style.minHeight = targetH + 'px';
        inner.style.height = targetH + 'px';
      }
      if (blogWhiteBox) {
        blogWhiteBox.style.maxWidth = window.matchMedia('(max-width: 720px)').matches ? '100%' : '1050px';
      }
    } else if (blogWhiteBox) {
      blogWhiteBox.style.maxWidth = window.matchMedia('(max-width: 720px)').matches ? '100%' : '1050px';
    }

    const coverMove = p1 * (vh * 0.45);
    if (blogCover) {
      blogCover.style.top = (scrollTop - coverMove) + 'px';
      blogCover.style.opacity = Math.max(0, 1 - p1 * 1.15);
    }

    if (isBlogActive) {
      if (p1 > 0.08) nav.classList.add('blog-mode');
      else {
        const wasBlogMode = nav.classList.contains('blog-mode');
        nav.classList.remove('blog-mode');
        if (wasBlogMode) scheduleCapsuleRefresh();
      }
    }
  }

  function easeOutCubic(x) {
    const t = Math.min(1, Math.max(0, x));
    return 1 - Math.pow(1 - t, 3);
  }

  let blogScrollHideTimer = null;
  let blogStageSnapTimer = null;
  let blogLastScrollTop = 0;
  let blogStageSnapLock = false;
  function snapBlogStagesIfMobile() {
    if (!blogPanel || isArticleReading || !isMobileBlogLayout()) return;
    if (blogStageSnapLock) return;
    const s1 = stage1Height || 0;
    const s2 = stage2Height || 0;
    const s3 = stage3Extra || 0;
    const stagesEnd = s1 + s2;          // 视差阶段结束
    const pinTop = s1 + s2 + s3;        // 列表钉住位置
    if (pinTop <= 8) return;
    const top = blogPanel.scrollTop;
    const dy = top - blogLastScrollTop;
    const goingDown = dy > 1.5;
    const goingUp = dy < -1.5;
    blogLastScrollTop = top;

    // 已过视差区：交给白盒列表内滚，外层不再吸附
    if (top >= stagesEnd - 1) return;

    // 下滑经过阶段中：自动滚到钉住位置（列表可继续在白盒内滑）
    if (goingDown && top > 8 && top < stagesEnd) {
      blogStageSnapLock = true;
      try {
        blogPanel.scrollTo({ top: pinTop, behavior: 'smooth' });
      } catch (_) {
        blogPanel.scrollTop = pinTop;
      }
      setTimeout(() => { blogStageSnapLock = false; blogLastScrollTop = blogPanel.scrollTop; }, 420);
      return;
    }

    // 上滑回封面：平滑回顶
    if (goingUp && top > 0 && top < stagesEnd) {
      blogStageSnapLock = true;
      try {
        blogPanel.scrollTo({ top: 0, behavior: 'smooth' });
      } catch (_) {
        blogPanel.scrollTop = 0;
      }
      setTimeout(() => { blogStageSnapLock = false; blogLastScrollTop = blogPanel.scrollTop; }, 420);
    }
  }
  if (blogPanel) {
    blogPanel.addEventListener('scroll', () => {
      // 阅读模式：外层滚动一律钉回基线，正文在框内滚
      if (isArticleReading) {
        lockOuterScrollToBase();
        requestAnimationFrame(() => {
          updateBlogScroll();
          updateGlobalAvatarPosition();
        });
        return;
      }

      blogPanel.classList.add('is-scrolling');
      if (blogScrollHideTimer) clearTimeout(blogScrollHideTimer);
      blogScrollHideTimer = setTimeout(() => {
        blogPanel.classList.remove('is-scrolling');
      }, 900);

      requestAnimationFrame(() => {
        updateBlogScroll();
        updateGlobalAvatarPosition();
      });

      if (isMobileBlogLayout()) {
        if (blogStageSnapTimer) clearTimeout(blogStageSnapTimer);
        blogStageSnapTimer = setTimeout(snapBlogStagesIfMobile, 90);
      }
    }, { passive: true });

    blogPanel.addEventListener('touchend', () => {
      if (isMobileBlogLayout() && !isArticleReading) {
        setTimeout(snapBlogStagesIfMobile, 40);
      }
    }, { passive: true });

    // 阅读模式：外层 overflow 已 hidden；框内原生滚动保留惯性
    blogPanel.addEventListener('wheel', (e) => {
      if (!isArticleReading) return;
      const absX = Math.abs(e.deltaX);
      const absY = Math.abs(e.deltaY);
      if (absX > absY) return;

      const articleEl = getArticleScrollEl();
      if (!articleEl) {
        e.preventDefault();
        lockOuterScrollToBase();
        return;
      }

      const top = articleEl.scrollTop;
      const max = Math.max(0, articleEl.scrollHeight - articleEl.clientHeight);
      const goingUp = e.deltaY < 0;
      const goingDown = e.deltaY > 0;
      const overArticle = !!(e.target && articleEl.contains(e.target));

      if (overArticle) {
        if ((goingUp && top <= 0.5) || (goingDown && top >= max - 0.5)) {
          e.preventDefault();
        }
        lockOuterScrollToBase();
        return;
      }

      if ((goingUp && top <= 0.5) || (goingDown && top >= max - 0.5)) {
        e.preventDefault();
        lockOuterScrollToBase();
        return;
      }
      articleEl.scrollTop = top + e.deltaY;
      e.preventDefault();
      lockOuterScrollToBase();
    }, { passive: false });

    blogPanel.addEventListener('touchmove', (e) => {
      if (!isArticleReading) return;
      const articleEl = getArticleScrollEl();
      if (!articleEl) return;
      if (e.target && articleEl.contains(e.target)) {
        lockOuterScrollToBase();
        return;
      }
      e.preventDefault();
      lockOuterScrollToBase();
    }, { passive: false });
  }

  function isDesktopFinePointer() {
    try {
      return !!(window.matchMedia && window.matchMedia('(hover: hover) and (pointer: fine)').matches);
    } catch (_) {
      return true;
    }
  }

  /** 电脑端禁止鼠标左右滑动切页；触屏仍可横滑；导航点击不受影响 */
  function setupDesktopPageSwipeLock() {
    if (!scrollContainer || scrollContainer.dataset.pageSwipeLock === '1') return;
    scrollContainer.dataset.pageSwipeLock = '1';

    const applyOverflow = () => {
      if (isDesktopFinePointer()) {
        scrollContainer.style.overflowX = 'hidden';
      } else {
        scrollContainer.style.overflowX = '';
      }
    };
    applyOverflow();
    try {
      const mq = window.matchMedia('(hover: hover) and (pointer: fine)');
      const onChange = () => applyOverflow();
      if (mq.addEventListener) mq.addEventListener('change', onChange);
      else if (mq.addListener) mq.addListener(onChange);
    } catch (_) {}

    scrollContainer.addEventListener('wheel', (e) => {
      if (!isDesktopFinePointer()) return;
      // 拦截横向滚轮 / Shift+滚轮 导致的切页
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY) || e.shiftKey) {
        e.preventDefault();
      }
    }, { passive: false });
  }
  setupDesktopPageSwipeLock();

  function setupBlogHorizontalPassthrough() {
    if (!blogPanel || !scrollContainer || blogPanel.dataset.hzPass === '1') return;
    blogPanel.dataset.hzPass = '1';

    blogPanel.addEventListener('wheel', (e) => {
      // 电脑端不通过横向滚轮切页
      if (isDesktopFinePointer()) return;
      const absX = Math.abs(e.deltaX);
      const absY = Math.abs(e.deltaY);
      if (absX > absY && absX > 1.5) {
        scrollContainer.scrollLeft += e.deltaX;
        e.preventDefault();
      }
    }, { passive: false });

    let touchStartX = 0;
    let touchStartY = 0;
    let axis = null;

    blogPanel.addEventListener('touchstart', (e) => {
      if (e.touches.length !== 1) return;
      touchStartX = e.touches[0].clientX;
      touchStartY = e.touches[0].clientY;
      axis = null;
    }, { passive: true });

    blogPanel.addEventListener('touchmove', (e) => {
      if (e.touches.length !== 1) return;
      // 触屏仍允许横滑切页
      const x = e.touches[0].clientX;
      const y = e.touches[0].clientY;
      const dx = x - touchStartX;
      const dy = y - touchStartY;

      if (!axis) {
        if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
        axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
      }

      if (axis === 'x') {
        scrollContainer.scrollLeft -= dx;
        touchStartX = x;
        touchStartY = y;
        e.preventDefault();
      }
    }, { passive: false });

    blogPanel.addEventListener('touchend', () => { axis = null; }, { passive: true });
    blogPanel.addEventListener('touchcancel', () => { axis = null; }, { passive: true });
  }
  setupBlogHorizontalPassthrough();

  function renderProfile() {
    const container = document.getElementById('profileContainer');
    const avatarContainer = document.getElementById('avatarContainer');
    const globalAvatar = document.getElementById('globalAvatar');
    const interests = profileData.interests || [];
    const fullAvatarUrl = 'https://free.picui.cn/free/2026/08/11/6a7a7c74e04ca.jpg';

    const grade = profileData.grade || '高中';
    const age = profileData.age ? `${profileData.age} 岁` : '';

    const statusText = (profileData.status && String(profileData.status).trim()) || '在线';
    let statusType = (profileData.statusType || 'online').toLowerCase();
    if (!['online', 'busy', 'away', 'dnd', 'invisible', 'offline', 'custom'].includes(statusType)) {
      statusType = 'custom';
    }

    const interestBtns = interests.map(tag => {
      const q = encodeURIComponent(tag);
      return `<a class="home-interest-btn" href="https://www.bing.com/search?q=${q}" target="_blank" rel="noopener noreferrer">${tag}</a>`;
    }).join('');

    container.innerHTML = `
      <p class="home-kicker">Personal Site</p>
      <div class="home-name-row">
        <h1 class="home-name">${profileData.name || 'MaxSui'}</h1>
        <button type="button" class="home-status${profileData.statusSummary ? ' has-summary' : ''}" id="homeStatusButton" title="点击查看状态简述">
          <span class="home-status-dot ${statusType}"></span>
          <span class="home-status-text">${statusText}</span>
        </button>
      </div>
      <p class="home-meta-row">${grade}${age ? ' · ' + age : ''}</p>
      <p class="home-bio">${profileData.bio || ''}</p>
      ${interestBtns ? `<div class="home-interests">${interestBtns}</div>` : ''}
    `;

    setupHomeStatusDetail();

    if (avatarContainer) {
      // 作品 / 联系按钮放在头像下方，中线与头像对齐
      avatarContainer.innerHTML =
        `<div class="avatar-circle-placeholder" id="homeAvatarPlaceholder"></div>` +
        `<div class="home-actions home-actions-under-avatar">` +
          `<a href="#works" class="nav-btn apple-primary-btn" style="text-decoration:none;"><i class="fas fa-code"></i> 作品</a>` +
          `<a href="#contact" class="nav-btn apple-secondary-btn" style="text-decoration:none;"><i class="fas fa-paper-plane"></i> 联系</a>` +
        `</div>`;
    }

    if (fullAvatarUrl) {
      globalAvatar.innerHTML = `<img src="${fullAvatarUrl}" alt="头像" style="width:100%; height:100%; object-fit:cover;">`;
    } else {
      globalAvatar.innerHTML = `<i class="fas fa-user-astronaut" style="font-size: 4rem; color: #ffffff;"></i>`;
    }

    const bindHomeHashLinks = (root) => {
      if (!root) return;
      root.querySelectorAll('a[href^="#"]').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          const target = document.getElementById(btn.getAttribute('href').substring(1));
          if (target) scrollContainer.scrollTo({ left: target.offsetLeft, behavior: 'smooth' });
        });
      });
    };
    bindHomeHashLinks(container);
    bindHomeHashLinks(avatarContainer);

    setupAvatarSecret();
    setupLogoTrailToggle();
  }

  function renderWorks() {
    const grid = document.getElementById('worksGrid');
    if (!grid) return;

    const works = [
      {
        name: "HomeworkViewer",
        description: "使用.NET 10.0 + WinForms实现的轻量级电子作业展板",
        github: "https://github.com/Suixiuliang/HomeworkViewer",
        legacyLink: "https://github.com/Suixiuliang/HomeworkViewer-Legacy",
        legacyText: "您的系统不支持.NET 10.0?<br>请前往兼容版HomeworkViewer-Legacy"
      },
      {
        name: "SimpleClock",
        description: "使用.NET 5.0 + WPF实现的简单的时钟，成功弥补了Win7系统下没有时钟应用而无法进行计时/闹钟等操作的遗憾",
        github: "https://github.com/Suixiuliang/SimpleClock"
      },
      {
        name: "Password_Gen",
        description: "使用.NET 10.0 + MAUI 实现，旨在加密你的密码，使用多重加密方法加密，再也不怕密码被撞库泄露了",
        github: "https://github.com/Suixiuliang/Password_gen"
      }
    ];

    let html = '';
    works.forEach(item => {
      html += `
        <div class="glass-card work-card">
          <div class="work-card-body">
            <h3>${item.name}</h3>
            <p>${item.description}</p>
          </div>
          <div class="work-card-footer">
            ${item.legacyLink ? `
              <a href="${item.legacyLink}" target="_blank" class="work-legacy-link">${item.legacyText}</a>
            ` : '<div></div>'}
            <a href="${item.github}" target="_blank" class="work-circle-btn" title="前往 GitHub 项目">
              <i class="fas fa-arrow-right"></i>
            </a>
          </div>
        </div>
      `;
    });

    grid.innerHTML = html;
  }

  // ---------- 路由懒加载：各面板数据首次进入时再拉取 ----------
  const routeLoadState = {
    profile: false,
    blog: false,
    works: false,
    contact: false,
    categories: false
  };
  const routeLoadPromises = {};

  async function loadProfileRoute(force = false) {
    if (routeLoadState.profile && !force) return profileData;
    if (routeLoadPromises.profile && !force) return routeLoadPromises.profile;
    routeLoadPromises.profile = (async () => {
      try {
        const profileRes = await fetch(`${API_BASE_URL}/profile`, { credentials: 'include' });
        if (profileRes.ok) {
          const data = await profileRes.json();
          const payload = data.profile || data;
          if (payload && typeof payload === 'object' && Object.keys(payload).length) {
            profileData = { ...defaultProfile, ...payload };
            profileData.status = String(
              payload.status_text ?? payload.status ?? profileData.status ?? '在线'
            );
            profileData.statusType = String(
              payload.status_type ?? payload.statusType ?? profileData.statusType ?? 'online'
            ).toLowerCase();
            profileData.statusSummary = String(
              payload.status_summary ?? payload.statusSummary ?? profileData.statusSummary ?? ''
            );
          }
        }
      } catch (e) {}
      routeLoadState.profile = true;
      renderProfile();
      setupStatusTimelineWheel();
      setupHomeNoVerticalScroll();
      loadStatusTimeline();
      return profileData;
    })();
    try {
      return await routeLoadPromises.profile;
    } finally {
      delete routeLoadPromises.profile;
    }
  }

  async function loadBlogRoute(force = false) {
    if (routeLoadState.blog && !force) return blogPosts;
    if (routeLoadPromises.blog && !force) return routeLoadPromises.blog;
    const listEl = document.getElementById('blogList');
    if (listEl && !routeLoadState.blog) {
      listEl.innerHTML = loadingPlaceholderHtml('加载文章...');
    }
    routeLoadPromises.blog = (async () => {
      try {
        const blogRes = await fetch(`${API_BASE_URL}/articles?limit=50`, { credentials: 'include' });
        if (blogRes.ok) {
          const data = await blogRes.json();
          const list = Array.isArray(data) ? data : (data.articles || data.posts || []);
          if (Array.isArray(list) && list.length) {
            blogPosts = list.map(post => {
              const raw = post.published_at || post.created_at || post.date || '';
              return {
                id: post.id ?? post.slug,
                title: post.title || '无标题',
                summary: post.excerpt || post.summary || '',
                content: post.content || '',
                rawDate: raw,
                date: formatDateUTC8(raw),
                readTime: post.reading_time ? `${post.reading_time} min` : (post.readTime || '3 min'),
                icon: post.icon || 'fa-pen',
                slug: post.slug,
                category: post.category || '',
                status: post.status || 'published'
              };
            });
          }
        }
      } catch (e) {
        try {
          const legacy = await fetch(`${API_BASE_URL}/blog`);
          if (legacy.ok) {
            const posts = await legacy.json();
            if (Array.isArray(posts)) blogPosts = posts;
          }
        } catch (_) {}
      }

      // 分类可与文章并行，但按路由懒加载
      if (!routeLoadState.categories || force) {
        try {
          const catRes = await fetch(`${API_BASE_URL}/categories`, { credentials: 'include' });
          if (catRes.ok) {
            const catData = await catRes.json();
            if (catData && Array.isArray(catData.categories)) {
              renderThemeRail(catData.categories);
              routeLoadState.categories = true;
            } else {
              renderThemeRail(blogPosts.map(p => p.category).filter(Boolean));
            }
          } else {
            renderThemeRail(blogPosts.map(p => p.category).filter(Boolean));
          }
        } catch (_) {
          renderThemeRail(blogPosts.map(p => p.category).filter(Boolean));
        }
      }

      routeLoadState.blog = true;
      filterAndRenderBlogs(blogFilterKeyword || '', blogFilterDate || null, false);
      requestAnimationFrame(() => {
        setupBlogScrollHeights();
        updateBlogScroll();
      });
      return blogPosts;
    })();
    try {
      return await routeLoadPromises.blog;
    } finally {
      delete routeLoadPromises.blog;
    }
  }

  async function loadWorksRoute(force = false) {
    if (routeLoadState.works && !force) return;
    if (routeLoadPromises.works && !force) return routeLoadPromises.works;
    routeLoadPromises.works = (async () => {
      // 作品目前是本地静态数据；仍按路由首次进入再渲染
      renderWorks();
      routeLoadState.works = true;
    })();
    try {
      await routeLoadPromises.works;
    } finally {
      delete routeLoadPromises.works;
    }
  }

  async function loadContactRoute(force = false) {
    if (routeLoadState.contact && !force) return;
    routeLoadState.contact = true;
    // 联系页为静态 DOM，无需额外请求；预留扩展点
  }

  async function ensureRouteLoaded(sectionId) {
    const id = String(sectionId || '');
    if (id === 'home') return loadProfileRoute();
    if (id === 'blog') return loadBlogRoute();
    if (id === 'works') return loadWorksRoute();
    if (id === 'contact') return loadContactRoute();
  }

  /** 兼容旧调用：仍可一次性刷新，但默认拆成路由懒加载 */
  async function fetchAllData() {
    await loadProfileRoute(true);
    await Promise.all([loadBlogRoute(true), loadWorksRoute(true)]);
  }

  function onHorizontalScrollForNav() {
    const now = performance.now();
    const left = scrollContainer.scrollLeft;
    const dt = Math.max(8, now - lastScrollTime);
    const velocity = Math.abs(left - lastScrollLeft) / dt * 1000;
    lastScrollLeft = left;
    lastScrollTime = now;

    updateCapsuleFromScroll();

    if (velocity > 40) {
      bumpCapsuleScaleFromVelocity(velocity);
    }
  }

  function formatBytesMB(bytes) {
    const n = Math.max(0, Number(bytes) || 0);
    return (n / (1024 * 1024)).toFixed(2) + 'MB';
  }

  function loadImageWithProgress(url) {
    return new Promise(async (resolve) => {
      let size = 0;
      try {
        const res = await fetch(url, { mode: 'cors', cache: 'force-cache', credentials: 'omit' });
        if (res.ok) {
          const cl = Number(res.headers.get('content-length') || 0);
          const buf = await res.arrayBuffer();
          size = buf.byteLength || cl || 0;
          // 触发解码缓存
          const blob = new Blob([buf]);
          const obj = URL.createObjectURL(blob);
          const img = new Image();
          img.onload = () => { try { URL.revokeObjectURL(obj); } catch (_) {} resolve({ ok: true, url, size }); };
          img.onerror = () => { try { URL.revokeObjectURL(obj); } catch (_) {} resolve({ ok: true, url, size }); };
          img.src = obj;
          return;
        }
      } catch (_) {}
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.decoding = 'async';
      img.onload = () => resolve({ ok: true, url, size: size || 0 });
      img.onerror = () => resolve({ ok: false, url, size: 0 });
      img.src = url;
    });
  }

  function setBootProgressBytes(loaded, total) {
    const bar = document.getElementById('bootProgressBar');
    const label = document.getElementById('bootProgressLabel');
    const track = document.getElementById('bootProgressTrack');
    const t = Math.max(total, 1);
    const l = Math.max(0, Math.min(loaded, t));
    const p = Math.max(0, Math.min(100, (l / t) * 100));
    if (bar) bar.style.width = p + '%';
    if (label) label.textContent = formatBytesMB(l) + '/' + formatBytesMB(t);
    if (track) track.setAttribute('aria-valuenow', String(Math.round(p)));
  }

  /** 等待 Font Awesome 字体就绪（门禁必过项） */
  async function waitForFontAwesome(timeoutMs) {
    const ms = timeoutMs || 15000;
    const deadline = Date.now() + ms;
    const families = [
      '900 16px "Font Awesome 6 Free"',
      '400 16px "Font Awesome 6 Free"',
      '400 16px "Font Awesome 6 Brands"',
      // 兼容部分 CDN / 旧命名
      '900 16px FontAwesome',
      '400 16px FontAwesome'
    ];
    try {
      if (document.fonts && document.fonts.load) {
        await Promise.race([
          Promise.all(families.map((spec) => document.fonts.load(spec).catch(() => null))),
          new Promise((r) => setTimeout(r, ms))
        ]);
        if (document.fonts.ready) {
          const remain = Math.max(0, deadline - Date.now());
          await Promise.race([
            document.fonts.ready,
            new Promise((r) => setTimeout(r, remain || 1))
          ]);
        }
      } else {
        await new Promise((r) => setTimeout(r, 800));
      }
    } catch (_) {}
    // 再确认至少有一枚 FA 字形可用（抽检 solid 常见图标）
    try {
      if (document.fonts && document.fonts.check) {
        const ok =
          document.fonts.check('900 16px "Font Awesome 6 Free"') ||
          document.fonts.check('900 16px FontAwesome');
        if (!ok) {
          // 再给一次短等待
          await new Promise((r) => setTimeout(r, 600));
        }
      }
    } catch (_) {}
  }

  async function runBootLoader() {
    const loader = document.getElementById('bootLoader');
    setBootProgressBytes(0, 1);

    if (scrollContainer) scrollContainer.style.overflow = 'hidden';

    const urls = CRITICAL_IMAGE_URLS.slice();
    const healthPromise = resolveApiBase();
    // 字体与图片并行启动；进入站点前两者都要完成
    const fontPromise = waitForFontAwesome(15000);

    let totalBytes = 0;
    let loadedBytes = 0;
    const sizes = new Array(urls.length).fill(0);

    let finishedCount = 0;
    await Promise.all(urls.map(async (url, idx) => {
      const result = await loadImageWithProgress(url);
      sizes[idx] = Math.max(0, result.size || 0);
      finishedCount += 1;
      loadedBytes = sizes.reduce((a, b) => a + b, 0);
      totalBytes = sizes.reduce((a, b) => a + b, 0);
      if (totalBytes > 0) {
        const known = sizes.filter((s) => s > 0);
        const avg = known.length ? (known.reduce((a, b) => a + b, 0) / known.length) : 0;
        const pending = urls.length - known.length;
        const estTotal = totalBytes + avg * pending;
        // 预留约 8% 给字体加载展示
        setBootProgressBytes(loadedBytes, Math.max(estTotal / 0.92, loadedBytes, 1));
      } else {
        const unit = 512 * 1024;
        setBootProgressBytes(finishedCount * unit, urls.length * unit / 0.92);
      }
    }));

    // 图片完成后再等到 Font Awesome
    await fontPromise;
    loadedBytes = sizes.reduce((a, b) => a + b, 0);
    if (loadedBytes > 0) setBootProgressBytes(loadedBytes, loadedBytes);
    else {
      const unit = 512 * 1024;
      setBootProgressBytes(urls.length * unit, urls.length * unit);
    }

    const apiOk = await healthPromise;
    await new Promise(r => setTimeout(r, 160));

    if (loader) {
      loader.classList.add('is-done');
      loader.setAttribute('aria-busy', 'false');
      setTimeout(() => {
        if (loader.parentNode) loader.parentNode.removeChild(loader);
      }, 500);
    }
    if (scrollContainer) scrollContainer.style.overflow = '';
    try { requestAnimationFrame(() => tryHideMobileBrowserChrome()); } catch (_) {}
    return { blocked: false, apiOk: !!apiOk };
  }

  /** 移动端：按 visualViewport 避开顶/底浏览器栏（Safari/Edge 底栏也会挡） */
  function tryHideMobileBrowserChrome() {
    try {
      if (!(document.documentElement.classList.contains('is-phone')
          || (window.matchMedia && window.matchMedia('(max-width: 480px)').matches)
          || (window.matchMedia && window.matchMedia('(pointer: coarse)').matches && window.matchMedia('(max-width: 900px)').matches))) {
        return;
      }
    } catch (_) { return; }

    const applyMobileViewport = () => {
      try {
        const vv = window.visualViewport;
        const layoutH = window.innerHeight || document.documentElement.clientHeight || 0;
        const visualH = vv ? vv.height : layoutH;
        const offsetTop = vv ? (vv.offsetTop || 0) : 0;
        // 底栏占用：布局视口底部 − 可视区域底边
        // 顶栏占用：offsetTop（Safari 顶栏展开时会下推 visual viewport）
        const chromeTop = Math.max(0, offsetTop);
        const chromeBottom = Math.max(0, layoutH - offsetTop - visualH);
        // 再叠一层系统安全区（Home 条等）
        let safeBottom = 0;
        let safeTop = 0;
        try {
          const cs = getComputedStyle(document.documentElement);
          // 若尚未写入，用 env 探测：放一个探针
          safeBottom = 0;
          safeTop = 0;
        } catch (_) {}

        const h = Math.max(1, Math.round(visualH));
        const topPx = Math.round(chromeTop);
        const bottomPx = Math.round(chromeBottom);

        document.documentElement.style.setProperty('--app-vh', h + 'px');
        document.documentElement.style.setProperty('--app-chrome-top', topPx + 'px');
        document.documentElement.style.setProperty('--app-chrome-bottom', bottomPx + 'px');
        document.documentElement.style.setProperty('--app-vv-offset-top', topPx + 'px');
        document.documentElement.classList.toggle('has-bottom-browser-chrome', bottomPx > 8);
        document.documentElement.classList.toggle('has-top-browser-chrome', topPx > 8);

        // 主壳高度 = 可视高度，避免内容画进底栏后面
        if (scrollContainer) {
          scrollContainer.style.height = h + 'px';
          scrollContainer.style.maxHeight = h + 'px';
        }
        const hsc = document.querySelector('.horizontal-scroll-container');
        if (hsc) {
          hsc.style.height = h + 'px';
          hsc.style.maxHeight = h + 'px';
        }
        // 固定导航：底栏很大时不要再被顶栏公式挤歪；顶栏展开时整体下移
        const nav = document.getElementById('mainNav');
        if (nav) {
          if (topPx > 0) {
            nav.style.top = 'calc(' + topPx + 'px + max(8px, env(safe-area-inset-top, 0px)))';
          } else {
            nav.style.top = '';
          }
        }
      } catch (_) {}
    };

    applyMobileViewport();

    // 轻推滚动：部分浏览器会收起工具栏（不保证，尤其是底栏常驻的 Safari/Edge）
    try {
      const se = document.scrollingElement || document.documentElement;
      se.scrollTop = 1;
      requestAnimationFrame(() => {
        se.scrollTop = 0;
        applyMobileViewport();
        setTimeout(() => {
          try {
            se.scrollTop = 1;
            requestAnimationFrame(() => { se.scrollTop = 0; applyMobileViewport(); });
          } catch (_) {}
        }, 150);
      });
    } catch (_) {}

    if (window.visualViewport && !window.__maxsuiVvBound) {
      window.__maxsuiVvBound = true;
      const onVv = () => applyMobileViewport();
      window.visualViewport.addEventListener('resize', onVv);
      window.visualViewport.addEventListener('scroll', onVv);
      window.addEventListener('resize', onVv, { passive: true });
    }
    if (!window.__maxsuiOrientBound) {
      window.__maxsuiOrientBound = true;
      window.addEventListener('orientationchange', () => {
        setTimeout(applyMobileViewport, 180);
        setTimeout(applyMobileViewport, 400);
      }, { passive: true });
    }
  }

  // ============================================================
  //  自定义小圆光标 + 空闲划动白色曳尾 + 按下连续点击特效
  //  （修复选中文字拖拽后“粘住”）
  // ============================================================
  function getClickColor(target, isRight) {
    const forbiddenZone = document.getElementById('forbiddenZone');
    if (forbiddenZone && target && forbiddenZone.contains(target)) {
      return { color: COLORS.FORBIDDEN, name: '淡红' };
    }
    return isRight ? { color: COLORS.RIGHT, name: '淡蓝' } : { color: COLORS.LEFT, name: '淡黄' };
  }

  function triggerAnimation(clientX, clientY, isRight) {
    const target = document.elementFromPoint(clientX, clientY);
    if (!target) return;
    const { color, name } = getClickColor(target, isRight);
    triggerClickEffect(clientX, clientY, color, name);
  }

  let isPointerDown = false;
  let pointerTimer = null;
  let lastPointerX = 0;
  let lastPointerY = 0;
  let pointerIsRight = false;
  let pointerDownTarget = null;
  let suppressEffectsUntil = 0;

  const coarsePointer = window.matchMedia('(hover: none), (pointer: coarse)').matches;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /** 手机（非平板）：窄屏 + 粗指针；iPad/平板走桌面布局 */
  function isPhoneDevice() {
    try {
      const ua = navigator.userAgent || '';
      const isIPad = /iPad/i.test(ua)
        || (navigator.platform === 'MacIntel' && (navigator.maxTouchPoints || 0) > 1);
      const isTablet = isIPad || /Tablet|Android(?!.*Mobile)/i.test(ua);
      if (isTablet) return false;
      const narrow = window.matchMedia('(max-width: 480px)').matches
        || Math.min(window.innerWidth, window.innerHeight) <= 480;
      return !!(coarsePointer && narrow);
    } catch (_) {
      return !!(coarsePointer && window.innerWidth <= 480);
    }
  }

  function applyPhoneChrome() {
    const phone = isPhoneDevice();
    document.documentElement.classList.toggle('is-phone', phone);
    document.body.classList.toggle('is-phone', phone);
    if (phone && screen.orientation && typeof screen.orientation.lock === 'function') {
      screen.orientation.lock('portrait').catch(() => {});
    }
  }
  applyPhoneChrome();
  window.addEventListener('resize', applyPhoneChrome, { passive: true });
  window.addEventListener('orientationchange', applyPhoneChrome, { passive: true });

  let customCursor = null;
  if (!coarsePointer) {
    customCursor = document.createElement('div');
    customCursor.className = 'custom-cursor';
    customCursor.setAttribute('aria-hidden', 'true');
    document.body.appendChild(customCursor);
  }

  function isTextEditingTarget(el) {
    if (!el || el === document || el === window) return false;
    const tag = (el.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select') return true;
    if (el.isContentEditable) return true;
    try {
      if (el.closest && el.closest('input, textarea, select, [contenteditable="true"]')) return true;
    } catch (_) {}
    return false;
  }

  function shouldSkipClickEffects(target) {
    if (!target) return false;
    if (isTextEditingTarget(target)) return true;
    try {
      const sel = window.getSelection && window.getSelection();
      if (sel && !sel.isCollapsed && String(sel.toString() || '').length > 0) {
        return true;
      }
    } catch (_) {}
    return false;
  }

  window.__maxsuiMoveCustomCursor = function(x,y){ try { moveCustomCursor(x,y); } catch(_){} };
  function moveCustomCursor(x, y) {
    if (!customCursor) return;
    customCursor.style.transform = `translate3d(${x}px, ${y}px, 0)`;
  }

  function setCursorVisible(v) {
    if (!customCursor) return;
    customCursor.classList.toggle('is-visible', !!v);
  }

  function setCursorDown(v, isRight) {
    if (!customCursor) return;
    customCursor.classList.toggle('is-down', !!v);
    customCursor.classList.toggle('is-right', !!isRight);
  }

  function setCursorTextMode(v) {
    if (!customCursor) return;
    customCursor.classList.toggle('is-hidden-for-text', !!v);
  }

  // ---------- 曳尾：贝塞尔平滑；快画圆加密，避免多边形 ----------
  const TRAIL_LIFE_MS = 240;
  const TRAIL_MAX_RAW = 64;
  const TRAIL_MAX_LEN = 220;
  const TRAIL_MIN_DIST = 2;
  const TRAIL_HALF_HEAD = 7;
  const TRAIL_HALF_TAIL = 2.0;
  const TRAIL_SPEED_MIN = 0.12;
  const TRAIL_SAMPLE_BASE = 6;     // 直线段最少细分
  const TRAIL_SAMPLE_MAX = 14;     // 急转/长段最多细分
  let trailCanvas = null;
  let trailCtx = null;
  let trailPoints = []; // {x,y,t}
  let trailAnimId = null;
  let trailLastX = 0;
  let trailLastY = 0;
  let trailPrevDx = 0;
  let trailPrevDy = 0;
  let trailHasLast = false;
  let trailDpr = 1;
  let trailLastMoveTs = 0;
  const TRAIL_BUF = 320;
  let trailLeftX = new Float32Array(TRAIL_BUF);
  let trailLeftY = new Float32Array(TRAIL_BUF);
  let trailRightX = new Float32Array(TRAIL_BUF);
  let trailRightY = new Float32Array(TRAIL_BUF);

  function ensureTrailCanvas() {
    if (trailCanvas || coarsePointer || reduceMotion) return trailCanvas;
    trailCanvas = document.createElement('canvas');
    trailCanvas.className = 'cursor-trail-canvas';
    trailCanvas.setAttribute('aria-hidden', 'true');
    document.body.appendChild(trailCanvas);
    trailCtx = trailCanvas.getContext('2d', { alpha: true, desynchronized: true });
    resizeTrailCanvas();
    window.addEventListener('resize', resizeTrailCanvas, { passive: true });
    return trailCanvas;
  }

  function resizeTrailCanvas() {
    if (!trailCanvas || !trailCtx) return;
    trailDpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const w = window.innerWidth;
    const h = window.innerHeight;
    trailCanvas.width = Math.floor(w * trailDpr);
    trailCanvas.height = Math.floor(h * trailDpr);
    trailCanvas.style.width = w + 'px';
    trailCanvas.style.height = h + 'px';
    trailCtx.setTransform(trailDpr, 0, 0, trailDpr, 0, 0);
  }

  function trimTrailByLength() {
    if (trailPoints.length < 2) return;
    let len = 0;
    for (let i = trailPoints.length - 1; i > 0; i--) {
      len += Math.hypot(
        trailPoints[i].x - trailPoints[i - 1].x,
        trailPoints[i].y - trailPoints[i - 1].y
      );
      if (len > TRAIL_MAX_LEN) {
        trailPoints.splice(0, i);
        break;
      }
    }
    while (trailPoints.length > TRAIL_MAX_RAW) trailPoints.shift();
  }

  // 默认关闭拖尾；连续点 Logo 7 次可开关
  let trailEffectEnabled = false;

  function setTrailEffectEnabled(on) {
    trailEffectEnabled = !!on;
    if (!trailEffectEnabled) {
      try { clearAllTrailDots(); } catch (_) {}
      trailPoints = [];
      trailHasLast = false;
      if (trailCanvas && trailCtx) {
        try { trailCtx.clearRect(0, 0, trailCanvas.width, trailCanvas.height); } catch (_) {}
      }
    }
  }

  function pushTrailPoint(x, y) {
    // 只有「小白点跟真实鼠标走」时才画尾巴；磁吸吸附时禁止
    if (document.body.classList.contains('is-seek-magnet')) return;
    if (!trailEffectEnabled || reduceMotion || coarsePointer) return;
    const now = performance.now();

    if (!trailHasLast) {
      trailLastX = x;
      trailLastY = y;
      trailPrevDx = 0;
      trailPrevDy = 0;
      trailLastMoveTs = now;
      trailHasLast = true;
      return;
    }

    const dx = x - trailLastX;
    const dy = y - trailLastY;
    const dist = Math.hypot(dx, dy);
    const dt = Math.max(4, now - trailLastMoveTs);
    const speed = dist / dt;

    const prevX = trailLastX;
    const prevY = trailLastY;
    trailLastX = x;
    trailLastY = y;
    trailLastMoveTs = now;

    if (speed < TRAIL_SPEED_MIN || dist < TRAIL_MIN_DIST) {
      if (trailPoints.length && !trailAnimId) {
        trailAnimId = requestAnimationFrame(drawTrailFrame);
      }
      return;
    }

    ensureTrailCanvas();
    if (!trailCtx) return;
    let turnBoost = 0;
    const plen = Math.hypot(trailPrevDx, trailPrevDy);
    if (plen > 0.1 && dist > 0.1) {
      const dot = (trailPrevDx * dx + trailPrevDy * dy) / (plen * dist);
      const ang = Math.acos(Math.max(-1, Math.min(1, dot))); // 0..π
      turnBoost = ang > 0.35 ? Math.ceil(ang * 4) : 0; // 转得越急补越多
    }
    trailPrevDx = dx;
    trailPrevDy = dy;
    const steps = Math.min(16, Math.max(1, Math.ceil(dist / 6) + turnBoost));
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      trailPoints.push({
        x: prevX + dx * t,
        y: prevY + dy * t,
        t: now
      });
    }

    trimTrailByLength();
    if (!trailAnimId) trailAnimId = requestAnimationFrame(drawTrailFrame);
  }
  function sampleTrailCenterline(pts) {
    const out = [];
    const n = pts.length;
    if (n === 0) return out;
    if (n === 1) {
      out.push({ x: pts[0].x, y: pts[0].y, t: pts[0].t });
      return out;
    }
    for (let i = 0; i < n - 1; i++) {
      const p0 = pts[i === 0 ? i : i - 1];
      const p1 = pts[i];
      const p2 = pts[i + 1];
      const p3 = pts[i + 2 < n ? i + 2 : i + 1];

      const c1x = p1.x + (p2.x - p0.x) / 6;
      const c1y = p1.y + (p2.y - p0.y) / 6;
      const c2x = p2.x - (p3.x - p1.x) / 6;
      const c2y = p2.y - (p3.y - p1.y) / 6;

      const segLen = Math.hypot(p2.x - p1.x, p2.y - p1.y);
      const midX = (p1.x + p2.x) * 0.5;
      const midY = (p1.y + p2.y) * 0.5;
      const curveX = (c1x + c2x) * 0.5;
      const curveY = (c1y + c2y) * 0.5;
      const bulge = Math.hypot(curveX - midX, curveY - midY);
      let segs = TRAIL_SAMPLE_BASE + Math.ceil(segLen / 10) + Math.ceil(bulge / 3);
      segs = Math.max(TRAIL_SAMPLE_BASE, Math.min(TRAIL_SAMPLE_MAX, segs));

      for (let s = 0; s < segs; s++) {
        const t = s / segs;
        const u = 1 - t;
        const x = u * u * u * p1.x + 3 * u * u * t * c1x + 3 * u * t * t * c2x + t * t * t * p2.x;
        const y = u * u * u * p1.y + 3 * u * u * t * c1y + 3 * u * t * t * c2y + t * t * t * p2.y;
        const tt = p1.t + (p2.t - p1.t) * t;
        out.push({ x, y, t: tt });
      }
    }
    const last = pts[n - 1];
    out.push({ x: last.x, y: last.y, t: last.t });
    return out;
  }

  function drawTrailFrame(now) {
    if (!trailCtx || !trailCanvas) {
      trailAnimId = null;
      return;
    }

    const cutoff = now - TRAIL_LIFE_MS;
    while (trailPoints.length && trailPoints[0].t < cutoff) trailPoints.shift();

    const w = window.innerWidth;
    const h = window.innerHeight;
    trailCtx.clearRect(0, 0, w, h);

    if (trailPoints.length < 2) {
      trailAnimId = trailPoints.length === 0 ? null : requestAnimationFrame(drawTrailFrame);
      return;
    }
    const smooth = sampleTrailCenterline(trailPoints);
    const n = Math.min(smooth.length, TRAIL_BUF - 1);
    if (n < 2) {
      trailAnimId = requestAnimationFrame(drawTrailFrame);
      return;
    }
    const distFromHead = new Float32Array(n);
    distFromHead[n - 1] = 0;
    for (let i = n - 2; i >= 0; i--) {
      distFromHead[i] = distFromHead[i + 1] + Math.hypot(
        smooth[i + 1].x - smooth[i].x,
        smooth[i + 1].y - smooth[i].y
      );
    }
    const span = Math.max(distFromHead[0], 1);
    let prevNx = 0;
    let prevNy = 1;
    for (let i = 0; i < n; i++) {
      const p = smooth[i];
      let tx, ty;
      if (i === 0) {
        tx = smooth[1].x - p.x;
        ty = smooth[1].y - p.y;
      } else if (i === n - 1) {
        tx = p.x - smooth[i - 1].x;
        ty = p.y - smooth[i - 1].y;
      } else {
        tx = smooth[i + 1].x - smooth[i - 1].x;
        ty = smooth[i + 1].y - smooth[i - 1].y;
      }
      let inv = 1 / (Math.hypot(tx, ty) || 1);
      let nx = -ty * inv;
      let ny = tx * inv;
      if (i > 0 && nx * prevNx + ny * prevNy < 0) {
        nx = -nx;
        ny = -ny;
      }
      if (i > 0) {
        nx = nx * 0.65 + prevNx * 0.35;
        ny = ny * 0.65 + prevNy * 0.35;
        inv = 1 / (Math.hypot(nx, ny) || 1);
        nx *= inv;
        ny *= inv;
      }
      prevNx = nx;
      prevNy = ny;

      const along = 1 - Math.min(1, distFromHead[i] / span);
      const taper = along * along * (3 - 2 * along);
      const life = Math.max(0, 1 - (now - p.t) / TRAIL_LIFE_MS);
      const hw = (TRAIL_HALF_TAIL + (TRAIL_HALF_HEAD - TRAIL_HALF_TAIL) * taper) * (0.8 + 0.2 * life);
      trailLeftX[i] = p.x + nx * hw;
      trailLeftY[i] = p.y + ny * hw;
      trailRightX[i] = p.x - nx * hw;
      trailRightY[i] = p.y - ny * hw;
    }

    const headLife = Math.max(0, 1 - (now - smooth[n - 1].t) / TRAIL_LIFE_MS);
    const alpha = 0.22 + headLife * 0.32;

    trailCtx.beginPath();
    trailCtx.moveTo(trailLeftX[0], trailLeftY[0]);
    for (let i = 1; i < n; i++) trailCtx.lineTo(trailLeftX[i], trailLeftY[i]);
    for (let i = n - 1; i >= 0; i--) trailCtx.lineTo(trailRightX[i], trailRightY[i]);
    trailCtx.closePath();
    trailCtx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
    trailCtx.fill();

    trailAnimId = requestAnimationFrame(drawTrailFrame);
  }

  function clearAllTrailDots() {
    trailPoints = [];
    trailHasLast = false;
    if (trailCtx && trailCanvas) {
      trailCtx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    }
    if (trailAnimId) {
      cancelAnimationFrame(trailAnimId);
      trailAnimId = null;
    }
  }

  function stopPointerTimer() {
    if (pointerTimer) {
      clearInterval(pointerTimer);
      pointerTimer = null;
    }
    isPointerDown = false;
    pointerDownTarget = null;
    setCursorDown(false, false);
  }

  function forceReleasePointer() {
    stopPointerTimer();
    suppressEffectsUntil = performance.now() + 120;
  }

  function startPointerEffects(x, y, isRight, target) {
    if (performance.now() < suppressEffectsUntil) return;

    pointerIsRight = isRight;
    lastPointerX = x;
    lastPointerY = y;
    pointerDownTarget = target || null;
    isPointerDown = true;
    setCursorDown(true, isRight);
    if (shouldSkipClickEffects(target)) {
      return;
    }

    triggerAnimation(x, y, isRight);
    if (pointerTimer) clearInterval(pointerTimer);
    // 触屏拖动也持续刷粒子
    pointerTimer = setInterval(() => {
      if (!isPointerDown) {
        stopPointerTimer();
        return;
      }
      if (shouldSkipClickEffects(pointerDownTarget)) {
        if (pointerTimer) {
          clearInterval(pointerTimer);
          pointerTimer = null;
        }
        return;
      }
      triggerAnimation(lastPointerX, lastPointerY, pointerIsRight);
    }, 160);
  }

  document.addEventListener('mousemove', function(e) {
    lastPointerX = e.clientX;
    lastPointerY = e.clientY;
    const magnetOn = document.body.classList.contains('is-seek-magnet');
    // 磁吸时：小白球跟进度；不跟真实鼠标，也不画拖尾
    if (!magnetOn) {
      moveCustomCursor(e.clientX, e.clientY);
      setCursorVisible(true);
      setCursorTextMode(isTextEditingTarget(e.target));
      pushTrailPoint(e.clientX, e.clientY);
    } else {
      // 磁吸中仍显示小白球（由 follow 循环定位），但不渲染尾巴
      setCursorVisible(true);
    }
  }, { passive: true });

  document.addEventListener('mouseenter', function(e) {
    moveCustomCursor(e.clientX, e.clientY);
    setCursorVisible(true);
  }, { passive: true });

  document.addEventListener('mouseleave', function() {
    setCursorVisible(false);
    forceReleasePointer();
    trailHasLast = false;
  }, { passive: true });

  document.addEventListener('mousedown', function(e) {
    if (e.button !== 0 && e.button !== 2) return;
    startPointerEffects(e.clientX, e.clientY, e.button === 2, e.target);
    if (e.button === 2) e.preventDefault();
  }, true);

  window.addEventListener('mouseup', function() {
    if (isPointerDown) forceReleasePointer();
  }, true);

  window.addEventListener('pointerup', function() {
    if (isPointerDown) forceReleasePointer();
  }, true);

  window.addEventListener('pointercancel', function() {
    forceReleasePointer();
  }, true);

  window.addEventListener('blur', function() {
    forceReleasePointer();
  });

  document.addEventListener('visibilitychange', function() {
    if (document.hidden) forceReleasePointer();
  });

  window.addEventListener('dragend', function() {
    forceReleasePointer();
  }, true);

  window.addEventListener('drop', function() {
    forceReleasePointer();
  }, true);

  document.addEventListener('dragstart', function() {
    if (pointerTimer) {
      clearInterval(pointerTimer);
      pointerTimer = null;
    }
  }, true);

  document.addEventListener('selectionchange', function() {
    if (!isPointerDown) return;
    try {
      const sel = window.getSelection && window.getSelection();
      if (sel && !sel.isCollapsed && String(sel.toString() || '').length > 0) {
        if (pointerTimer) {
          clearInterval(pointerTimer);
          pointerTimer = null;
        }
      }
    } catch (_) {}
  });

  // 触屏：保留点击/拖动粒子；无自定义光标；长按弹出菜单
  let longPressTimer = null;
  let longPressOrigin = null;
  let longPressMoved = false;
  let longPressFired = false;
  const LONG_PRESS_MS = 480;
  const LONG_PRESS_MOVE_MAX = 12;

  function clearLongPress() {
    if (longPressTimer) {
      clearTimeout(longPressTimer);
      longPressTimer = null;
    }
  }

  document.addEventListener('touchstart', function(e) {
    const touch = e.touches[0];
    if (!touch) return;
    lastPointerX = touch.clientX;
    lastPointerY = touch.clientY;
    longPressMoved = false;
    longPressFired = false;
    longPressOrigin = { x: touch.clientX, y: touch.clientY, target: e.target };
    clearLongPress();
    // 点击粒子 / 拖动连续粒子
    startPointerEffects(touch.clientX, touch.clientY, false, e.target);
    if (isTextEditingTarget(e.target)) return;
    longPressTimer = setTimeout(() => {
      longPressTimer = null;
      if (longPressMoved || !longPressOrigin) return;
      longPressFired = true;
      // 长按弹出菜单时停掉连续粒子，避免挡操作
      forceReleasePointer();
      showContextMenu(longPressOrigin.x, longPressOrigin.y, longPressOrigin.target);
      try { if (navigator.vibrate) navigator.vibrate(12); } catch (_) {}
    }, LONG_PRESS_MS);
  }, { passive: true });

  document.addEventListener('touchmove', function(e) {
    const touch = e.touches[0];
    if (!touch) return;
    lastPointerX = touch.clientX;
    lastPointerY = touch.clientY;
    if (longPressOrigin) {
      const dx = touch.clientX - longPressOrigin.x;
      const dy = touch.clientY - longPressOrigin.y;
      if (Math.hypot(dx, dy) > LONG_PRESS_MOVE_MAX) {
        longPressMoved = true;
        clearLongPress();
      }
    }
  }, { passive: true });

  window.addEventListener('touchend', function(e) {
    clearLongPress();
    if (isPointerDown) forceReleasePointer();
    if (longPressFired) {
      suppressEffectsUntil = performance.now() + 400;
      longPressFired = false;
      if (e && e.cancelable) {
        try { e.preventDefault(); } catch (_) {}
      }
    }
    longPressOrigin = null;
  }, true);

  window.addEventListener('touchcancel', function() {
    clearLongPress();
    longPressOrigin = null;
    longPressFired = false;
    forceReleasePointer();
  }, true);

  document.addEventListener('click', function(e) {
    // 触屏已由 touchstart 触发粒子，避免重复
    if (coarsePointer) return;
    if (e.button === 0 && !isPointerDown && performance.now() >= suppressEffectsUntil) {
      if (!shouldSkipClickEffects(e.target)) {
        triggerAnimation(e.clientX, e.clientY, false);
      }
    }
  }, true);

  // ============================================================
  //  自定义右键菜单
  // ============================================================
  let ctxMenuEl = null;
  let ctxMenuTarget = null;

  function ensureContextMenu() {
    if (ctxMenuEl) return ctxMenuEl;
    ctxMenuEl = document.createElement('div');
    ctxMenuEl.className = 'site-context-menu';
    ctxMenuEl.setAttribute('role', 'menu');
    ctxMenuEl.hidden = true;
    document.body.appendChild(ctxMenuEl);
    ctxMenuEl.addEventListener('click', (e) => e.stopPropagation());
    return ctxMenuEl;
  }

  function hideContextMenu() {
    if (!ctxMenuEl) return;
    ctxMenuEl.hidden = true;
    ctxMenuEl.classList.remove('is-open');
    ctxMenuTarget = null;
  }

  function getSelectedText() {
    try {
      const sel = window.getSelection && window.getSelection();
      return sel && !sel.isCollapsed ? String(sel.toString() || '') : '';
    } catch (_) {
      return '';
    }
  }

  async function copyTextToClipboard(text) {
    const t = String(text || '');
    if (!t) return false;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(t);
        return true;
      }
    } catch (_) {}
    try {
      const ta = document.createElement('textarea');
      ta.value = t;
      ta.setAttribute('readonly', '');
      ta.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return ok;
    } catch (_) {
      return false;
    }
  }

  function scrollPageToTop() {
    if (isArticleReading) {
      const view = typeof getArticleScrollEl === 'function' ? getArticleScrollEl() : document.getElementById('blogArticleView');
      if (view) view.scrollTo({ top: 0, behavior: 'smooth' });
      if (blogPanel) {
        const base = readingBaseScroll || 0;
        blogPanel.scrollTo({ top: base, behavior: 'smooth' });
      }
      return;
    }
    const panels = document.querySelectorAll('.panel');
    let active = null;
    if (scrollContainer) {
      const left = scrollContainer.scrollLeft;
      panels.forEach((p) => {
        if (Math.abs(p.offsetLeft - left) < (p.offsetWidth || window.innerWidth) * 0.45) active = p;
      });
    }
    if (active) active.scrollTo({ top: 0, behavior: 'smooth' });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  
  async function downloadUrlAs(url, filename) {
    const name = String(filename || 'download').replace(/[^\w\u4e00-\u9fff.-]+/g, '_') || 'download';
    try {
      const res = await fetch(url, { mode: 'cors', credentials: 'omit' });
      if (res.ok) {
        const blob = await res.blob();
        const obj = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = obj;
        a.download = name;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => { try { URL.revokeObjectURL(obj); } catch (_) {} }, 2000);
        return;
      }
    } catch (_) {}
    // 跨域无 CORS 时回退新标签打开
    const a = document.createElement('a');
    a.href = url;
    a.target = '_blank';
    a.rel = 'noopener';
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

function saveImageAs(img) {
    if (!img || !img.src) return;
    const a = document.createElement('a');
    a.href = img.src;
    a.download = (img.alt || 'image').replace(/[^\w\u4e00-\u9fff.-]+/g, '_') || 'image';
    a.target = '_blank';
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  function buildContextMenuItems(target) {
    const items = [];
    const img = target && (target.closest ? target.closest('img.md-img, .blog-article-body img, .md-img') : null);
    const isImg = !!(img && img.tagName === 'IMG');
    const selected = getSelectedText();
    const link = target && target.closest ? target.closest('a[href]') : null;

    items.push({
      id: 'to-top',
      icon: 'fa-arrow-up',
      label: '回到顶端',
      action: () => scrollPageToTop()
    });

    items.push({ type: 'sep' });

    if (selected) {
      items.push({
        id: 'copy-selection',
        icon: 'fa-copy',
        label: '复制所选文字',
        action: () => copyTextToClipboard(selected)
      });
    } else {
      items.push({
        id: 'copy',
        icon: 'fa-copy',
        label: '复制',
        disabled: true,
        action: () => {}
      });
    }

    if (link && link.href) {
      items.push({
        id: 'copy-link',
        icon: 'fa-link',
        label: '复制链接',
        action: () => copyTextToClipboard(link.href)
      });
      items.push({
        id: 'open-link',
        icon: 'fa-external-link-alt',
        label: '在新标签页打开链接',
        action: () => window.open(link.href, '_blank', 'noopener')
      });
    }

    if (isImg) {
      items.push({ type: 'sep' });
      items.push({
        id: 'open-image',
        icon: 'fa-image',
        label: '在新标签页中打开图片',
        action: () => window.open(img.src, '_blank', 'noopener')
      });
      items.push({
        id: 'copy-image-url',
        icon: 'fa-link',
        label: '复制图片地址',
        action: () => copyTextToClipboard(img.src)
      });
      items.push({
        id: 'save-image',
        icon: 'fa-download',
        label: '图片另存为…',
        action: () => saveImageAs(img)
      });
    }
    const codeWin = target && target.closest ? target.closest('.md-code-window') : null;
    if (codeWin) {
      const codeEl = codeWin.querySelector('pre code');
      if (codeEl) {
        items.push({ type: 'sep' });
        items.push({
          id: 'copy-code',
          icon: 'fa-code',
          label: '复制代码',
          action: () => copyTextToClipboard(codeEl.textContent || '')
        });
      }
    }

    // 音频播放器 / 歌词面板：下载音乐、下载歌词
    const playerEl = target && target.closest
      ? target.closest('.glass-audio-player, .md-audio-player, .md-lyrics, .md-song-block')
      : null;
    if (playerEl) {
      const block = playerEl.closest('.md-song-block') || playerEl;
      const audio = block.querySelector ? block.querySelector('audio') : null;
      const lyricsEl = block.querySelector ? block.querySelector('.md-lyrics') : null;
      const audioSrc = audio && (audio.currentSrc || audio.src || audio.getAttribute('src') || '');
      const lyricsSrc = lyricsEl && (lyricsEl.getAttribute('data-lyrics-src') || '');
      items.push({ type: 'sep' });
      items.push({
        id: 'dl-music',
        icon: 'fa-download',
        label: '下载音乐',
        disabled: !audioSrc,
        action: () => {
          if (!audioSrc) return;
          const name = (audioSrc.split('?')[0].split('/').pop() || 'audio') + '';
          downloadUrlAs(audioSrc, name);
        }
      });
      items.push({
        id: 'dl-lyrics',
        icon: 'fa-file-alt',
        label: '下载歌词',
        disabled: !lyricsSrc,
        action: () => {
          if (!lyricsSrc) return;
          const name = (lyricsSrc.split('?')[0].split('/').pop() || 'lyrics.lrc') + '';
          downloadUrlAs(lyricsSrc, name);
        }
      });
    }

    items.push({ type: 'sep' });
    items.push({
      id: 'reload',
      icon: 'fa-redo',
      label: '刷新页面',
      action: () => window.location.reload()
    });

    return items;
  }

  function showContextMenu(clientX, clientY, target) {
    const menu = ensureContextMenu();
    const items = buildContextMenuItems(target);
    ctxMenuTarget = target;

    let html = '';
    items.forEach((it) => {
      if (it.type === 'sep') {
        html += '<div class="site-ctx-sep" role="separator"></div>';
        return;
      }
      html += `<button type="button" class="site-ctx-item${it.disabled ? ' is-disabled' : ''}" data-id="${it.id}" role="menuitem" ${it.disabled ? 'disabled' : ''}>` +
        `<i class="fas ${it.icon}"></i><span>${it.label}</span></button>`;
    });
    menu.innerHTML = html;

    menu.querySelectorAll('.site-ctx-item:not(.is-disabled)').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.id;
        const def = items.find(x => x.id === id);
        hideContextMenu();
        if (def && typeof def.action === 'function') def.action();
      });
    });

    menu.hidden = false;
    menu.classList.add('is-open');
    const pad = 8;
    const mw = menu.offsetWidth || 220;
    const mh = menu.offsetHeight || 200;
    let x = clientX;
    let y = clientY;
    if (x + mw > window.innerWidth - pad) x = Math.max(pad, window.innerWidth - mw - pad);
    if (y + mh > window.innerHeight - pad) y = Math.max(pad, window.innerHeight - mh - pad);
    menu.style.left = x + 'px';
    menu.style.top = y + 'px';
  }

  document.addEventListener('contextmenu', function(e) {
    if (isTextEditingTarget(e.target)) {
      hideContextMenu();
      return;
    }
    e.preventDefault();
    if (!isPointerDown && performance.now() >= suppressEffectsUntil) {
      if (!shouldSkipClickEffects(e.target)) {
        triggerAnimation(e.clientX, e.clientY, true);
      }
    }
    showContextMenu(e.clientX, e.clientY, e.target);
  }, true);

  document.addEventListener('click', function() {
    hideContextMenu();
  }, true);

  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') hideContextMenu();
  }, true);

  window.addEventListener('blur', hideContextMenu);
  if (scrollContainer) {
    scrollContainer.addEventListener('scroll', hideContextMenu, { passive: true });
  }
  if (blogPanel) {
    blogPanel.addEventListener('scroll', hideContextMenu, { passive: true });
  }

  document.addEventListener('keydown', function(e) {
    if (e.key === ' ' || e.key === 'Space') {
      if (isTextEditingTarget(e.target)) return;
      e.preventDefault();
      const cx = window.innerWidth / 2;
      const cy = window.innerHeight / 2;
      const target = document.elementFromPoint(cx, cy);
      const { color, name } = getClickColor(target, false);
      triggerClickEffect(cx, cy, color, name);
    }
    if (e.key === 'Escape') {
      forceReleasePointer();
      clearAllTrailDots();
    }
  });



  // ============================================================
  // Fluent Reveal Highlight — 仅液态玻璃边框；坐标始终以当前真实 DOMRect 为准
  // ============================================================
  const REVEAL_SELECTOR = '.blog-list .blog-card, .work-card, .glass-card.win7-business-card, .glass-card.admin-card';
  let revealEnabled = false;
  let revealRaf = 0;
  let revealLastX = 0;
  let revealLastY = 0;
  let revealActiveHost = null;

  function canUseRevealHighlight() {
    try {
      if (window.matchMedia('(max-width: 480px)').matches) return false;
      if (window.matchMedia('(hover: none)').matches) return false;
      if (window.matchMedia('(pointer: coarse)').matches) return false;
      if (document.documentElement.classList.contains('is-phone')) return false;
    } catch (_) {}
    return true;
  }

  function ensureRevealLayers(el) {
    if (!el || el.dataset.revealReady === '1') return;
    el.dataset.revealReady = '1';
    el.classList.add('reveal-host');
    const border = document.createElement('span');
    border.className = 'reveal-border';
    border.setAttribute('aria-hidden', 'true');
    el.insertBefore(border, el.firstChild);
  }

  function prepareRevealHosts() {
    if (!revealEnabled) return;
    document.querySelectorAll(REVEAL_SELECTOR).forEach(ensureRevealLayers);
  }

  function clearRevealActive() {
    if (revealActiveHost) {
      revealActiveHost.classList.remove('is-reveal-active');
      revealActiveHost = null;
    }
  }

  function updateRevealAt(clientX, clientY) {
    if (!revealEnabled) return;
    prepareRevealHosts();
    const target = document.elementFromPoint(clientX, clientY);
    const host = target?.closest?.(REVEAL_SELECTOR) || null;
    if (!host || !host.isConnected) { clearRevealActive(); return; }

    // 关键：每一帧对当前真实玻璃面板重新取 DOMRect。
    // 博客阅读/返回、transform、滚动、动画都不会再使用旧坐标。
    const rect = host.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) { clearRevealActive(); return; }
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    const pad = 170;
    if (clientX < rect.left - pad || clientX > rect.right + pad || clientY < rect.top - pad || clientY > rect.bottom + pad) {
      clearRevealActive();
      return;
    }
    if (revealActiveHost && revealActiveHost !== host) revealActiveHost.classList.remove('is-reveal-active');
    revealActiveHost = host;
    host.style.setProperty('--reveal-x', `${x}px`);
    host.style.setProperty('--reveal-y', `${y}px`);
    const edgeDist = Math.min(x, rect.width - x, y, rect.height - y);
    const edgeBoost = Math.max(0, 1 - edgeDist / 110);
    host.style.setProperty('--reveal-edge', String(0.28 + edgeBoost * 0.72));
    host.classList.add('is-reveal-active');
  }

  function onRevealPointerMove(e) {
    revealLastX = e.clientX;
    revealLastY = e.clientY;
    if (revealRaf) return;
    revealRaf = requestAnimationFrame(() => {
      revealRaf = 0;
      updateRevealAt(revealLastX, revealLastY);
    });
  }

  function onRevealPointerLeave() { clearRevealActive(); }

  function refreshRevealAfterLayout() {
    if (!revealEnabled || !revealRaf) {
      if (revealEnabled) updateRevealAt(revealLastX, revealLastY);
    }
  }

  function setupRevealHighlight() {
    const enable = canUseRevealHighlight();
    if (enable === revealEnabled) { if (enable) prepareRevealHosts(); return; }
    revealEnabled = enable;
    if (enable) {
      document.addEventListener('pointermove', onRevealPointerMove, { passive: true });
      window.addEventListener('blur', onRevealPointerLeave);
      window.addEventListener('resize', refreshRevealAfterLayout, { passive: true });
      document.body.classList.add('has-reveal-highlight');
      prepareRevealHosts();
      const blogList = document.getElementById('blogList');
      if (blogList && !blogList._revealObs) {
        blogList._revealObs = new MutationObserver(() => { prepareRevealHosts(); refreshRevealAfterLayout(); });
        blogList._revealObs.observe(blogList, { childList: true, subtree: true });
      }
      const worksGrid = document.getElementById('worksGrid');
      if (worksGrid && !worksGrid._revealObs) {
        worksGrid._revealObs = new MutationObserver(() => { prepareRevealHosts(); refreshRevealAfterLayout(); });
        worksGrid._revealObs.observe(worksGrid, { childList: true, subtree: true });
      }
      // 博客阅读视图切换会改变 transform / 几何位置；动画期间持续刷新，但不遍历所有卡片。
      const blogPanel = document.getElementById('blog');
      if (blogPanel && !blogPanel._revealLayoutObs) {
        blogPanel._revealLayoutObs = new ResizeObserver(() => refreshRevealAfterLayout());
        blogPanel._revealLayoutObs.observe(blogPanel);
      }
    } else {
      document.removeEventListener('pointermove', onRevealPointerMove);
      window.removeEventListener('blur', onRevealPointerLeave);
      window.removeEventListener('resize', refreshRevealAfterLayout);
      document.body.classList.remove('has-reveal-highlight');
      onRevealPointerLeave();
    }
  }

  // ---------- 初始化 ----------
  async function init() {
    loadSpriteImage();
    const bootResult = await runBootLoader();
    const apiOk = !(bootResult && bootResult.apiOk === false);

    renderProfile();
    setupStatusTimelineWheel();
    setupHomeNoVerticalScroll();
    // 博客/作品改为路由懒加载，初始化只放占位
    const worksGrid = document.getElementById('worksGrid');
    if (worksGrid) worksGrid.innerHTML = '<div class="loading-placeholder">滑动进入后加载作品...</div>';
    const blogList = document.getElementById('blogList');
    if (blogList) blogList.innerHTML = loadingPlaceholderHtml('进入博客后加载...');
    setupBlogToolbarInteractions();
    setupBlogSortUI();
    setupArticleReaderUI();
    ensureNavCapsule();
    setupAdminLoginUI();
    updateActiveNavFromScroll();
    updateCapsuleFromScroll();
    setupBlogScrollHeights();
    updateBlogScroll();
    updateGlobalAvatarPosition();

    if (!apiOk) {
      applyApiOfflineHomeMode();
      setTimeout(() => centerAvatarForOffline(), 80);
      return;
    }

    await checkAdminSession();
    await loadProfileRoute();
    const bootSlug = parseBlogSlugFromLocation();
    if (bootSlug) {
      openArticleReader(bootSlug);
    } else {
      const active = document.querySelector('.nav-btn.active');
      const sec = active && active.getAttribute('data-section');
      if (sec && sec !== 'home') ensureRouteLoaded(sec);
    }
    window.addEventListener('popstate', () => {
      const slug = (history.state && history.state.blogSlug) || parseBlogSlugFromLocation();
      if (slug) openArticleReader(slug);
      else if (isArticleReading) closeArticleReader();
    });

    setupRevealHighlight();
    window.addEventListener('resize', setupRevealHighlight, { passive: true });

    setTimeout(() => {
      setupBlogScrollHeights();
      updateBlogScroll();
      updateGlobalAvatarPosition();
      updateCapsuleFromScroll();
      prepareRevealHosts();
    }, 500);
  }

  init();
})();