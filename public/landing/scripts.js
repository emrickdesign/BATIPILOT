/* =============================================
   POTENTIEEL — Scripts partagés
   ============================================= */

document.addEventListener('DOMContentLoaded', () => {
  initBlobBackgrounds();
  initSparkles();
  initTicker();
  initTestimonialCarousel();
  initTiltCards();
  initWordReveal();
  initScrollAnimations();
  initCounters();
  initMockCardFlip();
  initToolFlips();
  initToolsFusion();
});

/* ---- Centralisation : vidéo « fusion des outils » plein écran, pilotée au scroll ----
   L'épinglage est 100 % CSS (position:sticky sur .tools-fusion-sticky). Ici on ne fait
   que mapper la progression du scroll DANS .tools-fusion-scroll sur video.currentTime
   (bas = avance, haut = rembobine) et estomper le titre en overlay. On règle currentTime
   directement (pas de rAF) → fluide et « collé » au scroll même si rAF est throttlé, et
   on écoute le scroll fenêtre + document (capture), robuste quel que soit le scroller. */
function initToolsFusion() {
  const scroll  = document.querySelector('.tools-fusion-scroll');
  const video   = document.querySelector('.tools-scrolly-video');
  const overlay = document.querySelector('.tools-fusion-overlay');
  if (!scroll || !video) return;

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let duration = 0, warmed = false, lastSet = -1;

  function onMeta() {
    duration = video.duration || 0;
    if (reduceMotion && duration) { try { video.currentTime = duration - 0.05; } catch (e) {} }
    else apply();
  }
  if (video.readyState >= 1) onMeta();
  video.addEventListener('loadedmetadata', onMeta);

  if (reduceMotion) return;

  // Réveille le pipeline de décodage (surtout iOS) : lecture muette aussitôt mise en pause.
  function warmup() {
    if (warmed) return; warmed = true;
    const p = video.play();
    if (p && p.then) p.then(() => video.pause()).catch(() => {});
    else { try { video.pause(); } catch (e) {} }
  }

  let rafId = null;

  // Rend une image et renvoie true tant que la section est dans la zone active.
  // Piloté par une boucle rAF (kick), donc immunisé contre les events scroll
  // throttlés/absorbés (momentum mobile, iOS…) : tant qu'on est dans la zone,
  // on relit la position à chaque frame.
  function render() {
    const rect = scroll.getBoundingClientRect();
    const vh   = window.innerHeight || document.documentElement.clientHeight || 0;
    const inView = rect.bottom > -vh * 0.5 && rect.top < vh * 1.5;
    if (!duration) return inView;
    if (!inView) {
      const edge = rect.top > 0 ? 0 : duration;
      if (Math.abs(edge - lastSet) > 0.01) { lastSet = edge; try { video.currentTime = edge; } catch (e) {} }
      return false;
    }
    warmup();
    const dist = scroll.offsetHeight - vh;                // course de scrub (= hauteur − 100vh)
    let p = dist > 0 ? (-rect.top) / dist : 0;
    p = Math.max(0, Math.min(1, p));
    const t = p * duration;
    if (Math.abs(t - lastSet) >= 0.006) { lastSet = t; try { video.currentTime = t; } catch (e) {} }
    if (overlay) overlay.style.opacity = String(Math.max(0, 1 - p / 0.16));
    return true;
  }

  function loop() { rafId = render() ? requestAnimationFrame(loop) : null; }
  function kick() { if (rafId == null) rafId = requestAnimationFrame(loop); }
  // Hybride : réglage IMMÉDIAT à chaque scroll (fonctionne même sans rAF) +
  // boucle rAF pour un suivi continu et lissé entre deux events (momentum mobile).
  function apply() { render(); kick(); }

  window.addEventListener('scroll',   apply, { passive: true });
  document.addEventListener('scroll', apply, { passive: true, capture: true });
  window.addEventListener('resize',   apply, { passive: true });
  apply();
}

/* ---- Tool flip cards — tap/click toggles (hover handles desktop) ---- */
function initToolFlips() {
  document.querySelectorAll('.tool-flip').forEach(card => {
    card.addEventListener('click', () => card.classList.toggle('flipped'));
  });
}

/* ---- Hero mock card flip — floating badges reveal content on the back ---- */
function initMockCardFlip() {
  const card = document.getElementById('heroMockCard');
  if (!card) return;
  const badges = Array.from(document.querySelectorAll('.hero-float-badge[data-scene]'));
  if (!badges.length) return;

  function activate(scene, badge) {
    const isSame = card.classList.contains('flipped') && card.dataset.activeScene === scene;
    badges.forEach(b => b.classList.remove('active-badge'));
    if (isSame) {
      card.classList.remove('flipped');
      card.dataset.activeScene = '';
      return;
    }
    card.querySelectorAll('.mock-back-scene').forEach(s => s.classList.toggle('active', s.dataset.scene === scene));
    card.classList.add('flipped');
    card.dataset.activeScene = scene;
    badge.classList.add('active-badge');
  }

  badges.forEach(badge => {
    badge.addEventListener('click', () => activate(badge.dataset.scene, badge));
    badge.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        activate(badge.dataset.scene, badge);
      }
    });
  });
}

/* ---- Carrousel de témoignages photo — effet 3D, piloté par le scroll de la page ---- */
function initTestimonialCarousel() {
  const stage   = document.getElementById('testimonialTrack');
  const prev    = document.getElementById('testiPrev');
  const next    = document.getElementById('testiNext');
  const dots    = document.getElementById('testiDots');
  const section = document.querySelector('.testimonial-carousel-section');
  if (!stage || !prev || !next) return;

  const cards = Array.from(stage.querySelectorAll('.testi-card'));
  const total = cards.length;
  if (!total) return;

  const hasGsap = typeof gsap !== 'undefined';
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let idx = 0;

  function render(animate) {
    cards.forEach((card, i) => {
      let offset = i - idx;
      if (offset > total / 2) offset -= total;
      if (offset < -total / 2) offset += total;
      const abs   = Math.abs(offset);
      const x     = offset * 190;
      const z     = -abs * 170;
      const rotY  = offset * -26;
      const scale = Math.max(0.55, 1 - abs * 0.15);
      const opacity = Math.max(0, 1 - abs * 0.32);
      const zIndex  = Math.round(100 - abs * 10);

      if (hasGsap && animate) {
        gsap.to(card, {
          x, z, rotationY: rotY, scale, opacity, zIndex,
          xPercent: -50, yPercent: -50,
          duration: 0.6,
          ease: 'power2.out',
          overwrite: 'auto',
        });
      } else if (hasGsap) {
        // Instantané : gsap.set applique tout de suite, sans dépendre du ticker rAF
        // (indispensable pour le pilotage au scroll, fluide même si l'onglet est throttlé).
        gsap.set(card, { x, z, rotationY: rotY, scale, opacity, zIndex, xPercent: -50, yPercent: -50 });
      } else {
        card.style.transform = `translate(-50%,-50%) translateX(${x}px) translateZ(${z}px) rotateY(${rotY}deg) scale(${scale})`;
        card.style.opacity = String(opacity);
        card.style.zIndex = String(zIndex);
      }
      card.style.pointerEvents = abs > 2.5 ? 'none' : 'auto';
    });
    if (dots) {
      const active = ((Math.round(idx) % total) + total) % total;
      dots.querySelectorAll('.testi-dot').forEach((d, i) => d.classList.toggle('active', i === active));
    }
  }

  if (dots) {
    cards.forEach((_, i) => {
      const d = document.createElement('button');
      d.className = 'testi-dot' + (i === 0 ? ' active' : '');
      d.setAttribute('aria-label', 'Aller au témoignage ' + (i + 1));
      d.addEventListener('click', () => { idx = i; render(true); });
      dots.appendChild(d);
    });
  }

  prev.addEventListener('click', () => { idx = Math.round(idx) - 1; render(true); });
  next.addEventListener('click', () => { idx = Math.round(idx) + 1; render(true); });

  let touchX = 0;
  stage.addEventListener('touchstart', e => { touchX = e.touches[0].clientX; }, { passive: true });
  stage.addEventListener('touchend', e => {
    const diff = touchX - e.changedTouches[0].clientX;
    if (Math.abs(diff) > 50) { idx = Math.round(idx) + (diff > 0 ? 1 : -1); render(true); }
  });

  render(false);

  // Avance au fil du scroll de la section. Piloté par getBoundingClientRect (relatif
  // au viewport) et branché sur le scroll de la fenêtre ET du document (capture) : robuste
  // quel que soit l'élément qui scrolle réellement (fenêtre ou body via overflow),
  // contrairement à ScrollTrigger qui n'écoutait que la fenêtre et ne se déclenchait pas.
  if (section && !reduceMotion) {
    function applyScroll() {
      const rect = section.getBoundingClientRect();
      const vh = window.innerHeight || document.documentElement.clientHeight;
      const span = rect.height + vh;
      let p = span > 0 ? (vh - rect.top) / span : 0;
      p = Math.max(0, Math.min(1, p));
      idx = p * (total - 1);
      render(false);
    }
    // Appel synchrone : ne dépend pas du rAF, marche quel que soit l'élément qui scrolle.
    window.addEventListener('scroll', applyScroll, { passive: true });
    document.addEventListener('scroll', applyScroll, { passive: true, capture: true });
    window.addEventListener('resize', applyScroll, { passive: true });
    applyScroll();
  }
}

/* ---- Animated blob backgrounds (hero + page headers) ---- */
function initBlobBackgrounds() {
  document.querySelectorAll('.hero, .hero-modern, .page-header').forEach(section => {
    if (section.querySelector('.blob-bg')) return;
    const wrap = document.createElement('div');
    wrap.className = 'blob-bg';
    wrap.setAttribute('aria-hidden', 'true');
    wrap.innerHTML = '<span class="blob b1"></span><span class="blob b2"></span><span class="blob b3"></span>';
    section.insertBefore(wrap, section.firstChild);
  });
}

/* ---- Sparkles ---- */
function initSparkles() {
  const wrap = document.getElementById('sparkles');
  if (!wrap) return;
  const positions = [
    [8,18],[15,45],[22,72],[30,28],[40,60],[48,15],[55,82],[62,38],
    [70,65],[78,22],[85,50],[92,35],[18,88],[35,12],[50,55],[65,90],
    [75,10],[25,65],[45,35],[88,75]
  ];
  positions.forEach(([l, t], i) => {
    const s = document.createElement('div');
    s.className = 'sparkle';
    const delay = (i * 0.28) % 3;
    const dur = 2 + (i % 3) * 0.8;
    s.style.cssText = `left:${l}%;top:${t}%;animation-delay:${delay}s;animation-duration:${dur}s;`;
    if (i % 5 === 1) { s.style.background = '#c8f542'; s.style.width = '3px'; s.style.height = '3px'; }
    if (i % 7 === 0) { s.style.background = 'rgba(255,255,255,0.45)'; s.style.width = '2px'; s.style.height = '2px'; }
    wrap.appendChild(s);
  });
}

/* ---- Ticker ---- */
function initTicker() {
  const track = document.getElementById('ticker');
  if (!track) return;
  const items = [
    'Garagistes', 'Mandataires Immo', 'Kinésithérapeutes', 'Vétérinaires',
    'Artisans', 'Professions Libérales', 'Boulangers', 'Coiffeurs',
    'Électriciens', 'Plombiers', 'Architectes', 'Photographes'
  ];
  // Triple loop for seamless infinite scroll
  [0, 1, 2].forEach(() => {
    items.forEach(item => {
      const el = document.createElement('div');
      el.className = 'ticker-item';
      el.innerHTML = `<span class="dot"></span>${item}`;
      track.appendChild(el);
    });
  });
}

/* ---- 3D Tilt + Cursor Glow on Cards ---- */
function initTiltCards() {
  document.querySelectorAll('.tilt-card').forEach(card => {
    card.addEventListener('mousemove', e => {
      const rect  = card.getBoundingClientRect();
      const x     = e.clientX - rect.left;
      const y     = e.clientY - rect.top;
      const cx    = rect.width  / 2;
      const cy    = rect.height / 2;
      const rotX  = ((y - cy) / cy) * -7;
      const rotY  = ((x - cx) / cx) *  7;

      card.style.transform = `perspective(900px) rotateX(${rotX}deg) rotateY(${rotY}deg) translateZ(6px)`;
      card.style.setProperty('--gx', `${x}px`);
      card.style.setProperty('--gy', `${y}px`);
      card.style.setProperty('--go', '1');
      card.style.transition = 'transform 0.08s ease, box-shadow 0.2s ease';
    });

    card.addEventListener('mouseleave', () => {
      card.style.transform = '';
      card.style.setProperty('--go', '0');
      card.style.transition = 'transform 0.4s ease, box-shadow 0.3s ease';
    });
  });
}

/* ---- Scroll Animations ---- */
function initScrollAnimations() {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });

  document.querySelectorAll('.scroll-anim, .reveal-words').forEach(el => observer.observe(el));
}

/* ---- Counter Animation ---- */
function initCounters() {
  const counters = document.querySelectorAll('[data-count]');
  if (!counters.length) return;

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      const el      = entry.target;
      const target  = parseInt(el.dataset.count);
      const suffix  = el.dataset.suffix || '';
      const prefix  = el.dataset.prefix || '';
      let current   = 0;
      const step    = Math.max(1, Math.ceil(target / 50));
      const timer   = setInterval(() => {
        current = Math.min(current + step, target);
        el.textContent = prefix + current + suffix;
        if (current >= target) clearInterval(timer);
      }, 35);
      observer.unobserve(el);
    });
  }, { threshold: 0.5 });

  counters.forEach(el => observer.observe(el));
}

/* ---- Word Reveal (splits text into staggered spans, keeps inline elements) ---- */
function initWordReveal() {
  document.querySelectorAll('.reveal-words').forEach(el => {
    const nodes = Array.from(el.childNodes);
    el.innerHTML = '';
    let i = 0;
    nodes.forEach(node => {
      if (node.nodeType === 3) { // text node
        node.textContent.split(/(\s+)/).forEach(tok => {
          if (tok === '' ) return;
          if (/^\s+$/.test(tok)) { el.appendChild(document.createTextNode(tok)); return; }
          const sp = document.createElement('span');
          sp.className = 'rw';
          sp.textContent = tok;
          sp.style.transitionDelay = (i * 0.045) + 's';
          el.appendChild(sp);
          i++;
        });
      } else { // element node (e.g. <br>, <span class="serif">)
        if (node.classList) node.classList.add('rw');
        if (node.style) node.style.transitionDelay = (i * 0.045) + 's';
        el.appendChild(node);
        i++;
      }
    });
  });
}

/* ---- WA Carousel (index page) ---- */
function initWaCarousel() {
  const track = document.getElementById('waTrack');
  const prev  = document.getElementById('waPrev');
  const next  = document.getElementById('waNext');
  const dots  = document.getElementById('waDots');
  if (!track || !prev || !next) return;

  const cards = Array.from(track.querySelectorAll('.wa-screenshot-card'));
  const total = cards.length;
  let idx     = 0;
  let autoTimer;

  // Build dots
  if (dots) {
    cards.forEach((_, i) => {
      const d = document.createElement('button');
      d.className = 'wa-dot' + (i === 0 ? ' active' : '');
      d.addEventListener('click', () => goTo(i));
      dots.appendChild(d);
    });
  }

  function cardWidth() {
    return cards[0].offsetWidth + parseInt(getComputedStyle(track).gap || 24);
  }

  function goTo(n) {
    idx = ((n % total) + total) % total;
    track.style.transform = `translateX(-${idx * cardWidth()}px)`;
    if (dots) {
      dots.querySelectorAll('.wa-dot').forEach((d, i) => d.classList.toggle('active', i === idx));
    }
  }

  function startAuto() { autoTimer = setInterval(() => goTo(idx + 1), 5000); }
  function stopAuto()  { clearInterval(autoTimer); }

  prev.addEventListener('click', () => { stopAuto(); goTo(idx - 1); startAuto(); });
  next.addEventListener('click', () => { stopAuto(); goTo(idx + 1); startAuto(); });

  // Touch swipe
  let touchX = 0;
  track.addEventListener('touchstart', e => { touchX = e.touches[0].clientX; }, { passive: true });
  track.addEventListener('touchend',   e => {
    const diff = touchX - e.changedTouches[0].clientX;
    if (Math.abs(diff) > 50) goTo(diff > 0 ? idx + 1 : idx - 1);
  });

  startAuto();
}

document.addEventListener('DOMContentLoaded', initWaCarousel);
