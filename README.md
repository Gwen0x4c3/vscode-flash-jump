# VSCode Flash Jump

A small VSCode extension that brings flash.nvim-style jump labels to VSCodeVim.

Start VSCode Flash Jump, type a literal search query, then type the label shown next to the target match. The cursor jumps to that match and the mode exits.

## Commands

| Command | Description |
|---|---|
| `flashFind.start` | Enter flash jump mode |
| `flashFind.cancel` | Exit flash jump mode |
| `flashFind.backspace` | Delete one query or pending-label character while flash jump mode is active |

## VSCodeVim mapping

Add this to your VSCode `settings.json`:

```json
{
  "vim.normalModeKeyBindingsNonRecursive": [
    {
      "before": ["s"],
      "commands": ["flashFind.start"]
    },
    {
      "before": ["<BS>"],
      "commands": ["flashFind.backspace"]
    }
  ]
}
```

Do not map insert-mode `Esc` yourself. The extension contributes an `Esc`
keybinding that is active only while flash jump mode is active, so normal insert-mode
escape keeps working.

VSCode Flash Jump does not switch VSCodeVim into insert mode. While it is
active, the extension captures `a-z`, `0-9`, common code punctuation such as
`_`, `-`, `.`, `/`, `:`, and `Esc` / `Backspace` through conditional VSCode
keybindings. After jump or cancel, those keybindings turn off and VSCodeVim
normal mode receives keys normally again.

VSCodeVim owns the physical Backspace key in normal mode, so the `<BS>` mapping
above is needed for reliable query deletion. When flash jump mode is inactive,
`flashFind.backspace` forwards to VSCodeVim's normal Backspace command.

## Behavior

- Matches are limited to the visible editor ranges.
- Search is literal, not regex.
- Matching is case-insensitive by default.
- Labels are generated from the configured label alphabet.
- If there are more matches than label characters, labels become two or more characters.

## Settings

| Setting | Default | Description |
|---|---:|---|
| `flashFind.labels` | `asdfghjklqwertyuiopzxcvbnm` | Characters used to generate labels |
| `flashFind.maxMatches` | `200` | Maximum visible matches to label |
| `flashFind.caseSensitive` | `false` | Use case-sensitive matching |
| `flashFind.minQueryLength` | `1` | Minimum query length before showing matches |
