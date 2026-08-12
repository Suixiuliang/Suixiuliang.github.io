(function() {
  "use strict";

  const API_BASE_URL = 'https://maxsui-api.maxsui.workers.dev/api';

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
    // QQ 风格状态：管理员在后台改 profile.status / profile.statusType
    // statusType: online | busy | away | offline | custom
    status: "在线",
    statusType: "online"
  };

  let profileData = { ...defaultProfile };
  let blogPosts = [];

  let avatarClickCount = 0;
  let avatarClickTimer = null;

  // 滑动胶囊：只动胶囊，导航栏外壳尺寸不变
  let navCapsule = null;
  let lastScrollLeft = 0;
  let lastScrollTime = performance.now();
  let capsuleScale = 1;
  let capsuleScaleVel = 0;
  let capsuleScaleRaf = null;
  let capsuleX = 0;
  let capsuleW = 0;
  let capsuleTargetX = 0;
  let capsuleTargetW = 0;
  let capsulePosVelX = 0;
  let capsulePosVelW = 0;
  let capsulePosRaf = null;
  const CAPSULE_SCALE_MAX = 1.12;
  const CAPSULE_SPRING_K = 220;
  const CAPSULE_SPRING_D = 16;
  const CAPSULE_POS_K = 280;
  const CAPSULE_POS_D = 22;

  // Apple 自定义日历状态
  let calCurrentDate = new Date();
  let calSelectedDateStr = null;

  // 博客双阶段滚动状态
  const blogPanel = document.getElementById('blog');
  const blogContent = document.querySelector('.panel-blog-content');
  const blogCover = document.getElementById('blogCover');
  const blogWhiteBox = document.getElementById('blogWhiteBox');

  const STAGE1_RATIO = 1.0;
  let stage1Height = 0;
  let stage2Extra = 0;
  let isBlogActive = false;

  // DOM 绑定
  const blogSearchInput = document.getElementById('blogSearchInput');
  const calendarBtn = document.getElementById('calendarBtn');
  const calendarModal = document.getElementById('calendarModal');
  const closeCalendarBtn = document.getElementById('closeCalendarBtn');
  const searchByDateBtn = document.getElementById('searchByDateBtn');
  const clearDateBtn = document.getElementById('clearDateBtn');

  // ========== Apple 风格自定义日历逻辑 ==========
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

  // 初始化博客工具栏与弹窗
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

  // 过滤并渲染博客
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
        const postDate = (post.date || '').split(' ')[0];
        matchesDate = postDate === dateStr;
      }
      return matchesKeyword && matchesDate;
    });

    if (!filtered.length) {
      list.innerHTML = '<p class="loading-placeholder">没有找到匹配的文章</p>';
      if (countEl) countEl.textContent = '0 篇文章';
      setupBlogScrollHeights();
      return;
    }

    let html = '';
    filtered.forEach(post => {
      html += `
        <article class="blog-card">
          <div class="blog-icon"><i class="fas ${post.icon || 'fa-pen'}"></i></div>
          <h3>${post.title || '无标题'}</h3>
          <p>${post.summary || post.content || ''}</p>
          <div class="blog-meta">
            <span><i class="far fa-calendar"></i> ${post.date || ''}</span>
            <span><i class="far fa-clock"></i> ${post.readTime || '3 min'}</span>
          </div>
          <a href="#" class="read-more" data-id="${post.slug || post.id}">阅读全文 <i class="fas fa-arrow-right"></i></a>
        </article>
      `;
    });
    list.innerHTML = html;
    if (countEl) countEl.textContent = `${filtered.length} 篇文章`;

    list.querySelectorAll('.read-more').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const idOrSlug = btn.dataset.id;
        window.location.href = `https://suixiuliang.github.io/blog.html?id=${encodeURIComponent(idOrSlug)}`;
      });
    });

    requestAnimationFrame(() => {
      setupBlogScrollHeights();
      updateBlogScroll();
      updateGlobalAvatarPosition();
    });
  }

  // ---------- 管理员登录（连点头像 7 次 → API Session 认证） ----------
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
    } catch (e) {
      console.warn('logout request failed', e);
    }
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

  function unlockAdminPanel(options = {}) {
    const { scrollToAdmin = true } = options;
    if (adminUnlocked) return;
    adminUnlocked = true;
    closeAdminLoginModal();

    // 导航最前面插入「管理员」
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

    // 内容区最前面插入管理员面板
    if (scrollContainer && !document.getElementById('admin')) {
      const section = document.createElement('section');
      section.id = 'admin';
      section.className = 'panel';
      section.innerHTML = `
        <div class="panel-content">
          <div class="section-title"><i class="fas fa-user-shield"></i><span>管理员</span></div>
          <div class="glass-card admin-panel-placeholder">
            <p>已登录管理员会话</p>
            <p style="margin-top:0.75rem;font-size:0.9rem;opacity:0.75;">后台功能可在此扩展（文章 / 文件管理等）</p>
            <div style="margin-top:1.5rem;">
              <button type="button" class="nav-btn apple-secondary-btn" id="adminLogoutBtn">
                <i class="fas fa-sign-out-alt"></i> 退出登录
              </button>
            </div>
          </div>
        </div>
      `;
      scrollContainer.insertBefore(section, scrollContainer.firstChild);
      const logoutBtn = section.querySelector('#adminLogoutBtn');
      if (logoutBtn) logoutBtn.addEventListener('click', adminLogout);
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
    } catch (e) {
      console.warn('auth/me check failed', e);
    }
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
          console.error(ex);
        } finally {
          if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = '登录'; }
        }
      });
    }
  }

  // 彩蛋：连点头像 7 次 → 管理员登录窗
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

  // 全局头像平滑过渡插值引擎
  function updateGlobalAvatarPosition() {
    const globalAvatar = document.getElementById('globalAvatar');
    const homePlaceholder = document.getElementById('homeAvatarPlaceholder');
    const blogPlaceholder = document.getElementById('coverAvatarPlaceholder');
    const worksPlaceholder = document.getElementById('worksAvatarPlaceholder');
    const contactPlaceholder = document.getElementById('contactAvatarPlaceholder');
    
    if (!globalAvatar || !homePlaceholder || !blogPlaceholder || !worksPlaceholder || !contactPlaceholder) return;
    
    const vw = scrollContainer.clientWidth;
    const scrollLeft = scrollContainer.scrollLeft;
    
    // 有管理员页时它在最前，头像插值从主页（第 2 屏）开始算
    let p = scrollLeft / vw;
    if (adminUnlocked) p = p - 1;
    if (p < 0) {
      // 在管理员页：头像淡出
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

  // ---------- 滑动胶囊：按滚动进度连续插值，不在按钮上卡顿 ----------
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

  // 按横向滚动进度，在相邻导航按钮之间连续插值位置与宽度
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
    // 连续进度：0 → 0, 末尾 → btns.length - 1
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

    // 线性插值，跟手不卡在按钮上
    capsuleX = x0 + (x1 - x0) * t;
    capsuleW = w0 + (w1 - w0) * t;
    applyCapsuleTransform();
  }

  function moveCapsuleToActive(immediate) {
    // 兼容：瞬时对齐到当前滚动位置
    updateCapsuleFromScroll();
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
    const inner = blogWhiteBox.querySelector('.white-box-inner');
    const contentH = inner ? Math.max(inner.offsetHeight || inner.scrollHeight, 500) : 600;
    const topMargin = 20;
    stage2Extra = Math.max(0, contentH + topMargin * 2 - vh + 60);
    blogContent.style.height = (vh + stage1Height + stage2Extra) + 'px';
  }

  function updateBlogScroll() {
    if (!blogPanel || !blogContent) return;
    const scrollTop = blogPanel.scrollTop;
    const vh = blogPanel.clientHeight || window.innerHeight;

    let p1 = Math.min(1, Math.max(0, scrollTop / (stage1Height || 1)));
    let p2 = scrollTop > stage1Height ? Math.min(1, (scrollTop - stage1Height) / (stage2Extra || 1)) : 0;

    const topMargin = 20;
    let desiredY = p1 < 1 ? (vh - topMargin) * (1 - p1) + topMargin : topMargin - (p2 * stage2Extra);
    blogWhiteBox.style.top = (scrollTop + desiredY) + 'px';

    const coverMove = p1 * (vh * 0.45);
    if (blogCover) {
      blogCover.style.top = (scrollTop - coverMove) + 'px';
      blogCover.style.opacity = Math.max(0, 1 - p1 * 1.1);
    }

    if (isBlogActive) {
      if (p1 > 0.08) {
        nav.classList.add('blog-mode');
      } else {
        nav.classList.remove('blog-mode');
      }
    }
  }

  // 博客滚动条：仅在滑动时显示
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

  // ========== 主页渲染（Hero + QQ 状态 + 兴趣必应） ==========
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

  // 渲染规定的三个作品卡片
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
    // 个人资料：新 API 暂无 /profile，保留默认 + 静默兼容旧接口
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

    // 文章列表：优先新 API GET /articles
    try {
      const blogRes = await fetch(`${API_BASE_URL}/articles?limit=50`, { credentials: 'include' });
      if (blogRes.ok) {
        const data = await blogRes.json();
        const list = Array.isArray(data) ? data : (data.articles || data.posts || []);
        if (Array.isArray(list) && list.length) {
          blogPosts = list.map(post => ({
            id: post.id ?? post.slug,
            title: post.title || '无标题',
            summary: post.excerpt || post.summary || '',
            content: post.content || '',
            date: (post.published_at || post.created_at || post.date || '').replace('T', ' ').slice(0, 16),
            readTime: post.reading_time ? `${post.reading_time} min` : (post.readTime || '3 min'),
            icon: post.icon || 'fa-pen',
            slug: post.slug
          }));
        }
      }
    } catch (e) {
      // 兼容旧 /blog
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

  async function init() {
    renderProfile();
    filterAndRenderBlogs('', null);
    renderWorks();
    setupBlogToolbarInteractions();
    ensureNavCapsule();
    setupAdminLoginUI();
    updateActiveNavFromScroll();
    updateCapsuleFromScroll();
    setupBlogScrollHeights();
    updateBlogScroll();
    
    updateGlobalAvatarPosition();
    
    // 恢复已有 Session（Cookie），再拉业务数据
    await checkAdminSession();
    await fetchAllData();
    
    setTimeout(() => {
      setupBlogScrollHeights();
      updateBlogScroll();
      updateGlobalAvatarPosition();
      updateCapsuleFromScroll();
    }, 500);
  }

  init();
})();
