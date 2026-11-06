/* ==========================================================================
   YOUFLY04 — comportement du site
   Site 100 % statique : aucune base de données, aucun service tiers payant.
   La « réservation » prépare un SMS / un appel / un fichier agenda (.ics).
   ========================================================================== */
(() => {
'use strict';

/* ---------------------------------------------------------------
   ⚙️  RÉGLAGES À MODIFIER ICI (téléphone, créneaux de réservation)
   --------------------------------------------------------------- */
const CONFIG = {
  phone: '+33662701823',            // numéro au format international (pour sms: et tel:)
  phoneDisplay: '06 62 70 18 23',
  address: 'Quartier Saint-Christophe, 04000 Digne-les-Bains',
  // Créneaux proposés dans le formulaire (0 = dimanche … 6 = samedi), d'après la fiche Google
  slots: [
    { day: 1, start: '16:00', end: '19:30' },   // lundi
    { day: 3, start: '19:30', end: '21:00' },   // mercredi
    { day: 5, start: '18:00', end: '21:00' }    // vendredi
  ],
  weeksAhead: 3,
  maxSlotsShown: 6
};

const $ = (s, c = document) => c.querySelector(s);
const $$ = (s, c = document) => Array.from(c.querySelectorAll(s));
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const finePointer = matchMedia('(hover:hover) and (pointer:fine)').matches;
const hasGsap = typeof gsap !== 'undefined' && typeof ScrollTrigger !== 'undefined';
const safe = (name, fn) => { try { fn(); } catch (e) { console.warn('[youfly04] ' + name, e); } };
const raf = fn => { let t = 0; return (...a) => { if (t) return; t = requestAnimationFrame(() => { t = 0; fn(...a); }); }; };

let lenis = null;
const html = document.documentElement;

/* =========================================================
   1) Fonctions indépendantes de GSAP (marchent même sans lui)
   ========================================================= */

/* ---- Horaires : surligne le jour courant ---- */
safe('hours', () => {
  const row = $('#hours tr[data-d="' + new Date().getDay() + '"]');
  if (row) row.classList.add('today');
});

/* ---- Réservation : formulaire -> SMS / appel / .ics ---- */
safe('booking', () => {
  const form = $('#bform'); if (!form) return;
  const DAYS_S = ['Dim.', 'Lun.', 'Mar.', 'Mer.', 'Jeu.', 'Ven.', 'Sam.'];
  const DAYS_L = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
  const MON_S = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
  const MON_L = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
  const fmtT = t => t.replace(':00', 'h').replace(':', 'h');
  const pad = n => String(n).padStart(2, '0');

  // Prochains créneaux (au moins 2 h devant nous)
  const now = new Date(); const list = [];
  for (let i = 0; i <= 7 * CONFIG.weeksAhead + 1; i++) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
    CONFIG.slots.filter(s => s.day === d.getDay()).forEach(s => {
      const [h, m] = s.start.split(':').map(Number);
      const start = new Date(d.getFullYear(), d.getMonth(), d.getDate(), h, m);
      if (start - now > 2 * 3600e3) list.push({ date: d, ...s });
    });
  }
  const shown = list.slice(0, CONFIG.maxSlotsShown);
  const box = $('#chDates');
  box.innerHTML = shown.map((s, i) =>
    `<label class="choice"><input type="radio" name="slot" value="${i}"${i === 0 ? ' checked' : ''}>` +
    `<span><b>${DAYS_S[s.date.getDay()]} ${s.date.getDate()}</b><small>${MON_S[s.date.getMonth()]} · ${fmtT(s.start)}–${fmtT(s.end)}</small></span></label>`
  ).join('');

  const fName = $('#fName'), fCount = $('#fCount'), fMsg = $('#fMsg');
  const prev = $('#bPreview'), sms = $('#bSms'), hint = $('#bHint');
  const hintDefault = hint.textContent;
  const mobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

  const course = () => form.elements.course.value;
  const slot = () => { const v = form.elements.slot && form.elements.slot.value; return v === undefined || v === '' ? null : shown[+v]; };
  const text = () => {
    const c = course(), s = slot(), name = fName.value.trim(), n = Math.max(1, parseInt(fCount.value, 10) || 1), msg = fMsg.value.trim();
    const J = name ? 'Je' : 'je';
    let t = 'Bonjour Pauline, ' + (name ? 'c’est ' + name + '. ' : '');
    if (c === 'Je découvre') t += J + ' souhaite découvrir vos cours, pouvez-vous me conseiller ? ';
    else if (c === 'Stage') t += J + ' souhaite me renseigner sur les prochains stages. ';
    else t += J + ' souhaite réserver « ' + c + ' » pour ' + n + ' personne' + (n > 1 ? 's' : '') + '. ';
    if (s && c !== 'Stage') t += 'Créneau souhaité : ' + DAYS_L[s.date.getDay()] + ' ' + s.date.getDate() + ' ' + MON_L[s.date.getMonth()] + ' (' + fmtT(s.start) + '–' + fmtT(s.end) + '). ';
    else if (n > 1) t += 'Nous serions ' + n + '. ';
    if (msg) t += msg + ' ';
    return (t + 'Merci et à bientôt !').replace(/\s+\n/g, '\n').trim();
  };
  const refresh = () => {
    const t = text(); prev.textContent = t;
    sms.href = 'sms:' + CONFIG.phone + '?&body=' + encodeURIComponent(t);
    hint.textContent = hintDefault; hint.classList.remove('ok');
  };
  const say = (m, ok = true) => { hint.textContent = m; hint.classList.toggle('ok', ok); };

  const copy = async () => {
    const t = text();
    try { await navigator.clipboard.writeText(t); }
    catch (e) { const ta = document.createElement('textarea'); ta.value = t; ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); } catch (_) {} ta.remove(); }
    say('Message copié. Collez-le dans un SMS au ' + CONFIG.phoneDisplay + '.');
  };

  const ics = () => {
    const s = slot();
    if (!s) { say('Choisissez d’abord un créneau.', false); return; }
    const d = s.date, f = t => { const [h, m] = t.split(':'); return d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + 'T' + pad(h) + pad(m) + '00'; };
    const esc = v => v.replace(/[\\;,]/g, m => '\\' + m).replace(/\n/g, '\\n');
    const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
    const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Youfly04//Reservation//FR', 'CALSCALE:GREGORIAN', 'BEGIN:VEVENT',
      'UID:' + Date.now() + '@youfly04', 'DTSTAMP:' + stamp, 'DTSTART:' + f(s.start), 'DTEND:' + f(s.end),
      'SUMMARY:' + esc('Youfly04 — ' + course() + ' (créneau à confirmer)'),
      'LOCATION:' + esc(CONFIG.address),
      'DESCRIPTION:' + esc('Demande de cours envoyée à Pauline (' + CONFIG.phoneDisplay + '). Heure exacte à confirmer par SMS ou par téléphone.'),
      'BEGIN:VALARM', 'TRIGGER:-PT3H', 'ACTION:DISPLAY', 'DESCRIPTION:Cours Youfly04', 'END:VALARM', 'END:VEVENT', 'END:VCALENDAR'];
    const blob = new Blob([lines.join('\r\n')], { type: 'text/calendar;charset=utf-8' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'youfly04-cours.ics';
    document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
    say('Fichier agenda téléchargé (créneau à confirmer avec Pauline).');
  };

  form.addEventListener('input', refresh);
  form.addEventListener('change', refresh);
  form.addEventListener('submit', e => e.preventDefault());
  $('#nMinus').addEventListener('click', () => { fCount.value = Math.max(1, (parseInt(fCount.value, 10) || 1) - 1); refresh(); });
  $('#nPlus').addEventListener('click', () => { fCount.value = Math.min(12, (parseInt(fCount.value, 10) || 1) + 1); refresh(); });
  $('#bCopy').addEventListener('click', copy);
  $('#bIcs').addEventListener('click', ics);
  sms.addEventListener('click', () => { if (!mobile) { copy().then(() => say('Message copié (sur ordinateur, collez-le dans un SMS au ' + CONFIG.phoneDisplay + ').')); } });
  refresh();

  // Les boutons « Réserver ce cours » des cartes présélectionnent le cours
  $$('[data-pick]').forEach(a => a.addEventListener('click', () => {
    const val = a.getAttribute('data-pick');
    const r = $$('input[name="course"]', form).find(i => i.value === val);
    if (r) { r.checked = true; refresh(); }
  }));
});

/* ---- Avis : carrousel (défilement natif + boutons + glisser + auto) ---- */
safe('reviews', () => {
  const vp = $('#revView'); if (!vp) return;
  const cards = $$('.rcard', vp), track = $('#revTrack'), prog = $('#revProg');
  const step = () => cards[0].getBoundingClientRect().width + (parseFloat(getComputedStyle(track).columnGap) || 20);
  const update = raf(() => {
    const c = vp.getBoundingClientRect(), mid = c.left + c.width / 2;
    cards.forEach(card => {
      const r = card.getBoundingClientRect();
      card.style.setProperty('--a', Math.min(1, Math.abs(r.left + r.width / 2 - mid) / (c.width * .62)).toFixed(3));
    });
    const max = vp.scrollWidth - vp.clientWidth;
    prog.style.transform = 'scaleX(' + (max > 0 ? (.08 + .92 * vp.scrollLeft / max).toFixed(3) : 1) + ')';
  });
  vp.addEventListener('scroll', update, { passive: true });
  addEventListener('resize', update); update();
  $('#revPrev').addEventListener('click', () => vp.scrollBy({ left: -step(), behavior: reduce ? 'auto' : 'smooth' }));
  $('#revNext').addEventListener('click', () => vp.scrollBy({ left: step(), behavior: reduce ? 'auto' : 'smooth' }));
  vp.addEventListener('keydown', e => {
    if (e.key === 'ArrowRight') { e.preventDefault(); vp.scrollBy({ left: step(), behavior: 'smooth' }); }
    if (e.key === 'ArrowLeft') { e.preventDefault(); vp.scrollBy({ left: -step(), behavior: 'smooth' }); }
  });

  // glisser à la souris
  let down = false, sx = 0, sl = 0, moved = false;
  vp.addEventListener('pointerdown', e => { if (e.pointerType !== 'mouse') return; down = true; moved = false; sx = e.clientX; sl = vp.scrollLeft; });
  addEventListener('pointermove', e => {
    if (!down) return; const dx = e.clientX - sx;
    if (Math.abs(dx) > 4 && !moved) { moved = true; vp.style.scrollSnapType = 'none'; vp.style.cursor = 'grabbing'; }
    if (moved) vp.scrollLeft = sl - dx;
  });
  addEventListener('pointerup', () => { if (!down) return; down = false; if (moved) { vp.style.scrollSnapType = ''; vp.style.cursor = ''; } });

  // défilement automatique (seulement visible, sans survol, sans mouvement réduit)
  if (!reduce) {
    let timer = null, visible = false, paused = false;
    const tick = () => { const max = vp.scrollWidth - vp.clientWidth; if (vp.scrollLeft >= max - 6) vp.scrollTo({ left: 0, behavior: 'smooth' }); else vp.scrollBy({ left: step(), behavior: 'smooth' }); };
    const sync = () => { clearInterval(timer); if (visible && !paused) timer = setInterval(tick, 6500); };
    new IntersectionObserver(es => { visible = es[0].isIntersecting; sync(); }, { threshold: .35 }).observe(vp);
    ['pointerenter', 'focusin'].forEach(ev => vp.addEventListener(ev, () => { paused = true; sync(); }));
    ['pointerleave', 'focusout'].forEach(ev => vp.addEventListener(ev, () => { paused = false; sync(); }));
  }
});

/* ---- Galerie : lightbox ---- */
safe('lightbox', () => {
  const items = $$('[data-lightbox]'); const lb = $('#lb'); if (!items.length || !lb || !lb.showModal) return;
  const img = $('#lbImg'), cap = $('#lbCap'); let cur = 0, opener = null;
  const parse = el => { const [name, w, h, alt] = el.dataset.lightbox.split('|'); return { src: 'assets/img/' + name + '-1600.webp', w, h, alt, cap: ($('figcaption', el) || {}).textContent || alt }; };
  const show = i => { cur = (i + items.length) % items.length; const d = parse(items[cur]); img.src = d.src; img.alt = d.alt; img.width = d.w; img.height = d.h; cap.textContent = d.cap; };
  const open = i => { opener = items[i]; show(i); lb.showModal(); if (lenis) lenis.stop(); };
  items.forEach((el, i) => {
    el.tabIndex = 0; el.setAttribute('role', 'button'); el.setAttribute('aria-label', 'Agrandir la photo : ' + parse(el).alt);
    el.addEventListener('click', () => open(i));
    el.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(i); } });
  });
  $('#lbClose').addEventListener('click', () => lb.close());
  $('#lbPrev').addEventListener('click', () => show(cur - 1));
  $('#lbNext').addEventListener('click', () => show(cur + 1));
  lb.addEventListener('click', e => { if (e.target === lb) lb.close(); });
  lb.addEventListener('keydown', e => { if (e.key === 'ArrowLeft') show(cur - 1); if (e.key === 'ArrowRight') show(cur + 1); });
  lb.addEventListener('close', () => { if (lenis && !html.classList.contains('menu-open')) lenis.start(); if (opener) opener.focus({ preventScroll: true }); });
});

/* ---- Vidéos : lecture seulement quand elles sont visibles ---- */
safe('videos', () => {
  const vids = $$('video'); if (!vids.length) return;
  if (reduce) { vids.forEach(v => { v.removeAttribute('autoplay'); v.pause(); }); return; }
  const io = new IntersectionObserver(es => es.forEach(e => {
    const v = e.target; if (e.isIntersecting) { const p = v.play(); if (p && p.catch) p.catch(() => {}); } else v.pause();
  }), { threshold: .05 });
  vids.forEach(v => io.observe(v));
});

/* ---- Bouton flottant « Appeler » : se retire là où l'appel est déjà proposé en grand ---- */
safe('fab', () => {
  const fab = $('.fab'); const zones = $$('#reserver, #acces, .foot'); if (!fab || !('IntersectionObserver' in window)) return;
  const on = new Set();
  const io = new IntersectionObserver(es => { es.forEach(e => e.isIntersecting ? on.add(e.target) : on.delete(e.target)); fab.classList.toggle('is-away', on.size > 0); }, { threshold: .15 });
  zones.forEach(z => io.observe(z));
});
/* ---- Menu mobile + ancres ---- */
const menu = $('#menu'), burger = $('#burger'), nav = $('#nav');
let menuOpen = false;
const MENU_FROM = 'circle(0px at calc(100% - 44px) 40px)', MENU_TO = 'circle(160% at calc(100% - 44px) 40px)';
const setMenu = open => {
  if (!menu || open === menuOpen) return; menuOpen = open;
  burger.setAttribute('aria-expanded', open); burger.setAttribute('aria-label', open ? 'Fermer le menu' : 'Ouvrir le menu');
  menu.setAttribute('aria-hidden', !open); html.classList.toggle('menu-open', open);
  if (open) { menu.classList.add('is-open'); if (lenis) lenis.stop(); else document.body.style.overflow = 'hidden'; }
  else { if (lenis) lenis.start(); else document.body.style.overflow = ''; }
  if (hasGsap && !reduce) {
    if (open) {
      gsap.fromTo(menu, { clipPath: MENU_FROM }, { clipPath: MENU_TO, duration: .95, ease: 'power3.inOut' });
      gsap.fromTo('.menu__inner a', { yPercent: 115 }, { yPercent: 0, duration: .9, ease: 'expo.out', stagger: .06, delay: .3 });
      gsap.fromTo('.menu__foot', { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: .8, delay: .75 });
    } else gsap.to(menu, { clipPath: MENU_FROM, duration: .65, ease: 'power3.inOut', onComplete: () => menu.classList.remove('is-open') });
  } else { menu.style.clipPath = open ? 'none' : MENU_FROM; if (!open) menu.classList.remove('is-open'); }
};
if (burger) burger.addEventListener('click', () => setMenu(!menuOpen));
addEventListener('keydown', e => { if (e.key === 'Escape' && menuOpen) setMenu(false); });

document.addEventListener('click', e => {
  const a = e.target.closest('a[href^="#"]'); if (!a) return;
  const id = a.getAttribute('href'); if (id.length < 2) return;
  const target = $(id); if (!target) return;
  e.preventDefault();
  if (menuOpen) setMenu(false);
  const go = () => { if (lenis) lenis.scrollTo(target, { duration: 1.7, easing: t => Math.min(1, 1.001 - Math.pow(2, -10 * t)) }); else target.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth' }); };
  menuOpen ? setTimeout(go, 50) : go();
  history.replaceState(null, '', id);
});

/* ---- Plan B sans GSAP : barre de nav simple ---- */
const plainNav = () => { const f = raf(() => nav.classList.toggle('is-solid', scrollY > 40)); addEventListener('scroll', f, { passive: true }); f(); };

/* =========================================================
   2) Mouvement (GSAP + ScrollTrigger + Lenis)
   ========================================================= */
if (!hasGsap || reduce) {
  plainNav();
  body_ready();
} else {
  gsap.registerPlugin(ScrollTrigger);
  gsap.defaults({ ease: 'power3.out' });

  // Défilement fluide (inertie douce)
  if (typeof Lenis !== 'undefined') {
    lenis = new Lenis({ duration: 1.15, easing: t => Math.min(1, 1.001 - Math.pow(2, -10 * t)), smoothWheel: true, wheelMultiplier: .95, touchMultiplier: 1.4 });
    lenis.on('scroll', ScrollTrigger.update);
    gsap.ticker.add(t => lenis.raf(t * 1000));
    gsap.ticker.lagSmoothing(0);
    lenis.stop();
  }

  // Les images des zones épinglées doivent être prêtes avant le calcul des distances
  $$('.hs img, .story img, .ringframe img').forEach(i => { i.loading = 'eager'; });

  /* ---- Split text ---- */
  const splitText = (el, mode) => {
    if (el.dataset.splitDone) return [];
    el.dataset.splitDone = '1';
    if (!el.hasAttribute('aria-label') && !el.closest('[aria-label]') && !el.closest('[aria-hidden="true"]')) el.setAttribute('aria-label', el.textContent.trim().replace(/\s+/g, ' '));
    const out = [];
    const walk = node => Array.from(node.childNodes).forEach(n => {
      if (n.nodeType === 3) {
        const frag = document.createDocumentFragment();
        n.textContent.split(/(\s+)/).forEach(tok => {
          if (!tok) return;
          if (/^\s+$/.test(tok)) { frag.appendChild(document.createTextNode(' ')); return; }
          const w = document.createElement('span'); w.className = 'w'; w.setAttribute('aria-hidden', 'true');
          if (mode === 'chars') Array.from(tok).forEach(ch => { const c = document.createElement('span'); c.className = 'c'; c.textContent = ch; w.appendChild(c); out.push(c); });
          else { const c = document.createElement('span'); c.className = 'c'; c.textContent = tok; w.appendChild(c); out.push(c); }
          frag.appendChild(w);
        });
        n.replaceWith(frag);
      } else if (n.nodeType === 1 && n.tagName !== 'BR') walk(n);
    });
    walk(el); return out;
  };

  const heroChars = $$('.hero [data-split]').flatMap(el => splitText(el, el.dataset.split));
  const titleSplits = $$('[data-split]').filter(el => !el.closest('.hero')).map(el => ({ el, chars: splitText(el, el.dataset.split) }));
  titleSplits.forEach(s => gsap.set(s.chars, { yPercent: 112 }));

  /* ---- États initiaux de l'intro ---- */
  gsap.set(heroChars, { yPercent: 118 });
  gsap.set('[data-hero-fade], .hero__eyebrow, .hero__scroll', { opacity: 0, y: 30 });
  gsap.set('.hero__silk', { yPercent: -115 });
  gsap.set('.hero__ring', { scale: .72, opacity: 0, transformOrigin: '50% 50%' });
  gsap.set('.hero__media', { scale: 1.2 });
  gsap.set('.nav', { yPercent: -120 });

  /* ---- Loader : on traverse le cerceau ---- */
  const C = 528, fill = $('.loader__ring-fill'), count = $('#loaderCount');
  const state = { p: 0 };
  const render = () => { const p = Math.round(state.p); count.textContent = p; fill.style.strokeDashoffset = C * (1 - state.p / 100); };
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const posterReady = new Promise(res => { const i = new Image(); i.onload = i.onerror = res; i.src = 'assets/video/hero-poster.jpg'; });
  const fontsReady = (document.fonts && document.fonts.ready) || Promise.resolve();
  const ready = Promise.race([Promise.all([fontsReady, posterReady]), wait(3800)]);
  gsap.set('.loader__silk', { yPercent: -110 });
  gsap.to('.loader__silk', { yPercent: 0, duration: 1.4, ease: 'power4.out', stagger: .15 });
  gsap.to('.loader__silk--l', { rotation: 2.5, duration: 2.2, ease: 'sine.inOut', yoyo: true, repeat: -1 });
  gsap.to('.loader__silk--r', { rotation: -2.5, duration: 2.6, ease: 'sine.inOut', yoyo: true, repeat: -1 });
  gsap.to(state, { p: 94, duration: 1.7, ease: 'power2.out', onUpdate: render });
  let exited = false;
  const go = () => { if (exited) return; exited = true; gsap.to(state, { p: 100, duration: .4, ease: 'none', onUpdate: render, onComplete: exitLoader }); };
  Promise.all([wait(1750), ready]).then(go);
  setTimeout(go, 6000);                       // filet de sécurité : jamais bloqué sur le loader
  setTimeout(() => { if (document.body.classList.contains('is-loading')) { const l = $('#loader'); if (l) l.remove(); document.body.classList.remove('is-loading'); if (lenis) lenis.start(); ScrollTrigger.refresh(); } }, 11000);

  function exitLoader() {
    const tl = gsap.timeline({ onComplete: () => {
      $('#loader').remove(); document.body.classList.remove('is-loading');
      if (lenis) lenis.start();
      ScrollTrigger.refresh();
    }});
    tl.to('.loader__label', { opacity: 0, y: -14, duration: .35, ease: 'power2.in' })
      .to('.loader__silk', { yPercent: -120, duration: .7, ease: 'power3.in', stagger: .05 }, 0)
      // on passe à travers le cerceau
      .to('.loader__ring', { scale: 13, duration: 1.35, ease: 'expo.in', transformOrigin: '50% 50%' }, .25)
      .to('.loader__bg', { opacity: 0, duration: .6, ease: 'power2.inOut' }, .95)
      // le hero se révèle derrière
      .to('.hero__media', { scale: 1, duration: 2.2, ease: 'power3.out' }, 1.0)
      .to('.hero__ring', { scale: 1, opacity: 1, duration: 2, ease: 'expo.out', stagger: .12 }, 1.05)
      .to('.hero__silk', { yPercent: 0, duration: 2, ease: 'elastic.out(1,.6)', stagger: .15 }, 1.1)
      .to('.hero__eyebrow', { opacity: 1, y: 0, duration: .9 }, 1.25)
      .to(heroChars, { yPercent: 0, duration: 1.25, ease: 'expo.out', stagger: { each: .035, from: 'start' } }, 1.2)
      .to('[data-hero-fade]', { opacity: 1, y: 0, duration: 1, stagger: .12 }, 1.8)
      .to('.hero__scroll', { opacity: 1, y: 0, duration: 1 }, 2.1)
      .to('.nav', { yPercent: 0, duration: .9, ease: 'power3.out' }, 1.7);
  }

  /* ---- Barre de progression de lecture ---- */
  gsap.to('.progress i', { scaleX: 1, ease: 'none', scrollTrigger: { start: 0, end: 'max', scrub: .2 } });

  /* ---- Navigation : se cache en descendant, revient en remontant ---- */
  safe('nav', () => {
    let hidden = false;
    ScrollTrigger.create({ start: 0, end: 'max', onUpdate: self => {
      const y = self.scroll();
      nav.classList.toggle('is-solid', y > 40);
      const hide = self.direction === 1 && y > 260 && !menuOpen;
      const show = self.direction === -1 || y <= 260;
      if (hide && !hidden) { hidden = true; gsap.to(nav, { yPercent: -120, duration: .6, ease: 'power3.out', overwrite: true }); }
      else if (show && hidden) { hidden = false; gsap.to(nav, { yPercent: 0, duration: .6, ease: 'power3.out', overwrite: true }); }
    }});
  });

  /* ---- Curseur « anneau » ---- */
  safe('cursor', () => {
    if (!finePointer) return;
    const cur = $('.cursor'); const xTo = gsap.quickTo(cur, 'x', { duration: .28, ease: 'power3' }), yTo = gsap.quickTo(cur, 'y', { duration: .28, ease: 'power3' });
    addEventListener('pointermove', e => { xTo(e.clientX); yTo(e.clientY); }, { passive: true });
    document.addEventListener('pointerover', e => cur.classList.toggle('is-hover', !!e.target.closest('a,button,summary,label.choice,[data-tilt],.rev__viewport')));
    addEventListener('pointerdown', () => cur.classList.add('is-down')); addEventListener('pointerup', () => cur.classList.remove('is-down'));
  });

  /* ---- Boutons magnétiques ---- */
  safe('magnetic', () => {
    if (!finePointer) return;
    $$('[data-magnetic]').forEach(el => {
      const xTo = gsap.quickTo(el, 'x', { duration: .7, ease: 'elastic.out(1,.55)' }), yTo = gsap.quickTo(el, 'y', { duration: .7, ease: 'elastic.out(1,.55)' });
      el.addEventListener('pointermove', e => { const r = el.getBoundingClientRect(); xTo((e.clientX - r.left - r.width / 2) * .32); yTo((e.clientY - r.top - r.height / 2) * .4); });
      el.addEventListener('pointerleave', () => { xTo(0); yTo(0); });
    });
  });

  /* ---- Inclinaison 3D + reflet lumineux ---- */
  safe('tilt', () => {
    if (!finePointer) return;
    $$('[data-tilt]').forEach(el => {
      const isCard = el.classList.contains('card'), max = isCard ? 7 : 5;
      const rx = gsap.quickTo(el, 'rotationX', { duration: .6, ease: 'power3' }), ry = gsap.quickTo(el, 'rotationY', { duration: .6, ease: 'power3' });
      gsap.set(el, { transformPerspective: 900 });
      el.addEventListener('pointermove', e => {
        const r = el.getBoundingClientRect(), px = (e.clientX - r.left) / r.width, py = (e.clientY - r.top) / r.height;
        ry((px - .5) * 2 * max); rx(-(py - .5) * 2 * max);
        el.style.setProperty('--mx', (px * 100).toFixed(1) + '%'); el.style.setProperty('--my', (py * 100).toFixed(1) + '%');
      });
      el.addEventListener('pointerleave', () => { rx(0); ry(0); });
      const img = $('img', el);
      if (img && el.classList.contains('g')) {
        el.addEventListener('pointerenter', () => gsap.to(img, { scale: 1.09, duration: 1, ease: 'power3.out', overwrite: 'auto' }));
        el.addEventListener('pointerleave', () => gsap.to(img, { scale: 1, duration: 1, ease: 'power3.out', overwrite: 'auto' }));
      }
    });
  });

  /* ---- Titres : lettre par lettre / mot par mot ---- */
  titleSplits.forEach(({ el, chars }) => {
    const words = el.dataset.split === 'words';
    ScrollTrigger.create({ trigger: el, start: 'top 88%', once: true, onEnter: () => gsap.to(chars, { yPercent: 0, duration: 1.15, ease: 'expo.out', stagger: words ? .07 : .04 }) });
  });
  // pied de page
  safe('footgiant', () => {
    const g = $('#footGiant'); if (!g) return;
    ScrollTrigger.create({ trigger: g, start: 'top 98%', once: true, onEnter: () => gsap.to($$('.c', g), { yPercent: 0, duration: 1.4, ease: 'expo.out', stagger: .05 }) });
  });

  /* ---- Apparitions génériques ---- */
  const revealSel = '.eyebrow:not(.hero__eyebrow), .faq__intro, .book__lead, .bigphone, .book__how li, .qa, .bstep, .bout, .acc__addr, .acc__lines, .acc__h3, .hours, .acc__note, .acc__btns, .acc__mapframe, .rev__score, .rev__ctrl, .foot__tag, .foot__nav, .foot__contact';
  $$(revealSel).filter(el => !el.closest('.hero') && !el.closest('.imm')).forEach(el => el.setAttribute('data-reveal', ''));
  ScrollTrigger.batch('[data-reveal]', { start: 'top 90%', once: true, onEnter: els => gsap.to(els, { opacity: 1, y: 0, duration: 1.1, ease: 'power3.out', stagger: .1, overwrite: true }) });

  /* ---- Hero : parallax multicouche + vie ---- */
  safe('hero', () => {
    gsap.to('.hero__video', { scale: 1.09, duration: 26, ease: 'sine.inOut', yoyo: true, repeat: -1 });
    gsap.to('.hero__ring--led circle', { rotation: 360, svgOrigin: '400 400', duration: 320, ease: 'none', repeat: -1 });
    gsap.to('.hero__ring--thin circle', { rotation: -360, svgOrigin: '400 400', duration: 500, ease: 'none', repeat: -1 });
    gsap.to('.hero__silk--l', { rotation: 2.4, duration: 3.4, ease: 'sine.inOut', yoyo: true, repeat: -1, transformOrigin: '50% 0%' });
    gsap.to('.hero__silk--r', { rotation: -2.2, duration: 4.1, ease: 'sine.inOut', yoyo: true, repeat: -1, transformOrigin: '50% 0%' });
    const st = { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: true };
    // Les tweens d'entrée utilisent scale/opacity/yPercent : le parallax utilise y (pas de conflit)
    gsap.to('.hero__media', { y: () => innerHeight * .22, ease: 'none', scrollTrigger: st });
    gsap.to('.hero__ring--led', { y: -140, ease: 'none', scrollTrigger: st });
    gsap.to('.hero__ring--thin', { y: -70, ease: 'none', scrollTrigger: st });
    gsap.to('.hero__silk--l', { y: -300, ease: 'none', scrollTrigger: st });
    gsap.to('.hero__silk--r', { y: -420, ease: 'none', scrollTrigger: st });
    gsap.to('.hero__content', { y: -70, opacity: .15, ease: 'none', scrollTrigger: { trigger: '.hero', start: '35% top', end: 'bottom top', scrub: true } });
  });

  /* ---- Marquee : la vitesse et le sens réagissent au scroll ---- */
  safe('marquee', () => {
    const rows = $$('.marquee__track'); const tw = [];
    rows.forEach((t, i) => tw.push(gsap.fromTo(t, { xPercent: i % 2 ? -50 : 0 }, { xPercent: i % 2 ? 0 : -50, duration: 34, ease: 'none', repeat: -1 })));
    let dir = 1, boost = 0;
    ScrollTrigger.create({ start: 0, end: 'max', onUpdate: s => { dir = s.direction; boost = Math.min(7, Math.abs(s.getVelocity()) / 320); } });
    gsap.ticker.add(() => { boost *= .93; tw.forEach(t => t.timeScale(dir * (1 + boost))); });
  });

  /* ---- Chiffres clés ---- */
  safe('stats', () => {
    const fmt = (v, d) => v.toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d });
    $$('.stat').forEach(stat => {
      const num = $('[data-count]', stat), bar = $('.r-bar', stat), R = 2 * Math.PI * 54;
      const target = parseFloat(num.dataset.count), dec = +num.dataset.decimals || 0, pct = parseFloat(bar.dataset.pct) || 1;
      num.textContent = fmt(0, dec); bar.style.strokeDasharray = R; bar.style.strokeDashoffset = R;
      const o = { v: 0 };
      ScrollTrigger.create({ trigger: stat, start: 'top 85%', once: true, onEnter: () => {
        gsap.to(o, { v: target, duration: 2.2, ease: 'power3.out', onUpdate: () => { num.textContent = fmt(o.v, dec); } });
        gsap.to(bar, { strokeDashoffset: R * (1 - pct), duration: 2.4, ease: 'power3.out' });
      }});
    });
    const p = $('.stats__silk path');
    if (p) { const L = p.getTotalLength(); gsap.set(p, { strokeDasharray: L, strokeDashoffset: L }); gsap.to(p, { strokeDashoffset: 0, ease: 'none', scrollTrigger: { trigger: '.stats', start: 'top 85%', end: 'bottom 35%', scrub: .6 } }); }
  });

  /* ---- Galerie : révélation par masque + parallaxe dans le cadre ---- */
  safe('gallery', () => {
    $$('.g').forEach((g, i) => {
      const img = $('img', g);
      gsap.fromTo(g, { clipPath: 'inset(100% 0% 0% 0% round 22px)' }, { clipPath: 'inset(0% 0% 0% 0% round 22px)', duration: 1.4, ease: 'expo.out', clearProps: 'clipPath', scrollTrigger: { trigger: g, start: 'top 90%', once: true } });
      gsap.fromTo(img, { scale: 1.35 }, { scale: 1, duration: 1.8, ease: 'expo.out', scrollTrigger: { trigger: g, start: 'top 90%', once: true } });
      gsap.fromTo(img, { yPercent: -5 }, { yPercent: 5, ease: 'none', scrollTrigger: { trigger: g, start: 'top bottom', end: 'bottom top', scrub: true } });
    });
  });

  /* ---- Pièces « desktop » : sections épinglées ---- */
  const mm = gsap.matchMedia();

  mm.add('(min-width: 900px)', () => {
    /* Univers : storytelling épinglé en 4 temps */
    safe('story', () => {
      const steps = $$('.step'), imgs = $$('.ringframe__img'), dots = $$('.story__dots i'), bar = $('.ringframe__bar'), n = steps.length, L = 1169;
      gsap.set(steps.slice(1), { autoAlpha: 0, y: 50 });
      gsap.set(imgs.slice(1), { clipPath: 'circle(0% at 50% 50%)' });
      gsap.set(bar, { strokeDashoffset: L * (1 - 1 / n) });
      dots[0] && dots[0].classList.add('on');
      const tl = gsap.timeline({ defaults: { ease: 'none' }, scrollTrigger: {
        trigger: '.story', start: 'top top', end: () => '+=' + Math.round(innerHeight * .95 * n), pin: true, scrub: .7, anticipatePin: 1, invalidateOnRefresh: true, refreshPriority: 3,
        onUpdate: self => { const i = Math.min(n - 1, Math.round(self.progress * (n - 1))); dots.forEach((d, k) => d.classList.toggle('on', k === i)); }
      }});
      for (let i = 1; i < n; i++) {
        tl.to(steps[i - 1], { autoAlpha: 0, y: -50, duration: .35, ease: 'power2.in' }, i - .1)
          .fromTo(imgs[i], { clipPath: 'circle(0% at 50% 50%)' }, { clipPath: 'circle(75% at 50% 50%)', duration: .85, ease: 'power2.inOut' }, i - .1)
          .fromTo($('img', imgs[i]), { scale: 1.35 }, { scale: 1, duration: 1, ease: 'power2.out' }, i - .1)
          .fromTo(steps[i], { autoAlpha: 0, y: 50 }, { autoAlpha: 1, y: 0, duration: .5, ease: 'power2.out' }, i + .22);
      }
      tl.to(bar, { strokeDashoffset: 0, duration: n - 1 }, 0).to({}, { duration: .35 });
    });

    /* Cours : défilement horizontal piloté par le scroll vertical */
    safe('hscroll', () => {
      const track = $('#hsTrack'), barI = $('.hs__bar i'); if (!track) return;
      const dist = () => Math.max(0, track.scrollWidth - innerWidth);
      const h = gsap.to(track, { x: () => -dist(), ease: 'none', scrollTrigger: {
        trigger: '.hs', start: 'top top', end: () => '+=' + dist(), pin: true, scrub: .7, anticipatePin: 1, invalidateOnRefresh: true, refreshPriority: 2,
        onUpdate: self => { barI.style.transform = 'scaleX(' + self.progress.toFixed(4) + ')'; }
      }});
      $$('.card').forEach(card => {
        gsap.fromTo($('.card__img img', card), { xPercent: -4.5 }, { xPercent: 4.5, ease: 'none', scrollTrigger: { trigger: card, containerAnimation: h, start: 'left right', end: 'right left', scrub: true } });
      });
      gsap.to('.hs__end circle', { rotation: 360, svgOrigin: '100 100', ease: 'none', scrollTrigger: { trigger: '.hs', start: 'top top', end: () => '+=' + dist(), scrub: true } });
    });

    /* Immersion : le cercle s'ouvre sur la vidéo (section épinglée) */
    safe('imm-desktop', () => immersion(true));
  });

  mm.add('(max-width: 899px)', () => { safe('imm-mobile', () => immersion(false)); });

  function immersion(pin) {
    const stage = $('.imm__stage'), mask = $('#immMask'), ringC = $('#immRingC'), video = $('#immVideo'); if (!stage) return;
    ringC.setAttribute('cx', '50%'); ringC.setAttribute('cy', '50%');
    const o = { r: 0 };
    const max = () => Math.hypot(stage.clientWidth, stage.clientHeight) / 2 * 1.04;
    const min = () => Math.min(stage.clientWidth, stage.clientHeight) * .12;
    const paint = () => { mask.style.clipPath = 'circle(' + o.r.toFixed(1) + 'px at 50% 50%)'; ringC.setAttribute('r', Math.max(0, o.r).toFixed(1)); ringC.style.opacity = o.r > max() * .96 ? 0 : 1; };
    const tl = gsap.timeline({ defaults: { ease: 'none' }, scrollTrigger: pin
      ? { trigger: '.imm', start: 'top top', end: () => '+=' + Math.round(innerHeight * 1.5), pin: true, scrub: .8, anticipatePin: 1, invalidateOnRefresh: true, refreshPriority: 1 }
      : { trigger: stage, start: 'top 75%', end: 'center 35%', scrub: .6, invalidateOnRefresh: true } });
    tl.fromTo(o, { r: () => min() }, { r: () => max(), duration: 1, ease: 'power1.in', onUpdate: paint }, 0)
      .fromTo(video, { scale: 1.4 }, { scale: 1, duration: 1 }, 0)
      .fromTo('.imm__text .mask > span', { yPercent: 115 }, { yPercent: 0, duration: .45, stagger: .1, ease: 'power3.out' }, .15);
    if (pin) tl.to({}, { duration: .35 });
    paint();
    return () => { mask.style.clipPath = ''; };
  }

  /* ---- Fond de la section réservation : l'anneau tourne au scroll ---- */
  safe('bookring', () => {
    gsap.to('.book__bg svg', { rotation: 120, ease: 'none', scrollTrigger: { trigger: '.book', start: 'top bottom', end: 'bottom top', scrub: true } });
  });

  /* ---- Avis : entrée en cascade ---- */
  safe('revIn', () => {
    gsap.from('.rcard', { y: 70, opacity: 0, duration: 1.2, ease: 'expo.out', stagger: .09, scrollTrigger: { trigger: '.rev__viewport', start: 'top 85%', once: true }, clearProps: 'y,opacity' });
  });

  /* ---- Fin de chargement : recalcul des positions ---- */
  addEventListener('load', () => ScrollTrigger.refresh());
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => ScrollTrigger.refresh());
}

function body_ready() {
  // Sans animation : on affiche tout de suite
  const l = $('#loader'); if (l) l.remove(); document.body.classList.remove('is-loading');
  const m = $('#immMask'); if (m) m.style.clipPath = 'none';
}

})();
