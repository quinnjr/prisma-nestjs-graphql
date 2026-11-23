/**
 * Returns the text after `tag` when `line` starts with it, otherwise undefined.
 * Example: stripTag('@deprecated Use X', '@deprecated') => 'Use X'
 */
export function stripTag(line: string, tag: string): string | undefined {
  if (!line.startsWith(tag)) {
    return undefined;
  }

  return line.slice(tag.length).trim();
}
