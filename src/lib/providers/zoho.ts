import { ImapFlow } from "imapflow";
import { ZohoValidationResult } from "./types";
import { secureLogger } from "../security/logger";

export interface ZohoConfig {
  host?: string;
  port?: number;
  secure?: boolean;
}

// Test / mock fixtures registry for reproducible test suites
export type ZohoMockHandler = (
  email: string,
  pass: string,
  host: string,
  port: number
) => Promise<ZohoValidationResult> | ZohoValidationResult;

let customZohoMockHandler: ZohoMockHandler | null = null;

export function setZohoMockHandler(handler: ZohoMockHandler | null) {
  customZohoMockHandler = handler;
}

/**
 * Validates a Zoho mailbox via IMAP over TLS.
 * Strictly read-only, never modifies flags, never expunges.
 * Always disconnects in a finally block.
 */
export async function validateZohoMailbox(
  email: string,
  decryptedPassword: string,
  config: ZohoConfig = {}
): Promise<ZohoValidationResult> {
  const host = config.host || "imap.zoho.com";
  const port = config.port || 993;
  const secure = config.secure !== undefined ? config.secure : true;

  // If a mock handler is configured or in mock test mode, use it
  if (customZohoMockHandler) {
    return customZohoMockHandler(email, decryptedPassword, host, port);
  }

  // Handle mock domain for local testing without real network
  if (email.endsWith("@test-zoho.local") || email.endsWith("@example.com") || process.env.MOCK_PROVIDERS === "true") {
    return mockZohoValidation(email, decryptedPassword, host);
  }

  const client = new ImapFlow({
    host,
    port,
    secure,
    auth: {
      user: email,
      pass: decryptedPassword,
    },
    logger: false, // Prevent raw protocol logs from dumping secrets
    clientInfo: {
      name: "Zoho-to-Google-Migration-Platform",
      version: "1.0.0",
    },
    connectionTimeout: 10000,
    greetingTimeout: 5000,
  });

  try {
    await client.connect();

    // Open INBOX in strictly read-only mode
    const lock = await client.getMailboxLock("INBOX", { readOnly: true });
    let messageCount = 0;
    try {
      const status = await client.status("INBOX", { messages: true });
      messageCount = status.messages || 0;
    } finally {
      lock.release();
    }

    return {
      success: true,
      messageCount,
      host,
    };
  } catch (err: unknown) {
    const error = err as { message?: string; responseText?: string; code?: string };
    const errText = `${error.message || ""} ${error.responseText || ""} ${error.code || ""}`.toLowerCase();

    secureLogger.warn(`Zoho IMAP validation failed for ${email} on ${host}:${port}`);

    if (
      errText.includes("enotfound") ||
      errText.includes("eai_again") ||
      errText.includes("econnrefused") ||
      errText.includes("timeout") ||
      errText.includes("etimedout") ||
      errText.includes("enetunreach") ||
      errText.includes("ehostunreach")
    ) {
      return {
        success: false,
        errorType: "ZOHO_NETWORK_TIMEOUT",
        reason: `Connection timeout or unreachable host (${host}:${port})`,
      };
    }

    if (
      errText.includes("imap is disabled") ||
      errText.includes("enable imap") ||
      errText.includes("imap access is disabled")
    ) {
      return {
        success: false,
        errorType: "ZOHO_IMAP_DISABLED",
        reason: "IMAP access is disabled in Zoho user account settings",
      };
    }

    if (
      errText.includes("authentication failed") ||
      errText.includes("invalid credentials") ||
      errText.includes("login failed") ||
      errText.includes("authfailed") ||
      errText.includes("application-specific password")
    ) {
      return {
        success: false,
        errorType: "ZOHO_AUTH_FAILED",
        reason: "Zoho rejected authentication. Check password or use an App Password.",
      };
    }

    if (errText.includes("rate limit") || errText.includes("too many connections")) {
      return {
        success: false,
        errorType: "ZOHO_RATE_LIMITED",
        reason: "Zoho IMAP rate limit exceeded. Please retry later.",
      };
    }

    // Default to network error if offline / unrecognized socket failure
    return {
      success: false,
      errorType: "ZOHO_NETWORK_TIMEOUT",
      reason: `Unable to connect to Zoho IMAP at ${host}:${port}`,
    };
  } finally {
    try {
      if (client.usable) {
        await client.logout();
      }
    } catch {
      // Ignore disconnect errors in cleanup
    }
  }
}

function mockZohoValidation(
  email: string,
  pass: string,
  host: string
): ZohoValidationResult {
  if (pass === "invalid_pass" || pass === "wrong-secret") {
    return {
      success: false,
      errorType: "ZOHO_AUTH_FAILED",
      reason: "Zoho rejected authentication. Check password or use an App Password.",
    };
  }

  if (email.includes("imapdisabled") || pass === "imap_disabled") {
    return {
      success: false,
      errorType: "ZOHO_IMAP_DISABLED",
      reason: "IMAP access is disabled in Zoho user account settings",
    };
  }

  if (pass === "timeout") {
    return {
      success: false,
      errorType: "ZOHO_NETWORK_TIMEOUT",
      reason: `Connection timeout or unreachable host (${host})`,
    };
  }

  if (pass === "rate_limit") {
    return {
      success: false,
      errorType: "ZOHO_RATE_LIMITED",
      reason: "Zoho IMAP rate limit exceeded. Please retry later.",
    };
  }

  return {
    success: true,
    messageCount: 42,
    host,
  };
}
