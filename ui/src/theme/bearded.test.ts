import { createHighlighterCore } from 'shiki/core';
import { createOnigurumaEngine } from 'shiki/engine/oniguruma';
import php from 'shiki/langs/php.mjs';
import { describe, expect, it } from 'vitest';
import { beardedArcBlueberry } from './bearded';

describe('Bearded Arc Blueberry Shiki theme', () => {
  it('highlights PHP with the theme colors', async () => {
    const hl = await createHighlighterCore({ themes: [beardedArcBlueberry], langs: [php], engine: createOnigurumaEngine(import('shiki/wasm')) });
    const tokens = hl.codeToTokensBase('<?php\n$name = "arc"; // hi\nreturn 42;\n', { lang: 'php', theme: 'bearded-arc-blueberry' }).flat();
    const color = (text: string) => tokens.find((t) => t.content.trim().replace(/^["$]|"$/g, '') === text)?.color?.toLowerCase();
    expect(color('arc')).toBe('#3cec85');
    expect(color('name')).toBe('#ff738a');
    expect(color('return')).toBe('#eacd61');
    expect(color('42')).toBe('#e35535');
    expect(tokens.find((t) => t.content.includes('hi'))?.color?.toLowerCase()).toBe('#3c4776');
    hl.dispose();
  });

  it('gives Monaco the theme background and foreground', () => {
    expect(beardedArcBlueberry.type).toBe('dark');
    expect(beardedArcBlueberry.colors?.['editor.background']).toBe('#111422');
    expect(beardedArcBlueberry.colors?.['editor.foreground']).toBe('#bcc1dc');
  });
});
