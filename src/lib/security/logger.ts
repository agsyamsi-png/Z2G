/**
 * Secure logging utility that automatically scrubs sensitive credentials,
 * auth tokens, passwords, and private keys from log output.
 */

const SENSITIVE_PATTERNS = [
  /password\s*[:=]\s*['"]?([^'",\s]+)['"]?/gi,
  /source_password\s*[:=]\s*['"]?([^'",\s]+)['"]?/gi,
  /authorization\s*:\s*bearer\s+([a-zA-Z0-9_\-.]+)/gi,
  /private_key\s*[:=]\s*['"]?([^'",]+)['"]?/gi,
  /"private_key":\s*"([^"]+)"/gi,
  /client_secret\s*[:=]\s*['"]?([^'",\s]+)['"]?/gi,
];

export function redactSensitive(input: string): string {
  if (typeof input !== "string") {
    try {
      input = JSON.stringify(input);
    } catch {
      return "[UNSERIALIZABLE]";
    }
  }

  let sanitized = input;
  for (const pattern of SENSITIVE_PATTERNS) {
    sanitized = sanitized.replace(pattern, (match, secret) => {
      if (secret) {
        return match.replace(secret, "[REDACTED_SECRET]");
      }
      return "[REDACTED]";
    });
  }
  return sanitized;
}

export const secureLogger = {
  info(message: string, ...args: unknown[]) {
    const sanitizedMsg = redactSensitive(message);
    const sanitizedArgs = args.map((a) =>
      typeof a === "string" ? redactSensitive(a) : JSON.parse(redactSensitive(JSON.stringify(a)))
    );
    console.log(`[INFO] ${sanitizedMsg}`, ...sanitizedArgs);
  },

  warn(message: string, ...args: unknown[]) {
    const sanitizedMsg = redactSensitive(message);
    const sanitizedArgs = args.map((a) =>
      typeof a === "string" ? redactSensitive(a) : JSON.parse(redactSensitive(JSON.stringify(a)))
    );
    console.warn(`[WARN] ${sanitizedMsg}`, ...sanitizedArgs);
  },

  error(message: string, ...args: unknown[]) {
    const sanitizedMsg = redactSensitive(message);
    const sanitizedArgs = args.map((a) =>
      typeof a === "string" ? redactSensitive(a) : JSON.parse(redactSensitive(JSON.stringify(a)))
    );
    console.error(`[ERROR] ${sanitizedMsg}`, ...sanitizedArgs);
  },

  debug(message: string, ...args: unknown[]) {
    if (process.env.DEBUG === "true") {
      const sanitizedMsg = redactSensitive(message);
      const sanitizedArgs = args.map((a) =>
        typeof a === "string" ? redactSensitive(a) : JSON.parse(redactSensitive(JSON.stringify(a)))
      );
      console.debug(`[DEBUG] ${sanitizedMsg}`, ...sanitizedArgs);
    }
  },
};
