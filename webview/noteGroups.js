(function () {
  'use strict';

  // Estado de colapso por grupo — persiste enquanto o webview estiver vivo
  const collapsedGroups = new Set();

  /**
   * Constrói o HTML de todos os grupos (ficheiros + globais).
   * @param {Array}  globalNotes  notas sem filePath
   * @param {Object} byFile       { filePath: [nota, ...] }
   * @param {Function} buildNoteItem  função de main.js que gera o HTML de uma nota
   */
  function buildGroups(globalNotes, byFile, buildNoteItem) {
    let html = '';

    // ── Grupo global ──────────────────────────────────────────────────────────
    if (globalNotes.length) {
      const id        = '__global__';
      const collapsed = collapsedGroups.has(id);
      html += buildGroupHeader(id, null, 'Notes', globalNotes.length, collapsed);
      html += `<div class="group-body${collapsed ? '' : ' open'}" data-group="${id}">`;
      globalNotes.forEach(n => { html += buildNoteItem(n); });
      html += '</div><div class="divider"></div>';
    }

    // ── Grupos por ficheiro ───────────────────────────────────────────────────
    Object.entries(byFile).forEach(([file, items]) => {
      const id        = 'file::' + file;
      const collapsed = collapsedGroups.has(id);
      const short     = file.split('/').pop();
      html += buildGroupHeader(id, 'ti-file', short, items.length, collapsed);
      html += `<div class="group-body${collapsed ? '' : ' open'}" data-group="${id}">`;
      items.forEach(n => { html += buildNoteItem(n); });
      html += '</div><div class="divider"></div>';
    });

    return html;
  }

  /**
   * Header clicável de um grupo.
   */
  function buildGroupHeader(id, icon, label, count, collapsed) {
    const iconHtml = icon
      ? `<i class="ti ${icon}" style="font-size:11px;margin-right:4px"></i>`
      : '';
    return `
      <div class="note-group-header" data-group="${id}">
        <span class="note-group-label-text">
          ${iconHtml}
          <span class="group-name">${escapeHtml(label.toUpperCase())}</span>
          <span class="group-count">${count}</span>
        </span>
        <i class="ti ti-chevron-down group-chevron${collapsed ? ' collapsed' : ''}"></i>
      </div>`;
  }

  /**
   * Liga os eventos de colapso numa lista já renderizada.
   * Chama esta função depois de definir list.innerHTML.
   */
  function bindGroupToggle(listEl) {
    listEl.querySelectorAll('.note-group-header').forEach(header => {
      header.addEventListener('click', () => {
        const id   = header.dataset.group;
        const body = listEl.querySelector(`.group-body[data-group="${id}"]`);
        const chev = header.querySelector('.group-chevron');
        if (!body) { return; }

        const isOpen = body.classList.contains('open');
        if (isOpen) {
          body.classList.remove('open');
          chev.classList.add('collapsed');
          collapsedGroups.add(id);
        } else {
          body.classList.add('open');
          chev.classList.remove('collapsed');
          collapsedGroups.delete(id);
        }
      });
    });
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // Expõe para main.js
  window.NoteGroups = { buildGroups, bindGroupToggle };

}());