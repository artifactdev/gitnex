import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { EDITOR_COLORS, withEditorColors } from './theme';

describe('editor background (K34)', () => {
  it("is the app's --app-bg0 (no reddish dark-plus #1e1e1e), gutter and minimap included", () => {
    const tokens = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'theme', 'tokens.css'), 'utf8');
    const appBg = tokens.match(/--app-bg0:\s*(#[0-9a-f]{6})/i)![1].toLowerCase();
    expect(EDITOR_COLORS['editor.background']).toBe(appBg);
    expect(EDITOR_COLORS['editorGutter.background']).toBe(appBg);
    expect(EDITOR_COLORS['minimap.background']).toBe(appBg);
  });
});

describe('editor theme colours', () => {
  it("one selection colour, focused or not, matching the app's ::selection (--selection-bg)", () => {
    expect(EDITOR_COLORS['editor.selectionBackground']).toBe('#264f78');
    expect(EDITOR_COLORS['editor.inactiveSelectionBackground']).toBe('#264f78');
  });

  it("scrollbar sliders match the app's scrollbars (--scroll-thumb-bg / -hover-bg), with no shadow", () => {
    expect(EDITOR_COLORS['scrollbarSlider.background']).toBe('#ffffff26');
    expect(EDITOR_COLORS['scrollbarSlider.hoverBackground']).toBe('#ffffff40');
    expect(EDITOR_COLORS['scrollbarSlider.activeBackground']).toBe('#ffffff40');
    expect(EDITOR_COLORS['scrollbar.shadow']).toBe('#00000000');
  });

  it("diff colours: brick red at 20% for changed text, 15% for whole lines; green toned down (H8)", () => {
    // Red: #f85149 at 20% for changed text, line backgrounds faded a further 25%. Green (H8): #3fb950, a
    // whole added block stacks Monaco's line-insert and its whole-line char-insert, so 10% + 12%
    // composite to ~21% for the added block, instead of 32%.
    expect(EDITOR_COLORS['diffEditor.insertedTextBackground']).toBe('#3fb9501f');
    expect(EDITOR_COLORS['diffEditor.removedTextBackground']).toBe('#f8514933');
    expect(EDITOR_COLORS['diffEditor.insertedLineBackground']).toBe('#3fb9501a');
    expect(EDITOR_COLORS['diffEditor.removedLineBackground']).toBe('#f8514926');
    expect(EDITOR_COLORS['diffEditorGutter.insertedLineBackground']).toBe('#3fb9501a');
    expect(EDITOR_COLORS['diffEditorGutter.removedLineBackground']).toBe('#f8514926');
    // The overview ruler and minimap stay bright (the user likes them).
    expect(EDITOR_COLORS['diffEditorOverview.insertedForeground']).toBe('#3fb95099');
    expect(EDITOR_COLORS['diffEditorOverview.removedForeground']).toBe('#f8514999');
  });

  it("layers them over the Shiki theme's own colours, keeping the rest of the theme", () => {
    const base = { name: 'dark-plus', type: 'dark', colors: { 'editor.background': '#1E1E1E', 'editor.inactiveSelectionBackground': '#3A3D41' }, tokenColors: [{ scope: 'x', settings: {} }] };
    const t = withEditorColors(base);
    expect(t.name).toBe('dark-plus');
    expect(t.tokenColors).toBe(base.tokenColors);
    expect(t.colors['editor.background']).toBe('#00020d');
    expect(t.colors['editor.inactiveSelectionBackground']).toBe('#264f78');
    expect(base.colors['editor.inactiveSelectionBackground']).toBe('#3A3D41');
  });
});
