(function() {
  "use strict";

  // ==================== 配置区域 ====================
  // 请将此处替换为您的 Railway 后端地址
  const API_BASE_URL = 'https://你的Railway域名.up.railway.app/api';
  // =================================================

  // ---------- DOM 元素 ----------
  const nav = document.getElementById('mainNav');
  const scrollContainer = document.getElementById('scrollContainer');
  const sections = document.querySelectorAll('.panel');
  const navLinks = document.querySelectorAll('.nav-btn[data-section]');

  // ---------- 默认数据（API 失败时的占位） ----------
  const defaultProfile = {
    name: "隋修梁 MaxSui",
    age: 16,
    grade: "高一",
    bio: "热爱计算机底层与系统编程，熟悉 C / C# / C++，喜欢探索算法与图形学。",
    interests: ["C", "C#", "C++", "算法", "图形学"],
    avatar: null
  };

  const defaultBlogPosts = [
    {
      id: 1,
      title: "C++ 中的移动语义与完美转发",
      summary: "从拷贝到移动，理解现代C++的性能优化关键。",
      date: "2026-03-20",
      readTime: "8 min",
      icon: "fa-code"
    },
    {
      id: 2,
      title: "用 C# 实现一个简单游戏引擎",
      summary: "基于 MonoGame 的尝试，记录架构设计思路。",
      date: "2026-02-15",
      readTime: "12 min",
      icon: "fa-gamepad"
    },
    {
      id: 3,
      title: "C 语言实现内存池",
      summary: "从零构建一个轻量级内存分配器，适合嵌入式场景。",
      date: "2026-01-10",
      readTime: "10 min",
      icon: "fa-microchip"
    }
  ];

  const defaultWorks = [
    {
      id: 1,
      name: "作业展板",
      description: "HomeworkViewer — 一个用于展示作业项目集合的页面。",
      icon: "fa-chalkboard-user",
      link: "https://github.com/Suixiuliang/HomeworkViewer/"
    }
  ];

  // ---------- 全局状态 ----------
  let profileData = { ...defaultProfile };
  let blogPosts = [...defaultBlogPosts];
  let worksData = [...defaultWorks];
  let contactInfo = { email: '', wechat: '', qq: '' };

  // ---------- 导航栏滚动效果 ----------
  window.addEventListener('scroll', () => {
    nav.classList.toggle('scrolled', window.scrollY > 20);
  });

  // ---------- 水平滚动高亮联动 ----------
  function updateActiveNavFromScroll() {
    const scrollLeft = scrollContainer.scrollLeft;
    const containerWidth = scrollContainer.clientWidth;
    let activeIndex = 0;
    sections.forEach((section, index) => {
      const sectionLeft = section.offsetLeft;
      const sectionRight = sectionLeft + section.offsetWidth;
      const viewportCenter = scrollLeft + containerWidth / 2;
      if (viewportCenter >= sectionLeft && viewportCenter < sectionRight) {
        activeIndex = index;
      }
    });
    if (scrollLeft + containerWidth >= scrollContainer.scrollWidth - 5) {
      activeIndex = sections.length - 1;
    }
    const activeId = sections[activeIndex]?.getAttribute('id');
    navLinks.forEach(link => {
      link.classList.toggle('active', link.dataset.section === activeId);
    });
  }

  scrollContainer.addEventListener('scroll', updateActiveNavFromScroll);
  window.addEventListener('resize', updateActiveNavFromScroll);

  // ---------- 点击导航按钮平滑滚动 ----------
  navLinks.forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const targetId = link.getAttribute('href').substring(1);
      const targetSection = document.getElementById(targetId);
      if (targetSection) {
        scrollContainer.scrollTo({
          left: targetSection.offsetLeft,
          behavior: 'smooth'
        });
      }
    });
  });

  // ---------- 渲染个人主页资料 ----------
  function renderProfile() {
    const container = document.getElementById('profileContainer');
    const avatarContainer = document.getElementById('avatarContainer');
    const interestsStr = (profileData.interests || []).join(' · ');
    const avatarUrl = profileData.avatar;

    container.innerHTML = `
      <span class="hero-badge"><i class="fas fa-cog"></i> ${profileData.grade || '高中'} · ${profileData.age || ''}岁 · 热爱编程</span>
      <h1>
        <span class="hero-highlight">${profileData.name || '隋修梁 MaxSui'}</span><br>
        构建 · 思考 · 创造
      </h1>
      <p>${profileData.bio || ''}<br>技术栈：${interestsStr}</p>
      <div style="display: flex; gap: 16px; flex-wrap: wrap;">
        <a href="#works" class="nav-btn" style="background:#2563eb; color:white; border:none;"><i class="fas fa-arrow-down"></i> 查看作品</a>
        <a href="#contact" class="nav-btn"><i class="fas fa-comment"></i> 联系我</a>
      </div>
    `;

    if (avatarUrl) {
      avatarContainer.innerHTML = `
        <div class="avatar-circle">
          <img src="${avatarUrl}" alt="头像" style="width:100%; height:100%; object-fit:cover;">
        </div>
      `;
    } else {
      avatarContainer.innerHTML = `
        <div class="avatar-circle avatar-placeholder">
          <i class="fas fa-user-astronaut"></i>
        </div>
      `;
    }

    // 绑定主页内部按钮的横向跳转
    container.querySelectorAll('a[href^="#"]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const id = btn.getAttribute('href').substring(1);
        const target = document.getElementById(id);
        if (target) {
          scrollContainer.scrollTo({ left: target.offsetLeft, behavior: 'smooth' });
        }
      });
    });
  }

  // ---------- 渲染博客列表 ----------
  function renderBlog() {
    const grid = document.getElementById('blogGrid');
    if (!blogPosts.length) {
      grid.innerHTML = '<p class="loading-placeholder">暂无文章</p>';
      return;
    }
    let html = '';
    blogPosts.forEach(post => {
      html += `
        <article class="glass-card blog-card">
          <div class="blog-icon"><i class="fas ${post.icon || 'fa-pen'}"></i></div>
          <h3>${post.title}</h3>
          <p>${post.summary}</p>
          <div class="blog-meta">
            <span><i class="far fa-calendar"></i> ${post.date}</span>
            <span><i class="far fa-clock"></i> ${post.readTime}</span>
          </div>
          <a href="#" class="read-more" data-id="${post.id}">阅读全文 <i class="fas fa-arrow-right"></i></a>
        </article>
      `;
    });
    grid.innerHTML = html;

    grid.querySelectorAll('.read-more').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const postId = btn.dataset.id;
        // 博客跳转地址已改为 GitHub Pages 域名
        window.location.href = `https://suixiuliang.github.io/Blog/${postId}`;
      });
    });
  }

  // ---------- 渲染作品列表 ----------
  function renderWorks() {
    const grid = document.getElementById('worksGrid');
    if (!worksData.length) {
      grid.innerHTML = '<p class="loading-placeholder">暂无作品</p>';
      return;
    }
    let html = '';
    worksData.forEach(work => {
      html += `
        <div class="glass-card work-item">
          <div class="work-preview">
            <i class="fas ${work.icon || 'fa-code'}"></i>
          </div>
          <h3>${work.name}</h3>
          <p>${work.description}</p>
          <a href="${work.link}" target="_blank" class="work-link">查看项目 <i class="fas fa-external-link-alt"></i></a>
        </div>
      `;
    });
    grid.innerHTML = html;
  }

  // ---------- 联系方式口令验证 ----------
  function setupContactUnlock() {
    const displayArea = document.getElementById('contactDisplayArea');
    const unlockBtn = document.getElementById('unlockContactBtn');
    const passwordInput = document.getElementById('contactPasswordInput');

    function showContactDetails() {
      displayArea.innerHTML = `
        <div class="contact-method">
          <i class="fas fa-envelope"></i>
          <div><strong>电子邮箱</strong><br>${contactInfo.email || '未设置'}</div>
        </div>
        <div class="contact-method">
          <i class="fab fa-weixin"></i>
          <div><strong>微信</strong><br>${contactInfo.wechat || '未设置'}</div>
        </div>
        <div class="contact-method">
          <i class="fab fa-qq"></i>
          <div><strong>QQ</strong><br>${contactInfo.qq || '未设置'}</div>
        </div>
        <p style="margin-top: 1rem; font-size:0.9rem;"><i class="fas fa-shield"></i> 请注明来意，谢谢。</p>
      `;
    }

    async function unlockContact() {
      const password = passwordInput.value.trim();
      if (!password) {
        alert('请输入口令');
        return;
      }
      try {
        const res = await fetch(`${API_BASE_URL}/contact?password=${encodeURIComponent(password)}`);
        if (!res.ok) {
          if (res.status === 403) {
            alert('❌ 口令错误');
          } else {
            throw new Error('请求失败');
          }
          return;
        }
        contactInfo = await res.json();
        showContactDetails();
      } catch (err) {
        console.error('验证口令失败:', err);
        alert('网络错误，请稍后重试');
      }
    }

    unlockBtn.addEventListener('click', unlockContact);
    passwordInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') unlockBtn.click();
    });
  }

  // ---------- 留言表单模拟 ----------
  function setupMessageForm() {
    const form = document.getElementById('messageForm');
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      alert('✨ 留言已发送 (演示模式)。我会尽快回复！');
      form.reset();
    });
  }

  // ---------- API 数据获取 ----------
  async function fetchAllData() {
    try {
      const profileRes = await fetch(`${API_BASE_URL}/profile`);
      if (profileRes.ok) {
        const data = await profileRes.json();
        if (data && Object.keys(data).length) {
          profileData = { ...defaultProfile, ...data };
        }
      } else {
        console.warn('获取个人资料失败，使用默认数据');
      }
    } catch (err) {
      console.error('API 请求错误 (profile):', err);
    }

    try {
      const blogRes = await fetch(`${API_BASE_URL}/blog`);
      if (blogRes.ok) {
        const posts = await blogRes.json();
        if (Array.isArray(posts) && posts.length) {
          blogPosts = posts;
        }
      } else {
        console.warn('获取博客列表失败，使用默认数据');
      }
    } catch (err) {
      console.error('API 请求错误 (blog):', err);
    }

    try {
      const worksRes = await fetch(`${API_BASE_URL}/works`);
      if (worksRes.ok) {
        const works = await worksRes.json();
        if (Array.isArray(works) && works.length) {
          worksData = works;
        }
      } else {
        console.warn('获取作品列表失败，使用默认数据');
      }
    } catch (err) {
      console.error('API 请求错误 (works):', err);
    }

    renderProfile();
    renderBlog();
    renderWorks();
  }

  // ---------- 初始化 ----------
  async function init() {
    renderProfile();
    renderBlog();
    renderWorks();
    setupContactUnlock();
    setupMessageForm();
    updateActiveNavFromScroll();
    await fetchAllData();
  }

  init();
})();
