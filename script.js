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

  async function resolveApiBase() {
    const tryOne = async (base) => {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 4500);
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
    };

    for (const base of API_CANDIDATES) {
      if (await tryOne(base)) {
        API_BASE_URL = base;
        return API_BASE_URL;
      }
    }
    API_BASE_URL = API_CANDIDATES[0];
    return API_BASE_URL;
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

  const defaultProfile = {
    name: "MaxSui",
    age: 16,
    grade: "高二",
    bio: "热爱计算机底层与系统编程，熟悉 C / C# / C++，喜欢探索新的算法。",
    interests: ["C", "C#", "C++", "OIer", "Minecraft", "CR-中国铁路", "Airbus"],
    avatar: null,
    status: "在线",
    statusType: "online"
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
  let stage1Height = 0;
  let stage2Height = 0;
  let stage3Extra = 0;
  let isBlogActive = false;
  let activeCategory = '';

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
    const cats = categories && categories.length
      ? categories
      : Array.from(new Set(blogPosts.map(p => p.category).filter(Boolean)));
    let html = `<button type="button" class="theme-chip ${!activeCategory ? 'active' : ''}" data-category="">全部</button>`;
    cats.forEach(c => {
      const name = typeof c === 'string' ? c : (c.name || c.slug || '');
      if (!name) return;
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

  function filterAndRenderBlogs(keyword = '', dateStr = null) {
    const list = document.getElementById('blogList');
    const countEl = document.getElementById('postCount');
    if (!list) return;

    let filtered = blogPosts.filter(post => {
      const titleMatch = (post.title || '').toLowerCase().includes(keyword);
      const summaryMatch = (post.summary || post.content || '').toLowerCase().includes(keyword);
      const matchesKeyword = !keyword || titleMatch || summaryMatch;
      let matchesDate = true;
      if (dateStr) {
        const postDate = dateOnlyUTC8(post.rawDate || post.date) || (post.date || '').split(' ')[0];
        matchesDate = postDate === dateStr;
      }
      const matchesCat = !activeCategory || (post.category || '') === activeCategory;
      return matchesKeyword && matchesDate && matchesCat;
    });

    if (!filtered.length) {
      list.innerHTML = '<p class="loading-placeholder">没有找到匹配的文章</p>';
      if (countEl) countEl.textContent = '0 篇文章';
      setupBlogScrollHeights();
      return;
    }

    let html = '';
    filtered.forEach(post => {
      const displayDate = post.date || formatDateUTC8(post.rawDate) || '';
      const id = escapeHtml(post.slug || post.id);
      html += `
        <article class="blog-card" role="button" tabindex="0" data-id="${id}">
          <div class="blog-icon"><i class="fas ${post.icon || 'fa-pen'}"></i></div>
          <h3>${escapeHtml(post.title || '无标题')}</h3>
          <p>${escapeHtml(post.summary || '')}</p>
          <div class="blog-meta">
            <span><i class="far fa-calendar"></i> ${escapeHtml(displayDate)} <small style="opacity:.7">UTC+8</small></span>
            <span><i class="far fa-clock"></i> ${escapeHtml(post.readTime || '3 min')}</span>
          </div>
          <span class="read-more" aria-hidden="true">阅读 <i class="fas fa-arrow-right"></i></span>
        </article>
      `;
    });
    list.innerHTML = html;
    if (countEl) countEl.textContent = `${filtered.length} 篇文章`;

    list.querySelectorAll('.blog-card[data-id]').forEach(card => {
      const open = () => openArticleReader(card.dataset.id);
      card.addEventListener('click', open);
      card.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          open();
        }
      });
    });

    requestAnimationFrame(() => {
      setupBlogScrollHeights();
      updateBlogScroll();
      updateGlobalAvatarPosition();
    });
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
    s = s.replace(/```([a-zA-Z0-9_+-]*)[ \t]*\n?([\s\S]*?)```/g, (_, lang, code) => {
      const langClean = (lang || '').trim().toLowerCase();
      const cls = langClean ? `language-${esc(langClean)}` : '';
      const body = esc(code.replace(/^\n+|\n+$/g, ''));
      return hold(`<pre class="md-code"><code class="${cls}">${body}</code></pre>`);
    });

    // 行内代码
    s = s.replace(/`([^`\n]+)`/g, (_, c) => hold(`<code>${esc(c)}</code>`));

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
    s = s.replace(/\*(.+?)\*/g, '<em>$1</em>');
    s = s.replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g,
      '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
    s = s.replace(/^&gt;[ \t]+(.+)$/gm, '<blockquote>$1</blockquote>');
    s = s.replace(/^(?:- |\* )(.+)$/gm, '<li>$1</li>');
    s = s.replace(/(?:<li>[\s\S]*?<\/li>\s*)+/g, (m) => `<ul>${m}</ul>`);

    s = s.split(/\n{2,}/).map(block => {
      const t = block.trim();
      if (!t) return '';
      if (/^<(h[1-6]|ul|ol|pre|blockquote|div)/.test(t)) return t;
      if (/^\uE000\d+\uE001$/.test(t)) return t;
      return `<p>${block.replace(/\n/g, '<br>')}</p>`;
    }).join('\n');

    s = s.replace(/\uE000(\d+)\uE001/g, (_, i) => slots[+i] || '');
    return s;
  }

  function highlightArticleCode(root) {
    if (!root) return;
    const run = () => {
      if (typeof window.hljs === 'undefined' || typeof window.hljs.highlightElement !== 'function') {
        return false;
      }
      root.querySelectorAll('pre code').forEach((block) => {
        try {
          window.hljs.highlightElement(block);
        } catch (_) { /* ignore single-block errors */ }
      });
      return true;
    };
    if (!run()) {
      let n = 0;
      const timer = setInterval(() => {
        n += 1;
        if (run() || n > 40) clearInterval(timer);
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

  async function openArticleReader(idOrSlug) {
    const modal = document.getElementById('articleReaderModal');
    const titleEl = document.getElementById('articleReaderTitle');
    const metaEl = document.getElementById('articleReaderMeta');
    const bodyEl = document.getElementById('articleReaderBody');
    if (!modal || !titleEl || !bodyEl) return;

    const local = blogPosts.find(p => String(p.slug) === String(idOrSlug) || String(p.id) === String(idOrSlug));
    titleEl.textContent = (local && local.title) || '加载中…';
    if (metaEl) {
      metaEl.innerHTML = local
        ? `<span><i class="far fa-calendar"></i> ${escapeHtml(local.date || '')} UTC+8</span>` +
          (local.category ? `<span><i class="fas fa-tag"></i> ${escapeHtml(local.category)}</span>` : '') +
          `<span><i class="far fa-clock"></i> ${escapeHtml(local.readTime || '')}</span>`
        : '';
    }
    bodyEl.innerHTML = '<p class="loading-placeholder"><i class="fas fa-spinner fa-pulse"></i> 加载正文…</p>';
    modal.classList.add('active');

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
      return;
    }

    titleEl.textContent = article.title || (local && local.title) || '无标题';
    const rawDate = article.published_at || article.created_at || article.date || (local && local.rawDate) || '';
    const displayDate = formatDateUTC8(rawDate) || (local && local.date) || '';
    if (metaEl) {
      metaEl.innerHTML =
        `<span><i class="far fa-calendar"></i> ${escapeHtml(displayDate)} UTC+8</span>` +
        (article.category || (local && local.category)
          ? `<span><i class="fas fa-tag"></i> ${escapeHtml(article.category || local.category)}</span>`
          : '') +
        (article.reading_time || (local && local.readTime)
          ? `<span><i class="far fa-clock"></i> ${escapeHtml(article.reading_time ? article.reading_time + ' min' : local.readTime)}</span>`
          : '');
    }
    const content = article.content || article.body || (local && local.content) || article.summary || article.excerpt || '';
    bodyEl.innerHTML = simpleMarkdownToHtml(content) || '<p>（无正文）</p>';
    highlightArticleCode(bodyEl);
    renderArticleMath(bodyEl);
  }

  function closeArticleReader() {
    const modal = document.getElementById('articleReaderModal');
    if (modal) modal.classList.remove('active');
  }

  function setupArticleReaderUI() {
    const modal = document.getElementById('articleReaderModal');
    const closeBtn = document.getElementById('articleReaderClose');
    if (closeBtn) closeBtn.addEventListener('click', closeArticleReader);
    if (modal) {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) closeArticleReader();
      });
    }
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeArticleReader();
    });
  }

  function openAdminLoginModal() {
    const modal = document.getElementById('adminLoginModal');
    const err = document.getElementById('adminLoginError');
    const user = document.getElementById('adminUsername');
    const pass = document.getElementById('adminPassword');
    if (err) { err.hidden = true; err.textContent = '密码错误'; }
    if (user) user.value = '';
    if (pass) pass.value = '';
    if (modal) modal.classList.add('active');
    setTimeout(() => user && user.focus(), 50);
  }

  function closeAdminLoginModal() {
    const modal = document.getElementById('adminLoginModal');
    if (modal) modal.classList.remove('active');
  }

  function bindNavLinkClick(link) {
    link.addEventListener('click', (e) => {
      e.preventDefault();
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

  function lockAdminPanel() {
    if (!adminUnlocked) return;
    adminUnlocked = false;
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
                  <label>状态类型</label>
                  <select id="adminStatusType">
                    <option value="online"${stType==='online'?' selected':''}>在线 (绿)</option>
                    <option value="busy"${stType==='busy'?' selected':''}>忙碌 (红)</option>
                    <option value="away"${stType==='away'?' selected':''}>离开 (黄)</option>
                    <option value="offline"${stType==='offline'?' selected':''}>离线 (灰)</option>
                    <option value="custom"${stType==='custom'?' selected':''}>自定义 (蓝)</option>
                  </select>
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
          <div class="admin-tab-panel" data-panel="articles">
            <div class="glass-card admin-card">
              <div class="admin-toolbar">
                <h3 style="margin:0"><i class="fas fa-list"></i> 文章管理</h3>
                <button type="button" class="nav-btn apple-secondary-btn" id="adminRefreshArticlesBtn"><i class="fas fa-sync"></i> 刷新</button>
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
                  <label>正文（Markdown）</label>
                  <textarea id="adminArticleContent" placeholder="# 标题&#10;&#10;正文…"></textarea>
                </div>
                <div class="admin-form-row">
                  <label>状态</label>
                  <select id="adminArticleStatus">
                    <option value="published">发布</option>
                    <option value="draft">草稿</option>
                    <option value="archived">归档</option>
                  </select>
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
      });
    });

    const statusText = section.querySelector('#adminStatusText');
    const statusType = section.querySelector('#adminStatusType');
    const previewText = section.querySelector('#adminStatusPreviewText');
    const previewDot = section.querySelector('#adminStatusDot');
    const syncPreview = () => {
      if (previewText) previewText.textContent = statusText?.value || '在线';
      if (previewDot) {
        previewDot.className = 'home-status-dot ' + (statusType?.value || 'online');
      }
    };
    statusText?.addEventListener('input', syncPreview);
    statusType?.addEventListener('change', syncPreview);

    section.querySelector('#adminSaveStatusBtn')?.addEventListener('click', () => {
      const text = (statusText?.value || '').trim() || '在线';
      const type = statusType?.value || 'online';
      profileData.status = text;
      profileData.statusType = type;
      try {
        localStorage.setItem('maxsui_profile_status', JSON.stringify({ status: text, statusType: type }));
      } catch (_) {}
      renderProfile();
      const msg = section.querySelector('#adminStatusMsg');
      if (msg) {
        msg.textContent = '状态已更新并显示在主页（本地保存；后端暂无 profile 接口）';
        msg.className = 'admin-msg ok';
      }
    });

    section.querySelector('#adminLogoutBtn')?.addEventListener('click', adminLogout);
    section.querySelector('#adminRefreshArticlesBtn')?.addEventListener('click', loadAdminArticles);
    section.querySelector('#adminSaveArticleBtn')?.addEventListener('click', saveAdminArticle);
    section.querySelector('#adminResetEditorBtn')?.addEventListener('click', resetAdminEditor);

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

  async function loadAdminArticles() {
    const box = document.getElementById('adminArticlesList');
    const msg = document.getElementById('adminArticlesMsg');
    if (!box) return;
    box.innerHTML = '<p class="admin-msg">加载中…</p>';
    try {
      const res = await fetch(`${API_BASE_URL}/articles?limit=50`, { credentials: 'include' });
      const data = await res.json().catch(() => null);
      const list = data?.articles || [];
      if (!list.length) {
        box.innerHTML = '<p class="admin-msg">暂无已发布文章（草稿需后端管理列表接口）</p>';
        return;
      }
      let rows = list.map(a => `
        <tr>
          <td>${escapeHtml(a.title)}</td>
          <td><code>${escapeHtml(a.slug)}</code></td>
          <td>${escapeHtml(a.category || '—')}</td>
          <td>${escapeHtml(dateOnlyUTC8(a.published_at || a.created_at || '') || (a.published_at || a.created_at || '').slice(0, 10))}</td>
          <td class="admin-article-actions">
            <button type="button" class="admin-mini-btn" data-edit-id="${a.id}" data-slug="${escapeHtml(a.slug)}">编辑</button>
            <button type="button" class="admin-mini-btn danger" data-del-id="${a.id}">删除</button>
          </td>
        </tr>
      `).join('');
      box.innerHTML = `
        <table class="admin-article-table">
          <thead><tr><th>标题</th><th>Slug</th><th>分类</th><th>日期</th><th>操作</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>`;
      box.querySelectorAll('[data-edit-id]').forEach(btn => {
        btn.addEventListener('click', () => editAdminArticle(btn.dataset.editId, btn.dataset.slug));
      });
      box.querySelectorAll('[data-del-id]').forEach(btn => {
        btn.addEventListener('click', () => deleteAdminArticle(btn.dataset.delId));
      });
      if (msg) { msg.textContent = ''; msg.className = 'admin-msg'; }
    } catch (e) {
      box.innerHTML = '<p class="admin-msg err">加载失败</p>';
    }
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
      document.getElementById('adminArticleStatus').value = 'published';
      document.getElementById('adminEditorTitle').textContent = '编辑文章 #' + id;
      document.querySelectorAll('.admin-tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === 'editor'));
      document.querySelectorAll('.admin-tab-panel').forEach(p => p.classList.toggle('active', p.dataset.panel === 'editor'));
      if (msg) { msg.textContent = '已载入文章'; msg.className = 'admin-msg ok'; }
    } catch (e) {
      if (msg) { msg.textContent = String(e.message || e); msg.className = 'admin-msg err'; }
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
    document.getElementById('adminArticleStatus').value = 'published';
    document.getElementById('adminEditorTitle').textContent = '新建文章';
    const msg = document.getElementById('adminEditorMsg');
    if (msg) { msg.textContent = ''; msg.className = 'admin-msg'; }
  }

  async function saveAdminArticle() {
    const msg = document.getElementById('adminEditorMsg');
    const id = document.getElementById('adminEditArticleId')?.value;
    const body = {
      title: (document.getElementById('adminArticleTitle')?.value || '').trim(),
      slug: (document.getElementById('adminArticleSlug')?.value || '').trim(),
      category: (document.getElementById('adminArticleCategory')?.value || '').trim() || null,
      excerpt: (document.getElementById('adminArticleExcerpt')?.value || '').trim(),
      content: document.getElementById('adminArticleContent')?.value || '',
      status: document.getElementById('adminArticleStatus')?.value || 'draft'
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

  function unlockAdminPanel(options = {}) {
    const { scrollToAdmin = true } = options;
    if (adminUnlocked) return;
    adminUnlocked = true;
    closeAdminLoginModal();

    const linksWrap = document.querySelector('.nav-links');
    if (linksWrap && !document.querySelector('.nav-btn[data-section="admin"]')) {
      const a = document.createElement('a');
      a.href = '#admin';
      a.className = 'nav-btn';
      a.dataset.section = 'admin';
      a.innerHTML = '<i class="fas fa-user-shield"></i><span>管理员</span>';
      linksWrap.insertBefore(a, linksWrap.firstChild);
      bindNavLinkClick(a);
    }

    if (scrollContainer && !document.getElementById('admin')) {
      const section = document.createElement('section');
      section.id = 'admin';
      section.className = 'panel';
      section.innerHTML = buildAdminPanelHTML();
      scrollContainer.insertBefore(section, scrollContainer.firstChild);
      bindAdminPanelEvents(section);
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
      const res = await fetch(`${API_BASE_URL}/auth/me`, {
        credentials: 'include',
        cache: 'no-store'
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data && (data.authenticated === true || (data.success === true && data.admin))) {
        unlockAdminPanel({ scrollToAdmin: false });
        return true;
      }
    } catch (e) { /* silent */ }
    return false;
  }

  function setupAdminLoginUI() {
    const modal = document.getElementById('adminLoginModal');
    const form = document.getElementById('adminLoginForm');
    const closeBtn = document.getElementById('closeAdminLoginBtn');
    const cancelBtn = document.getElementById('adminLoginCancel');
    const err = document.getElementById('adminLoginError');

    if (closeBtn) closeBtn.addEventListener('click', closeAdminLoginModal);
    if (cancelBtn) cancelBtn.addEventListener('click', closeAdminLoginModal);
    if (modal) {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) closeAdminLoginModal();
      });
    }

    if (form) {
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const username = (document.getElementById('adminUsername')?.value || '').trim();
        const password = document.getElementById('adminPassword')?.value || '';
        if (!username || !password) {
          if (err) { err.hidden = false; err.textContent = '请输入用户名和密码'; }
          return;
        }

        const submitBtn = document.getElementById('adminLoginSubmit');
        if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = '校验中…'; }

        try {
          const res = await fetch(`${API_BASE_URL}/auth/login`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
          });
          const data = await res.json().catch(() => null);

          if (res.ok && data && data.success !== false) {
            unlockAdminPanel({ scrollToAdmin: true });
          } else {
            const msg = (data && data.error) ? data.error : (res.status === 401 ? '用户名或密码错误' : '登录失败');
            if (err) { err.hidden = false; err.textContent = msg; }
          }
        } catch (ex) {
          if (err) { err.hidden = false; err.textContent = '网络错误，请稍后重试'; }
        } finally {
          if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = '登录'; }
        }
      });
    }
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

  function updateGlobalAvatarPosition() {
    const globalAvatar = document.getElementById('globalAvatar');
    const homePlaceholder = document.getElementById('homeAvatarPlaceholder');
    const blogPlaceholder = document.getElementById('coverAvatarPlaceholder');
    const worksPlaceholder = document.getElementById('worksAvatarPlaceholder');
    const contactPlaceholder = document.getElementById('contactAvatarPlaceholder');
    if (!globalAvatar || !homePlaceholder || !blogPlaceholder || !worksPlaceholder || !contactPlaceholder) return;

    const vw = scrollContainer.clientWidth;
    const scrollLeft = scrollContainer.scrollLeft;
    let p = scrollLeft / vw;
    if (adminUnlocked) p = p - 1;
    if (p < 0) {
      globalAvatar.style.opacity = Math.max(0, 1 + p);
      const r = homePlaceholder.getBoundingClientRect();
      globalAvatar.style.width = r.width + 'px';
      globalAvatar.style.height = r.height + 'px';
      globalAvatar.style.transform =
        `translate(calc(${r.left + r.width / 2}px - 50%), calc(${r.top + r.height / 2}px - 50%))`;
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

    globalAvatar.style.width = size + 'px';
    globalAvatar.style.height = size + 'px';
    globalAvatar.style.transform = `translate(calc(${cx}px - 50%), calc(${cy}px - 50%))`;

    if (blogPanel && isBlogActive) {
      const blogScrollTop = blogPanel.scrollTop;
      const vh = blogPanel.clientHeight || window.innerHeight;
      let p1 = Math.min(1, Math.max(0, blogScrollTop / (stage1Height || vh || 1)));
      globalAvatar.style.opacity = Math.max(0, 1 - p1 * 1.2);
    } else {
      globalAvatar.style.opacity = 1;
    }
  }

  let rafId = null;

  function updateActiveNavFromScroll() {
    if (rafId) cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(() => {
      const sections = getSections();
      const scrollLeft = scrollContainer.scrollLeft;
      const containerWidth = scrollContainer.clientWidth;
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
      const activeId = sections[closestIndex]?.getAttribute('id');

      getNavLinks().forEach(link => { link.classList.toggle('active', link.dataset.section === activeId); });

      const wasBlog = isBlogActive;
      isBlogActive = (activeId === 'blog');
      if (isBlogActive !== wasBlog) {
        if (!isBlogActive) {
          nav.classList.remove('blog-mode');
        } else {
          if (blogPanel) blogPanel.scrollTop = 0;
          updateBlogScroll();
        }
      }
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

  function updateCapsuleFromScroll() {
    ensureNavCapsule();
    if (!navCapsule) return;
    if (nav.classList.contains('blog-mode')) {
      navCapsule.style.opacity = '0';
      return;
    }
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
    const x0 = r0.left - parentRect.left;
    const x1 = r1.left - parentRect.left;
    const w0 = r0.width;
    const w1 = r1.width;

    capsuleX = x0 + (x1 - x0) * t;
    capsuleW = w0 + (w1 - w0) * t;
    applyCapsuleTransform();
  }

  scrollContainer.addEventListener('scroll', () => {
    updateActiveNavFromScroll();
    onHorizontalScrollForNav();
    requestAnimationFrame(updateGlobalAvatarPosition);
  }, { passive: true });

  window.addEventListener('resize', () => {
    updateActiveNavFromScroll();
    updateCapsuleFromScroll();
    setupBlogScrollHeights();
    updateBlogScroll();
    updateGlobalAvatarPosition();
  });

  getNavLinks().forEach(bindNavLinkClick);

  function setupBlogScrollHeights() {
    if (!blogPanel || !blogContent || !blogWhiteBox) return;
    const vh = blogPanel.clientHeight || window.innerHeight;
    stage1Height = Math.round(vh * STAGE1_RATIO);
    stage2Height = Math.round(vh * STAGE2_RATIO);
    const inner = blogWhiteBox.querySelector('.white-box-inner');
    const contentH = inner ? Math.max(inner.offsetHeight || inner.scrollHeight, 500) : 600;
    const gapPx = getBlogGapPx();
    const topMargin = typeof getBlogTopMargin === 'function' ? getBlogTopMargin() : (gapPx + 56);
    stage3Extra = Math.max(0, contentH + topMargin * 2 - vh + 80);
    blogContent.style.height = (vh + stage1Height + stage2Height + stage3Extra) + 'px';
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
    return Math.max(gapPx, (navRect.bottom - panelRect.top) + gapPx);
  }

  let railGapLocked = false;

  function updateBlogScroll() {
    if (!blogPanel || !blogContent || !blogStageDuo) return;
    const scrollTop = blogPanel.scrollTop;
    const vh = blogPanel.clientHeight || window.innerHeight;
    const gapPx = getBlogGapPx();
    const topMargin = getBlogTopMargin();

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

    const startY = vh + 28;
    const midY = vh * 0.48;
    let desiredY;
    if (p1 < 1) {
      desiredY = startY * (1 - p1) + midY * p1;
    } else if (p2 < 1) {
      desiredY = midY * (1 - p2) + topMargin * p2;
    } else {
      desiredY = topMargin - p3 * stage3Extra;
    }

    blogStageDuo.style.top = (scrollTop + desiredY) + 'px';
    blogStageDuo.style.pointerEvents = 'none';
    if (blogWhiteBox) blogWhiteBox.style.pointerEvents = 'auto';
    if (blogThemeRail) blogThemeRail.style.pointerEvents = (p2 > 0.2 || railGapLocked) ? 'auto' : 'none';

    const railW = window.matchMedia('(max-width: 480px)').matches
      ? 84
      : (window.matchMedia('(max-width: 720px)').matches ? 96 : 132);
    const gap = gapPx;
    let t = easeOutCubic(p2);
    if (railGapLocked) t = 1;

    if (blogThemeRail) {
      blogThemeRail.style.flex = `0 0 ${railW}px`;
      blogThemeRail.style.width = `${railW}px`;
      blogThemeRail.style.maxWidth = `${railW}px`;
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
    }
    if (blogWhiteBox) {
      blogWhiteBox.style.maxWidth = window.matchMedia('(max-width: 720px)').matches ? '100%' : '1050px';
    }

    const coverMove = p1 * (vh * 0.45);
    if (blogCover) {
      blogCover.style.top = (scrollTop - coverMove) + 'px';
      blogCover.style.opacity = Math.max(0, 1 - p1 * 1.15);
    }

    if (isBlogActive) {
      if (p1 > 0.08) nav.classList.add('blog-mode');
      else nav.classList.remove('blog-mode');
    }
  }

  function easeOutCubic(x) {
    const t = Math.min(1, Math.max(0, x));
    return 1 - Math.pow(1 - t, 3);
  }

  let blogScrollHideTimer = null;
  if (blogPanel) {
    blogPanel.addEventListener('scroll', () => {
      blogPanel.classList.add('is-scrolling');
      if (blogScrollHideTimer) clearTimeout(blogScrollHideTimer);
      blogScrollHideTimer = setTimeout(() => {
        blogPanel.classList.remove('is-scrolling');
      }, 900);

      requestAnimationFrame(() => {
        updateBlogScroll();
        updateGlobalAvatarPosition();
      });
    }, { passive: true });
  }

  function setupBlogHorizontalPassthrough() {
    if (!blogPanel || !scrollContainer || blogPanel.dataset.hzPass === '1') return;
    blogPanel.dataset.hzPass = '1';

    blogPanel.addEventListener('wheel', (e) => {
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
    if (!['online', 'busy', 'away', 'offline', 'custom'].includes(statusType)) {
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
        <div class="home-status" title="状态（管理员可在后台修改）">
          <span class="home-status-dot ${statusType}"></span>
          <span class="home-status-text">${statusText}</span>
        </div>
      </div>
      <p class="home-meta-row">${grade}${age ? ' · ' + age : ''}</p>
      <p class="home-bio">${profileData.bio || ''}</p>
      ${interestBtns ? `<div class="home-interests">${interestBtns}</div>` : ''}
      <div class="home-actions">
        <a href="#works" class="nav-btn apple-primary-btn" style="text-decoration:none;"><i class="fas fa-code"></i> 作品</a>
        <a href="#contact" class="nav-btn apple-secondary-btn" style="text-decoration:none;"><i class="fas fa-paper-plane"></i> 联系</a>
      </div>
    `;

    if (avatarContainer) {
      avatarContainer.innerHTML = `<div class="avatar-circle-placeholder" id="homeAvatarPlaceholder"></div>`;
    }

    if (fullAvatarUrl) {
      globalAvatar.innerHTML = `<img src="${fullAvatarUrl}" alt="头像" style="width:100%; height:100%; object-fit:cover;">`;
    } else {
      globalAvatar.innerHTML = `<i class="fas fa-user-astronaut" style="font-size: 4rem; color: #ffffff;"></i>`;
    }

    container.querySelectorAll('a[href^="#"]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const target = document.getElementById(btn.getAttribute('href').substring(1));
        if (target) scrollContainer.scrollTo({ left: target.offsetLeft, behavior: 'smooth' });
      });
    });

    setupAvatarSecret();
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

  async function fetchAllData() {
    try {
      const profileRes = await fetch(`${API_BASE_URL}/profile`, { credentials: 'include' });
      if (profileRes.ok) {
        const data = await profileRes.json();
        const payload = data.profile || data;
        if (payload && typeof payload === 'object' && Object.keys(payload).length) {
          profileData = { ...defaultProfile, ...payload };
        }
      }
    } catch (e) {}

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
              category: post.category || ''
            };
          });
          renderThemeRail(blogPosts.map(p => p.category).filter(Boolean));
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

    renderProfile();
    filterAndRenderBlogs('', null);
    renderWorks();
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

  function loadImageWithProgress(url) {
    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.decoding = 'async';
      img.onload = () => resolve({ ok: true, url });
      img.onerror = () => resolve({ ok: false, url });
      img.src = url;
    });
  }

  function startBootCircleAnim(canvas) {
    if (!canvas) return () => {};
    const ctx = canvas.getContext('2d');
    let raf = null;
    let last = 0;
    const num = 7;
    const minHue = 195;
    const maxHue = 230;
    const circles = [];
    for (let i = 0; i < num; i++) {
      circles.push({
        x: Math.random(),
        y: Math.random(),
        r: i / num,
        colorRand: Math.random()
      });
    }
    const draw = (ts) => {
      const w = canvas.width = window.innerWidth * (window.devicePixelRatio || 1);
      const h = canvas.height = window.innerHeight * (window.devicePixelRatio || 1);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, w, h);
      const g = ctx.createRadialGradient(w * 0.5, h * 0.55, 0, w * 0.5, h * 0.5, Math.max(w, h) * 0.7);
      g.addColorStop(0, 'rgba(20, 48, 88, 0.55)');
      g.addColorStop(0.55, 'rgba(8, 20, 40, 0.35)');
      g.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);

      let dt = ts - last;
      last = ts;
      if (dt > 500) dt = 16;
      for (let i = 0; i < circles.length; i++) {
        const c = circles[i];
        c.r += 0.045 * (dt / 1000);
        if (c.r >= 1) {
          c.r = c.r % 1;
          c.x = Math.random();
          c.y = Math.random();
          c.colorRand = Math.random();
        }
        const cx = c.x * w;
        const cy = c.y * h;
        const radius = (0.12 + Math.sin(c.r * Math.PI) * 0.28) * Math.min(w, h);
        const hue = minHue + Math.round(c.colorRand * (maxHue - minHue));
        const alpha = Math.min(1, (1 - Math.abs(1 - c.r * 2)) * 1.2) * 0.55;
        const rg = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
        rg.addColorStop(0, `hsla(${hue}, 85%, 42%, ${alpha})`);
        rg.addColorStop(0.45, `hsla(${hue}, 80%, 28%, ${alpha * 0.35})`);
        rg.addColorStop(1, `hsla(${hue}, 70%, 18%, 0)`);
        ctx.fillStyle = rg;
        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx.fill();
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => { if (raf) cancelAnimationFrame(raf); };
  }

  function setBootProgress(pct) {
    const bar = document.getElementById('bootProgressBar');
    const label = document.getElementById('bootProgressLabel');
    const track = document.getElementById('bootProgressTrack');
    const p = Math.max(0, Math.min(100, Math.round(pct)));
    if (bar) bar.style.width = p + '%';
    if (label) label.textContent = p + '%';
    if (track) track.setAttribute('aria-valuenow', String(p));
  }

  async function runBootLoader() {
    const loader = document.getElementById('bootLoader');
    const canvas = document.getElementById('bootLoaderCanvas');
    const stopAnim = startBootCircleAnim(canvas);
    setBootProgress(0);

    if (scrollContainer) scrollContainer.style.overflow = 'hidden';

    const urls = CRITICAL_IMAGE_URLS.slice();
    let done = 0;
    const total = urls.length;

    await Promise.all(urls.map(async (url) => {
      await loadImageWithProgress(url);
      done += 1;
      setBootProgress((done / total) * 100);
    }));

    await new Promise(r => setTimeout(r, 180));
    setBootProgress(100);

    if (loader) {
      loader.classList.add('is-done');
      loader.setAttribute('aria-busy', 'false');
      setTimeout(() => {
        stopAnim();
        if (loader.parentNode) loader.parentNode.removeChild(loader);
      }, 500);
    } else {
      stopAnim();
    }
    if (scrollContainer) scrollContainer.style.overflow = '';
  }

  // ============================================================
  //  点击特效事件绑定
  // ============================================================
  function getClickColor(target, isRight) {
    const forbiddenZone = document.getElementById('forbiddenZone');
    if (forbiddenZone && forbiddenZone.contains(target)) {
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
  let lastPointerX = 0, lastPointerY = 0;
  let pointerIsRight = false;

  function startPointerTimer(e) {
    const isRight = (e.button === 2);
    pointerIsRight = isRight;
    const x = e.clientX, y = e.clientY;
    lastPointerX = x;
    lastPointerY = y;
    triggerAnimation(x, y, isRight);
    if (pointerTimer) clearInterval(pointerTimer);
    pointerTimer = setInterval(() => {
      triggerAnimation(lastPointerX, lastPointerY, pointerIsRight);
    }, 150);
    isPointerDown = true;
  }

  function updatePointerPosition(e) {
    if (!isPointerDown) return;
    lastPointerX = e.clientX;
    lastPointerY = e.clientY;
  }

  function stopPointerTimer() {
    if (pointerTimer) {
      clearInterval(pointerTimer);
      pointerTimer = null;
    }
    isPointerDown = false;
  }

  document.addEventListener('mousedown', function(e) {
    if (e.button === 0 || e.button === 2) {
      startPointerTimer(e);
      if (e.button === 2) e.preventDefault();
    }
  });

  document.addEventListener('mousemove', function(e) {
    updatePointerPosition(e);
  });

  document.addEventListener('mouseup', function(e) {
    if (isPointerDown) stopPointerTimer();
  });

  document.addEventListener('mouseleave', function() {
    if (isPointerDown) stopPointerTimer();
  });

  document.addEventListener('touchstart', function(e) {
    const touch = e.touches[0];
    if (!touch) return;
    pointerIsRight = false;
    const x = touch.clientX, y = touch.clientY;
    lastPointerX = x;
    lastPointerY = y;
    triggerAnimation(x, y, false);
    if (pointerTimer) clearInterval(pointerTimer);
    pointerTimer = setInterval(() => {
      triggerAnimation(lastPointerX, lastPointerY, false);
    }, 150);
    isPointerDown = true;
    e.preventDefault();
  }, { passive: false });

  document.addEventListener('touchmove', function(e) {
    if (!isPointerDown) return;
    const touch = e.touches[0];
    if (!touch) return;
    lastPointerX = touch.clientX;
    lastPointerY = touch.clientY;
    e.preventDefault();
  }, { passive: false });

  document.addEventListener('touchend', function(e) {
    if (isPointerDown) stopPointerTimer();
  });

  document.addEventListener('touchcancel', function() {
    if (isPointerDown) stopPointerTimer();
  });

  document.addEventListener('click', function(e) {
    if (e.button === 0) {
      if (!isPointerDown) {
        triggerAnimation(e.clientX, e.clientY, false);
      }
    }
  });

  document.addEventListener('contextmenu', function(e) {
    e.preventDefault();
    if (!isPointerDown) {
      triggerAnimation(e.clientX, e.clientY, true);
    }
  });

  document.addEventListener('keydown', function(e) {
    if (e.key === ' ' || e.key === 'Space') {
      e.preventDefault();
      const cx = window.innerWidth / 2, cy = window.innerHeight / 2;
      const target = document.elementFromPoint(cx, cy);
      const { color, name } = getClickColor(target, false);
      triggerClickEffect(cx, cy, color, name);
    }
  });

  // ---------- 初始化 ----------
  async function init() {
    loadSpriteImage();

    const bootPromise = runBootLoader();

    renderProfile();
    filterAndRenderBlogs('', null);
    renderWorks();
    setupBlogToolbarInteractions();
    setupArticleReaderUI();
    ensureNavCapsule();
    setupAdminLoginUI();
    updateActiveNavFromScroll();
    updateCapsuleFromScroll();
    setupBlogScrollHeights();
    updateBlogScroll();
    updateGlobalAvatarPosition();

    try {
      const saved = JSON.parse(localStorage.getItem('maxsui_profile_status') || 'null');
      if (saved && typeof saved === 'object') {
        if (saved.status) profileData.status = saved.status;
        if (saved.statusType) profileData.statusType = saved.statusType;
      }
    } catch (_) {}

    await resolveApiBase();
    await checkAdminSession();
    await fetchAllData();

    try {
      const catRes = await fetch(`${API_BASE_URL}/categories`, { credentials: 'include' });
      if (catRes.ok) {
        const catData = await catRes.json();
        if (Array.isArray(catData.categories)) renderThemeRail(catData.categories);
      }
    } catch (_) {}

    await bootPromise;

    setTimeout(() => {
      setupBlogScrollHeights();
      updateBlogScroll();
      updateGlobalAvatarPosition();
      updateCapsuleFromScroll();
    }, 500);
  }

  init();
})();