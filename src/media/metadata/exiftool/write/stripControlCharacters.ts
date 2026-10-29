/** Strips ASCII control characters (U+0000–U+001F, U+007F) from text. */
export function stripControlCharacters(value: string): string {
  let result = '';
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code > 0x1f && code !== 0x7f) {
      result += value[i];
    }
  }
  return result;
}
