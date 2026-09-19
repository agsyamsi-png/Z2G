import { describe, it, expect } from "vitest";
import { normalizeRfc822Headers } from "../../src/lib/migration/normalizer";
import { quarantineRestrictedAttachments, isRestrictedAttachmentFilename } from "../../src/lib/migration/quarantine";

describe("FastMigrator Architecture Pillars", () => {
  describe("Pillar 3: RFC 822 Header Normalization Engine", () => {
    it("injects missing From, Date, and Subject headers into malformed raw email", () => {
      const rawMalformed = Buffer.from("Content-Type: text/plain\r\n\r\nHello this is body text.");
      const normalized = normalizeRfc822Headers(rawMalformed, "sender@example.com", "2026-09-15T00:00:00Z");
      const normalizedStr = normalized.toString("utf-8");

      expect(normalizedStr).toContain("From: <sender@example.com>");
      expect(normalizedStr).toContain("Subject: (No Subject)");
      expect(normalizedStr).toContain("Date: ");
      expect(normalizedStr).toContain("Message-ID: ");
      expect(normalizedStr).toContain("Hello this is body text.");
    });

    it("does not mutate already valid RFC 822 email headers", () => {
      const validEmail = 
        "From: user@company.com\r\n" +
        "To: target@company.com\r\n" +
        "Date: Mon, 15 Sep 2026 10:00:00 +0000\r\n" +
        "Subject: Quarterly Report\r\n" +
        "Message-ID: <valid-msg-123@company.com>\r\n" +
        "\r\n" +
        "Quarterly report content.";

      const normalized = normalizeRfc822Headers(Buffer.from(validEmail), "fallback@company.com");
      expect(normalized.toString("utf-8")).toBe(validEmail);
    });
  });

  describe("Pillar 4: In-Flight Attachment Quarantine Engine", () => {
    it("detects restricted file extensions according to Google Workspace policies", () => {
      expect(isRestrictedAttachmentFilename("invoice.exe")).toBe(true);
      expect(isRestrictedAttachmentFilename("document.bat")).toBe(true);
      expect(isRestrictedAttachmentFilename("archive.rar")).toBe(true);
      expect(isRestrictedAttachmentFilename("script.vbs")).toBe(true);
      expect(isRestrictedAttachmentFilename("presentation.pdf")).toBe(false);
      expect(isRestrictedAttachmentFilename("spreadsheet.xlsx")).toBe(false);
    });

    it("quarantines prohibited attachments and replaces them with security notice", () => {
      const boundary = "==BOUNDARY_12345==";
      const rawEmail = 
        `Content-Type: multipart/mixed; boundary="${boundary}"\r\n` +
        `From: sender@domain.com\r\n` +
        `\r\n` +
        `--${boundary}\r\n` +
        `Content-Type: text/plain\r\n` +
        `\r\n` +
        `Please check attached file.\r\n` +
        `--${boundary}\r\n` +
        `Content-Type: application/octet-stream; name="malicious_payload.exe"\r\n` +
        `Content-Disposition: attachment; filename="malicious_payload.exe"\r\n` +
        `\r\n` +
        `TVqQAAMAAAAEAAAA//8AALgAAAAAAAAAQAA...FAKEEXE\r\n` +
        `--${boundary}--\r\n`;

      const result = quarantineRestrictedAttachments(Buffer.from(rawEmail));
      expect(result.modified).toBe(true);
      expect(result.quarantinedFiles).toContain("malicious_payload.exe");

      const sanitizedStr = result.content.toString("utf-8");
      expect(sanitizedStr).toContain("quarantined_malicious_payload.exe.txt");
      expect(sanitizedStr).not.toContain("TVqQAAMAAAAEAAAA//8AALgAAAAAAAAAQAA...FAKEEXE");
      expect(sanitizedStr).toContain("Content-Type: text/plain");
    });
  });
});
