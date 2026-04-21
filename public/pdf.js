// ── PDF Export ────────────────────────────────────────────────────────────────
// Loaded on-demand. References globals: PERSONAS, persona, finalArticle,
// articleIntent, currentHistoryId from index.html

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

function downloadPDF() {
  const panel = document.getElementById('share-panel');
  panel.classList.remove('open');
  if (!finalArticle) return;

  const p = PERSONAS[persona] || PERSONAS.provocateur;
  const html = _buildPDFHtml(finalArticle, p);
  const win = window.open('', '_blank');
  win.document.write(html);
  win.document.close();
  // Give fonts a moment to load before triggering print
  win.onload = () => setTimeout(() => { win.focus(); win.print(); }, 600);
}

function _buildPDFHtml(a, p) {
  const c = p.color;
  const isComp = a.articleType === 'comparison';
  const cars = isComp ? (a.cars || []) : [a.car];
  const date = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

  function stat(lbl, val) {
    if (!val) return '';
    return `<div class="stat-cell">
      <div class="stat-val" style="color:${c}">${val}</div>
      <div class="stat-lbl">${lbl}</div>
    </div>`;
  }

  function carBlock(car, i) {
    const stats = [stat(car.stat1_label||'',car.stat1_val||''), stat(car.stat2_label||'',car.stat2_val||''), stat(car.stat3_label||'',car.stat3_val||'')].filter(Boolean).join('');
    const body = (car.fullReview || car.copy || '').replace(/\n/g, '<br>');
    const gen = [car.generation, (car.yearFrom&&car.yearTo) ? car.yearFrom+'–'+car.yearTo : ''].filter(Boolean).join(' · ');
    let html = '';
    if (isComp) {
      html += `<div class="opt-label" style="color:${c}">Option ${i+1}</div>
               <div class="car-name">${car.make} ${car.model}</div>
               <div class="car-gen">${gen}</div>`;
    }
    if (stats) html += `<div class="stats-row">${stats}<div class="stat-spacer"></div></div>`;
    html += `<div class="body-text">${body}</div>`;
    if (car.quote) html += `<div class="pull-quote" style="border-left-color:${c}">"${car.quote}"</div>`;
    return html;
  }

  const divider = '<div class="divider"></div>';
  const introHtml = a.intro ? `<div class="intro">${a.intro}</div>` : '';

  return `<!DOCTYPE html><html><head><meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:ital,wght@0,400;0,700;0,900;1,700&family=Barlow:wght@400;500&family=Playfair+Display:ital@1&display=swap" rel="stylesheet">
<title>${a.headline || 'FullChat'}</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box;}
  body{font-family:'Barlow',sans-serif;background:#fff;color:#1A1A1A;}
  @media print{
    @page{margin:0;size:A4;}
    body{-webkit-print-color-adjust:exact;print-color-adjust:exact;}
  }
  .header{background:${c};padding:20px 40px;display:flex;align-items:center;justify-content:space-between;}
  .header-logo{font-family:'Barlow Condensed',sans-serif;font-weight:900;font-size:32px;letter-spacing:-1px;color:#fff;}
  .header-sub{font-family:'Barlow Condensed',sans-serif;font-weight:700;font-size:10px;letter-spacing:4px;text-transform:uppercase;color:rgba(255,255,255,0.7);}
  .hero{background:linear-gradient(135deg,${c}33 0%,#F5F0E8 100%);padding:48px 40px 40px;}
  .hero-tag{font-family:'Barlow Condensed',sans-serif;font-weight:700;font-size:10px;letter-spacing:4px;text-transform:uppercase;color:${c};margin-bottom:14px;}
  .hero-title{font-family:'Barlow Condensed',sans-serif;font-weight:900;font-size:42px;line-height:1.0;color:#1A1A1A;margin-bottom:14px;}
  .hero-deck{font-size:15px;color:#555;line-height:1.55;max-width:600px;}
  .byline{padding:10px 40px;border-top:2px solid #1A1A1A;border-bottom:2px solid #1A1A1A;display:flex;justify-content:space-between;align-items:center;}
  .byline-l{font-family:'Barlow Condensed',sans-serif;font-weight:700;font-size:10px;letter-spacing:3px;text-transform:uppercase;color:#888;}
  .byline-r{font-family:'Barlow Condensed',sans-serif;font-size:10px;letter-spacing:2px;text-transform:uppercase;color:#BBB;}
  .body-wrap{padding:32px 40px 48px;}
  .intro{font-size:15px;line-height:1.75;color:#1A1A1A;font-weight:500;margin-bottom:32px;padding-bottom:24px;border-bottom:1px solid #E0DAD3;}
  .opt-label{font-family:'Barlow Condensed',sans-serif;font-weight:900;font-size:11px;letter-spacing:4px;text-transform:uppercase;margin-top:32px;margin-bottom:4px;}
  .car-name{font-family:'Barlow Condensed',sans-serif;font-weight:900;font-size:28px;color:#1A1A1A;line-height:1.1;margin-bottom:4px;}
  .car-gen{font-size:12px;color:#888;margin-bottom:16px;}
  .stats-row{display:flex;border:1px solid #E0DAD3;border-radius:4px;margin:24px 0;overflow:hidden;}
  .stat-cell{flex:1;text-align:center;padding:16px 8px;border-right:1px solid #E0DAD3;}
  .stat-val{font-family:'Barlow Condensed',sans-serif;font-weight:900;font-size:26px;line-height:1;}
  .stat-lbl{font-family:'Barlow Condensed',sans-serif;font-size:10px;letter-spacing:2px;text-transform:uppercase;color:#888;margin-top:4px;}
  .stat-spacer{flex:1;padding:16px 8px;}
  .body-text{font-size:13.5px;line-height:1.75;color:#2A2A2A;}
  .pull-quote{margin:24px 0;padding:20px 24px;border-left:4px solid;background:#F9F6F2;font-family:'Barlow Condensed',sans-serif;font-weight:700;font-size:17px;font-style:italic;color:#1A1A1A;line-height:1.4;}
  .divider{height:1px;background:#E0DAD3;margin:32px 0;}
  .footer{background:#1A1A1A;padding:16px 40px;display:flex;align-items:center;justify-content:space-between;}
  .footer-logo{font-family:'Barlow Condensed',sans-serif;font-weight:900;font-size:16px;color:#F5F0E8;}
  .footer-sub{font-family:'Barlow Condensed',sans-serif;font-size:10px;letter-spacing:2px;color:#888;text-transform:uppercase;}
</style>
</head><body>
<div class="header">
  <div class="header-logo">FULLCHAT</div>
  <div class="header-sub">${p.label} · AI-POWERED MOTORING JOURNALISM</div>
</div>
<div class="hero">
  <div class="hero-tag">${isComp ? 'COMPARISON' : 'DEEP DIVE'}</div>
  <div class="hero-title">${a.headline || ''}</div>
  <div class="hero-deck">${a.deck || ''}</div>
</div>
<div class="byline">
  <div class="byline-l">AI-Generated Feature · ${p.name}</div>
  <div class="byline-r">${date}</div>
</div>
<div class="body-wrap">
  ${introHtml}
  ${cars.map((car,i) => carBlock(car,i)).join(divider)}
</div>
<div class="footer">
  <div class="footer-logo">FULLCHAT</div>
  <div class="footer-sub">AI-Powered Motoring Journalism · Generated ${date}</div>
</div>
</body></html>`;
}
