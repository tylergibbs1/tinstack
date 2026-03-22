import { InMemoryStorage, type StorageBackend } from "../../core/storage";
import { AwsError } from "../../core/errors";

export interface EmailIdentity {
  emailIdentity: string;
  identityType: string;
  verifiedForSendingStatus: boolean;
  dkimSigningEnabled: boolean;
  createdAt: number;
}

export interface SentMessage {
  messageId: string;
  fromEmailAddress: string;
  destination: {
    toAddresses?: string[];
    ccAddresses?: string[];
    bccAddresses?: string[];
  };
  subject?: string;
  body?: string;
  sentAt: number;
}

export interface EmailTemplate {
  templateName: string;
  templateContent: {
    subject?: string;
    html?: string;
    text?: string;
  };
  createdAt: number;
}

export interface ConfigurationSet {
  configurationSetName: string;
  deliveryOptions?: {
    sendingPoolName?: string;
    tlsPolicy?: string;
  };
  reputationOptions?: {
    reputationMetricsEnabled?: boolean;
    lastFreshStart?: number;
  };
  sendingOptions?: {
    sendingEnabled?: boolean;
  };
  trackingOptions?: {
    customRedirectDomain?: string;
  };
  createdAt: number;
}

export interface SuppressedDestination {
  emailAddress: string;
  reason: "BOUNCE" | "COMPLAINT";
  createdAt: number;
}

export interface BulkEmailEntry {
  destination: {
    toAddresses?: string[];
    ccAddresses?: string[];
    bccAddresses?: string[];
  };
  replacementEmailContent?: {
    replacementTemplate?: {
      replacementTemplateData?: string;
    };
  };
}

export interface BulkEmailEntryResult {
  status: "SUCCESS" | "FAILED";
  messageId?: string;
  error?: string;
}

export class SesService {
  private identities: StorageBackend<string, EmailIdentity>;
  private templates: StorageBackend<string, EmailTemplate>;
  private configurationSets: StorageBackend<string, ConfigurationSet>;
  private suppressedDestinations: StorageBackend<string, SuppressedDestination>;
  private messages: SentMessage[] = [];
  private sendingEnabled = true;

  constructor(private accountId: string) {
    this.identities = new InMemoryStorage();
    this.templates = new InMemoryStorage();
    this.configurationSets = new InMemoryStorage();
    this.suppressedDestinations = new InMemoryStorage();
  }

  // --- Email Identities ---

  createEmailIdentity(emailIdentity: string): EmailIdentity {
    const existing = this.identities.get(emailIdentity);
    if (existing) {
      throw new AwsError("AlreadyExistsException", `Identity ${emailIdentity} already exists.`, 400);
    }

    const identityType = emailIdentity.includes("@") ? "EMAIL_ADDRESS" : "DOMAIN";
    const identity: EmailIdentity = {
      emailIdentity,
      identityType,
      verifiedForSendingStatus: true,
      dkimSigningEnabled: false,
      createdAt: Date.now(),
    };
    this.identities.set(emailIdentity, identity);
    return identity;
  }

  getEmailIdentity(emailIdentity: string): EmailIdentity {
    const identity = this.identities.get(emailIdentity);
    if (!identity) {
      throw new AwsError("NotFoundException", `Identity ${emailIdentity} does not exist.`, 404);
    }
    return identity;
  }

  listEmailIdentities(): EmailIdentity[] {
    return this.identities.values();
  }

  deleteEmailIdentity(emailIdentity: string): void {
    if (!this.identities.get(emailIdentity)) {
      throw new AwsError("NotFoundException", `Identity ${emailIdentity} does not exist.`, 404);
    }
    this.identities.delete(emailIdentity);
  }

  putEmailIdentityDkimAttributes(emailIdentity: string, signingEnabled: boolean): void {
    const identity = this.identities.get(emailIdentity);
    if (!identity) {
      throw new AwsError("NotFoundException", `Identity ${emailIdentity} does not exist.`, 404);
    }
    identity.dkimSigningEnabled = signingEnabled;
    this.identities.set(emailIdentity, identity);
  }

  // --- Send Email ---

  sendEmail(
    fromEmailAddress: string,
    destination: { toAddresses?: string[]; ccAddresses?: string[]; bccAddresses?: string[] },
    subject?: string,
    body?: string,
  ): string {
    const messageId = crypto.randomUUID();
    this.messages.push({
      messageId,
      fromEmailAddress,
      destination,
      subject,
      body,
      sentAt: Date.now(),
    });
    return messageId;
  }

  getSentMessages(): SentMessage[] {
    return this.messages;
  }

  // --- Email Templates ---

  createEmailTemplate(templateName: string, templateContent: EmailTemplate["templateContent"]): void {
    if (this.templates.get(templateName)) {
      throw new AwsError("AlreadyExistsException", `Template ${templateName} already exists.`, 400);
    }
    this.templates.set(templateName, {
      templateName,
      templateContent,
      createdAt: Date.now(),
    });
  }

  getEmailTemplate(templateName: string): EmailTemplate {
    const template = this.templates.get(templateName);
    if (!template) {
      throw new AwsError("NotFoundException", `Template ${templateName} does not exist.`, 404);
    }
    return template;
  }

  listEmailTemplates(): EmailTemplate[] {
    return this.templates.values();
  }

  updateEmailTemplate(templateName: string, templateContent: EmailTemplate["templateContent"]): void {
    if (!this.templates.get(templateName)) {
      throw new AwsError("NotFoundException", `Template ${templateName} does not exist.`, 404);
    }
    this.templates.set(templateName, {
      templateName,
      templateContent,
      createdAt: Date.now(),
    });
  }

  deleteEmailTemplate(templateName: string): void {
    if (!this.templates.get(templateName)) {
      throw new AwsError("NotFoundException", `Template ${templateName} does not exist.`, 404);
    }
    this.templates.delete(templateName);
  }

  // --- Send Bulk Email ---

  sendBulkEmail(
    defaultContent: { template?: { templateName?: string; templateData?: string } },
    bulkEmailEntries: BulkEmailEntry[],
    fromEmailAddress?: string,
    configurationSetName?: string,
  ): BulkEmailEntryResult[] {
    const templateName = defaultContent.template?.templateName;
    if (templateName && !this.templates.get(templateName)) {
      throw new AwsError("NotFoundException", `Template ${templateName} does not exist.`, 404);
    }

    return bulkEmailEntries.map((entry) => {
      const messageId = crypto.randomUUID();
      const dest = entry.destination;
      this.messages.push({
        messageId,
        fromEmailAddress: fromEmailAddress ?? "",
        destination: {
          toAddresses: dest.toAddresses,
          ccAddresses: dest.ccAddresses,
          bccAddresses: dest.bccAddresses,
        },
        subject: templateName ? `[template:${templateName}]` : undefined,
        sentAt: Date.now(),
      });
      return { status: "SUCCESS" as const, messageId };
    });
  }

  // --- Configuration Sets ---

  createConfigurationSet(config: Omit<ConfigurationSet, "createdAt">): void {
    if (this.configurationSets.get(config.configurationSetName)) {
      throw new AwsError(
        "AlreadyExistsException",
        `Configuration set ${config.configurationSetName} already exists.`,
        400,
      );
    }
    this.configurationSets.set(config.configurationSetName, {
      ...config,
      createdAt: Date.now(),
    });
  }

  getConfigurationSet(name: string): ConfigurationSet {
    const cs = this.configurationSets.get(name);
    if (!cs) {
      throw new AwsError("NotFoundException", `Configuration set ${name} does not exist.`, 404);
    }
    return cs;
  }

  listConfigurationSets(): ConfigurationSet[] {
    return this.configurationSets.values();
  }

  deleteConfigurationSet(name: string): void {
    if (!this.configurationSets.get(name)) {
      throw new AwsError("NotFoundException", `Configuration set ${name} does not exist.`, 404);
    }
    this.configurationSets.delete(name);
  }

  // --- Suppression List ---

  putSuppressedDestination(emailAddress: string, reason: "BOUNCE" | "COMPLAINT"): void {
    this.suppressedDestinations.set(emailAddress, {
      emailAddress,
      reason,
      createdAt: Date.now(),
    });
  }

  getSuppressedDestination(emailAddress: string): SuppressedDestination {
    const dest = this.suppressedDestinations.get(emailAddress);
    if (!dest) {
      throw new AwsError("NotFoundException", `Suppressed destination ${emailAddress} does not exist.`, 404);
    }
    return dest;
  }

  listSuppressedDestinations(): SuppressedDestination[] {
    return this.suppressedDestinations.values();
  }

  // --- Account ---

  getAccount(): any {
    return {
      SendQuota: {
        Max24HourSend: 50000,
        MaxSendRate: 14,
        SentLast24Hours: this.messages.length,
      },
      SendingEnabled: this.sendingEnabled,
      DedicatedIpAutoWarmupEnabled: false,
      EnforcementStatus: "HEALTHY",
      ProductionAccessEnabled: true,
    };
  }

  putAccountSendingAttributes(sendingEnabled: boolean): void {
    this.sendingEnabled = sendingEnabled;
  }
}
