import path from "path";

/**
 * File extensions strictly blocked by Google Workspace Gmail attachment policies.
 * Reference: https://support.google.com/mail/answer/6590
 */
export const GOOGLE_RESTRICTED_EXTENSIONS = new Set([
  ".ade", ".adp", ".apk", ".appx", ".appxbundle", ".bat", ".cab", ".chm",
  ".cmd", ".com", ".cpl", ".diagcab", ".diagcfg", ".dll", ".dmg", ".ex",
  ".exe", ".flvh", ".hta", ".img", ".ins", ".iso", ".isp", ".jar", ".jnlp",
  ".js", ".jse", ".lib", ".lnk", ".mde", ".msc", ".msi", ".msix", ".msixbundle",
  ".msp", ".mst", ".nsh", ".pif", ".ps1", ".scr", ".sct", ".shb", ".sys",
  ".vb", ".vbe", ".vbs", ".vxd", ".wsc", ".wsf", ".wsh", ".xnk", ".rar"
]);

/**
 * Checks whether a given filename has a restricted attachment extension.
 */
export function isRestrictedAttachmentFilename(filename: string): boolean {
  if (!filename) return false;
  const ext = path.extname(filename.trim()).toLowerCase();
  return GOOGLE_RESTRICTED_EXTENSIONS.has(ext);
}

/**
 * In-Flight Attachment Quarantine Engine (Pillar 4 of FastMigrator).
 * Scans MIME multipart payload, locates prohibited file attachments (.exe, .bat, .scr, .rar, etc.),
 * and replaces the binary payload with an informative ASCII security quarantine notice.
 */
export function quarantineRestrictedAttachments(
  rawContent: Buffer | string
): { modified: boolean; content: Buffer; quarantinedFiles: string[] } {
  const contentStr = Buffer.isBuffer(rawContent)
    ? rawContent.toString("latin1")
    : rawContent;

  const quarantinedFiles: string[] = [];

  // Find multipart boundary if present
  const boundaryMatch = contentStr.match(/boundary=["']?([^"';\r\n]+)["']?/i);
  if (!boundaryMatch) {
    return {
      modified: false,
      content: Buffer.isBuffer(rawContent) ? rawContent : Buffer.from(rawContent, "utf-8"),
      quarantinedFiles: [],
    };
  }

  const boundary = boundaryMatch[1];
  const delimiter = `--${boundary}`;
  const parts = contentStr.split(delimiter);

  if (parts.length <= 1) {
    return {
      modified: false,
      content: Buffer.isBuffer(rawContent) ? rawContent : Buffer.from(rawContent, "utf-8"),
      quarantinedFiles: [],
    };
  }

  let modified = false;
  const newParts: string[] = [];

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    // Check if this part contains a filename or name
    const filenameMatch = part.match(/(?:filename|name)=["']?([^"';\r\n]+)["']?/i);
    if (!filenameMatch) {
      newParts.push(part);
      continue;
    }

    const filename = filenameMatch[1].trim();
    if (!isRestrictedAttachmentFilename(filename)) {
      newParts.push(part);
      continue;
    }

    // Split part headers and part body
    let splitIdx = part.indexOf("\r\n\r\n");
    let crlfLen = 4;
    if (splitIdx === -1) {
      splitIdx = part.indexOf("\n\n");
      crlfLen = 2;
    }

    if (splitIdx === -1) {
      newParts.push(part);
      continue;
    }

    modified = true;
    quarantinedFiles.push(filename);

    let partHeaders = part.slice(0, splitIdx);
    const notice = 
`[SECURITY QUARANTINE NOTICE]
Attachment '${filename}' was quarantined during migration
in compliance with Google Workspace Attachment Security Policies.
Original File Name: ${filename}
Migration Timestamp: ${new Date().toISOString()}
`;
    const base64Notice = Buffer.from(notice, "utf-8").toString("base64");

    // Update part headers to plain text and update filename
    partHeaders = partHeaders
      .replace(new RegExp(`filename=["']?${filename}["']?`, "gi"), `filename="quarantined_${filename}.txt"`)
      .replace(new RegExp(`name=["']?${filename}["']?`, "gi"), `name="quarantined_${filename}.txt"`);

    if (/Content-Type:[^\r\n]+/i.test(partHeaders)) {
      partHeaders = partHeaders.replace(
        /Content-Type:[^\r\n]+/i,
        `Content-Type: text/plain; charset=utf-8; name="quarantined_${filename}.txt"`
      );
    }

    if (/Content-Transfer-Encoding:[^\r\n]+/i.test(partHeaders)) {
      partHeaders = partHeaders.replace(
        /Content-Transfer-Encoding:[^\r\n]+/i,
        "Content-Transfer-Encoding: base64"
      );
    } else {
      partHeaders += "\r\nContent-Transfer-Encoding: base64";
    }

    // Reconstruct sanitized part (preserving any trailing CRLF before next boundary)
    const trailingNewline = part.endsWith("\r\n") ? "\r\n" : (part.endsWith("\n") ? "\n" : "");
    newParts.push(`${partHeaders}${crlfLen === 4 ? "\r\n\r\n" : "\n\n"}${base64Notice}${trailingNewline}`);
  }

  if (!modified) {
    return {
      modified: false,
      content: Buffer.isBuffer(rawContent) ? rawContent : Buffer.from(rawContent, "utf-8"),
      quarantinedFiles: [],
    };
  }

  const resultStr = newParts.join(delimiter);
  return {
    modified: true,
    content: Buffer.from(resultStr, "latin1"),
    quarantinedFiles,
  };
}
