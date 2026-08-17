/**
 * 博客文章列表渲染与事件绑定逻辑
 * 已集成 Reveal Highlight 鼠标坐标追踪，并保留原有读取逻辑
 */

function renderBlogPage(articles) {
  const list = document.getElementById('blog-list') || document.querySelector('.blog-list');
  if (!list) return;

  // 遍历所有博客卡片绑定事件
  const cards = list.querySelectorAll('.blog-card[data-id]');
  cards.forEach(card => {
    // 1. 实时监听鼠标移动，计算光线中心坐标 (Reveal Highlight)
    card.addEventListener('mousemove', (e) => {
      const rect = card.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      card.style.setProperty('--mouse-x', `${x}px`);
      card.style.setProperty('--mouse-y', `${y}px`);
    });

    // 2. 打开文章详情页逻辑
    const open = (e) => {
      if (e) e.preventDefault();
      const targetId = card.dataset.slug || card.dataset.id;
      if (typeof openArticleReader === 'function') {
        openArticleReader(targetId);
      }
    };

    // 绑定点击与键盘可访问性事件
    card.addEventListener('click', open);
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        open(e);
      }
    });
  });
}

// 导出或保留全局使用
if (typeof window !== 'undefined') {
  window.renderBlogPage = renderBlogPage;
}
