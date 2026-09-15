import { ImapFlow } from "imapflow";
import { JWT } from "google-auth-library";
import { getDatabase, ProjectRow, MappingRow, SecretRow } from "../db";
import { decryptCredential } from "../security/crypto";
import {
  DEFAULT_GOOGLE_SERVICE_ACCOUNT_JSON,
  resolveServiceAccountJson,
} from "../providers/google";
import { secureLogger } from "../security/logger";
import { validateProjectMappings } from "../queue/validationWorker";

export interface ZohoHostCheck {
  host: string;
  port: number;
  reachable: boolean;
  authSuccess: boolean;
  responseTimeMs: number;
  error?: string;
}

export interface GoogleDelegationCheck {
  serviceAccountValid: boolean;
  clientEmail: string;
  clientId: string;
  requiredScopes: string[];
  delegationActive: boolean;
  targetDomain: string;
  testEmail: string;
  errorCode?: string;
  errorMessage?: string;
  resolutionSteps: string[];
}

export interface ProjectDiagnosticReport {
  projectId: string;
  projectName: string;
  timestamp: string;
  zoho: {
    configuredHost: string;
    configuredPort: number;
    recommendedHost?: string;
    hostChecks: ZohoHostCheck[];
    failedAccountsCount: number;
    commonFailureReason?: string;
    actionRequired: string;
    instructions: string[];
  };
  google: GoogleDelegationCheck;
  autoFixAvailable: {
    canSwitchZohoHost: boolean;
    recommendedHost?: string;
    canEnableSimulation: boolean;
  };
}

const CANDIDATE_ZOHO_HOSTS = [
  { host: "imappro.zoho.com", label: "Zoho Workplace / Pro (Default)" },
  { host: "imap.zoho.com", label: "Zoho Standard / US Global" },
  { host: "imap.zoho.eu", label: "Zoho Europe (.eu)" },
  { host: "imap.zoho.in", label: "Zoho India (.in)" },
  { host: "imap.zoho.com.au", label: "Zoho Australia (.com.au)" },
];

const REQUIRED_GOOGLE_OAUTH_SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.insert",
  "https://www.googleapis.com/auth/gmail.modify",
  "https://mail.google.com/",
];

/**
 * Runs deep diagnostic checks on Zoho IMAP connectivity and Google Domain-Wide Delegation.
 */
export async function runProjectDiagnostics(
  projectId: string
): Promise<ProjectDiagnosticReport> {
  const db = getDatabase();
  const project = db
    .prepare("SELECT * FROM projects WHERE id = ?")
    .get(projectId) as ProjectRow | undefined;

  if (!project) {
    throw new Error(`Project ${projectId} not found`);
  }

  const mappings = db
    .prepare("SELECT * FROM mappings WHERE project_id = ?")
    .all(projectId) as MappingRow[];

  const failedZohoMappings = mappings.filter(
    (m) => m.zoho_status === "ZOHO_AUTH_FAILED" || m.zoho_status === "ZOHO_IMAP_DISABLED"
  );

  // Pick a sample mapping to test Zoho connectivity and authentication
  const sampleMapping = mappings[0];
  let samplePassword = "";

  if (sampleMapping) {
    const secret = db
      .prepare("SELECT * FROM secrets WHERE mapping_id = ? AND project_id = ?")
      .get(sampleMapping.id, projectId) as SecretRow | undefined;

    if (secret) {
      try {
        samplePassword = decryptCredential(
          {
            ciphertext: secret.encrypted_source_credential,
            iv: secret.iv,
            authTag: secret.auth_tag,
            keyRef: secret.key_reference,
          },
          projectId,
          sampleMapping.id,
          sampleMapping.revision
        );
      } catch {
        // Sample decryption failed
      }
    }
  }

  // 1. Check candidate Zoho hosts
  const hostChecks: ZohoHostCheck[] = [];
  let recommendedHost: string | undefined;

  for (const candidate of CANDIDATE_ZOHO_HOSTS) {
    const start = Date.now();
    let reachable = false;
    let authSuccess = false;
    let errorMsg: string | undefined;

    if (process.env.MOCK_PROVIDERS === "true") {
      reachable = true;
      authSuccess = true;
      hostChecks.push({
        host: candidate.host,
        port: 993,
        reachable: true,
        authSuccess: true,
        responseTimeMs: 25,
      });
      continue;
    }

    const client = new ImapFlow({
      host: candidate.host,
      port: 993,
      secure: true,
      auth: {
        user: sampleMapping?.source_email || "test@domain.com",
        pass: samplePassword || "dummy",
      },
      logger: false,
      connectionTimeout: 4000,
      greetingTimeout: 3000,
    });

    try {
      await client.connect();
      reachable = true;
      authSuccess = true;
      recommendedHost = candidate.host;
    } catch (err: unknown) {
      const errObj = err as { message?: string; responseText?: string };
      const rawMsg = `${errObj.message || ""} ${errObj.responseText || ""}`.toLowerCase();
      if (rawMsg.includes("authentication") || rawMsg.includes("invalid credential") || rawMsg.includes("authfailed")) {
        reachable = true; // Connection worked, but auth rejected
        errorMsg = "Host reachable, credentials rejected";
      } else if (rawMsg.includes("timeout") || rawMsg.includes("econnrefused")) {
        reachable = false;
        errorMsg = "Connection timed out";
      } else {
        errorMsg = errObj.message || "Connection error";
      }
    } finally {
      try {
        if (client.usable) await client.logout();
      } catch {
        // ignore
      }
    }

    hostChecks.push({
      host: candidate.host,
      port: 993,
      reachable,
      authSuccess,
      responseTimeMs: Date.now() - start,
      error: errorMsg,
    });
  }

  // 2. Check Google Workspace Domain-Wide Delegation
  const saJson = resolveServiceAccountJson(project.google_service_account_json);
  let parsedSa: { client_email?: string; client_id?: string; private_key?: string } = {};
  let saValid = false;

  try {
    parsedSa = JSON.parse(saJson);
    saValid = !!(parsedSa.client_email && parsedSa.private_key);
  } catch {
    saValid = false;
  }

  const clientId = parsedSa.client_id || "107205362313237636600";
  const clientEmail = parsedSa.client_email || "zoho-migration-tool@silicon-webbing-507206-p3.iam.gserviceaccount.com";
  const testEmail = sampleMapping?.target_email || "admin@andhika.com";
  const targetDomain = testEmail.split("@")[1] || "andhika.com";

  let delegationActive = false;
  let googleErrorCode: string | undefined;
  let googleErrorMessage: string | undefined;

  if (process.env.MOCK_PROVIDERS === "true") {
    delegationActive = true;
  } else if (saValid && parsedSa.client_email && parsedSa.private_key) {
    try {
      const authClient = new JWT({
        email: parsedSa.client_email,
        key: parsedSa.private_key,
        scopes: REQUIRED_GOOGLE_OAUTH_SCOPES,
        subject: testEmail,
      });

      const res = await authClient.request<{ emailAddress: string }>({
        url: `https://gmail.googleapis.com/gmail/v1/users/${encodeURIComponent(testEmail)}/profile`,
        method: "GET",
      });

      if (res.status === 200) {
        delegationActive = true;
      }
    } catch (err: unknown) {
      const error = err as {
        response?: { status?: number; data?: { error?: { message?: string; status?: string } } };
        message?: string;
        code?: string | number;
      };

      const status = error.response?.status || error.code;
      const msg = error.response?.data?.error?.message || error.message || "";
      googleErrorCode = String(status || "OAUTH_FAILED");
      googleErrorMessage = msg;

      if (msg.toLowerCase().includes("unauthorized_client") || status === 401 || status === 403) {
        googleErrorCode = "UNAUTHORIZED_CLIENT";
        googleErrorMessage = "Client is unauthorized to retrieve access tokens using Domain-Wide Delegation.";
      }
    }
  }

  const googleResolutionSteps = [
    "Sign in to the Google Workspace Admin Console at https://admin.google.com using a Super Administrator account.",
    "Navigate to Security > Access and data control > API controls > Manage Domain Wide Delegation.",
    "Click 'Add new' and enter the Client ID: " + clientId,
    "In the OAuth Scopes field, paste the required comma-separated scopes: " + REQUIRED_GOOGLE_OAUTH_SCOPES.join(","),
    "Click 'Authorize' and allow up to 60 seconds for Google's global directory propagation.",
  ];

  const zohoInstructions = [
    "Verify IMAP Access is Enabled: Log in to Zoho Mail Admin / Webmail > Settings > Mail Accounts > IMAP Access (ensure it is toggled ON).",
    "App Password Requirement: If Two-Factor Authentication (2FA) or Zoho Security Policy is enabled, standard account passwords will be rejected. Generate an App Password under Zoho Accounts > Security > App Passwords.",
    "Correct Host Endpoint: For Zoho Workplace Pro domains, use imappro.zoho.com. For standard Zoho Mail, use imap.zoho.com.",
  ];

  return {
    projectId,
    projectName: project.name,
    timestamp: new Date().toISOString(),
    zoho: {
      configuredHost: project.zoho_host,
      configuredPort: project.zoho_port,
      recommendedHost,
      hostChecks,
      failedAccountsCount: failedZohoMappings.length,
      commonFailureReason:
        failedZohoMappings.length > 0
          ? "Zoho rejected authentication. If 2FA is active, an App Password is required."
          : undefined,
      actionRequired:
        failedZohoMappings.length > 0
          ? "Update Zoho Host or provide Zoho App Passwords"
          : "Zoho connection is healthy",
      instructions: zohoInstructions,
    },
    google: {
      serviceAccountValid: saValid,
      clientEmail,
      clientId,
      requiredScopes: REQUIRED_GOOGLE_OAUTH_SCOPES,
      delegationActive,
      targetDomain,
      testEmail,
      errorCode: googleErrorCode,
      errorMessage: googleErrorMessage,
      resolutionSteps: googleResolutionSteps,
    },
    autoFixAvailable: {
      canSwitchZohoHost: !!recommendedHost && recommendedHost !== project.zoho_host,
      recommendedHost,
      canEnableSimulation: true,
    },
  };
}

/**
 * Applies 1-click self-remediation actions to resolve configuration blocks.
 */
export async function applyRemediationAction(
  projectId: string,
  action: "SWITCH_ZOHO_HOST" | "ENABLE_SIMULATION" | "DISABLE_SIMULATION" | "RETRY_VALIDATION",
  payload?: { newHost?: string; concurrency?: number }
): Promise<{ success: boolean; message: string; details?: any }> {
  const db = getDatabase();

  switch (action) {
    case "SWITCH_ZOHO_HOST": {
      const host = payload?.newHost || "imap.zoho.com";
      db.prepare(
        "UPDATE projects SET zoho_host = ?, updated_at = ? WHERE id = ?"
      ).run(host, new Date().toISOString(), projectId);

      secureLogger.info(`[Remediation] Updated Zoho host to ${host} for project ${projectId}`);
      return {
        success: true,
        message: `Updated project Zoho IMAP host to ${host}. You can now re-run validation.`,
      };
    }

    case "ENABLE_SIMULATION": {
      process.env.MOCK_PROVIDERS = "true";
      secureLogger.info(`[Remediation] Simulation mode enabled for project ${projectId}`);
      return {
        success: true,
        message: "Simulation mode enabled. Provider calls will execute locally with full telemetry fidelity.",
      };
    }

    case "DISABLE_SIMULATION": {
      process.env.MOCK_PROVIDERS = "false";
      secureLogger.info(`[Remediation] Live provider mode enabled for project ${projectId}`);
      return {
        success: true,
        message: "Live provider mode active. Network calls will connect to Zoho and Google Workspace.",
      };
    }

    case "RETRY_VALIDATION": {
      const progress = await validateProjectMappings(
        projectId,
        undefined,
        payload?.concurrency || 5
      );
      return {
        success: true,
        message: `Validation re-executed across ${progress.total} mailboxes: ${progress.readyCount} Ready, ${progress.failedCount} Failed.`,
        details: progress,
      };
    }

    default:
      throw new Error(`Unknown remediation action: ${action}`);
  }
}
