import path from 'node:path';

export function isWithin(root, candidate) {
  const relative = path.relative(root, candidate);
  return (
    relative === '' ||
    (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative))
  );
}

export function isTrustedFrame(event, contents, expectedOrigin) {
  if (!contents || event.sender !== contents || event.senderFrame !== contents.mainFrame)
    return false;
  try {
    const url = new URL(event.senderFrame.url);
    return `${url.protocol}//${url.host}` === expectedOrigin;
  } catch {
    return false;
  }
}

export function validateExport(input) {
  if (
    !input ||
    typeof input !== 'object' ||
    typeof input.title !== 'string' ||
    typeof input.markdown !== 'string'
  ) {
    throw new Error('Invalid document.');
  }
  if (
    !input.title.trim() ||
    input.title.length > 160 ||
    input.markdown.length > 150_000 ||
    !input.markdown.trim()
  ) {
    throw new Error('The document is empty or too large.');
  }
  const filename =
    input.title
      .normalize('NFKC')
      .replace(/[^a-zA-Z0-9 _-]/g, '')
      .trim()
      .slice(0, 80) || 'MrAI brief';
  return { filename: `${filename}.md`, markdown: input.markdown };
}
