export type ZohoValidationResult =
  | { success: true; messageCount?: number; host: string }
  | {
      success: false;
      errorType:
        | "ZOHO_AUTH_FAILED"
        | "ZOHO_IMAP_DISABLED"
        | "ZOHO_NETWORK_TIMEOUT"
        | "ZOHO_RATE_LIMITED";
      reason: string;
      canRetry?: boolean;
      retryAfterSeconds?: number;
    };

export type GoogleValidationResult =
  | { success: true; profileEmail: string; messagesTotal?: number }
  | {
      success: false;
      errorType:
        | "GOOGLE_USER_NOT_FOUND"
        | "GOOGLE_API_ACCESS_FAILED"
        | "GOOGLE_RATE_LIMITED";
      reason: string;
      canRetry?: boolean;
      retryAfterSeconds?: number;
    };

export interface MailboxValidationResult {
  mappingId: string;
  revision: number;
  zohoResult: ZohoValidationResult;
  googleResult: GoogleValidationResult;
  overallStatus: "READY" | "FAILED" | "WARNING" | "MIGRATING";
  safeReason?: string;
  validatedAt: string;
}
