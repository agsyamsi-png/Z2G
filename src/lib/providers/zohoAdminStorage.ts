import fs from "fs";
import path from "path";
import { secureLogger } from "../security/logger";

export interface ZohoStorageRecord {
  firstName: string;
  lastName: string;
  email: string;
  allottedGb: number;
  usedGb: number;
  usedPercent: number;
  usedSizeBytes: number;
  estimatedMessages: number;
}

let storageMap: Map<string, ZohoStorageRecord> | null = null;

/**
 * Loads and parses the official Zoho Admin Console storage usage report.
 */
export function getZohoAdminStorageMap(): Map<string, ZohoStorageRecord> {
  if (storageMap) {
    return storageMap;
  }

  const map = new Map<string, ZohoStorageRecord>();
  const csvPath = path.resolve(process.cwd(), "data/zoho_storage_report.csv");

  if (!fs.existsSync(csvPath)) {
    secureLogger.warn("data/zoho_storage_report.csv not found, using fallback calculations");
    storageMap = map;
    return map;
  }

  try {
    const content = fs.readFileSync(csvPath, "utf-8");
    const lines = content.split("\n").filter((l) => l.trim().length > 0);

    for (let i = 1; i < lines.length; i++) {
      const match = lines[i].match(
        /\"([^\"]*)\",\"([^\"]*)\",\"([^\"]*)\",\"([^\"]*)\",\"([^\"]*)\"/
      );
      if (match) {
        const firstName = match[1].trim();
        const lastName = match[2].trim();
        const email = match[3].trim().toLowerCase();
        const allottedGb = parseFloat(match[4]) || 5.0;

        const parts = match[5].split(",");
        const usedGb = parseFloat(parts[0]) || 0;
        const usedPercent = parseFloat(parts[1]) || 0;

        const usedSizeBytes = Math.round(usedGb * 1024 * 1024 * 1024);
        // Realistic email estimate: corporate email with attachments averages ~120KB - 150KB
        const estimatedMessages =
          usedSizeBytes > 0 ? Math.max(1, Math.round(usedSizeBytes / 130000)) : 0;

        map.set(email, {
          firstName,
          lastName,
          email,
          allottedGb,
          usedGb,
          usedPercent,
          usedSizeBytes,
          estimatedMessages,
        });
      }
    }

    secureLogger.info(`Loaded ${map.size} Zoho Admin Storage records from CSV`);
  } catch (err) {
    secureLogger.error("Failed to parse zoho_storage_report.csv:", (err as Error).message);
  }

  storageMap = map;
  return map;
}

/**
 * Retrieves the Zoho Admin storage record for a specific mailbox email.
 */
export function getZohoStorageForEmail(email: string): ZohoStorageRecord | undefined {
  const map = getZohoAdminStorageMap();
  return map.get(email.toLowerCase());
}
