(function () {
  'use strict';

  const vscode = acquireVsCodeApi();

  let notes = [];
  let activeFilter = 'all';
  let fileFilterOn = false;
  let currentUserId = null;

  let editorFile = null;

  // ── Init ────────────────────────────────────────────────────────────────────

  vscode.postMessage({ type: 'ready' });
  vscode.postMessage({ type: 'getContext' });

  // ── Mensagens vindas do extension host ──────────────────────────────────────

  window.addEventListener('message', e => {
    const msg = e.data;

    if (msg.type === 'load') {
      notes = msg.notes;
      currentUserId = msg.userId ?? null;
      renderNotes();
    }

    if (msg.type === 'context') {
      editorFile = msg.filePath;
      renderNotes();
    }
  });

  // ── Event listeners ─────────────────────────────────────────────────────────

  document.getElementById('search-input')
    .addEventListener('input', renderNotes);

  document.getElementById('f-all')
    .addEventListener('click', () => setFilter('all'));

  document.getElementById('f-private')
    .addEventListener('click', () => setFilter('private'));

  document.getElementById('f-public')
    .addEventListener('click', () => setFilter('public'));

  document.getElementById('btn-file-filter')
    .addEventListener('click', toggleFileFilter);

  document.getElementById('btn-new-note')
    .addEventListener('click', () => {
      vscode.postMessage({ type: 'newNote' });
    });

  // ── Render ──────────────────────────────────────────────────────────────────

  function renderNotes() {
    const list = document.getElementById('notes-list');
    const q = document.getElementById('search-input').value.toLowerCase();

    const filtered = notes.filter(n => {
      if (activeFilter === 'private' && n.scope !== 'private') { return false; }
      if (activeFilter === 'public'  && n.scope !== 'public')  { return false; }
      if (fileFilterOn && n.filePath !== editorFile)            { return false; }
      if (q && !(n.text ?? '').toLowerCase().includes(q) && !(n.filePath ?? '').toLowerCase().includes(q)) {
        return false;
      }
      return true;
    });

    if (!filtered.length) {
      list.innerHTML = buildEmptyState();
      return;
    }

    const globalNotes = filtered.filter(n => !n.filePath);
    const byFile      = groupByFile(filtered.filter(n => n.filePath));

    list.innerHTML = NoteGroups.buildGroups(globalNotes, byFile, buildNoteItem);
    NoteGroups.bindGroupToggle(list);
  }

  function buildNoteItem(n) {
    const label = n.scope === 'private' ? 'privada' : 'pública';
    const title = firstLine(n.text);
    const date  = n.createdAt.slice(0, 10);

    return `
      <div class="note-item" id="note-${n.id}" data-id="${n.id}" role="button" tabindex="0" title="Abrir nota">
        <div class="note-item-inner">
          <span class="note-title-text">${escapeHtml(title)}</span>
          <span class="note-date">${date}</span>
        </div>
      </div>`;
  }

  function firstLine(text) {
    if (!text) { return 'Nota vazia'; }
    const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    if (!lines.length) { return 'Nota vazia'; }

    const heading = lines.find(l => /^#{1,3}\s+/.test(l));
    if (heading) {
      const clean = heading.replace(/^#+\s*/, '').trim();
      return clean.length > 48 ? clean.substring(0, 48) + '…' : clean;
    }

    const todoLines = lines.filter(l => /^- \[[ xX]\]/.test(l));
    if (todoLines.length === lines.length) {
      const total = lines.length;
      const done  = lines.filter(l => /^- \[[xX]\]/.test(l)).length;
      return 'Checklist (' + done + '/' + total + ')';
    }

    const firstTodo = lines[0].match(/^- \[[ xX]\] (.+)/);
    if (firstTodo) {
      const lbl    = firstTodo[1].trim();
      const suffix = lines.length > 1 ? ' +' + (lines.length - 1) : '';
      return (lbl.length > 44 ? lbl.substring(0, 44) + '…' : lbl) + suffix;
    }

    if (lines[0].startsWith('|') && lines[0].endsWith('|')) { return 'Tabela'; }

    const clean = lines[0].replace(/\|/g, '').trim();
    return clean.length > 48 ? clean.substring(0, 48) + '…' : clean;
  }

  function buildEmptyState() {
    return '<div class="empty-state">'
      + '<i class="ti ti-notes-off"></i>'
      + '<p>Sem anotações.<br>Cria uma nova abaixo.</p>'
      + '</div>';
  }

  // ── Event delegation ─────────────────────────────────────────────────────────

  document.getElementById('notes-list').addEventListener('click', e => {
    const noteItem = e.target.closest('.note-item');
    if (noteItem) {
      const id = noteItem.dataset.id;
      vscode.postMessage({ type: 'openNote', id });
    }
  });

  // Acessibilidade: Enter/Space também abre
  document.getElementById('notes-list').addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') {
      const noteItem = e.target.closest('.note-item');
      if (noteItem) {
        e.preventDefault();
        const id = noteItem.dataset.id;
        vscode.postMessage({ type: 'openNote', id });
      }
    }
  });

  // ── Actions ─────────────────────────────────────────────────────────────────

  function setFilter(f) {
    activeFilter = f;
    ['all', 'private', 'public'].forEach(id => {
      document.getElementById('f-' + id).classList.toggle('active', id === f);
    });
    vscode.postMessage({type: 'filter', scope: f})
    //renderNotes();
  }

  function toggleFileFilter() {
    fileFilterOn = !fileFilterOn;
    document.getElementById('btn-file-filter').classList.toggle('active', fileFilterOn);
    renderNotes();
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────

  function groupByFile(notes) {
    return notes.reduce((acc, n) => {
      if (!acc[n.filePath]) { acc[n.filePath] = []; }
      acc[n.filePath].push(n);
      return acc;
    }, {});
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

}());