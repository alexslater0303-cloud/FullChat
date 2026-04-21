// ── Share Panel ───────────────────────────────────────────────────────────────

function toggleSharePanel() {
  if (!finalArticle) return;
  const panel = document.getElementById('share-panel');
  const isOpen = panel.classList.contains('open');
  panel.classList.toggle('open', !isOpen);
  if (!isOpen) {
    setTimeout(() => {
      const close = (e) => {
        if (!document.getElementById('share-wrap')?.contains(e.target)) {
          panel.classList.remove('open');
          document.removeEventListener('click', close);
        }
      };
      document.addEventListener('click', close);
    }, 0);
  }
}

async function copyShareLink() {
  const panel = document.getElementById('share-panel');
  const opt = document.getElementById('sopt-link');
  panel.classList.remove('open');
  if (!finalArticle || opt.classList.contains('busy')) return;
  opt.classList.add('busy');
  opt.textContent = '🔗 Saving…';
  try {
    let shareId = currentHistoryId;
    if (!shareId) {
      const r = await fetch('/api/share', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          inviteCode, persona,
          prompt: document.getElementById('p-input')?.value || '',
          depth,
          articleType: finalArticle.articleType || articleIntent,
          article: finalArticle,
        })
      });
      const j = await r.json();
      if (j.error || !j.id) throw new Error(j.error || 'no id');
      shareId = j.id;
    }
    const url = window.location.origin + '/?share=' + shareId;
    await navigator.clipboard.writeText(url);
    const btn = document.getElementById('share-btn');
    btn.textContent = '✓ COPIED';
    btn.classList.add('copied');
    setTimeout(() => { btn.textContent = '⬆ SHARE'; btn.classList.remove('copied'); }, 3000);
  } catch(e) {
    console.error('Share failed:', e.message);
  } finally {
    opt.classList.remove('busy');
    opt.textContent = '🔗 Copy Link';
  }
}
