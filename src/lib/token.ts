// Confusable characters (0/O/I/L/1) excluded so tokens stay legible when shared verbally.
export const TOKEN_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export function generateToken(len = 6): string {
  let out = '';
  for (let i = 0; i < len; i++) {
    out += TOKEN_ALPHABET[Math.floor(Math.random() * TOKEN_ALPHABET.length)];
  }
  return out;
}

export const TOKEN_INPUT_PATTERN = /[^a-zA-Z0-9]/g;
export const TOKEN_VALID_PATTERN = /^[a-zA-Z0-9]{4,32}$/;

export function sanitizeTokenInput(raw: string): string {
  return raw.replace(TOKEN_INPUT_PATTERN, '').slice(0, 32);
}
