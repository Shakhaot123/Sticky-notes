// Sticky Notes — Alpine.js component. Registered before Alpine starts.
document.addEventListener('alpine:init', () => {
  const KEY = 'sticky-notes-alpine-v1';
  const COLORS = { yellow: '#fde68a', green: '#bbf7d0', blue: '#bae6fd', pink: '#fbcfe8', purple: '#ddd6fe', orange: '#fed7aa' };
  const MIN_W = 200, MIN_H = 160, BAR_H = 36;

  // Strip scripts and inline handlers from note HTML (used for stored + imported data)
  function sanitize(html) {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    doc.querySelectorAll('script,style,iframe,object,embed,link,meta').forEach(el => el.remove());
    doc.body.querySelectorAll('*').forEach(el => [...el.attributes].forEach(a => {
      if (/^on/i.test(a.name) || /javascript:/i.test(a.value)) el.removeAttribute(a.name);
    }));
    return doc.body.innerHTML;
  }

  // Guarantee every field exists with a valid value
  const normalize = n => ({
    id: String(n.id || crypto.randomUUID()),
    title: String(n.title || ''),
    html: sanitize(String(n.html || '')),
    color: COLORS[n.color] ? n.color : 'yellow',
    x: Number.isFinite(n.x) ? Math.max(0, n.x) : 40,
    y: Number.isFinite(n.y) ? Math.max(0, n.y) : 40,
    w: Math.max(MIN_W, Number(n.w) || 260),
    h: Math.max(MIN_H, Number(n.h) || 240),
    z: Number(n.z) || 1,
    min: !!n.min, prev: n.prev || null
  });

  const textOf = html => { const d = document.createElement('div'); d.innerHTML = html; return d.textContent || ''; };

  Alpine.data('notesApp', () => ({
    notes: [], query: '', filter: 'all', colors: COLORS, barH: BAR_H, maxZ: 1, timer: null,

    init() {
      try {
        const data = JSON.parse(localStorage.getItem(KEY) || '[]');
        this.notes = Array.isArray(data) ? data.map(normalize) : [];
      } catch (e) { this.notes = []; }
      this.maxZ = Math.max(1, ...this.notes.map(n => n.z));
      this.$watch('notes', () => this.save()); // deep watch: any edit saves
    },

    // Debounced save to localStorage
    save() {
      clearTimeout(this.timer);
      this.timer = setTimeout(() => {
        try { localStorage.setItem(KEY, JSON.stringify(this.notes)); }
        catch (e) { console.warn('Could not save notes:', e); }
      }, 250);
    },

    /* ---- Search + filter ---- */
    visible(n) {
      const q = this.query.trim().toLowerCase();
      const hit = !q || (n.title + ' ' + textOf(n.html)).toLowerCase().includes(q);
      return hit && (this.filter === 'all' || n.color === this.filter);
    },
    get visibleCount() { return this.notes.filter(n => this.visible(n)).length; },

    /* ---- Note actions ---- */
    addNote() {
      const i = this.notes.length, keys = Object.keys(COLORS);
      const n = normalize({
        color: keys[i % keys.length],
        x: 40 + (i % 8) * 28 + document.getElementById('canvas').scrollLeft,
        y: 30 + (i % 8) * 28 + document.getElementById('canvas').scrollTop,
        z: ++this.maxZ
      });
      this.query = ''; this.filter = 'all';
      this.notes.push(n);
      this.$nextTick(() => document.querySelector(`[data-id="${n.id}"] .note-body`)?.focus());
    },
    remove(n) { this.notes = this.notes.filter(x => x.id !== n.id); },
    front(n) { if (n.z < this.maxZ || this.maxZ === 1) n.z = ++this.maxZ; },
    toggleMax(n) {
      if (n.prev) { n.w = n.prev.w; n.h = n.prev.h; n.prev = null; }
      else { n.prev = { w: n.w, h: n.h }; n.w = 520; n.h = 420; }
      n.min = false;
    },

    /* ---- Rich text ---- */
    fmt(cmd, n, e) {
      document.execCommand(cmd, false, null);
      n.html = e.currentTarget.closest('.note').querySelector('.note-body').innerHTML;
    },
    pastePlain(e) { document.execCommand('insertText', false, e.clipboardData.getData('text/plain')); },

    /* ---- Drag & resize (pointer events: mouse + touch) ---- */
    startDrag(e, n) {
      if (e.target.closest('button, input')) return;
      this.track(e, n, (dx, dy, s) => { n.x = Math.max(0, s.x + dx); n.y = Math.max(0, s.y + dy); }, true);
    },
    startResize(e, n) {
      this.track(e, n, (dx, dy, s) => { n.w = Math.max(MIN_W, s.w + dx); n.h = Math.max(MIN_H, s.h + dy); n.prev = null; }, false);
    },
    track(e, n, apply, dragging) {
      e.preventDefault();
      const el = e.currentTarget, card = el.closest('.note');
      const start = { px: e.clientX, py: e.clientY, x: n.x, y: n.y, w: n.w, h: n.h };
      card.classList.toggle('dragging', dragging);
      el.setPointerCapture(e.pointerId);
      const move = ev => apply(ev.clientX - start.px, ev.clientY - start.py, start);
      const up = () => {
        card.classList.remove('dragging');
        ['pointermove', 'pointerup', 'pointercancel'].forEach((t, i) => el.removeEventListener(t, [move, up, up][i]));
      };
      el.addEventListener('pointermove', move);
      el.addEventListener('pointerup', up);
      el.addEventListener('pointercancel', up);
    },

    /* ---- Header actions ---- */
    clearAll() {
      if (this.notes.length && confirm(`Delete all ${this.notes.length} notes? This cannot be undone.`)) this.notes = [];
    },
    exportNotes() {
      const blob = new Blob([JSON.stringify(this.notes, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `sticky-notes-${new Date().toISOString().slice(0, 10)}.json`;
      a.click(); URL.revokeObjectURL(a.href);
    },
    async importNotes(e) {
      const file = e.target.files[0]; if (!file) return;
      try {
        const data = JSON.parse(await file.text());
        if (!Array.isArray(data)) throw new Error('Expected a list of notes');
        const ids = new Set(this.notes.map(n => n.id));
        data.map(normalize).forEach(n => {
          if (ids.has(n.id)) n.id = crypto.randomUUID();
          n.z = ++this.maxZ; this.notes.push(n);
        });
      } catch (err) { alert('Import failed: ' + err.message + '. Choose a JSON file exported from this app.'); }
      e.target.value = '';
    }
  }));
});
