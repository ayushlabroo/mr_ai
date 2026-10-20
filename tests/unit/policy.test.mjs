import { describe, expect, it } from 'vitest';
import { isTrustedFrame, isWithin, validateExport } from '../../desktop/policy.mjs';

describe('native bridge boundary', () => {
  it('accepts only the expected origin in the actual main frame', () => {
    const frame = { url: 'ayra://app/index.html' };
    const contents = { mainFrame: frame };
    expect(isTrustedFrame({ sender: contents, senderFrame: frame }, contents, 'ayra://app')).toBe(
      true,
    );
    expect(isTrustedFrame({ sender: {}, senderFrame: frame }, contents, 'ayra://app')).toBe(false);
    expect(
      isTrustedFrame({ sender: contents, senderFrame: { url: frame.url } }, contents, 'ayra://app'),
    ).toBe(false);
    frame.url = 'https://evil.example/';
    expect(isTrustedFrame({ sender: contents, senderFrame: frame }, contents, 'ayra://app')).toBe(
      false,
    );
    frame.url = 'ayra://app.evil/index.html';
    expect(isTrustedFrame({ sender: contents, senderFrame: frame }, contents, 'ayra://app')).toBe(
      false,
    );
  });
  it('rejects paths outside the app asset root, including prefix collisions', () => {
    expect(isWithin('/app/dist', '/app/dist/assets/app.js')).toBe(true);
    expect(isWithin('/app/dist', '/app/dist-copy/private')).toBe(false);
    expect(isWithin('/app/dist', '/app/private')).toBe(false);
  });
  it('sanitises export names and rejects excessive or malformed documents', () => {
    expect(validateExport({ title: '../../my/brief', markdown: '# Demo' })).toEqual({
      filename: 'mybrief.md',
      markdown: '# Demo',
    });
    expect(() => validateExport({ title: 'ok', markdown: 'x'.repeat(150001) })).toThrow();
    expect(() => validateExport({ title: '', markdown: '# Demo' })).toThrow();
    expect(() => validateExport({ title: 'ok', markdown: '' })).toThrow();
    expect(() => validateExport({ title: 1, markdown: '# Demo' })).toThrow();
  });
});
