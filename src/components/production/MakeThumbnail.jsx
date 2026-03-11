import React, { useState, useRef, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import {
  ArrowLeft, Upload, X, Sparkles, Loader2, Download,
  RefreshCw, Wand2, Users, Star, ChevronRight, Image as ImageIcon,
  CheckCircle, AlertCircle, Eye, Zap, Target, Palette
} from 'lucide-react';
import ThumbnailTemplatePicker from './ThumbnailTemplatePicker';
import { buildTemplatePrompt } from './thumbnailTemplates';
import { TEMPLATE_IMAGES } from './thumbnailReferenceImages';

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
// CONCEPT CARD — one card per AI-generated concept from backend
// ═══════════════════════════════════════════════════════════════════════
function ConceptCard({ concept, isSelected, onSelect, onGenerate, generating }) {
  const ctr = concept.ctr_score || 7;
  const ctrColor = ctr >= 9 ? '#22c55e' : ctr >= 7 ? '#f59e0b' : '#9ca3af';
  const templateName = (concept.visual_metaphor || concept.concept_type || '').replace(/_/g, ' ');

  return (
    <div
      onClick={() => onSelect(concept)}
      style={{
        border: isSelected ? '2px solid #7c3aed' : '2px solid #1f2937',
        borderRadius: 12, background: isSelected ? 'rgba(124,58,237,0.1)' : '#0b0b1a',
        cursor: 'pointer', transition: 'border 0.15s, background 0.15s, box-shadow 0.15s',
        overflow: 'hidden',
        boxShadow: isSelected ? '0 0 24px rgba(124,58,237,0.35)' : 'none',
      }}
    >
      {/* Preview area — shows generated image or placeholder */}
      <div style={{
        aspectRatio: '16/9', background: '#070711', position: 'relative',
        display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
      }}>
        {concept.image_url ? (
          <img src={concept.image_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : (
          <div style={{ textAlign: 'center', padding: '12px 16px' }}>
            {concept.text_overlay && (
              <div style={{
                fontFamily: 'Impact, Arial Black, sans-serif', fontWeight: 900,
                fontSize: 18, color: '#fff', letterSpacing: '0.05em',
                textShadow: '2px 2px 0 #000', marginBottom: 6, lineHeight: 1.1,
              }}>
                "{concept.text_overlay}"
              </div>
            )}
            <div style={{ fontSize: 11, color: '#4b5563', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              {templateName || 'thumbnail concept'}
            </div>
          </div>
        )}
        {/* Rank badge */}
        <div style={{
          position: 'absolute', top: 8, left: 8, background: 'rgba(0,0,0,0.8)',
          borderRadius: 6, padding: '2px 8px', fontSize: 11, fontWeight: 700, color: '#fff',
        }}>#{concept.rank || 1}</div>
        {/* CTR badge */}
        <div style={{
          position: 'absolute', top: 8, right: 8, background: ctrColor,
          borderRadius: 6, padding: '2px 8px', fontSize: 11, fontWeight: 700, color: '#fff',
        }}>⭐ {ctr}/10</div>
      </div>

      <div style={{ padding: '10px 12px' }}>
        {/* Template name */}
        {templateName && (
          <div style={{ fontSize: 10, color: '#7c3aed', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 4 }}>
            {templateName}
          </div>
        )}

        {/* Text overlay */}
        {concept.text_overlay && (
          <div style={{ fontFamily: 'Impact, Arial Black', fontWeight: 900, fontSize: 16, color: '#fff', letterSpacing: '0.04em', marginBottom: 5 }}>
            "{concept.text_overlay}"
          </div>
        )}

        {/* Description snippet */}
        <div style={{ color: '#6b7280', fontSize: 11, lineHeight: 1.45, marginBottom: 8 }}>
          {(concept.why_it_stops_scrolling || concept.concept_description || '')
            .replace(/^\[.*?\]\s*/, '')
            .substring(0, 90)}…
        </div>

        {/* Color scheme tag */}
        {concept.color_scheme && (
          <div style={{ fontSize: 10, color: '#4b5563', background: '#1f2937', borderRadius: 4, padding: '2px 7px', display: 'inline-block', marginBottom: isSelected ? 10 : 0 }}>
            {concept.color_scheme.split('|')[0].trim().substring(0, 40)}
          </div>
        )}

        {/* Generate button — only when selected */}
        {isSelected && (
          <button
            onClick={e => { e.stopPropagation(); onGenerate(concept); }}
            disabled={generating}
            style={{
              width: '100%', marginTop: 10, padding: '10px', borderRadius: 8, border: 'none',
              background: generating ? '#374151' : 'linear-gradient(135deg, #7c3aed, #db2777)',
              color: '#fff', cursor: generating ? 'not-allowed' : 'pointer',
              fontWeight: 700, fontSize: 13,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            }}
          >
            {generating
              ? <><Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> Rendering with Ideogram V3…</>
              : <><Sparkles size={14} /> Generate This Thumbnail</>
            }
          </button>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────────────
// FLOW:
//   Step 0 — User enters title + optional summary + character count/photos
//   Step 1 — Loading: create Project → call generateThumbnailConcepts
//             → Gemini builds 10 concepts using 26-template DNA vault
//             → Display 10 ConceptCards for user to choose from
//   Step 2 — Loading: call generateThumbnailImage(concept_id)
//             → Kie/Ideogram V3 renders → polls → returns image_url
//   Step 3 — Show final image, download, try other concepts
// ═══════════════════════════════════════════════════════════════════════
export default function MakeThumbnail({ onBack }) {
  // Navigation
  const [step, setStep] = useState(0);

  // Step 0 inputs
  const [title, setTitle]     = useState('');
  const [summary, setSummary] = useState('');
  const [charCount, setCharCount] = useState(2);
  const [chars, setChars]     = useState([null, null, null]);
  const [selectedUserTemplate, setSelectedUserTemplate] = useState(null); // user-picked reference template

  // Step 1 data
  const [loadingConcepts, setLoadingConcepts] = useState(false);
  const [loadingPhase, setLoadingPhase]       = useState('');
  const [concepts, setConcepts]               = useState([]);
  const [selectedConcept, setSelectedConcept] = useState(null);
  const [templateMeta, setTemplateMeta]       = useState(null);
  const [projectId, setProjectId]             = useState(null);

  // Step 2/3 data
  const [generating, setGenerating]   = useState(false);
  const [generatedUrl, setGeneratedUrl] = useState(null);
  const [error, setError]             = useState(null);

  // ── helpers ─────────────────────────────────────────────────────
  const handleCharCount = n => {
    setCharCount(n);
    setChars(prev => { const a = [...prev]; while (a.length < 3) a.push(null); return a; });
  };
  const handleUpload = (i, file) => {
    const url = URL.createObjectURL(file);
    setChars(prev => { const a = [...prev]; a[i] = { file, url, name: file.name }; return a; });
  };
  const handleRemove = i => {
    setChars(prev => { const a = [...prev]; a[i] = null; return a; });
  };

  // ── Step 0 → 1 ──────────────────────────────────────────────────
  // 1. Create a Project record so backend has a project_id
  // 2. Call generateThumbnailConcepts — Gemini designs 10 concepts
  //    using its 26-template DNA vault, saves to ThumbnailConcepts entity
  // 3. Fetch saved records and show them as concept cards
  const handleGenerateConcepts = async () => {
    if (!title.trim()) return;
    setLoadingConcepts(true);
    setError(null);
    setConcepts([]);
    setSelectedConcept(null);
    setGeneratedUrl(null);
    setStep(1);

    try {
      // ── Call newThumbnailConcept ──────────────────────────────────
      // Standalone function — no Projects/Scripts/Topics dependency.
      // Sends: video_title + optional summary
      // Returns: { success, concept_ids[], project_id (session), template_selection{} }
      setLoadingPhase('Gemini is designing 10 thumbnail concepts…');

      // ── Convert uploaded character photos to base64 ─────────────
      setLoadingPhase('Preparing your character photos…');
      const charPhotos = [];
      for (const char of chars.filter(Boolean)) {
        if (char?.file) {
          try {
            const b64 = await new Promise((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = () => resolve(reader.result.split(',')[1]);
              reader.onerror = reject;
              reader.readAsDataURL(char.file);
            });
            const mime = char.file.type || 'image/jpeg';
            charPhotos.push({ b64, mime, name: char.name || 'character' });
          } catch (_) {}
        }
      }

      // ── Build template context ────────────────────────────────
      const templateContext = selectedUserTemplate ? {
        template_id:          selectedUserTemplate.id,
        template_name:        selectedUserTemplate.name,
        template_psychology:  selectedUserTemplate.psychology,
        template_text_strategy: selectedUserTemplate.textStrategy,
        template_layout:      JSON.stringify(selectedUserTemplate.layout || {}),
        template_ctr:         selectedUserTemplate.ctrScore,
        template_b64:         TEMPLATE_IMAGES[selectedUserTemplate.id]?.b64  ?? null,
        template_mime:        TEMPLATE_IMAGES[selectedUserTemplate.id]?.mime ?? null,
      } : {};

      setLoadingPhase('Gemini is designing 10 thumbnail concepts…');
      let conceptsResult;
      try {
        conceptsResult = await base44.functions.invoke('newThumbnailConcept', {
          video_title:   title.trim(),
          summary:       summary.trim() || '',
          char_count:    charCount,
          char_photos:   charPhotos,   // base64 photos of uploaded characters
          ...templateContext,
        });
      } catch (e) {
        throw new Error(`newThumbnailConcept function error: ${e.message}`);
      }

      // base44 sometimes wraps the response in a .data property
      const result = conceptsResult?.data ?? conceptsResult;

      if (result?.error) {
        throw new Error(result.error);
      }

      const conceptIds = result?.concept_ids || result?.data?.concept_ids || [];
      if (!conceptIds.length) {
        // Log what we actually got to help debug
        console.error('newThumbnailConcept raw response:', JSON.stringify(conceptsResult));
        throw new Error('No concept_ids returned. Raw response logged to console.');
      }

      // Store template selection metadata for display
      const templateSel = result?.template_selection || result?.data?.template_selection;
      if (templateSel) setTemplateMeta(templateSel);

      // Load saved concepts by ID — avoids any project_id field type issues
      setLoadingPhase('Loading your 10 concepts...');
      const saved = [];
      for (const id of conceptIds) {
        try {
          const record = await base44.entities.ThumbnailConcepts.get(id);
          if (record) saved.push(record);
        } catch (_) {}
      }
      if (!saved.length) {
        throw new Error('Concepts were saved but could not be loaded. Check ThumbnailConcepts entity exists.');
      }

      const sorted = [...saved].sort((a, b) => (a.rank || 99) - (b.rank || 99));
      setConcepts(sorted);
      setSelectedConcept(sorted[0] || null);

    } catch (e) {
      console.error('handleGenerateConcepts error:', e);
      setError(e.message);
      setStep(0);
    }

    setLoadingPhase('');
    setLoadingConcepts(false);
  };

  // ── Step 1 → 2 → 3 ──────────────────────────────────────────────
  // Call generateThumbnailImage with the chosen concept_id
  // Backend: reads concept.image_prompt → Kie/Ideogram V3 → polls → saves image_url
  const handleGenerateImage = async concept => {
    if (!concept?.id) return;
    setSelectedConcept(concept);
    setGenerating(true);
    setError(null);
    setGeneratedUrl(null);
    setStep(2);

    try {
      const raw = await base44.functions.invoke('generateNewThumbnailImage', {
        concept_id: concept.id,
      });

      // base44 wraps responses in .data
      const result = raw?.data ?? raw;
      const imageUrl = result?.image_url || result?.data?.image_url;

      if (imageUrl) {
        setGeneratedUrl(imageUrl);
      } else if (result?.error) {
        throw new Error(result.error);
      } else {
        console.error('generateNewThumbnailImage raw response:', JSON.stringify(raw));
        throw new Error('No image_url in response. Check function logs for details.');
      }
    } catch (e) {
      console.error('handleGenerateImage error:', e);
      setError(e.message);
    }

    setGenerating(false);
    setStep(3);
  };

  const handleDownload = () => {
    const url = generatedUrl || selectedConcept?.image_url;
    if (!url) return;
    const a = document.createElement('a');
    a.href = url;
    a.download = `thumbnail-${title.replace(/\s+/g, '-').toLowerCase()}.png`;
    a.click();
  };

  // ════════════════════════════════════════════════════════════════
  // STEP 0 — Setup
  // ════════════════════════════════════════════════════════════════
  if (step === 0) return (
    <div style={{ minHeight: '100vh', background: '#070711', color: '#fff' }}>
      {/* Header */}
      <div style={{ borderBottom: '1px solid #1f2937', padding: '15px 24px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <button onClick={onBack} style={{ background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontSize: 14 }}>
          <ArrowLeft size={16} /> Back
        </button>
        <div style={{ width: 1, height: 20, background: '#1f2937' }} />
        <div style={{ fontSize: 15, fontWeight: 700 }}>🎯 AI Thumbnail Maker</div>
      </div>

      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '32px 16px' }}>
        <StepDots current={0} total={4} />

        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ fontSize: 25, fontWeight: 800, marginBottom: 8 }}>Create a World-Class Thumbnail</div>
          <div style={{ color: '#6b7280', fontSize: 14, lineHeight: 1.6 }}>
            Gemini analyses your title using a 26-template DNA vault, then Ideogram V3 renders the final image
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
            onKeyDown={e => e.key === 'Enter' && title.trim() && handleGenerateConcepts()}
            placeholder='e.g. "GRANDMA EXPLODES After Finding Out The Truth!"'
            style={{ width: '100%', padding: '13px 16px', background: '#0f172a', border: '1px solid #1f2937', borderRadius: 10, color: '#fff', fontSize: 15, outline: 'none', boxSizing: 'border-box' }}
          />
        </div>

        {/* Summary */}
        <div style={{ marginBottom: 22 }}>
          <label style={{ fontSize: 12, fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 8 }}>
            Video Summary <span style={{ color: '#4b5563', fontWeight: 400, textTransform: 'none' }}>— optional but greatly improves concepts</span>
          </label>
          <textarea
            value={summary}
            onChange={e => setSummary(e.target.value)}
            placeholder="What's the video about? Gemini uses this to extract visual anchors, key moments and emotional hooks"
            rows={3}
            style={{ width: '100%', padding: '11px 16px', background: '#0f172a', border: '1px solid #1f2937', borderRadius: 10, color: '#fff', fontSize: 14, outline: 'none', resize: 'vertical', boxSizing: 'border-box', fontFamily: 'inherit', lineHeight: 1.5 }}
          />
        </div>

        {/* Character count */}
        <div style={{ marginBottom: 26 }}>
          <label style={{ fontSize: 12, fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 10 }}>
            Characters
          </label>
          <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
            {[1, 2, 3].map(n => (
              <button key={n} onClick={() => handleCharCount(n)} style={{
                flex: 1, padding: '11px 8px', borderRadius: 10,
                border: charCount === n ? '2px solid #7c3aed' : '2px solid #1f2937',
                background: charCount === n ? 'rgba(124,58,237,0.15)' : '#0f172a',
                color: charCount === n ? '#a78bfa' : '#4b5563',
                cursor: 'pointer', fontWeight: 700, fontSize: 13, transition: 'all 0.15s',
              }}>
                {n === 1 ? '👤 Solo' : n === 2 ? '👥 Duo' : '👨‍👩‍👦 Trio'}
              </button>
            ))}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${charCount}, 1fr)`, gap: 12, maxWidth: charCount === 1 ? 160 : charCount === 2 ? 300 : '100%' }}>
            {Array.from({ length: charCount }, (_, i) => (
              <CharSlot key={i} index={i} label={`Character ${i + 1}`} char={chars[i]} onUpload={handleUpload} onRemove={handleRemove} />
            ))}
          </div>
          <p style={{ color: '#374151', fontSize: 11, marginTop: 8 }}>
            💡 Photos optional — skip to let Gemini generate characters that match your content
          </p>
        </div>

        {/* ── TEMPLATE PICKER ── */}
        <div style={{ marginBottom: 26 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <label style={{ fontSize: 12, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Choose a Reference Template
            </label>
            <span style={{ fontSize: 10, color: '#4b5563', background: '#1f2937', borderRadius: 4, padding: '2px 6px' }}>
              Optional
            </span>
          </div>
          <p style={{ color: '#4b5563', fontSize: 12, marginBottom: 14, lineHeight: 1.5 }}>
            Pick a proven layout — AI recreates it verbatim using your characters &amp; title.
            Includes full <strong style={{ color: '#6b7280' }}>Beast Formula</strong>: rim lights, skin treatment, color grade, composition.
          </p>
          <ThumbnailTemplatePicker
            selectedTemplate={selectedUserTemplate}
            onSelect={setSelectedUserTemplate}
            detectedMood={detectMood(title, summary)}
          />
        </div>

        <button
          onClick={handleGenerateConcepts}
          disabled={!title.trim()}
          style={{
            width: '100%', padding: '15px', borderRadius: 12, border: 'none',
            background: title.trim() ? 'linear-gradient(135deg, #7c3aed, #db2777)' : '#1f2937',
            color: '#fff', cursor: title.trim() ? 'pointer' : 'not-allowed',
            fontWeight: 700, fontSize: 15, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          }}
        >
          <Wand2 size={18} />
          {selectedUserTemplate
            ? `Recreate "${selectedUserTemplate.name}" with My Content`
            : 'Generate 10 AI Thumbnail Concepts'}
        </button>
      </div>
      <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  // ════════════════════════════════════════════════════════════════
  // STEP 1 — Loading concepts / Pick a concept
  // ════════════════════════════════════════════════════════════════
  if (step === 1) return (
    <div style={{ minHeight: '100vh', background: '#070711', color: '#fff' }}>
      {/* Header */}
      <div style={{ borderBottom: '1px solid #1f2937', padding: '15px 24px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <button
          onClick={() => { setStep(0); setError(null); }}
          disabled={loadingConcepts}
          style={{ background: 'none', border: 'none', color: loadingConcepts ? '#374151' : '#6b7280', cursor: loadingConcepts ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontSize: 14 }}
        >
          <ArrowLeft size={16} /> Back
        </button>
        <div style={{ width: 1, height: 20, background: '#1f2937' }} />
        <div style={{ fontSize: 15, fontWeight: 700 }}>
          {loadingConcepts ? '🧠 Generating Concepts…' : `Pick a Concept — ${concepts.length} generated`}
        </div>
      </div>

      {/* ── Loading state ── */}
      {loadingConcepts && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 'calc(100vh - 56px)' }}>
          <div style={{ textAlign: 'center', maxWidth: 460, padding: 24 }}>
            <div style={{
              width: 76, height: 76, borderRadius: '50%',
              background: 'linear-gradient(135deg, #7c3aed, #db2777)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 22px', animation: 'pulse 1.5s ease-in-out infinite',
            }}>
              <Sparkles size={30} color="#fff" />
            </div>
            <h2 style={{ fontSize: 19, fontWeight: 800, marginBottom: 8 }}>Designing 10 Thumbnail Concepts</h2>
            <p style={{ color: '#6b7280', fontSize: 13, lineHeight: 1.6, marginBottom: 22 }}>
              {loadingPhase || 'Gemini is running your title through the 26-template DNA vault…'}
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[
                'Detecting niche, emotional hooks & keywords',
                'Scoring 26 templates against your content',
                'Selecting top 3 templates by CTR potential',
                'Building 10 unique thumbnail concepts',
                'Writing 400-word Ideogram prompts per concept',
                'Saving to database…',
              ].map((phase, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#0f172a', borderRadius: 8, padding: '9px 14px' }}>
                  <Loader2 size={13} style={{ flexShrink: 0, color: '#7c3aed', animation: `spin ${0.7 + i * 0.12}s linear infinite` }} />
                  <span style={{ color: '#6b7280', fontSize: 12 }}>{phase}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Error state ── */}
      {!loadingConcepts && error && (
        <div style={{ maxWidth: 580, margin: '40px auto', padding: '0 16px' }}>
          <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 12, padding: 20 }}>
            <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
              <AlertCircle size={16} color="#f87171" style={{ flexShrink: 0, marginTop: 1 }} />
              <div style={{ fontWeight: 700, fontSize: 14, color: '#f87171' }}>Generation Failed</div>
            </div>
            <div style={{ fontSize: 13, color: '#fca5a5', lineHeight: 1.6, marginBottom: 16 }}>{error}</div>
            <button onClick={() => { setStep(0); setError(null); }} style={{ padding: '9px 18px', borderRadius: 8, border: 'none', background: '#7c3aed', color: '#fff', cursor: 'pointer', fontWeight: 700, fontSize: 13 }}>
              ← Try Again
            </button>
          </div>
        </div>
      )}

      {/* ── Concepts grid ── */}
      {!loadingConcepts && !error && concepts.length > 0 && (
        <div style={{ maxWidth: 1160, margin: '0 auto', padding: '22px 16px' }}>
          <StepDots current={1} total={4} />

          {/* Template selection banner */}
          {templateMeta && (
            <div style={{
              background: 'rgba(124,58,237,0.1)', border: '1px solid rgba(124,58,237,0.25)',
              borderRadius: 12, padding: '12px 16px', marginBottom: 18,
              display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center',
            }}>
              <span style={{ fontSize: 12, color: '#9ca3af' }}>AI selected templates:</span>
              {(templateMeta.all_templates || []).map((t, i) => (
                <span key={t.id} style={{
                  background: i === 0 ? '#7c3aed' : '#1f2937', color: '#fff',
                  borderRadius: 8, padding: '3px 10px', fontSize: 11, fontWeight: 700,
                }}>
                  {i === 0 ? '★ ' : ''}{t.name} · {t.ctr}
                </span>
              ))}
              {templateMeta.is_shorts && <span style={{ fontSize: 11, color: '#f59e0b', fontWeight: 700 }}>📱 Shorts 9:16</span>}
              {templateMeta.detected_niche && <span style={{ marginLeft: 'auto', fontSize: 11, color: '#4b5563' }}>Niche: {templateMeta.detected_niche}</span>}
            </div>
          )}

          <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 14 }}>
            Click a concept to select it, then hit <strong style={{ color: '#fff' }}>Generate This Thumbnail</strong> — Ideogram V3 renders it in ~60s
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 14 }}>
            {concepts.map(c => (
              <ConceptCard
                key={c.id}
                concept={c}
                isSelected={selectedConcept?.id === c.id}
                onSelect={setSelectedConcept}
                onGenerate={handleGenerateImage}
                generating={generating}
              />
            ))}
          </div>
        </div>
      )}

      <style>{`
        @keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
        @keyframes pulse{0%,100%{box-shadow:0 0 0 0 rgba(124,58,237,0.5)}50%{box-shadow:0 0 0 18px transparent}}
      `}</style>
    </div>
  );

  // ════════════════════════════════════════════════════════════════
  // STEP 2 — Generating image
  // ════════════════════════════════════════════════════════════════
  if (step === 2) return (
    <div style={{ minHeight: '100vh', background: '#070711', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ textAlign: 'center', maxWidth: 420, padding: 24 }}>
        <div style={{
          width: 80, height: 80, borderRadius: '50%',
          background: 'linear-gradient(135deg, #7c3aed, #db2777)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          margin: '0 auto 22px', animation: 'pulse 1.5s ease-in-out infinite',
        }}>
          <Sparkles size={32} color="#fff" />
        </div>
        <h2 style={{ fontSize: 20, fontWeight: 800, marginBottom: 8 }}>Rendering with Ideogram V3</h2>

        {/* Selected concept text */}
        {selectedConcept?.text_overlay && (
          <div style={{
            fontFamily: 'Impact, Arial Black', fontSize: 22, fontWeight: 900,
            color: '#fff', letterSpacing: '0.05em', textShadow: '2px 2px 0 #000',
            background: '#0f172a', borderRadius: 8, padding: '10px 16px',
            marginBottom: 16, display: 'inline-block',
          }}>
            "{selectedConcept.text_overlay}"
          </div>
        )}
        <p style={{ color: '#6b7280', fontSize: 13, lineHeight: 1.6, marginBottom: 22 }}>
          Ideogram V3 Quality is rendering at 1920×1080. This typically takes 45–90 seconds…
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
          {[
            { icon: '🧠', label: 'Reading 400-word image prompt' },
            { icon: '🎨', label: 'Rendering photorealistic scene with Ideogram V3' },
            { icon: '💡', label: 'Applying cinematic lighting & color grade' },
            { icon: '🔍', label: 'Upscaling to 1920×1080' },
            { icon: '💾', label: 'Saving to your library' },
          ].map((item, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#0f172a', borderRadius: 8, padding: '10px 14px' }}>
              <span style={{ fontSize: 15 }}>{item.icon}</span>
              <span style={{ color: '#9ca3af', fontSize: 12 }}>{item.label}</span>
              <Loader2 size={12} style={{ marginLeft: 'auto', color: '#7c3aed', animation: `spin ${0.8 + i * 0.1}s linear infinite` }} />
            </div>
          ))}
        </div>

        {selectedConcept?.ctr_score && (
          <div style={{ marginTop: 18, background: '#0f172a', borderRadius: 10, padding: '10px 16px', display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 12, color: '#4b5563' }}>Predicted CTR</span>
            <span style={{ fontSize: 16, fontWeight: 800, color: '#22c55e' }}>{selectedConcept.ctr_score}/10</span>
          </div>
        )}
      </div>
      <style>{`
        @keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
        @keyframes pulse{0%,100%{box-shadow:0 0 0 0 rgba(124,58,237,0.5)}50%{box-shadow:0 0 0 18px transparent}}
      `}</style>
    </div>
  );

  // ════════════════════════════════════════════════════════════════
  // STEP 3 — Result
  // ════════════════════════════════════════════════════════════════
  const finalUrl  = generatedUrl || selectedConcept?.image_url;
  const ctrScore  = selectedConcept?.ctr_score || 8;
  const ctrColor  = ctrScore >= 9 ? '#22c55e' : ctrScore >= 7 ? '#f59e0b' : '#9ca3af';

  return (
    <div style={{ minHeight: '100vh', background: '#070711', color: '#fff' }}>
      {/* Header */}
      <div style={{ borderBottom: '1px solid #1f2937', padding: '14px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button
            onClick={() => { setStep(1); setGeneratedUrl(null); setError(null); }}
            style={{ background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}
          >
            <ArrowLeft size={15} /> Back to concepts
          </button>
          <div style={{ fontWeight: 700, fontSize: 14 }}>Your Thumbnail</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => selectedConcept && handleGenerateImage(selectedConcept)}
            disabled={!selectedConcept}
            style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid #1f2937', background: 'none', color: '#9ca3af', cursor: 'pointer', fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <RefreshCw size={13} /> Re-render
          </button>
          {finalUrl && (
            <button onClick={handleDownload} style={{ padding: '8px 14px', borderRadius: 8, border: 'none', background: '#7c3aed', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Download size={13} /> Download
            </button>
          )}
        </div>
      </div>

      <div style={{ maxWidth: 900, margin: '0 auto', padding: '22px 16px' }}>
        <StepDots current={3} total={4} />

        {/* Error banner */}
        {error && (
          <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 10, padding: '12px 16px', marginBottom: 16, color: '#fca5a5', fontSize: 13, display: 'flex', gap: 8, alignItems: 'flex-start' }}>
            <AlertCircle size={15} style={{ flexShrink: 0, marginTop: 1 }} />
            <span>{error}</span>
          </div>
        )}

        {/* Main image */}
        {finalUrl ? (
          <div style={{ borderRadius: 12, overflow: 'hidden', boxShadow: '0 24px 64px rgba(0,0,0,0.7)', marginBottom: 18 }}>
            <img src={finalUrl} alt="Generated thumbnail" style={{ width: '100%', display: 'block' }} />
          </div>
        ) : (
          <div style={{ aspectRatio: '16/9', background: '#0f172a', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 18, border: '2px dashed #1f2937' }}>
            <div style={{ textAlign: 'center', color: '#4b5563' }}>
              <ImageIcon size={32} style={{ margin: '0 auto 8px' }} />
              <div style={{ fontSize: 13 }}>No image yet</div>
            </div>
          </div>
        )}

        {/* Stats row */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 16 }}>
          {[
            { label: 'CTR Score', value: `${ctrScore}/10`, color: ctrColor },
            { label: 'Template', value: (selectedConcept?.visual_metaphor || selectedConcept?.concept_type || 'AI').replace(/_/g,' '), color: '#7c3aed' },
            { label: 'Text Overlay', value: selectedConcept?.text_overlay || '—', color: '#f59e0b' },
          ].map(s => (
            <div key={s.label} style={{ background: '#0f172a', borderRadius: 10, padding: '12px 14px', textAlign: 'center' }}>
              <div style={{ fontSize: 10, color: '#4b5563', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>{s.label}</div>
              <div style={{ fontWeight: 800, fontSize: 13, color: s.color, lineHeight: 1.2, wordBreak: 'break-word' }}>{s.value}</div>
            </div>
          ))}
        </div>

        {/* Why it works */}
        {selectedConcept?.why_it_stops_scrolling && (
          <div style={{ background: '#0b0b1a', border: '1px solid #1f2937', borderRadius: 12, padding: '13px 16px', marginBottom: 14 }}>
            <div style={{ fontSize: 11, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 5 }}>Why this achieves 10M+ views</div>
            <div style={{ fontSize: 13, color: '#9ca3af', lineHeight: 1.5 }}>{selectedConcept.why_it_stops_scrolling}</div>
          </div>
        )}

        {/* Try other concepts */}
        {concepts.filter(c => c.id !== selectedConcept?.id).length > 0 && (
          <div style={{ background: '#0b0b1a', border: '1px solid #1f2937', borderRadius: 12, padding: '13px 16px' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>Try Another Concept</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {concepts.filter(c => c.id !== selectedConcept?.id).slice(0, 6).map(c => (
                <button key={c.id} onClick={() => handleGenerateImage(c)}
                  style={{ padding: '7px 12px', borderRadius: 8, border: '1px solid #1f2937', background: '#0f172a', color: '#9ca3af', cursor: 'pointer', fontSize: 12, display: 'flex', alignItems: 'center', gap: 5 }}>
                  <Sparkles size={11} />
                  #{c.rank} {c.text_overlay ? `"${c.text_overlay}"` : (c.concept_type || 'concept').replace(/_/g,' ')}
                  <span style={{ color: '#22c55e', fontSize: 10 }}>⭐{c.ctr_score}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
