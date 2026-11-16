import {coverCrop, revealColumns, floatingPreviewPosition} from './interaction-math.js?v=floating-1';

const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const finePointer = matchMedia('(hover: hover) and (pointer: fine)');
const previews = [...document.querySelectorAll('.work-preview')].filter(preview => !preview.closest('.handoff-final-frame'));
const visibility = new Map();
const visibilityObserver = new IntersectionObserver(entries => {
  for (const entry of entries) {
    visibility.set(entry.target, entry.isIntersecting);
    syncPreview(entry.target);
  }
}, {threshold: 0});

function syncPreview(preview) {
  preview.classList.toggle('is-preview-engaged', preview.dataset.engaged === 'true' && !document.hidden);
  const active = preview.dataset.engaged === 'true' && finePointer.matches && !reduced.matches && !document.hidden && visibility.get(preview) !== false;
  preview.classList.toggle('is-preview-active', active);
}

for (const preview of previews) {
  const card = preview.closest('.project-card,.archive-card') || preview;
  const track = preview.querySelector('.work-preview-track');
  const measure = () => preview.style.setProperty('--pan-distance', `${track ? Math.max(0, track.scrollHeight - preview.clientHeight) : 0}px`);
  const sizeObserver = new ResizeObserver(measure);
  sizeObserver.observe(preview);
  if (track) sizeObserver.observe(track);
  for (const image of track?.querySelectorAll('img') || []) image.addEventListener('load', measure);
  let hovered = false, keyboardFocused = false;
  const engage = value => { preview.dataset.engaged = String(value); syncPreview(preview); };
  card.addEventListener('pointerenter', event => {if (event.pointerType !== 'touch') {hovered = true; engage(true);}});
  card.addEventListener('pointerleave', () => {hovered = false; engage(keyboardFocused);});
  card.addEventListener('focusin', event => {keyboardFocused = event.target.matches(':focus-visible'); engage(hovered || keyboardFocused);});
  card.addEventListener('focusout', event => {if (!card.contains(event.relatedTarget)) {keyboardFocused = false; engage(hovered);}});
  card.addEventListener('pointermove', event => {
    const rect = preview.getBoundingClientRect();
    preview.style.setProperty('--view-x', `${Math.max(40, Math.min(rect.width - 40, event.clientX - rect.left))}px`);
    preview.style.setProperty('--view-y', `${Math.max(22, Math.min(rect.height - 22, event.clientY - rect.top))}px`);
  });
  visibilityObserver.observe(preview);
  measure();
}
const refreshPreviews = () => previews.forEach(syncPreview);
document.addEventListener('visibilitychange', refreshPreviews);
reduced.addEventListener('change', refreshPreviews);
finePointer.addEventListener('change', refreshPreviews);

const capabilities = document.querySelector('#capabilities');
if (capabilities) {
  const rows = [...capabilities.querySelectorAll('.capability-row')];
  const figure = capabilities.querySelector('.capability-preview');
  const home = capabilities.querySelector('.capabilities-sticky');
  const canvas = figure.querySelector('canvas');
  const context = canvas.getContext('2d');
  const fallback = figure.querySelector('img');
  const caption = figure.querySelector('.capability-preview-title');
  const counter = figure.querySelector('.capability-preview-count');
  const compact = matchMedia('(max-width:760px)');
  const imageCache = new Map();
  const small = document.createElement('canvas');
  const smallContext = small.getContext('2d');
  let activeRow = null, index = 0, generation = 0, raf = 0, cycle = 0, leaveTimer = 0;
  let pointerRaf = 0, positioned = false;
  let pointer = {x: 0, y: 0}, current = {x: 0, y: 0}, target = {x: 0, y: 0};

  function placeFigure() {
    const floating = !compact.matches && finePointer.matches;
    figure.classList.toggle('is-floating', floating);
    const parent = floating ? document.body : activeRow || home;
    if (figure.parentElement !== parent) parent.append(figure);
  }
  function paintPosition() {
    figure.style.setProperty('--float-x', `${current.x.toFixed(2)}px`);
    figure.style.setProperty('--float-y', `${current.y.toFixed(2)}px`);
  }
  function followPointer() {
    pointerRaf = 0;
    if (!activeRow || !figure.classList.contains('is-floating')) return;
    current.x += (target.x - current.x) * .22;
    current.y += (target.y - current.y) * .22;
    paintPosition();
    if (Math.abs(target.x - current.x) + Math.abs(target.y - current.y) > .2) pointerRaf = requestAnimationFrame(followPointer);
  }
  function positionAt(x, y, immediate = false) {
    pointer = {x, y};
    if (!figure.classList.contains('is-floating')) return;
    target = floatingPreviewPosition(x, y, figure.offsetWidth, figure.offsetHeight, innerWidth, innerHeight);
    if (!positioned || immediate || reduced.matches) {
      current = {...target};
      positioned = true;
      paintPosition();
    } else if (!pointerRaf) pointerRaf = requestAnimationFrame(followPointer);
  }
  function loadImage(src) {
    if (!imageCache.has(src)) imageCache.set(src, new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = reject;
      image.src = src;
    }));
    return imageCache.get(src);
  }
  async function showImage(row, selectedIndex, token) {
    const entries = JSON.parse(row.dataset.previews);
    const entry = entries[selectedIndex];
    caption.textContent = entry.title;
    counter.textContent = `${String(selectedIndex + 1).padStart(2, '0')} / ${String(entries.length).padStart(2, '0')}`;
    positionAt(pointer.x, pointer.y);
    cancelAnimationFrame(raf);
    fallback.src = entry.src;
    fallback.alt = entry.title;
    fallback.hidden = !!context;
    canvas.setAttribute('aria-label', entry.title);
    if (context) context.clearRect(0, 0, canvas.width, canvas.height);
    try {
      const image = await loadImage(entry.src);
      if (token !== generation || activeRow !== row) return;
      if (!context || !smallContext) {canvas.hidden = true; fallback.hidden = false; return;}
      canvas.hidden = false;
      canvas.width = 720;
      canvas.height = 540;
      const crop = coverCrop(image.naturalWidth, image.naturalHeight, canvas.width, canvas.height);
      const started = performance.now();
      function frame(now) {
        if (token !== generation || activeRow !== row) return;
        const progress = reduced.matches ? 1 : Math.min(1, (now - started) / 720);
        const columns = revealColumns(progress, canvas.width);
        small.width = columns;
        small.height = Math.max(1, Math.round(columns * canvas.height / canvas.width));
        smallContext.drawImage(image, ...crop, 0, 0, small.width, small.height);
        context.imageSmoothingEnabled = false;
        context.clearRect(0, 0, canvas.width, canvas.height);
        context.drawImage(small, 0, 0, canvas.width, canvas.height);
        if (progress < 1) raf = requestAnimationFrame(frame);
      }
      raf = requestAnimationFrame(frame);
    } catch {
      if (token === generation) {canvas.hidden = true; fallback.hidden = false;}
    }
  }
  function activate(row, event) {
    clearTimeout(leaveTimer);
    if (activeRow === row) {if (event) positionAt(event.clientX, event.clientY); return;}
    activeRow = row;
    index = 0;
    const token = ++generation;
    for (const candidate of rows) candidate.querySelector('button').setAttribute('aria-expanded', String(candidate === row));
    placeFigure();
    const rect = row.querySelector('button').getBoundingClientRect();
    positionAt(event?.clientX ?? rect.left, event?.clientY ?? (rect.top + rect.height / 2), true);
    figure.classList.add('is-visible');
    figure.setAttribute('aria-hidden', 'false');
    capabilities.classList.add('is-previewing');
    showImage(row, index, token);
    clearInterval(cycle);
    if (!reduced.matches) cycle = setInterval(() => {
      if (document.hidden || !activeRow) return;
      const count = JSON.parse(row.dataset.previews).length;
      index = (index + 1) % count;
      showImage(row, index, ++generation);
    }, 3200);
  }
  function hide() {
    activeRow = null;
    generation++;
    cancelAnimationFrame(raf);
    cancelAnimationFrame(pointerRaf);
    pointerRaf = 0;
    positioned = false;
    clearInterval(cycle);
    figure.classList.remove('is-visible');
    figure.setAttribute('aria-hidden', 'true');
    capabilities.classList.remove('is-previewing');
    for (const row of rows) row.querySelector('button').setAttribute('aria-expanded', 'false');
  }
  for (const row of rows) {
    const button = row.querySelector('button');
    row.addEventListener('pointerenter', event => {if (finePointer.matches && event.pointerType !== 'touch') activate(row, event);});
    row.addEventListener('pointermove', event => {if (activeRow === row && event.pointerType !== 'touch') positionAt(event.clientX, event.clientY);});
    row.addEventListener('pointerleave', () => {
      if (!row.contains(document.activeElement)) leaveTimer = setTimeout(hide, 100);
    });
    button.addEventListener('focus', () => {if (finePointer.matches || button.matches(':focus-visible')) activate(row);});
    button.addEventListener('blur', () => {if (!row.matches(':hover')) hide();});
    button.addEventListener('click', () => activate(row));
  }
  capabilities.addEventListener('keydown', event => {if (event.key === 'Escape') hide();});
  function reflowFigure() {placeFigure(); if (activeRow) positionAt(pointer.x, pointer.y, true);}
  compact.addEventListener('change', reflowFigure);
  finePointer.addEventListener('change', reflowFigure);
  addEventListener('resize', reflowFigure);
  addEventListener('scroll', () => {if (activeRow && figure.classList.contains('is-floating')) hide();}, {passive: true});
  reduced.addEventListener('change', () => {if (activeRow) {const row = activeRow; hide(); activate(row);}});
}
