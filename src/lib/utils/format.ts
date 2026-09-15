/**
 * Formats byte values into human-readable strings (B, KB, MB, GB, TB).
 */
export function formatBytes(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined || isNaN(bytes) || bytes <= 0) {
    return "0 B";
  }

  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const val = bytes / Math.pow(k, i);

  return `${val.toFixed(i >= 2 ? 2 : 1)} ${sizes[i]}`;
}

/**
 * Formats number of messages with commas.
 */
export function formatNumber(num: number | null | undefined): string {
  if (num === null || num === undefined || isNaN(num)) {
    return "0";
  }
  return num.toLocaleString();
}
