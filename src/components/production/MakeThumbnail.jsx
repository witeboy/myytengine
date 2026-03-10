import React, { useState, useRef, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import {
  ArrowLeft, Upload, X, Sparkles, Loader2, Download,
  RefreshCw, Wand2, Users, Star, ChevronRight, Image as ImageIcon,
  CheckCircle, AlertCircle, Eye, Zap, Target, Palette
} from 'lucide-react';

// ═══════════════════════════════════════════════════════════════════════
// MOOD ENGINE — maps title+summary → visual DNA
// ═══════════════════════════════════════════════════════════════════════
const MOODS = {
  crime: {
    label: 'True Crime / Murder',
    emoji: '🔪',
    keywords: ['murder','kill','dead','crime','police','arrest','prison','victim','suspect','blood','killer','stalker','death','missing','body','shot','gun','court','trial','corpse','homicide','evidence','suspect'],
    bg: ['#0a0000','#1a0000','#2d0000'],
    accent: '#cc0000',
    accent2: '#ff3b30',
    textColor: '#fff',
    badgeBg: '#cc0000',
    titleFont: '"Impact", "Arial Black", sans-serif',
    titleShadow: '3px 3px 0 #000, 0 0 20px rgba(200,0,0,0.9)',
    overlayFilter: 'grayscale(55%) contrast(135%) brightness(0.75)',
    vignetteStrength: 0.92,
    bgStyle: 'radial-gradient(ellipse at 30% 50%, #3a0000 0%, #0a0000 60%, #000 100%)',
    decorElements: ['question_marks', 'police_tape', 'red_splatter'],
    textStroke: '2px',
    ctrBase: 9.1,
  },
  drama: {
    label: 'Drama / Conflict',
    emoji: '🎭',
    keywords: ['fight','drama','conflict','cheat','betray','secret','lie','explode','war','divorce','scandal','exposed','confrontation','shocking','angry','upset','hurt','crisis','revelation'],
    bg: ['#0d0d1a','#16213e','#0f3460'],
    accent: '#e94560',
    accent2: '#ffcc00',
    textColor: '#fff',
    badgeBg: '#e94560',
    titleFont: '"Arial Black", Impact, sans-serif',
    titleShadow: '3px 3px 0 #000, 0 0 25px rgba(233,69,96,0.7)',
    overlayFilter: 'saturate(140%) contrast(120%)',
    vignetteStrength: 0.75,
    bgStyle: 'linear-gradient(135deg, #0d0d1a 0%, #16213e 50%, #0f3460 100%)',
    decorElements: ['lightning_bolt', 'arrow', 'split_line'],
    textStroke: '2px',
    ctrBase: 8.8,
  },
  nollywood: {
    label: 'Nollywood / African',
    emoji: '🎬',
    keywords: ['nollywood','naija','nigeria','africa','yoruba','igbo','hausa','lagos','abuja','village','marriage','mother','father','husband','wife','tradition','domestic','sonia','bimbo','brodashaggi'],
    bg: ['#4a0a00','#8B0000','#FF6600'],
    accent: '#FFD700',
    accent2: '#ff4500',
    textColor: '#fff',
    badgeBg: '#FF4500',
    titleFont: '"Arial Black", Impact, sans-serif',
    titleShadow: '3px 3px 0 #000, 0 0 15px rgba(255,165,0,0.6)',
    overlayFilter: 'saturate(160%) contrast(120%)',
    vignetteStrength: 0.6,
    bgStyle: 'linear-gradient(135deg, #4a0a00 0%, #8B2500 30%, #c45200 60%, #e06000 100%)',
    decorElements: ['lightning_bolt', 'stars', 'bold_stripes'],
    textStroke: '3px',
    ctrBase: 8.6,
  },
  comedy: {
    label: 'Comedy / Challenge',
    emoji: '😂',
    keywords: ['funny','laugh','joke','comedy','prank','crazy','wild','hilarious','fun','challenge','lol','epic','fail','meme','skit','insane','unbelievable'],
    bg: ['#f7971e','#ffd200','#ff6b6b'],
    accent: '#ff3b30',
    accent2: '#000',
    textColor: '#000',
    badgeBg: '#ff3b30',
    titleFont: 'Impact, "Arial Black", sans-serif',
    titleShadow: '3px 3px 0 rgba(0,0,0,0.4)',
    overlayFilter: 'saturate(200%) brightness(1.1)',
    vignetteStrength: 0.2,
    bgStyle: 'linear-gradient(135deg, #f7971e 0%, #ffd200 50%, #ff9f43 100%)',
    decorElements: ['big_arrow', 'exclamation', 'bright_burst'],
    textStroke: '2px',
    ctrBase: 9.3,
  },
  finance: {
    label: 'Finance / Business',
    emoji: '💰',
    keywords: ['money','profit','income','rich','wealth','invest','business','startup','earn','salary','million','billion','dollar','$','revenue','growth','stock','crypto','passive'],
    bg: ['#0a0a0a','#0d2137','#0a1628'],
    accent: '#00d4aa',
    accent2: '#ffd700',
    textColor: '#fff',
    badgeBg: '#00d4aa',
    titleFont: '"Arial Black", "Helvetica Neue", sans-serif',
    titleShadow: '2px 2px 0 #000, 0 0 20px rgba(0,212,170,0.5)',
    overlayFilter: 'contrast(115%) brightness(0.9)',
    vignetteStrength: 0.65,
    bgStyle: 'radial-gradient(ellipse at 20% 80%, #0d2137 0%, #0a0a0a 70%)',
    decorElements: ['money_symbols', 'upward_arrow', 'data_bars'],
    textStroke: '1px',
    ctrBase: 8.5,
  },
  inspirational: {
    label: 'Motivational / Life',
    emoji: '✨',
    keywords: ['success','motivation','inspire','dream','goal','achieve','win','champion','mindset','transformation','change','better','power','hustle','grind','journey','growth'],
    bg: ['#667eea','#764ba2','#f093fb'],
    accent: '#ffd700',
    accent2: '#fff',
    textColor: '#fff',
    badgeBg: '#ffd700',
    titleFont: '"Arial Black", Impact, sans-serif',
    titleShadow: '2px 2px 8px rgba(0,0,0,0.6)',
    overlayFilter: 'saturate(130%)',
    vignetteStrength: 0.3,
    bgStyle: 'linear-gradient(135deg, #667eea 0%, #764ba2 50%, #f093fb 100%)',
    decorElements: ['glow_rays', 'stars', 'gradient_burst'],
    textStroke: '1px',
    ctrBase: 8.4,
  },
  educational: {
    label: 'Educational / Explainer',
    emoji: '📚',
    keywords: ['how','why','what','learn','explain','guide','tutorial','secret','truth','science','history','fact','know','understand','discover','reveal','proof','real'],
    bg: ['#1e3c72','#2a5298','#1565c0'],
    accent: '#00b4d8',
    accent2: '#fff',
    textColor: '#fff',
    badgeBg: '#00b4d8',
    titleFont: '"Arial Black", "Helvetica Neue", sans-serif',
    titleShadow: '2px 2px 4px rgba(0,0,0,0.8)',
    overlayFilter: 'contrast(115%)',
    vignetteStrength: 0.55,
    bgStyle: 'linear-gradient(160deg, #1e3c72 0%, #2a5298 60%, #1565c0 100%)',
    decorElements: ['numbered_badge', 'arrows', 'info_elements'],
    textStroke: '1px',
    ctrBase: 8.2,
  },
};

// ═══════════════════════════════════════════════════════════════════════
// TEMPLATE DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════
const TEMPLATES = [
  {
    id: 'split_reaction',
    name: 'Split Reaction',
    desc: 'Two characters split by a bold divider — the classic drama/reaction format used by top creators',
    layout: 'split',
    chars: 2,
    textPos: 'bottom_bar',
    badgePos: 'top_right',
    arrow: true,
    bestFor: ['drama','crime','nollywood'],
    ctrBonus: 0.4,
    preview: '◧◨',
  },
  {
    id: 'hero_dominant',
    name: 'Hero Dominant',
    desc: 'Single character fills 70% of frame with bold title text — cinematic & powerful',
    layout: 'hero',
    chars: 1,
    textPos: 'bottom_gradient',
    badgePos: 'top_right',
    arrow: false,
    bestFor: ['inspirational','finance','educational'],
    ctrBonus: 0.2,
    preview: '⬜',
  },
  {
    id: 'movie_poster',
    name: 'Movie Poster',
    desc: 'Cinematic multi-character poster layout — like Nollywood & Netflix thumbnails',
    layout: 'poster',
    chars: 3,
    textPos: 'center_bold',
    badgePos: 'top_left',
    arrow: false,
    bestFor: ['nollywood','drama','crime'],
    ctrBonus: 0.3,
    preview: '⊞',
  },
  {
    id: 'versus',
    name: 'Versus',
    desc: 'Two worlds in conflict — dramatic contrast between characters/situations',
    layout: 'versus',
    chars: 2,
    textPos: 'bottom_bar',
    badgePos: 'center',
    arrow: false,
    bestFor: ['drama','comedy','nollywood'],
    ctrBonus: 0.35,
    preview: '⚡',
  },
  {
    id: 'closeup_shock',
    name: 'Close-Up Shock',
    desc: 'One massive face dominating with bold reaction text — highest CTR format',
    layout: 'closeup',
    chars: 1,
    textPos: 'bottom_bar',
    badgePos: 'top_left',
    arrow: false,
    bestFor: ['comedy','drama','crime'],
    ctrBonus: 0.5,
    preview: '😱',
  },
  {
    id: 'documentary',
    name: 'Documentary',
    desc: 'Multi-photo collage with police/crime tape feel — perfect for true crime',
    layout: 'documentary',
    chars: 2,
    textPos: 'diagonal_text',
    badgePos: 'top_bar',
    arrow: true,
    bestFor: ['crime','educational','drama'],
    ctrBonus: 0.25,
    preview: '🎞',
  },
];

const OVERLAY_SUGGESTIONS = {
  crime:         ['THE TRUTH', 'CAUGHT!', 'EXPOSED', '?', 'HE LIED', 'SHE KNEW'],
  drama:         ['SHOCKING!', 'BETRAYED!', 'IT EXPLODES', 'THE SECRET', 'SHE KNOWS'],
  nollywood:     ['EXPLODES!', 'THE TRUTH', 'SHOCKING!', 'BETRAYAL!', 'REVEALED'],
  comedy:        ['INSANE! 😭', 'NO WAY!', 'EPIC FAIL', 'WAIT FOR IT', 'I TRIED 😂'],
  finance:       ['$1,000,000', '+500%', 'IT WORKS!', 'HOW?', 'THE TRUTH'],
  inspirational: ['IT CHANGED', 'THE SECRET', 'WATCH THIS', '1 YEAR LATER', 'THE MINDSET'],
  educational:   ['THE TRUTH', 'NOBODY SAYS', 'REVEALED', 'PROOF', 'WHY?'],
};

// ═══════════════════════════════════════════════════════════════════════
// MOOD DETECTOR
// ═══════════════════════════════════════════════════════════════════════
function detectMood(title, summary) {
  const text = `${title} ${summary}`.toLowerCase();
  const scores = {};
  for (const [mood, data] of Object.entries(MOODS)) {
    scores[mood] = data.keywords.filter(kw => text.includes(kw)).length;
  }
  if (/bimbo|sonia|kunle|brodashaggi|naija|yoruba|igbo|woli|shaggi/.test(text)) scores.nollywood += 6;
  if (/\$[0-9]|[0-9]k\/|per month|passive income/.test(text)) scores.finance += 4;
  if (/murder|kill|blood|victim|stalker/.test(text)) scores.crime += 5;
  const best = Object.entries(scores).sort((a,b) => b[1]-a[1])[0];
  return best[1] > 0 ? best[0] : 'drama';
}

// ═══════════════════════════════════════════════════════════════════════
// CANVAS THUMBNAIL RENDERER
// Full pixel-perfect rendering that mirrors how real thumbnails look
// ═══════════════════════════════════════════════════════════════════════
function ThumbnailCanvas({ mood, template, chars, title, overlayText, width = 640, height = 360, className = '' }) {
  const canvasRef = useRef(null);
  const profile = MOODS[mood] || MOODS.drama;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const W = canvas.width;
    const H = canvas.height;

    ctx.clearRect(0, 0, W, H);

    // ── 1. Background gradient ──────────────────────────────────
    const bgColors = profile.bg;
    if (template.layout === 'split' || template.layout === 'versus') {
      // Left half
      const lgL = ctx.createLinearGradient(0, 0, W/2, H);
      lgL.addColorStop(0, bgColors[0]);
      lgL.addColorStop(1, bgColors[1]);
      ctx.fillStyle = lgL;
      ctx.fillRect(0, 0, W/2, H);
      // Right half — different shade
      const lgR = ctx.createLinearGradient(W/2, 0, W, H);
      lgR.addColorStop(0, bgColors[1]);
      lgR.addColorStop(1, bgColors[2] || bgColors[0]);
      ctx.fillStyle = lgR;
      ctx.fillRect(W/2, 0, W/2, H);
    } else {
      const grad = ctx.createLinearGradient(0, 0, W, H);
      grad.addColorStop(0, bgColors[0]);
      grad.addColorStop(0.5, bgColors[1]);
      grad.addColorStop(1, bgColors[2] || bgColors[0]);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, W, H);
    }

    // ── 2. Draw characters ─────────────────────────────────────
    const drawChar = (img, x, y, w, h, flip = false) => {
      ctx.save();
      if (flip) {
        ctx.translate(x + w, y);
        ctx.scale(-1, 1);
        ctx.drawImage(img, 0, 0, w, h);
      } else {
        ctx.drawImage(img, x, y, w, h);
      }
      ctx.restore();
    };

    const charImages = chars.filter(Boolean).map(c => {
      if (!c?.url) return null;
      const img = new Image();
      img.src = c.processed || c.url;
      return img;
    });

    let imagesLoaded = 0;
    const totalImages = charImages.filter(Boolean).length;

    const renderAfterImages = () => {
      // ── 3. Decorative elements ──────────────────────────────

      // Split line
      if (template.layout === 'split' || template.layout === 'versus') {
        ctx.save();
        ctx.strokeStyle = profile.accent;
        ctx.lineWidth = 4;
        ctx.shadowColor = profile.accent;
        ctx.shadowBlur = 16;
        ctx.beginPath();
        ctx.moveTo(W/2, 0);
        ctx.lineTo(W/2, H);
        ctx.stroke();
        ctx.restore();
      }

      // Arrow (drama/split layouts)
      if (template.arrow && template.layout === 'split') {
        ctx.save();
        ctx.fillStyle = '#ff0000';
        ctx.shadowColor = '#ff0000';
        ctx.shadowBlur = 12;
        // Draw arrow pointing right-upward
        const ax = W*0.44, ay = H*0.42, aw = W*0.12, ah = H*0.12;
        ctx.translate(ax + aw/2, ay + ah/2);
        ctx.rotate(-0.5);
        ctx.beginPath();
        ctx.moveTo(-aw/2, ah/4);
        ctx.lineTo(aw/4, ah/4);
        ctx.lineTo(aw/4, -ah/2);
        ctx.lineTo(aw/2, 0);
        ctx.lineTo(aw/4, ah/2);
        ctx.lineTo(aw/4, ah/4);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }

      // Question marks for crime
      if (mood === 'crime') {
        ctx.save();
        ctx.font = `bold ${H*0.35}px Arial Black`;
        ctx.fillStyle = 'rgba(255,255,255,0.12)';
        ctx.fillText('?', W*0.42, H*0.65);
        ctx.font = `bold ${H*0.22}px Arial Black`;
        ctx.fillStyle = 'rgba(200,0,0,0.25)';
        ctx.fillText('?', W*0.52, H*0.45);
        ctx.restore();
      }

      // Lightning bolt for nollywood/drama
      if ((mood === 'nollywood' || mood === 'drama') && template.layout !== 'hero') {
        ctx.save();
        ctx.font = `${H*0.2}px sans-serif`;
        ctx.fillText('⚡', W*0.47, H*0.22);
        ctx.restore();
      }

      // ── 4. Vignette ──────────────────────────────────────────
      const vigStrength = profile.vignetteStrength;
      const vig = ctx.createRadialGradient(W/2, H/2, H*0.25, W/2, H/2, W*0.75);
      vig.addColorStop(0, 'rgba(0,0,0,0)');
      vig.addColorStop(1, `rgba(0,0,0,${vigStrength})`);
      ctx.fillStyle = vig;
      ctx.fillRect(0, 0, W, H);

      // ── 5. Bottom gradient for text ──────────────────────────
      const textGrad = ctx.createLinearGradient(0, H*0.55, 0, H);
      textGrad.addColorStop(0, 'rgba(0,0,0,0)');
      textGrad.addColorStop(0.4, 'rgba(0,0,0,0.7)');
      textGrad.addColorStop(1, 'rgba(0,0,0,0.97)');
      ctx.fillStyle = textGrad;
      ctx.fillRect(0, H*0.55, W, H*0.45);

      // ── 6. Title text ────────────────────────────────────────
      const titleText = (title || 'YOUR TITLE HERE').toUpperCase();
      const titleSize = Math.max(H * 0.095, Math.min(H * 0.13, H * (1.8 / Math.max(titleText.length, 10))));

      ctx.save();
      ctx.font = `900 ${titleSize}px ${profile.titleFont}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';

      // Shadow layers
      ctx.shadowColor = 'rgba(0,0,0,1)';
      ctx.shadowBlur = 20;
      ctx.shadowOffsetX = 3;
      ctx.shadowOffsetY = 3;

      // White stroke outline
      ctx.strokeStyle = '#000';
      ctx.lineWidth = titleSize * 0.08;
      ctx.lineJoin = 'round';
      ctx.strokeText(titleText, W/2, H - H*0.04);

      ctx.fillStyle = profile.textColor;
      ctx.fillText(titleText, W/2, H - H*0.04);
      ctx.restore();

      // ── 7. Overlay badge text ────────────────────────────────
      if (overlayText) {
        const badgeText = overlayText.toUpperCase();
        const badgeSize = H * 0.085;
        ctx.save();
        ctx.font = `900 ${badgeSize}px ${profile.titleFont}`;
        const badgeW = ctx.measureText(badgeText).width + badgeSize * 0.8;
        const badgeH = badgeSize * 1.5;
        const bx = W - badgeW - W*0.03;
        const by = H*0.06;

        // Badge background
        ctx.fillStyle = profile.badgeBg;
        ctx.shadowColor = 'rgba(0,0,0,0.6)';
        ctx.shadowBlur = 12;

        // Slightly rotated badge
        ctx.save();
        ctx.translate(bx + badgeW/2, by + badgeH/2);
        ctx.rotate(-0.035);
        ctx.fillRect(-badgeW/2, -badgeH/2, badgeW, badgeH);

        ctx.shadowBlur = 0;
        ctx.fillStyle = '#fff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.strokeStyle = 'rgba(0,0,0,0.4)';
        ctx.lineWidth = 2;
        ctx.strokeText(badgeText, 0, 0);
        ctx.fillText(badgeText, 0, 0);
        ctx.restore();
        ctx.restore();
      }
    };

    // Draw characters with layout
    const layoutAndDrawChars = (loadedImages) => {
      const validImgs = loadedImages.filter(Boolean);

      if (template.layout === 'split' || template.layout === 'versus') {
        if (validImgs[0]) {
          // Left char
          const targetH = H * 1.05;
          const targetW = targetH * (validImgs[0].naturalWidth / validImgs[0].naturalHeight);
          drawChar(validImgs[0], -targetW*0.05, -H*0.05, targetW, targetH);
        }
        if (validImgs[1]) {
          // Right char — position from right
          const targetH = H * 1.05;
          const targetW = targetH * (validImgs[1].naturalWidth / validImgs[1].naturalHeight);
          const xPos = W - targetW * 0.95;
          drawChar(validImgs[1], xPos, -H*0.05, targetW, targetH, true);
        }
      } else if (template.layout === 'hero' || template.layout === 'closeup') {
        if (validImgs[0]) {
          const targetH = H * (template.layout === 'closeup' ? 1.15 : 1.05);
          const targetW = targetH * (validImgs[0].naturalWidth / validImgs[0].naturalHeight);
          const xPos = (W - targetW) / 2;
          drawChar(validImgs[0], xPos, -H*0.08, targetW, targetH);
        }
      } else if (template.layout === 'poster') {
        const imgs = validImgs.slice(0, 3);
        if (imgs[0]) {
          const h = H*0.9; const w = h*(imgs[0].naturalWidth/imgs[0].naturalHeight);
          drawChar(imgs[0], -w*0.08, H*0.1, w, h);
        }
        if (imgs[2]) {
          const h = H*0.9; const w = h*(imgs[2].naturalWidth/imgs[2].naturalHeight);
          drawChar(imgs[2], W - w*0.92, H*0.1, w, h, true);
        }
        if (imgs[1]) {
          const h = H*1.0; const w = h*(imgs[1].naturalWidth/imgs[1].naturalHeight);
          const xPos = (W - w) / 2;
          drawChar(imgs[1], xPos, -H*0.03, w, h);
        }
      } else if (template.layout === 'documentary') {
        if (validImgs[0]) {
          const h = H*0.85; const w = h*(validImgs[0].naturalWidth/validImgs[0].naturalHeight);
          ctx.save();
          ctx.globalAlpha = 0.85;
          drawChar(validImgs[0], W*0.02, H*0.05, w*0.85, h);
          ctx.restore();
        }
        if (validImgs[1]) {
          const h = H*0.55; const w = h*(validImgs[1].naturalWidth/validImgs[1].naturalHeight);
          ctx.save();
          ctx.globalAlpha = 0.9;
          ctx.translate(W*0.55+w*0.5, H*0.25+h*0.5);
          ctx.rotate(0.03);
          ctx.drawImage(validImgs[1], -w*0.5, -h*0.5, w, h);
          ctx.restore();
        }
      }

      renderAfterImages();
    };

    if (totalImages === 0) {
      // No images — draw placeholder silhouettes
      const drawSilhouette = (x, w) => {
        ctx.save();
        ctx.fillStyle = `${profile.accent}22`;
        ctx.strokeStyle = `${profile.accent}55`;
        ctx.lineWidth = 2;
        ctx.setLineDash([8, 4]);
        const h = H * 0.75;
        const y = H - h;
        // Head
        const headR = w * 0.18;
        ctx.beginPath();
        ctx.arc(x + w/2, y + headR*1.2, headR, 0, Math.PI*2);
        ctx.fill();
        ctx.stroke();
        // Body
        ctx.fillRect(x + w*0.2, y + headR*2.8, w*0.6, h*0.5);
        ctx.strokeRect(x + w*0.2, y + headR*2.8, w*0.6, h*0.5);
        ctx.restore();
      };

      if (template.layout === 'split' || template.layout === 'versus') {
        drawSilhouette(W*0.02, W*0.44);
        drawSilhouette(W*0.54, W*0.44);
      } else if (template.layout === 'poster') {
        drawSilhouette(W*0.02, W*0.28);
        drawSilhouette(W*0.36, W*0.28);
        drawSilhouette(W*0.70, W*0.28);
      } else {
        drawSilhouette(W*0.2, W*0.6);
      }
      renderAfterImages();
      return;
    }

    // Load images then draw
    const loaded = new Array(charImages.length).fill(null);
    charImages.forEach((img, i) => {
      if (!img) { imagesLoaded++; if (imagesLoaded === totalImages) layoutAndDrawChars(loaded); return; }
      img.onload = () => {
        loaded[i] = img;
        imagesLoaded++;
        if (imagesLoaded === totalImages) layoutAndDrawChars(loaded);
      };
      img.onerror = () => {
        imagesLoaded++;
        if (imagesLoaded === totalImages) layoutAndDrawChars(loaded);
      };
      if (img.complete && img.naturalWidth) {
        loaded[i] = img;
        imagesLoaded++;
        if (imagesLoaded === totalImages) layoutAndDrawChars(loaded);
      }
    });
  }, [mood, template, chars, title, overlayText, width, height]);

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      className={className}
      style={{ width: '100%', height: 'auto', borderRadius: 10, display: 'block' }}
    />
  );
}

// ═══════════════════════════════════════════════════════════════════════
// CHARACTER UPLOAD SLOT
// ═══════════════════════════════════════════════════════════════════════
function CharSlot({ index, label, char, onUpload, onRemove }) {
  const ref = useRef(null);
  return (
    <div
      onClick={() => !char && ref.current?.click()}
      style={{
        border: char ? '2px solid #7c3aed' : '2px dashed #374151',
        borderRadius: 12, overflow: 'hidden', aspectRatio: '3/4',
        background: char ? '#000' : '#0f172a', cursor: char ? 'default' : 'pointer',
        position: 'relative', transition: 'border-color 0.2s',
      }}
    >
      <input ref={ref} type="file" accept="image/*" style={{ display: 'none' }}
        onChange={e => { const f = e.target.files?.[0]; if (f) onUpload(index, f); }} />
      {char ? (
        <>
          <img src={char.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          <button onClick={e => { e.stopPropagation(); onRemove(index); }}
            style={{ position: 'absolute', top: 6, right: 6, width: 26, height: 26, borderRadius: '50%', background: 'rgba(0,0,0,0.75)', border: 'none', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <X size={13} />
          </button>
          <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: 'linear-gradient(to top,rgba(0,0,0,0.9),transparent)', padding: '18px 8px 6px', fontSize: 11, color: '#ccc', textAlign: 'center' }}>
            {label}
          </div>
        </>
      ) : (
        <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, color: '#4b5563' }}>
          <Upload size={24} />
          <div style={{ fontSize: 12, textAlign: 'center', lineHeight: 1.4 }}>
            <div style={{ color: '#6b7280', fontWeight: 600 }}>{label}</div>
            <div style={{ color: '#374151', fontSize: 10 }}>Click to upload</div>
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// STEP INDICATOR
// ═══════════════════════════════════════════════════════════════════════
function StepDots({ current, total }) {
  return (
    <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginBottom: 28 }}>
      {Array.from({ length: total }, (_, i) => (
        <div key={i} style={{
          width: i === current ? 24 : 8, height: 8, borderRadius: 4,
          background: i === current ? '#7c3aed' : i < current ? '#4c1d95' : '#1f2937',
          transition: 'all 0.3s',
        }} />
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════
export default function MakeThumbnail({ onBack }) {
  const [step, setStep] = useState(0); // 0=setup 1=templates 2=generating 3=result
  const [title, setTitle] = useState('');
  const [summary, setSummary] = useState('');
  const [overlayText, setOverlayText] = useState('');
  const [charCount, setCharCount] = useState(2);
  const [chars, setChars] = useState([null, null, null]);
  const [mood, setMood] = useState(null);
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [aiAnalysis, setAiAnalysis] = useState(null);
  const [loading, setLoading] = useState(false);
  const [generatedUrl, setGeneratedUrl] = useState(null);
  const [error, setError] = useState(null);
  const resultCanvasRef = useRef(null);

  const profile = MOODS[mood || 'drama'];

  const handleCharCount = (n) => {
    setCharCount(n);
    setChars(prev => {
      const a = [...prev]; while (a.length < 3) a.push(null);
      return a;
    });
  };

  const handleUpload = (i, file) => {
    const url = URL.createObjectURL(file);
    setChars(prev => { const a = [...prev]; a[i] = { file, url, name: file.name }; return a; });
  };

  const handleRemove = (i) => {
    setChars(prev => { const a = [...prev]; a[i] = null; return a; });
  };

  // Step 0 → 1: Analyse
  const handleAnalyse = async () => {
    if (!title.trim()) return;
    setLoading(true);
    setError(null);
    const detectedMood = detectMood(title, summary);
    setMood(detectedMood);

    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          max_tokens: 500,
          system: `You are a world-class YouTube thumbnail strategist with deep knowledge of what drives clicks. Analyse the video title and summary, return ONLY valid JSON with no markdown:
{
  "mood": "crime|drama|nollywood|comedy|finance|inspirational|educational",
  "moodReason": "one sentence",
  "overlayOptions": ["3-4 ALL CAPS options, max 3 words each"],
  "bestTemplate": "split_reaction|hero_dominant|movie_poster|versus|closeup_shock|documentary",
  "templateReason": "one sentence",
  "ctrTips": ["tip 1", "tip 2"]
}`,
          messages: [{ role: 'user', content: `Title: "${title}"\nSummary: "${summary || 'none'}"` }],
        }),
      });
      const data = await response.json();
      const text = data.content?.[0]?.text || '{}';
      const parsed = JSON.parse(text.replace(/```json|```/g, '').trim());
      setAiAnalysis(parsed);
      if (parsed.mood && MOODS[parsed.mood]) setMood(parsed.mood);
      if (parsed.overlayOptions?.[0]) setOverlayText(parsed.overlayOptions[0]);
      const rec = TEMPLATES.find(t => t.id === parsed.bestTemplate);
      if (rec) setSelectedTemplate(rec);
    } catch {
      // Fallback local
      setAiAnalysis({ overlayOptions: OVERLAY_SUGGESTIONS[detectedMood] || [] });
      const rec = TEMPLATES.find(t => t.bestFor.includes(detectedMood));
      if (rec) setSelectedTemplate(rec);
      if (OVERLAY_SUGGESTIONS[detectedMood]?.[0]) setOverlayText(OVERLAY_SUGGESTIONS[detectedMood][0]);
    }

    setLoading(false);
    setStep(1);
  };

  // Step 1 → 3: Generate
  const handleGenerate = async () => {
    if (!selectedTemplate) return;
    setStep(2);
    setLoading(true);
    setError(null);
    setGeneratedUrl(null);

    const moodProfile = MOODS[mood] || MOODS.drama;
    const uploadedChars = chars.filter(Boolean).slice(0, charCount);

    // Build detailed Ideogram prompt
    const moodVisuals = {
      crime: 'dark desaturated grayscale color grade, deep crimson red accents, dramatic noir shadows, high contrast, police investigation aesthetic',
      drama: 'intense blue-dark gradient background, vivid emotional contrast, dramatic studio lighting, cinematic color grade',
      nollywood: 'vibrant rich saturated African movie poster, warm amber-orange-gold tones, bold cinematic Nigerian film style, high energy',
      comedy: 'explosive bright yellow-orange gradient, high saturation pop-art energy, maximum contrast, playful bold colors',
      finance: 'sleek dark tech background, emerald green money accents, professional clean aesthetic, subtle gold highlights',
      inspirational: 'beautiful purple-gold gradient, radiant light rays, uplifting warm glow, premium cinematic feel',
      educational: 'deep blue academic background, clean white accents, clear informational layout, professional look',
    };

    const layoutPrompts = {
      split_reaction: 'two people split vertically down the center of frame, one on each side, both facing slightly inward, dramatic lighting separating them',
      hero_dominant: 'single person filling 65% of frame, centered, looking directly at camera with strong expression',
      movie_poster: 'movie poster arrangement, main character large in center, two flanking characters slightly smaller on each side',
      versus: 'two people on opposite sides of frame facing each other, tension between them, bold contrast',
      closeup_shock: 'extreme close-up of one face filling 80% of frame, exaggerated shocked or dramatic expression',
      documentary: 'documentary-style layout, main subject large on left, secondary photo/image smaller on right, slightly overlapping',
    };

    const prompt = `Ultra high-quality professional YouTube thumbnail, 1280x720 pixels, 16:9 aspect ratio.

GENRE: ${moodProfile.label}
VISUAL STYLE: ${moodVisuals[mood] || moodVisuals.drama}
CHARACTER LAYOUT: ${layoutPrompts[selectedTemplate.id] || layoutPrompts.split_reaction}
${uploadedChars.length > 0 ? `CHARACTERS: ${uploadedChars.length} real people, backgrounds removed, seamlessly composited into the scene` : 'CHARACTERS: 2-3 diverse photorealistic people with appropriate expressions for the content'}

REQUIRED ELEMENTS:
- Bold text at bottom reading: "${title.toUpperCase()}" in thick Impact/Arial Black font
- ${overlayText ? `Accent badge in top-right corner with text: "${overlayText}" on ${moodProfile.badgeBg} background` : 'No additional text badge'}
- ${mood === 'crime' ? 'Large subtle question marks in background, hint of red/blood accents' : ''}
- ${mood === 'nollywood' ? 'Lightning bolt decorative elements, warm glow effects' : ''}
- ${mood === 'drama' ? 'Red arrow pointing, bold dividing line if two characters' : ''}
- Strong vignette around edges, professional depth-of-field
- Dramatic lighting that matches the ${moodProfile.label} theme
- No watermarks, no borders, no text except the title and badge

TECHNICAL: Hyper-realistic photography composite, cinematic quality, maximum visual impact for thumbnail CTR`;

    try {
      const result = await base44.functions.invoke('generateThumbnail', {
        prompt,
        title,
        mood,
        template: selectedTemplate.id,
        overlay_text: overlayText,
        character_count: charCount,
        character_images: uploadedChars.map(c => c.url),
      });

      if (result?.image_url || result?.url || result?.data?.url) {
        setGeneratedUrl(result.image_url || result.url || result.data?.url);
      } else {
        throw new Error('No image URL in response');
      }
    } catch (e) {
      console.error('Generation error:', e);
      setError('AI generation failed — showing canvas preview instead. You can download the canvas version below.');
    }

    setLoading(false);
    setStep(3);
  };

  const handleDownload = () => {
    if (generatedUrl) {
      const a = document.createElement('a');
      a.href = generatedUrl;
      a.download = `thumbnail-${title.replace(/\s+/g,'-').toLowerCase()}.png`;
      a.click();
    } else {
      // Download canvas
      const canvas = document.querySelector('canvas');
      if (canvas) {
        const a = document.createElement('a');
        a.href = canvas.toDataURL('image/png');
        a.download = `thumbnail-${title.replace(/\s+/g,'-').toLowerCase()}.png`;
        a.click();
      }
    }
  };

  const ctrScore = selectedTemplate
    ? ((profile.ctrBase || 8.5) + (selectedTemplate.ctrBonus || 0)).toFixed(1)
    : (profile?.ctrBase || 8.5).toFixed(1);

  // ── STEP 0: Setup ──────────────────────────────────────────────────
  if (step === 0) {
    return (
      <div style={{ minHeight: '100vh', background: '#070711', color: '#fff', padding: '0' }}>
        {/* Header bar */}
        <div style={{ borderBottom: '1px solid #1f2937', padding: '16px 24px', display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={onBack} style={{ background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, padding: '6px 10px', borderRadius: 8, hover: 'background:#1f2937' }}>
            <ArrowLeft size={16} /> Back
          </button>
          <div style={{ width: 1, height: 20, background: '#1f2937' }} />
          <div style={{ fontSize: 15, fontWeight: 700 }}>🎯 AI Thumbnail Maker</div>
        </div>

        <div style={{ maxWidth: 680, margin: '0 auto', padding: '32px 16px' }}>
          <StepDots current={0} total={4} />

          <div style={{ textAlign: 'center', marginBottom: 36 }}>
            <div style={{ fontSize: 26, fontWeight: 800, marginBottom: 8 }}>Create a World-Class Thumbnail</div>
            <div style={{ color: '#6b7280', fontSize: 14, lineHeight: 1.6 }}>
              Tell AI about your video — it will detect the mood, choose perfect colors, and build a high-CTR thumbnail
            </div>
          </div>

          {/* Title */}
          <div style={{ marginBottom: 18 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 8 }}>
              Video Title *
            </label>
            <input
              value={title}
              onChange={e => setTitle(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && title.trim() && handleAnalyse()}
              placeholder='e.g. "GRANDMA EXPLODES After Finding Out The Truth!"'
              style={{ width: '100%', padding: '14px 16px', background: '#0f172a', border: '1px solid #1f2937', borderRadius: 10, color: '#fff', fontSize: 15, outline: 'none', boxSizing: 'border-box' }}
            />
          </div>

          {/* Summary */}
          <div style={{ marginBottom: 20 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 8 }}>
              Video Summary <span style={{ color: '#374151', fontWeight: 400, textTransform: 'none' }}>— optional, greatly improves AI accuracy</span>
            </label>
            <textarea
              value={summary}
              onChange={e => setSummary(e.target.value)}
              placeholder="What is the video about? Story, plot, topic... AI uses this to pick the right mood, lighting, colors & elements"
              rows={3}
              style={{ width: '100%', padding: '12px 16px', background: '#0f172a', border: '1px solid #1f2937', borderRadius: 10, color: '#fff', fontSize: 14, outline: 'none', resize: 'vertical', boxSizing: 'border-box', fontFamily: 'inherit', lineHeight: 1.5 }}
            />
          </div>

          {/* Characters */}
          <div style={{ marginBottom: 18 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 12 }}>
              Characters in Thumbnail
            </label>
            <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
              {[1, 2, 3].map(n => (
                <button key={n} onClick={() => handleCharCount(n)} style={{
                  flex: 1, padding: '12px 8px', borderRadius: 10,
                  border: charCount === n ? '2px solid #7c3aed' : '2px solid #1f2937',
                  background: charCount === n ? 'rgba(124,58,237,0.15)' : '#0f172a',
                  color: charCount === n ? '#a78bfa' : '#4b5563',
                  cursor: 'pointer', fontWeight: 700, fontSize: 13, transition: 'all 0.15s',
                }}>
                  {n === 1 ? '👤 Solo' : n === 2 ? '👥 Duo' : '👨‍👩‍👦 Trio'}
                </button>
              ))}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: `repeat(${charCount}, 1fr)`, gap: 12, maxWidth: charCount === 1 ? 180 : charCount === 2 ? 320 : '100%' }}>
              {Array.from({ length: charCount }, (_, i) => (
                <CharSlot key={i} index={i} label={`Character ${i + 1}`} char={chars[i]} onUpload={handleUpload} onRemove={handleRemove} />
              ))}
            </div>
            <p style={{ color: '#374151', fontSize: 11, marginTop: 8 }}>
              💡 Upload portrait/headshot photos — AI removes backgrounds & composites them perfectly. Or skip to use AI-generated characters.
            </p>
          </div>

          <button
            onClick={handleAnalyse}
            disabled={!title.trim() || loading}
            style={{
              width: '100%', padding: '15px', borderRadius: 12, border: 'none',
              background: title.trim() && !loading ? 'linear-gradient(135deg, #7c3aed, #db2777)' : '#1f2937',
              color: '#fff', cursor: title.trim() && !loading ? 'pointer' : 'not-allowed',
              fontWeight: 700, fontSize: 15, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              transition: 'opacity 0.2s',
            }}
          >
            {loading
              ? <><Loader2 size={18} className="animate-spin" /> Analysing mood & building style...</>
              : <><Wand2 size={18} /> Analyse Title & Select Templates</>}
          </button>
        </div>
      </div>
    );
  }

  // ── STEP 1: Template Selection ──────────────────────────────────────
  if (step === 1) {
    const overlaySugs = aiAnalysis?.overlayOptions || OVERLAY_SUGGESTIONS[mood] || [];
    const sortedTemplates = [...TEMPLATES].sort((a, b) => {
      const aFit = a.bestFor.includes(mood) ? 1 : 0;
      const bFit = b.bestFor.includes(mood) ? 1 : 0;
      const aRec = aiAnalysis?.bestTemplate === a.id ? 2 : 0;
      const bRec = aiAnalysis?.bestTemplate === b.id ? 2 : 0;
      return (bFit + bRec) - (aFit + aRec);
    });

    return (
      <div style={{ minHeight: '100vh', background: '#070711', color: '#fff' }}>
        <div style={{ borderBottom: '1px solid #1f2937', padding: '16px 24px', display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={() => setStep(0)} style={{ background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontSize: 14 }}>
            <ArrowLeft size={16} /> Back
          </button>
          <div style={{ width: 1, height: 20, background: '#1f2937' }} />
          <div style={{ fontSize: 15, fontWeight: 700 }}>Choose Layout & Style</div>
        </div>

        <div style={{ maxWidth: 900, margin: '0 auto', padding: '28px 16px' }}>
          <StepDots current={1} total={4} />

          {/* Mood result card */}
          <div style={{
            background: `linear-gradient(135deg, ${profile.accent}18, ${profile.accent}08)`,
            border: `1px solid ${profile.accent}35`,
            borderRadius: 14, padding: '16px 20px', marginBottom: 24,
            display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'flex-start',
          }}>
            <div style={{ flex: '0 0 auto' }}>
              <div style={{ fontSize: 11, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Detected Mood</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 22 }}>{profile.emoji}</span>
                <div>
                  <div style={{ fontWeight: 800, fontSize: 15, color: profile.accent }}>{profile.label}</div>
                  {aiAnalysis?.moodReason && <div style={{ color: '#9ca3af', fontSize: 12 }}>{aiAnalysis.moodReason}</div>}
                </div>
              </div>
            </div>
            <div style={{ flex: 1, minWidth: 200 }}>
              <div style={{ fontSize: 11, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Visual DNA</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {['Bg: ' + profile.bgStyle.substring(0,20)+'…', 'Accent: '+profile.accent, 'Font: Impact'].map(tag => (
                  <span key={tag} style={{ background: `${profile.accent}15`, border: `1px solid ${profile.accent}30`, color: profile.accent, borderRadius: 20, padding: '2px 9px', fontSize: 10, fontWeight: 600 }}>{tag}</span>
                ))}
              </div>
            </div>
            {aiAnalysis?.ctrTips?.length > 0 && (
              <div style={{ width: '100%', borderTop: `1px solid ${profile.accent}20`, paddingTop: 10 }}>
                {aiAnalysis.ctrTips.map((tip, i) => (
                  <div key={i} style={{ color: '#86efac', fontSize: 12, display: 'flex', gap: 6, marginBottom: 3 }}>
                    <span style={{ color: '#22c55e' }}>✓</span>{tip}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Overlay text picker */}
          <div style={{ marginBottom: 24 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 10 }}>
              Overlay Badge Text
            </label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
              {overlaySugs.map(s => (
                <button key={s} onClick={() => setOverlayText(s)} style={{
                  padding: '6px 14px', borderRadius: 20, fontWeight: 700, fontSize: 12, cursor: 'pointer',
                  border: overlayText === s ? `2px solid ${profile.accent}` : '2px solid #1f2937',
                  background: overlayText === s ? `${profile.accent}20` : '#0f172a',
                  color: overlayText === s ? profile.accent : '#6b7280', transition: 'all 0.15s',
                }}>{s}</button>
              ))}
              <button onClick={() => setOverlayText('')} style={{ padding: '6px 14px', borderRadius: 20, fontWeight: 600, fontSize: 12, cursor: 'pointer', border: '2px solid #1f2937', background: '#0f172a', color: !overlayText ? '#9ca3af' : '#374151' }}>
                None
              </button>
            </div>
            <input
              value={overlayText}
              onChange={e => setOverlayText(e.target.value.toUpperCase())}
              placeholder="Custom badge text..."
              maxLength={18}
              style={{ width: '100%', padding: '10px 14px', background: '#0f172a', border: '1px solid #1f2937', borderRadius: 8, color: '#fff', fontSize: 13, outline: 'none', boxSizing: 'border-box', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' }}
            />
          </div>

          {/* Template grid */}
          <div style={{ fontSize: 12, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>Layout Templates</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 14, marginBottom: 28 }}>
            {sortedTemplates.map(tmpl => {
              const isSelected = selectedTemplate?.id === tmpl.id;
              const isRec = aiAnalysis?.bestTemplate === tmpl.id;
              const isFit = tmpl.bestFor.includes(mood);
              return (
                <div key={tmpl.id} onClick={() => setSelectedTemplate(tmpl)} style={{
                  border: isSelected ? `2px solid ${profile.accent}` : '2px solid #1f2937',
                  borderRadius: 12, overflow: 'hidden', background: isSelected ? `${profile.accent}0d` : '#0b0b1a',
                  cursor: 'pointer', transition: 'all 0.15s',
                  boxShadow: isSelected ? `0 0 24px ${profile.accent}30` : 'none',
                }}>
                  {/* Live mini canvas preview */}
                  <div style={{ padding: 8, background: '#07070f' }}>
                    <ThumbnailCanvas
                      mood={mood}
                      template={tmpl}
                      chars={chars.slice(0, charCount)}
                      title={title}
                      overlayText={overlayText}
                      width={320}
                      height={180}
                    />
                  </div>
                  <div style={{ padding: '10px 14px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                      <div style={{ fontWeight: 700, fontSize: 13 }}>{tmpl.name}</div>
                      <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                        {isRec && <span style={{ background: '#7c3aed', color: '#fff', borderRadius: 8, padding: '1px 7px', fontSize: 10, fontWeight: 700 }}>AI PICK</span>}
                        {isFit && !isRec && <span style={{ background: `${profile.accent}25`, color: profile.accent, borderRadius: 8, padding: '1px 7px', fontSize: 10, fontWeight: 700 }}>GREAT FIT</span>}
                        <span style={{ color: '#fbbf24', fontSize: 11, fontWeight: 700 }}>⭐{((profile.ctrBase||8.5)+(tmpl.ctrBonus||0)).toFixed(1)}</span>
                      </div>
                    </div>
                    <div style={{ color: '#4b5563', fontSize: 11, lineHeight: 1.4 }}>{tmpl.desc}</div>
                  </div>
                </div>
              );
            })}
          </div>

          <button
            onClick={handleGenerate}
            disabled={!selectedTemplate}
            style={{
              width: '100%', padding: '15px', borderRadius: 12, border: 'none',
              background: selectedTemplate ? `linear-gradient(135deg, ${profile.accent}, #7c3aed)` : '#1f2937',
              color: '#fff', cursor: selectedTemplate ? 'pointer' : 'not-allowed',
              fontWeight: 700, fontSize: 15, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            }}
          >
            <Sparkles size={18} /> Generate Thumbnail with AI
          </button>
        </div>
      </div>
    );
  }

  // ── STEP 2: Generating ──────────────────────────────────────────────
  if (step === 2) {
    return (
      <div style={{ minHeight: '100vh', background: '#070711', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center', maxWidth: 420, padding: 24 }}>
          <div style={{
            width: 80, height: 80, borderRadius: '50%',
            background: `linear-gradient(135deg, ${profile.accent}, #7c3aed)`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 24px', animation: 'thumbPulse 1.5s ease-in-out infinite',
          }}>
            <Sparkles size={32} color="#fff" />
          </div>
          <h2 style={{ fontSize: 20, fontWeight: 800, marginBottom: 8 }}>Building Your Thumbnail</h2>
          <p style={{ color: '#6b7280', fontSize: 13, lineHeight: 1.6, marginBottom: 24 }}>
            Removing backgrounds, applying {profile.label} color grade, compositing characters, adding effects...
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[
              { icon: '🖼', label: 'Processing character images' },
              { icon: '✂️', label: 'Removing backgrounds' },
              { icon: '🎨', label: `Applying ${profile.label} color grade` },
              { icon: '✍️', label: 'Adding typography & overlays' },
              { icon: '⚡', label: 'Optimizing for CTR' },
            ].map((item, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#0f172a', borderRadius: 8, padding: '10px 14px' }}>
                <span style={{ fontSize: 16 }}>{item.icon}</span>
                <span style={{ color: '#9ca3af', fontSize: 13 }}>{item.label}</span>
                <Loader2 size={13} style={{ marginLeft: 'auto', color: profile.accent, animation: `spin ${0.8 + i*0.1}s linear infinite` }} />
              </div>
            ))}
          </div>
        </div>
        <style>{`
          @keyframes thumbPulse { 0%,100%{box-shadow:0 0 0 0 ${profile.accent}50} 50%{box-shadow:0 0 0 20px transparent} }
          @keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
        `}</style>
      </div>
    );
  }

  // ── STEP 3: Result ──────────────────────────────────────────────────
  return (
    <div style={{ minHeight: '100vh', background: '#070711', color: '#fff' }}>
      <div style={{ borderBottom: '1px solid #1f2937', padding: '14px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button onClick={() => setStep(1)} style={{ background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
            <ArrowLeft size={15} /> Back
          </button>
          <div style={{ fontWeight: 700, fontSize: 14 }}>Your Thumbnail</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => { setStep(1); setGeneratedUrl(null); setError(null); }}
            style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid #1f2937', background: 'none', color: '#9ca3af', cursor: 'pointer', fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <RefreshCw size={13} /> Regenerate
          </button>
          <button
            onClick={handleDownload}
            style={{ padding: '8px 14px', borderRadius: 8, border: 'none', background: profile.accent, color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <Download size={13} /> Download
          </button>
        </div>
      </div>

      <div style={{ maxWidth: 860, margin: '0 auto', padding: '28px 16px' }}>
        <StepDots current={3} total={4} />

        {error && (
          <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 10, padding: '12px 16px', marginBottom: 16, color: '#fca5a5', fontSize: 13, display: 'flex', gap: 8, alignItems: 'flex-start' }}>
            <AlertCircle size={15} style={{ flexShrink: 0, marginTop: 1 }} /> {error}
          </div>
        )}

        {/* Main thumbnail */}
        <div style={{ marginBottom: 20, boxShadow: `0 24px 64px rgba(0,0,0,0.7)`, borderRadius: 12, overflow: 'hidden' }}>
          {generatedUrl ? (
            <img src={generatedUrl} alt="Generated thumbnail" style={{ width: '100%', display: 'block' }} />
          ) : (
            <ThumbnailCanvas
              mood={mood}
              template={selectedTemplate}
              chars={chars.slice(0, charCount)}
              title={title}
              overlayText={overlayText}
              width={1280}
              height={720}
            />
          )}
        </div>

        {/* Stats row */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 20 }}>
          {[
            { label: 'Predicted CTR', value: `${ctrScore}%`, color: '#22c55e', icon: Target },
            { label: 'Mood', value: profile.emoji + ' ' + profile.label.split('/')[0], color: profile.accent, icon: Palette },
            { label: 'Layout', value: selectedTemplate?.name || '-', color: '#7c3aed', icon: ImageIcon },
            { label: 'Characters', value: charCount + ' person' + (charCount > 1 ? 's' : ''), color: '#f59e0b', icon: Users },
          ].map(stat => {
            const Icon = stat.icon;
            return (
              <div key={stat.label} style={{ background: '#0f172a', borderRadius: 10, padding: '12px 14px', textAlign: 'center' }}>
                <Icon size={14} color={stat.color} style={{ margin: '0 auto 6px' }} />
                <div style={{ fontSize: 10, color: '#4b5563', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 3 }}>{stat.label}</div>
                <div style={{ fontWeight: 800, fontSize: 13, color: stat.color, lineHeight: 1.2 }}>{stat.value}</div>
              </div>
            );
          })}
        </div>

        {/* Quick variations */}
        <div style={{ background: '#0b0b1a', border: '1px solid #1f2937', borderRadius: 12, padding: '16px 18px' }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>Quick Variations</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <div style={{ fontSize: 12, color: '#374151', marginRight: 4, alignSelf: 'center' }}>Try badge:</div>
            {(aiAnalysis?.overlayOptions || OVERLAY_SUGGESTIONS[mood] || []).map(opt => (
              <button key={opt} onClick={() => { setOverlayText(opt); setStep(1); }}
                style={{ padding: '6px 12px', borderRadius: 8, border: `1px solid ${profile.accent}35`, background: `${profile.accent}10`, color: profile.accent, cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>
                "{opt}"
              </button>
            ))}
            <div style={{ width: '100%', height: 1, background: '#1f2937', margin: '8px 0' }} />
            <div style={{ fontSize: 12, color: '#374151', marginRight: 4, alignSelf: 'center' }}>Try layout:</div>
            {TEMPLATES.filter(t => t.id !== selectedTemplate?.id).slice(0, 3).map(t => (
              <button key={t.id} onClick={() => { setSelectedTemplate(t); setStep(1); }}
                style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid #1f2937', background: '#0f172a', color: '#6b7280', cursor: 'pointer', fontSize: 12 }}>
                {t.name}
              </button>
            ))}
          </div>
        </div>
      </div>

      <style>{`@keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }`}</style>
    </div>
  );
}
