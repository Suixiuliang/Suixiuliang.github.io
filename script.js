(function() {
  "use strict";

  const API_BASE_URL = 'https://maxsui-backbend-production.up.railway.app/api';

  const nav = document.getElementById('mainNav');
  const scrollContainer = document.getElementById('scrollContainer');
  const sections = document.querySelectorAll('.panel');
  const navLinks = document.querySelectorAll('.nav-btn[data-section]');

  const defaultProfile = {
    name: "MaxSui",
    age: 16,
    grade: "高二",
    bio: "热爱计算机底层与系统编程，熟悉 C / C# / C++，喜欢探索新的算法。",
    interests: ["C", "C#", "C++", "OIer", "Minecraft", "CR-中国铁路", "Airbus"],
    avatar: null
  };

  let profileData = { ...defaultProfile };
  let blogPosts = [];
  let worksData = [];

  let avatarClickCount = 0;
  let avatarClickTimer = null;

  // ========== 博客双阶段滚动状态 ==========
  const blogPanel = document.getElementById('blog');
  const blogContent = document.querySelector('.panel-blog-content');
  const blogCover = document.getElementById('blogCover');
  const blogWhiteBox = document.getElementById('blogWhiteBox');

  const STAGE1_RATIO = 1.0;
  let stage1Height = 0;
  let stage2Extra = 0;
  let isBlogActive = false;

  // 搜索与日历 DOM 绑定
  const blogSearchInput = document.getElementById('blogSearchInput');
  const calendarBtn = document.getElementById('calendarBtn');
  const calendarModal = document.getElementById('calendarModal');
  const closeCalendarBtn = document.getElementById('closeCalendarBtn');
  const blogDatePicker = document.getElementById('blogDatePicker');
  const searchByDateBtn = document.getElementById('searchByDateBtn');
  const clearDateBtn = document.getElementById('clearDateBtn');

  // 初始化日历和搜索交互
  function setupBlogToolbarInteractions() {
    if (calendarBtn && calendarModal) {
      calendarBtn.addEventListener('click', () => {
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
        const selectedDate = blogDatePicker.value; // 格式: YYYY-MM-DD
        if (!selectedDate) {
          alert('请先选择日期');
          return;
        }
        filterAndRenderBlogs('', selectedDate);
        calendarModal.classList.remove('active');
      });
    }

    if (clearDateBtn) {
      clearDateBtn.addEventListener('click', () => {
        if (blogDatePicker) blogDatePicker.value = '';
        if (blogSearchInput) blogSearchInput.value = '';
        filterAndRenderBlogs('', null);
        calendarModal.classList.remove('active');
      });
    }
  }

  // 过滤并渲染博客列表
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
        // 假设文章的 date 字段格式包含该日期或者匹配
        const postDate = (post.date || '').split(' ')[0]; // 提取 YYYY-MM-DD
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
          <a href="#" class="read-more" data-id="${post.id}">阅读全文 <i class="fas fa-arrow-right"></i></a>
        </article>
      `;
    });
    list.innerHTML = html;
    if (countEl) countEl.textContent = `${filtered.length} 篇文章`;

    list.querySelectorAll('.read-more').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        window.location.href = `https://suixiuliang.github.io/blog.html?id=${btn.dataset.id}`;
      });
    });

    requestAnimationFrame(() => {
      setupBlogScrollHeights();
      updateBlogScroll();
      updateGlobalAvatarPosition();
    });
  }

  // 🌟 彩蛋绑定至全局悬浮头像
  function setupAvatarSecret() {
    const globalAvatar = document.getElementById('globalAvatar');
    if (!globalAvatar) return;
    globalAvatar.addEventListener('click', () => {
      avatarClickCount++;
      clearTimeout(avatarClickTimer);
      if (avatarClickCount >= 10) {
        window.location.href = 'https://suixiuliang.github.io/backendmgr';
        avatarClickCount = 0;
      } else {
        avatarClickTimer = setTimeout(() => { avatarClickCount = 0; }, 2000);
      }
    });
  }

  // ========== 🌟 全局头像平滑插值引擎 ==========
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
    if (p < 0) p = 0;
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

  window.addEventListener('scroll', () => { nav.classList.toggle('scrolled', window.scrollY > 20); });

  let rafId = null;
  function updateActiveNavFromScroll() {
    if (rafId) cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(() => {
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
      
      navLinks.forEach(link => { link.classList.toggle('active', link.dataset.section === activeId); });

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

  scrollContainer.addEventListener('scroll', () => {
    updateActiveNavFromScroll();
    requestAnimationFrame(updateGlobalAvatarPosition);
  });

  window.addEventListener('resize', () => {
    updateActiveNavFromScroll();
    setupBlogScrollHeights();
    updateBlogScroll();
    updateGlobalAvatarPosition();
  });

  navLinks.forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const target = document.getElementById(link.getAttribute('href').substring(1));
      if (target) scrollContainer.scrollTo({ left: target.offsetLeft, behavior: 'smooth' });
    });
  });

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

  if (blogPanel) {
    blogPanel.addEventListener('scroll', () => {
      requestAnimationFrame(() => {
        updateBlogScroll();
        updateGlobalAvatarPosition();
      });
    }, { passive: true });
  }

  function renderProfile() {
    const container = document.getElementById('profileContainer');
    const avatarContainer = document.getElementById('avatarContainer');
    const globalAvatar = document.getElementById('globalAvatar');
    const interestsStr = (profileData.interests || []).join(' · ');
    const fullAvatarUrl = 'https://free.picui.cn/free/2026/08/11/6a7a7c74e04ca.jpg';
    
    container.innerHTML = `
      <span class="hero-badge"><i class="fas fa-cog"></i> ${profileData.grade || '高中'} · ${profileData.age || ''}岁 · 热爱编程</span>
      <h1><span class="hero-highlight">${profileData.name || '隋修梁 MaxSui'}</span><br>I Can, because I think I Can!</h1>
      <p>${profileData.bio || ''}<br>技术栈：${interestsStr}</p>
      <div style="display: flex; gap: 16px; flex-wrap: wrap;">
        <a href="#works" class="nav-btn" style="background:#2563eb; color:white; border:none; border-radius:40px; padding:0.6rem 1.2rem; text-decoration:none; display:inline-flex; align-items:center; gap:8px;"><i class="fas fa-arrow-down"></i> 查看作品</a>
        <a href="#contact" class="nav-btn" style="background:rgba(255,255,255,0.2); color:white; border:none; border-radius:40px; padding:0.6rem 1.2rem; text-decoration:none; display:inline-flex; align-items:center; gap:8px;"><i class="fas fa-comment"></i> 联系我</a>
      </div>
    `;
    
    avatarContainer.innerHTML = `<div class="avatar-circle-placeholder" id="homeAvatarPlaceholder"></div>`;
    
    if (fullAvatarUrl) {
      globalAvatar.innerHTML = `<img src="${fullAvatarUrl}" alt="头像" style="width:100%; height:100%; object-fit:cover;">`;
    } else {
      globalAvatar.innerHTML = `<i class="fas fa-user-astronaut" style="font-size: 5rem; color: #ffffff;"></i>`;
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

  function renderBlog() {
    filterAndRenderBlogs('', null);
  }

  function renderWorks() {
    const grid = document.getElementById('worksGrid');
    if (!worksData.length) { 
      worksData = [
        { name: "C# 综合控制台框架", description: "基于 C# 开发的轻量化终端调试管理与架构工具。", icon: "fa-terminal", link: "#" },
        { name: "图形学算法渲染演示", description: "探索基础光栅化与几何变换原理的简易引擎。", icon: "fa-cube", link: "#" },
        { name: "在线题解与博客系统", description: "用代码与文字记录高中阶段的技术思考。", icon: "fa-book-open", link: "#" }
      ];
    }
    let html = '';
    worksData.forEach(work => {
      html += `
        <div class="glass-card work-item">
          <div class="work-preview"><i class="fas ${work.icon || 'fa-code'}"></i></div>
          <h3>${work.name}</h3>
          <p>${work.description}</p>
          <a href="${work.link}" target="_blank" class="work-link">查看项目 <i class="fas fa-external-link-alt"></i></a>
        </div>
      `;
    });
    grid.innerHTML = html;
  }

  async function fetchAllData() {
    try {
      const profileRes = await fetch(`${API_BASE_URL}/profile`);
      if (profileRes.ok) { const data = await profileRes.json(); if (Object.keys(data).length) profileData = { ...defaultProfile, ...data }; }
    } catch (e) {}
    try {
      const blogRes = await fetch(`${API_BASE_URL}/blog`);
      if (blogRes.ok) { const posts = await blogRes.json(); if (Array.isArray(posts)) blogPosts = posts; }
    } catch (e) {}
    try {
      const worksRes = await fetch(`${API_BASE_URL}/works`);
      if (worksRes.ok) { const works = await worksRes.json(); if (Array.isArray(works) && works.length) worksData = works; }
    } catch (e) {}
    
    renderProfile(); renderBlog(); renderWorks();
  }

  async function init() {
    renderProfile();
    renderBlog();
    renderWorks();
    setupBlogToolbarInteractions();
    updateActiveNavFromScroll();
    setupBlogScrollHeights();
    updateBlogScroll();
    
    updateGlobalAvatarPosition();
    
    await fetchAllData();
    
    setTimeout(() => {
      setupBlogScrollHeights();
      updateBlogScroll();
      updateGlobalAvatarPosition();
    }, 500);
  }

  init();
})();
