import { InMemoryStorage, type StorageBackend } from "../../core/storage";
import { AwsError } from "../../core/errors";

export interface EmailIdentity {
  emailIdentity: string;
  identityType: string;
  verifiedForSendingStatus: boolean;
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

export class SesService {
  private identities: StorageBackend<string, EmailIdentity>;
  private messages: SentMessage[] = [];

  constructor(private accountId: string) {
    this.identities = new InMemoryStorage();
  }

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

  getAccount(): any {
    return {
      SendQuota: {
        Max24HourSend: 50000,
        MaxSendRate: 14,
        SentLast24Hours: this.messages.length,
      },
      SendingEnabled: true,
      DedicatedIpAutoWarmupEnabled: false,
      EnforcementStatus: "HEALTHY",
      ProductionAccessEnabled: true,
    };
  }
}
