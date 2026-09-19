import crypto from "crypto";

/**
 * Formats a Date object to RFC 2822 date string (e.g., "Mon, 20 Sep 2026 01:00:00 +0000").
 */
export function formatRfc2822Date(date: Date = new Date()): string {
  return date.toUTCString();
}

/**
 * Repairs missing or corrupted RFC 822 headers in raw MIME email bytes in-flight.
 * Google Workspace users.messages.import requires valid headers; missing From/Date can cause HTTP 400 Bad Request.
 */
export function normalizeRfc822Headers(
  rawContent: Buffer | string,
  fallbackSender: string,
  fallbackDate?: Date | string
): Buffer {
  const buf = Buffer.isBuffer(rawContent) ? rawContent : Buffer.from(rawContent, "utf-8");

  // Locate the header/body delimiter (\r\n\r\n or \n\n)
  let headerEnd = buf.indexOf(Buffer.from("\r\n\r\n"));
  let delimiterLen = 4;
  if (headerEnd === -1) {
    headerEnd = buf.indexOf(Buffer.from("\n\n"));
    delimiterLen = 2;
  }

  const headerBytes = headerEnd !== -1 ? buf.subarray(0, headerEnd) : buf;
  const bodyBytes = headerEnd !== -1 ? buf.subarray(headerEnd + delimiterLen) : Buffer.alloc(0);
  const headerStr = headerBytes.toString("latin1");

  // Parse top-level header keys (case-insensitive)
  const headerLines = headerStr.split(/\r?\n/);
  const existingHeaders = new Set<string>();

  for (const line of headerLines) {
    if (/^[ \t]/.test(line)) continue; // Folded header line
    const colonIdx = line.indexOf(":");
    if (colonIdx > 0) {
      existingHeaders.add(line.slice(0, colonIdx).trim().toLowerCase());
    }
  }

  const additions: string[] = [];

  // 1. Ensure From: exists
  if (!existingHeaders.has("from")) {
    additions.push(`From: <${fallbackSender}>`);
  }

  // 2. Ensure Date: exists
  if (!existingHeaders.has("date")) {
    let dateObj: Date;
    if (fallbackDate instanceof Date) {
      dateObj = fallbackDate;
    } else if (typeof fallbackDate === "string" && !isNaN(Date.parse(fallbackDate))) {
      dateObj = new Date(fallbackDate);
    } else {
      dateObj = new Date();
    }
    additions.push(`Date: ${formatRfc2822Date(dateObj)}`);
  }

  // 3. Ensure Subject: exists
  if (!existingHeaders.has("subject")) {
    additions.push("Subject: (No Subject)");
  }

  // 4. Ensure Message-ID: exists
  if (!existingHeaders.has("message-id")) {
    const uuid = crypto.randomUUID();
    const domain = fallbackSender.includes("@") ? fallbackSender.split("@")[1] : "migration.local";
    additions.push(`Message-ID: <${uuid}@${domain}>`);
  }

  // If nothing missing, return original buffer directly
  if (additions.length === 0) {
    return buf;
  }

  // Prepend missing headers
  const additionBlock = Buffer.from(additions.join("\r\n") + "\r\n", "latin1");
  const crlf = Buffer.from("\r\n\r\n", "latin1");

  return Buffer.concat([additionBlock, headerBytes, crlf, bodyBytes]);
}
