import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
} from 'node:crypto';
const SCRYPT_N = 32768;
const SCRYPT_R = 8;
const SCRYPT_P = 1;

function derive(
  password: string,
  salt: Buffer,
  length: number,
  n: number,
  r: number,
  p: number,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCallback(
      password,
      salt,
      length,
      { N: n, r, p, maxmem: 64 * 1024 * 1024 },
      (error, value) => {
        if (error) reject(error);
        else resolve(value);
      },
    );
  });
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

export function randomNumericToken(
  digits = 10,
  source: (size: number) => Buffer = randomBytes,
): string {
  let value = '';
  while (value.length < digits) {
    for (const byte of source(digits - value.length)) {
      if (byte < 250) value += String(byte % 10);
      if (value.length === digits) break;
    }
  }
  return value;
}

export function tokenHash(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = await derive(
    password,
    salt,
    64,
    SCRYPT_N,
    SCRYPT_R,
    SCRYPT_P,
  );
  return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt.toString('base64url')}$${derived.toString('base64url')}`;
}

export async function verifyPassword(
  password: string,
  encoded: string,
): Promise<boolean> {
  const [algorithm, n, r, p, saltValue, hashValue] = encoded.split('$');
  if (algorithm !== 'scrypt' || !n || !r || !p || !saltValue || !hashValue)
    return false;
  try {
    const expected = Buffer.from(hashValue, 'base64url');
    const actual = await derive(
      password,
      Buffer.from(saltValue, 'base64url'),
      expected.length,
      Number(n),
      Number(r),
      Number(p),
    );
    return (
      expected.length === actual.length && timingSafeEqual(expected, actual)
    );
  } catch {
    return false;
  }
}

const blockedPasswords = new Set([
  'password1234',
  'password12345',
  '123456789012',
  'qwerty123456',
  'admin12345678',
  'welcome123456',
  'letmein123456',
  'zenovel123456',
]);

export function passwordPolicyErrors(
  password: string,
  username = '',
): string[] {
  const errors: string[] = [];
  if (password.length < 12)
    errors.push('Password must be at least 12 characters.');
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password))
    errors.push('Password must contain letters and numbers.');
  const normalized = password.toLowerCase();
  if (blockedPasswords.has(normalized) || /^(.)\1{11,}$/.test(password))
    errors.push('Choose a password that is not commonly used.');
  if (username.length >= 3 && normalized.includes(username.toLowerCase()))
    errors.push('Password must not contain the username.');
  return errors;
}

const base32Alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export function base32Encode(value: Buffer): string {
  let bits = '';
  for (const byte of value) bits += byte.toString(2).padStart(8, '0');
  let output = '';
  for (let index = 0; index < bits.length; index += 5) {
    output +=
      base32Alphabet[
        Number.parseInt(bits.slice(index, index + 5).padEnd(5, '0'), 2)
      ];
  }
  return output;
}
function base32Decode(value: string): Buffer {
  let bits = '';
  for (const character of value.replace(/=+$/g, '').toUpperCase()) {
    const index = base32Alphabet.indexOf(character);
    if (index < 0) throw new Error('Invalid Base32');
    bits += index.toString(2).padStart(5, '0');
  }
  const bytes: number[] = [];
  for (let index = 0; index + 8 <= bits.length; index += 8)
    bytes.push(Number.parseInt(bits.slice(index, index + 8), 2));
  return Buffer.from(bytes);
}

export function generateTotpSecret(): string {
  return base32Encode(randomBytes(20));
}
export function totp(secret: string, time = Date.now()): string {
  const counter = Math.floor(time / 30_000);
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac('sha1', base32Decode(secret))
    .update(buffer)
    .digest();
  const offset = digest[digest.length - 1]! & 0x0f;
  const code = (digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000;
  return code.toString().padStart(6, '0');
}
export function verifyTotp(
  secret: string,
  code: string,
  time = Date.now(),
): boolean {
  if (!/^\d{6}$/.test(code)) return false;
  return [-1, 0, 1].some((window) => {
    const expected = Buffer.from(totp(secret, time + window * 30_000));
    const actual = Buffer.from(code);
    return timingSafeEqual(expected, actual);
  });
}

export function encryptSecret(secret: string, base64Key: string): string {
  const key = Buffer.from(base64Key, 'base64');
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(secret, 'utf8'),
    cipher.final(),
  ]);
  return [iv, cipher.getAuthTag(), ciphertext]
    .map((item) => item.toString('base64url'))
    .join('.');
}
export function decryptSecret(encoded: string, base64Key: string): string {
  const [iv, tag, ciphertext] = encoded
    .split('.')
    .map((item) => Buffer.from(item!, 'base64url'));
  const decipher = createDecipheriv(
    'aes-256-gcm',
    Buffer.from(base64Key, 'base64'),
    iv!,
  );
  decipher.setAuthTag(tag!);
  return Buffer.concat([
    decipher.update(ciphertext!),
    decipher.final(),
  ]).toString('utf8');
}
