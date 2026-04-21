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

function _loadHtml2PDF() {
  return new Promise((resolve, reject) => {
    if (window.html2pdf) { resolve(); return; }
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js';
    s.onload = resolve; s.onerror = reject;
    document.head.appendChild(s);
  });
}

async function downloadPDF() {
  const panel = document.getElementById('share-panel');
  const opt = document.getElementById('sopt-pdf');
  panel.classList.remove('open');
  if (!finalArticle || opt.classList.contains('busy')) return;
  opt.classList.add('busy');
  opt.textContent = '📄 Building…';
  const btn = document.getElementById('share-btn');
  btn.textContent = '📄 PDF…';
  try {
    await _loadHtml2PDF();
    const el = _buildPDFElement(finalArticle);
    document.body.appendChild(el);
    const slug = (finalArticle.headline || 'fullchat')
      .toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40);
    await html2pdf().set({
      margin: 0,
      filename: 'fullchat-' + slug + '.pdf',
      image: { type: 'jpeg', quality: 0.92 },
      html2canvas: { scale: 2, useCORS: true, letterRendering: true, logging: false },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
      pagebreak: { mode: ['avoid-all', 'css'] }
    }).from(el).save();
    document.body.removeChild(el);
  } catch(e) {
    console.error('PDF failed:', e);
  } finally {
    opt.classList.remove('busy');
    opt.textContent = '📄 Download PDF';
    btn.textContent = '⬆ SHARE';
  }
}

function _buildPDFElement(a) {
  const p = PERSONAS[persona] || PERSONAS.provocateur;
  const c = p.color;
  const isComp = a.articleType === 'comparison';
  const cars = isComp ? (a.cars || []) : [a.car];
  const date = new Date().toLocaleDateString('en-GB', {
    day: 'numeric', month: 'long', year: 'numeric'
  });

  function stat(lbl, val) {
    if (!val) return '';
    return '<div style="flex:1;text-align:center;padding:16px 8px;border-right:1px solid #E0DAD3">'
      + '<div style="font-family:Barlow Condensed,sans-serif;font-weight:900;font-size:26px;color:' + c + ';line-height:1">' + val + '</div>'
      + '<div style="font-family:Barlow Condensed,sans-serif;font-size:10px;letter-spacing:2px;text-transform:uppercase;color:#888;margin-top:4px">' + lbl + '</div>'
      + '</div>';
  }

  function carBlock(car, i) {
    const s1 = stat(car.stat1_label || '', car.stat1_val || '');
    const s2 = stat(car.stat2_label || '', car.stat2_val || '');
    const s3 = stat(car.stat3_label || '', car.stat3_val || '');
    const stats = [s1, s2, s3].filter(Boolean).join('');
    const body = (car.fullReview || car.copy || '');
    const gen = [car.generation, (car.yearFrom && car.yearTo) ? car.yearFrom + '–' + car.yearTo : '']
      .filter(Boolean).join(' · ');

    let html = '';
    if (isComp) {
      html += '<div style="margin:32px 0 4px;font-family:Barlow Condensed,sans-serif;font-weight:900;font-size:11px;letter-spacing:4px;text-transform:uppercase;color:' + c + '">Option ' + (i + 1) + '</div>';
      html += '<div style="font-family:Barlow Condensed,sans-serif;font-weight:900;font-size:28px;color:#1A1A1A;line-height:1.1;margin-bottom:4px">' + car.make + ' ' + car.model + '</div>';
      html += '<div style="font-size:12px;color:#888;margin-bottom:16px">' + gen + '</div>';
    }
    if (stats) {
      html += '<div style="display:flex;border:1px solid #E0DAD3;border-radius:4px;margin:' + (isComp ? '12px' : '24px') + ' 0;overflow:hidden">'
        + stats + '<div style="flex:1;padding:16px 8px"></div></div>';
    }
    html += '<div style="font-size:13.5px;line-height:1.75;color:#2A2A2A;white-space:pre-wrap">' + body + '</div>';
    if (car.quote) {
      html += '<div style="margin:24px 0;padding:20px 24px;border-left:4px solid ' + c + ';background:#F9F6F2;font-family:Barlow Condensed,sans-serif;font-weight:700;font-size:17px;font-style:italic;color:#1A1A1A;line-height:1.4">"' + car.quote + '"</div>';
    }
    return html;
  }

  const divider = '<div style="height:1px;background:#E0DAD3;margin:32px 0"></div>';
  const introHtml = a.intro
    ? '<div style="font-size:15px;line-height:1.75;color:#1A1A1A;font-weight:500;margin-bottom:32px;padding-bottom:24px;border-bottom:1px solid #E0DAD3">' + a.intro + '</div>'
    : '';

  const wrap = document.createElement('div');
  wrap.style.cssText = 'position:fixed;left:-9999px;top:0;width:794px;background:#fff;font-family:Barlow,sans-serif';

  let html = '<div style="width:794px;background:#fff">';

  // Header
  html += '<div style="background:' + c + ';padding:20px 40px;display:flex;align-items:center;justify-content:space-between">'
    + '<div style="font-family:Barlow Condensed,sans-serif;font-weight:900;font-size:32px;letter-spacing:-1px;color:#fff">FULLCHAT</div>'
    + '<div style="font-family:Barlow Condensed,sans-serif;font-weight:700;font-size:10px;letter-spacing:4px;text-transform:uppercase;color:rgba(255,255,255,0.7)">' + p.label + ' · AI-POWERED MOTORING JOURNALISM</div>'
    + '</div>';

  // Hero
  html += '<div style="background:linear-gradient(135deg,' + c + '22 0%,#F5F0E8 100%);padding:48px 40px 40px">'
    + '<div style="font-family:Barlow Condensed,sans-serif;font-weight:700;font-size:10px;letter-spacing:4px;text-transform:uppercase;color:' + c + ';margin-bottom:14px">' + (isComp ? 'COMPARISON' : 'DEEP DIVE') + '</div>'
    + '<div style="font-family:Barlow Condensed,sans-serif;font-weight:900;font-size:42px;line-height:1.0;color:#1A1A1A;margin-bottom:14px">' + (a.headline || '') + '</div>'
    + '<div style="font-size:15px;color:#555;line-height:1.55;max-width:600px">' + (a.deck || '') + '</div>'
    + '</div>';

  // Byline
  html += '<div style="padding:10px 40px;border-bottom:2px solid #1A1A1A;border-top:2px solid #1A1A1A;display:flex;justify-content:space-between;align-items:center">'
    + '<div style="font-family:Barlow Condensed,sans-serif;font-weight:700;font-size:10px;letter-spacing:3px;text-transform:uppercase;color:#888">AI-Generated Feature · ' + p.name + '</div>'
    + '<div style="font-family:Barlow Condensed,sans-serif;font-size:10px;letter-spacing:2px;text-transform:uppercase;color:#BBB">' + date + '</div>'
    + '</div>';

  // Body
  html += '<div style="padding:32px 40px 48px">'
    + introHtml
    + cars.map((car, i) => carBlock(car, i)).join(divider)
    + '</div>';

  // Footer
  html += '<div style="background:#1A1A1A;padding:16px 40px;display:flex;align-items:center;justify-content:space-between">'
    + '<div style="font-family:Barlow Condensed,sans-serif;font-weight:900;font-size:16px;color:#F5F0E8">FULLCHAT</div>'
    + '<div style="font-family:Barlow Condensed,sans-serif;font-size:10px;letter-spacing:2px;color:#888;text-transform:uppercase">AI-Powered Motoring Journalism · Generated ' + date + '</div>'
    + '</div>';

  html += '</div>';
  wrap.innerHTML = html;
  return wrap;
}
