let vscode;
try {
  vscode = require("vscode");
} catch (_) {
  vscode = undefined;
}

const DEFAULT_LABELS = "asdfghjklqwertyuiopzxcvbnm";

function uniqueChars(text) {
  const out = [];
  const seen = new Set();
  for (const ch of String(text || "")) {
    if (seen.has(ch)) continue;
    seen.add(ch);
    out.push(ch);
  }
  return out;
}

function generateLabels(count, alphabetText = DEFAULT_LABELS) {
  const alphabet = uniqueChars(alphabetText);
  if (count <= 0 || alphabet.length === 0) return [];

  let width = 1;
  while (Math.pow(alphabet.length, width) < count) width++;

  const labels = [];
  for (let n = 0; n < count; n++) {
    let value = n;
    const parts = new Array(width);
    for (let i = width - 1; i >= 0; i--) {
      parts[i] = alphabet[value % alphabet.length];
      value = Math.floor(value / alphabet.length);
    }
    labels.push(parts.join(""));
  }
  return labels;
}

function generateLabelsWithFirstAlphabet(count, firstAlphabetText, restAlphabetText = firstAlphabetText) {
  const firstAlphabet = uniqueChars(firstAlphabetText);
  const restAlphabet = uniqueChars(restAlphabetText);
  if (count <= 0 || firstAlphabet.length === 0 || restAlphabet.length === 0) return [];

  let width = 1;
  while (firstAlphabet.length * Math.pow(restAlphabet.length, width - 1) < count) width++;

  const labels = [];
  for (let n = 0; n < count; n++) {
    let value = n;
    const parts = new Array(width);
    parts[0] = firstAlphabet[value % firstAlphabet.length];
    value = Math.floor(value / firstAlphabet.length);
    for (let i = width - 1; i >= 1; i--) {
      parts[i] = restAlphabet[value % restAlphabet.length];
      value = Math.floor(value / restAlphabet.length);
    }
    labels.push(parts.join(""));
  }
  return labels;
}

function nextInputCharsForMatches(matches, query) {
  const chars = new Set();
  for (const match of matches) {
    if (!match || typeof match.text !== "string") continue;
    const relativeEnd = (match.start || 0) + query.length;
    const next = match.text[relativeEnd];
    if (next) chars.add(next.toLocaleLowerCase());
  }
  return chars;
}

function assignMatchLabels(matches, query, alphabetText = DEFAULT_LABELS) {
  const alphabet = uniqueChars(alphabetText);
  const blocked = nextInputCharsForMatches(matches, query);
  const firstAlphabet = alphabet.filter(ch => !blocked.has(ch.toLocaleLowerCase()));
  const labels = generateLabelsWithFirstAlphabet(
    matches.length,
    firstAlphabet.length > 0 ? firstAlphabet.join("") : alphabet.join(""),
    alphabet.join(""),
  );
  return matches.map((match, index) => ({ ...match, label: labels[index] }));
}

function indexOfAll(text, query, caseSensitive) {
  if (!query) return [];
  const haystack = caseSensitive ? text : text.toLocaleLowerCase();
  const needle = caseSensitive ? query : query.toLocaleLowerCase();
  const indexes = [];
  let from = 0;
  while (from <= haystack.length - needle.length) {
    const found = haystack.indexOf(needle, from);
    if (found === -1) break;
    indexes.push(found);
    from = found + Math.max(needle.length, 1);
  }
  return indexes;
}

function findLineMatches(lines, query, options = {}) {
  const caseSensitive = !!options.caseSensitive;
  const maxMatches = Number.isFinite(options.maxMatches) ? options.maxMatches : 200;
  const matches = [];

  for (let line = 0; line < lines.length && matches.length < maxMatches; line++) {
    const text = lines[line] || "";
    for (const character of indexOfAll(text, query, caseSensitive)) {
      matches.push({ line, character, length: query.length });
      if (matches.length >= maxMatches) break;
    }
  }
  return matches;
}

function getConfig() {
  const cfg = vscode.workspace.getConfiguration("flashFind");
  return {
    labels: cfg.get("labels", DEFAULT_LABELS),
    maxMatches: cfg.get("maxMatches", 200),
    caseSensitive: cfg.get("caseSensitive", false),
    minQueryLength: cfg.get("minQueryLength", 1),
  };
}

function makeState(context) {
  return {
    context,
    active: false,
    query: "",
    pendingLabel: "",
    matches: [],
    activeDecoration: undefined,
    matchDecoration: undefined,
    labelDecorations: [],
    status: undefined,
  };
}

function ensureDecorations(state) {
  if (!vscode) return;
  if (!state.activeDecoration) {
    state.activeDecoration = vscode.window.createTextEditorDecorationType({
      isWholeLine: true,
      borderColor: new vscode.ThemeColor("focusBorder"),
      borderStyle: "solid",
      borderWidth: "0 0 0 2px",
      overviewRulerColor: new vscode.ThemeColor("focusBorder"),
      overviewRulerLane: vscode.OverviewRulerLane.Left,
      rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed,
    });
    state.context.subscriptions.push(state.activeDecoration);
  }
  if (state.matchDecoration) return;
  state.matchDecoration = vscode.window.createTextEditorDecorationType({
    backgroundColor: new vscode.ThemeColor("editor.findMatchHighlightBackground"),
    border: "1px solid",
    borderColor: new vscode.ThemeColor("editor.findMatchBorder"),
  });
  state.context.subscriptions.push(state.matchDecoration);
}

function disposeLabelDecorations(state) {
  for (const decoration of state.labelDecorations) decoration.dispose();
  state.labelDecorations = [];
}

function clearVisuals(state, editor) {
  if (editor && state.activeDecoration) editor.setDecorations(state.activeDecoration, []);
  if (editor && state.matchDecoration) editor.setDecorations(state.matchDecoration, []);
  disposeLabelDecorations(state);
}

function visibleMatches(editor, query, config) {
  if (!query || query.length < config.minQueryLength) return [];

  const doc = editor.document;
  const out = [];
  const seen = new Set();

  for (const visibleRange of editor.visibleRanges) {
    const startLine = Math.max(0, visibleRange.start.line);
    const endLine = Math.min(doc.lineCount - 1, visibleRange.end.line);

    for (let line = startLine; line <= endLine && out.length < config.maxMatches; line++) {
      const text = doc.lineAt(line).text;
      for (const character of indexOfAll(text, query, config.caseSensitive)) {
        const start = new vscode.Position(line, character);
        const end = new vscode.Position(line, character + query.length);
        if (!visibleRange.contains(start) && !visibleRange.contains(end)) continue;
        const key = `${line}:${character}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ range: new vscode.Range(start, end), text, start: character });
        if (out.length >= config.maxMatches) break;
      }
    }
  }

  return out;
}

function updateVisuals(state) {
  const editor = vscode.window.activeTextEditor;
  if (!editor || !state.active) return;

  ensureDecorations(state);
  clearVisuals(state, editor);
  editor.setDecorations(state.activeDecoration, editor.visibleRanges);

  const config = getConfig();
  const matches = visibleMatches(editor, state.query, config);
  state.matches = assignMatchLabels(matches, state.query, config.labels);
  editor.setDecorations(state.matchDecoration, state.matches.map(match => match.range));

  for (const match of state.matches) {
    const labelDecoration = vscode.window.createTextEditorDecorationType({
      after: {
        contentText: match.label,
        margin: "0 0 0 1px",
        color: new vscode.ThemeColor("editorSuggestWidget.selectedForeground"),
        backgroundColor: new vscode.ThemeColor("editorSuggestWidget.selectedBackground"),
        fontWeight: "bold",
        fontStyle: "normal",
      },
      rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed,
    });
    state.labelDecorations.push(labelDecoration);
    editor.setDecorations(labelDecoration, [new vscode.Range(match.range.end, match.range.end)]);
  }

  const labelHint = state.pendingLabel ? ` label:${state.pendingLabel}` : "";
  state.status.text = `$(search) Flash: ${state.query || "type"}${labelHint} (${state.matches.length})`;
  state.status.show();
}

function stop(state) {
  const editor = vscode.window.activeTextEditor;
  clearVisuals(state, editor);
  state.active = false;
  state.query = "";
  state.pendingLabel = "";
  state.matches = [];
  if (state.status) state.status.hide();
  if (vscode) vscode.commands.executeCommand("setContext", "flashFind.active", false);
}

async function start(state) {
  const editor = vscode.window.activeTextEditor;
  if (!editor) return;
  if (!state.status) {
    state.status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    state.context.subscriptions.push(state.status);
  }
  state.active = true;
  state.query = "";
  state.pendingLabel = "";
  state.matches = [];
  await vscode.commands.executeCommand("setContext", "flashFind.active", true);
  updateVisuals(state);
}

async function jumpToMatch(state, match) {
  const editor = vscode.window.activeTextEditor;
  if (!editor) return;
  const pos = match.range.start;
  editor.selection = new vscode.Selection(pos, pos);
  editor.revealRange(match.range, vscode.TextEditorRevealType.InCenterIfOutsideViewport);
  stop(state);
}

async function tryExecuteCommand(command) {
  try {
    await vscode.commands.executeCommand(command);
    return true;
  } catch (_) {
    return false;
  }
}

function labelsForState(state) {
  return state.matches.map(match => match.label);
}

async function handleInput(state, text) {
  if (!state.active) return;
  if (!text || text.length !== 1 || text < " ") return;

  const labels = labelsForState(state);
  const candidate = state.pendingLabel + text;
  const exact = state.matches.find(match => match.label === candidate);
  const hasPrefix = labels.some(label => label.startsWith(candidate));

  if (exact) {
    await jumpToMatch(state, exact);
    return;
  }
  if (hasPrefix) {
    state.pendingLabel = candidate;
    updateVisuals(state);
    return;
  }

  state.query += candidate;
  state.pendingLabel = "";
  updateVisuals(state);
}

async function handleDeleteLeft(state) {
  if (!state.active) {
    if (await tryExecuteCommand("extension.vim_backspace")) return;
    await tryExecuteCommand("deleteLeft");
    return;
  }
  if (state.pendingLabel) state.pendingLabel = state.pendingLabel.slice(0, -1);
  else state.query = state.query.slice(0, -1);
  updateVisuals(state);
}

async function cancel(state) {
  if (!state.active) return;
  stop(state);
}

function activate(context) {
  if (!vscode) return;
  const state = makeState(context);
  vscode.commands.executeCommand("setContext", "flashFind.active", false);

  context.subscriptions.push(
    vscode.commands.registerCommand("flashFind.start", () => start(state)),
    vscode.commands.registerCommand("flashFind.cancel", () => cancel(state)),
    vscode.commands.registerCommand("flashFind.backspace", () => handleDeleteLeft(state)),
    vscode.commands.registerCommand("flashFind.input", args => handleInput(state, args && args.text)),
    vscode.window.onDidChangeTextEditorVisibleRanges(() => {
      if (state.active) updateVisuals(state);
    }),
    vscode.window.onDidChangeActiveTextEditor(() => {
      if (state.active) stop(state);
    }),
  );
}

function deactivate() {}

module.exports = {
  activate,
  deactivate,
  generateLabels,
  assignMatchLabels,
  indexOfAll,
  findLineMatches,
};
