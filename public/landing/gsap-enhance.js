/* =============================================
   POTENTIEEL — application.html
   Couche d'amélioration GSAP + ScrollTrigger + Draggable.
   Additive uniquement : ne modifie ni ne supprime les animations
   CSS existantes (badgeFloat, mockFloat, toolBob, ticker...).
   Le scroll reste natif (pas de lissage type Lenis) : ScrollTrigger
   écoute directement le scroll natif du navigateur.
   ============================================= */

document.addEventListener('DOMContentLoaded', () => {
  if (typeof gsap === 'undefined') return;

  gsap.registerPlugin(ScrollTrigger, Draggable, InertiaPlugin, SplitText);

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduceMotion) return; // le HTML affiche déjà l'état final (aucune animation à sauter)

  initHeroTitleSplit();
  initHeroParallax();
  initBpKpiCounters();
  initBpChartGrow();
  initToolCardStagger();
  initToolsFusion();
});

/* ---- Centralisation : vidéo « fusion des outils » plein écran, pilotée au scroll ----
   ScrollTrigger épingle la section (100vh) dès qu'elle remplit l'écran, puis mappe
   la progression du scroll sur video.currentTime (bas = avance, haut = rembobine).
   Le titre en overlay s'estompe dès que la fusion démarre. Fin du scrub → dépin →
   la page continue normalement. */
function initToolsFusion() {
  const pin     = document.querySelector('.tools-fusion-pin');
  const video   = document.querySelector('.tools-scrolly-video');
  const overlay = document.querySelector('.tools-fusion-overlay');
  if (!pin || !video) return;

  let duration = video.duration || 0;
  let warmed = false;

  // Réveille le pipeline de décodage (surtout iOS) : lecture muette aussitôt mise en pause.
  function warmup() {
    if (warmed) return; warmed = true;
    const p = video.play();
    if (p && p.then) p.then(() => video.pause()).catch(() => {});
    else { try { video.pause(); } catch (e) {} }
  }

  function seek(progress) {
    warmup();
    if (duration) { try { video.currentTime = progress * duration; } catch (e) {} }
    if (overlay) overlay.style.opacity = String(Math.max(0, 1 - progress / 0.16));
  }

  const st = ScrollTrigger.create({
    trigger: pin,
    start: 'top top',
    end: () => '+=' + Math.round((window.innerHeight || 800) * 1.5), // course de scroll (plus courte = déroulé plus rapide/sensible)
    pin: true,
    pinSpacing: true,
    scrub: 0.5,                 // léger lissage → fluide dans les deux sens
    invalidateOnRefresh: true,
    onUpdate: self => seek(self.progress),
  });

  // La durée peut n'être connue qu'après le chargement des métadonnées.
  if (video.readyState < 1) {
    video.addEventListener('loadedmetadata', () => {
      duration = video.duration || 0;
      seek(st.progress);
      ScrollTrigger.refresh();
    }, { once: true });
  }
}

/* ---- H1 hero : cascade mot par mot, en plus du fondu de bloc existant (.hero-entry) ---- */
function initHeroTitleSplit() {
  const h1 = document.querySelector('.hero-modern-text h1');
  if (!h1 || typeof SplitText === 'undefined') return;

  const split = SplitText.create(h1, { type: 'words' });
  gsap.from(split.words, {
    opacity: 0,
    duration: 0.5,
    stagger: 0.045,
    delay: 0.5,
    ease: 'power2.out',
  });
}

/* ---- Parallax léger sur le visuel du hero (le conteneur lui-même n'a aucune animation propre) ---- */
function initHeroParallax() {
  const visual = document.querySelector('.hero-modern-visual');
  const hero = document.querySelector('.hero-modern');
  if (!visual || !hero) return;

  gsap.to(visual, {
    y: 46,
    ease: 'none',
    scrollTrigger: {
      trigger: hero,
      start: 'top top',
      end: 'bottom top',
      scrub: true,
    },
  });
}

/* ---- KPI BatiPilot : comptent depuis 0 au scroll (lit la valeur déjà écrite dans le HTML) ---- */
function initBpKpiCounters() {
  document.querySelectorAll('.bp-kpi b').forEach((el) => {
    const match = el.textContent.trim().match(/^(\d+)(.*)$/);
    if (!match) return;
    const target = parseInt(match[1], 10);
    const suffix = match[2] || '';
    const counter = { val: 0 };

    ScrollTrigger.create({
      trigger: el,
      start: 'top 88%',
      once: true,
      onEnter: () => {
        gsap.to(counter, {
          val: target,
          duration: 1.3,
          ease: 'power2.out',
          onUpdate: () => { el.textContent = Math.round(counter.val) + suffix; },
        });
      },
    });
  });
}

/* ---- Barres du mini-graphique BatiPilot : poussent depuis 0 au scroll ---- */
function initBpChartGrow() {
  const bars = document.querySelectorAll('.bp-chart span');
  if (!bars.length) return;
  const targets = Array.from(bars).map((b) => b.style.height);
  gsap.set(bars, { height: 0 });

  ScrollTrigger.create({
    trigger: '.bp-chart',
    start: 'top 85%',
    once: true,
    onEnter: () => {
      bars.forEach((bar, i) => {
        gsap.to(bar, {
          height: targets[i],
          duration: 0.9,
          delay: i * 0.06,
          ease: 'power3.out',
        });
      });
    },
  });
}

/* ---- Cartes outils : entrée en cascade par catégorie (opacity uniquement, ne touche pas au bob CSS) ---- */
function initToolCardStagger() {
  document.querySelectorAll('.tools-category').forEach((cat) => {
    const cards = cat.querySelectorAll('.tool-flip');
    if (!cards.length) return;
    gsap.set(cards, { opacity: 0 });

    ScrollTrigger.create({
      trigger: cat,
      start: 'top 88%',
      once: true,
      onEnter: () => {
        gsap.to(cards, {
          opacity: 1,
          duration: 0.45,
          stagger: 0.06,
          ease: 'power1.out',
        });
      },
    });
  });
}
