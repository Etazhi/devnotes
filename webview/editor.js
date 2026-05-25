// Convert - [ ] and - [x] syntax to interactive checkboxes
function renderChecklists(content) {
  return content
    .replace(/- \[ \] (.+)/g, '<li class="todo"><input type="checkbox"> $1</li>')
    .replace(/- \[x\] (.+)/gi, '<li class="todo done"><input type="checkbox" checked> $1</li>');
}

function insertTable(rows = 3, cols = 3) {
  const header = '| ' + Array(cols).fill('Header').join(' | ') + ' |';
  const divider = '|' + Array(cols).fill('---').join('|') + '|';
  const row = '| ' + Array(cols).fill('Cell').join(' | ') + ' |';
  const rows_content = Array(rows - 1).fill(row).join('\n');
  return `${header}\n${divider}\n${rows_content}`;
}

function insertChecklist() {
  return '- [ ] Tarefa 1\n- [ ] Tarefa 2\n- [x] Tarefa concluída';
}