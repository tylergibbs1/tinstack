import { InMemoryStorage, type StorageBackend } from "../../core/storage";
import { AwsError } from "../../core/errors";

export interface Domain {
  domainName: string;
  autoRenew: boolean;
  transferLock: boolean;
  registrationDate: number;
  expirationDate: number;
  nameservers: { name: string }[];
  adminContact: any;
  registrantContact: any;
  techContact: any;
  status: string[];
  tags: Record<string, string>;
}

export class Route53DomainsService {
  private domains: StorageBackend<string, Domain>;

  constructor(private accountId: string) {
    this.domains = new InMemoryStorage();
  }

  registerDomain(domainName: string, durationInYears: number, adminContact: any, registrantContact: any, techContact: any): string {
    const operationId = crypto.randomUUID();
    const now = new Date();
    const expiration = new Date(now);
    expiration.setFullYear(expiration.getFullYear() + (durationInYears ?? 1));
    const domain: Domain = {
      domainName, autoRenew: true, transferLock: true,
      registrationDate: Math.floor(now.getTime() / 1000), expirationDate: Math.floor(expiration.getTime() / 1000),
      nameservers: [{ name: "ns1.example.com" }, { name: "ns2.example.com" }],
      adminContact: adminContact ?? {}, registrantContact: registrantContact ?? {},
      techContact: techContact ?? {}, status: ["ACTIVE"], tags: {},
    };
    this.domains.set(domainName, domain);
    return operationId;
  }

  getDomainDetail(domainName: string): Domain {
    const d = this.domains.get(domainName);
    if (!d) throw new AwsError("InvalidInput", `Domain ${domainName} not found.`, 400);
    return d;
  }

  listDomains(): { domainName: string; autoRenew: boolean; transferLock: boolean; expiry: string }[] {
    return this.domains.values().map(d => ({
      domainName: d.domainName, autoRenew: d.autoRenew,
      transferLock: d.transferLock, expiry: d.expirationDate,
    }));
  }

  checkDomainAvailability(domainName: string): { availability: string } {
    return { availability: this.domains.has(domainName) ? "UNAVAILABLE" : "AVAILABLE" };
  }

  transferDomain(domainName: string, durationInYears: number, nameservers: any[], adminContact: any, registrantContact: any, techContact: any, authCode: string): string {
    const operationId = crypto.randomUUID();
    this.registerDomain(domainName, durationInYears, adminContact, registrantContact, techContact);
    return operationId;
  }

  renewDomain(domainName: string, durationInYears: number): string {
    const d = this.domains.get(domainName);
    if (!d) throw new AwsError("InvalidInput", `Domain ${domainName} not found.`, 400);
    const exp = new Date(d.expirationDate);
    exp.setFullYear(exp.getFullYear() + (durationInYears ?? 1));
    d.expirationDate = Math.floor(exp.getTime() / 1000);
    this.domains.set(domainName, d);
    return crypto.randomUUID();
  }

  updateDomainNameservers(domainName: string, nameservers: { name: string }[]): string {
    const d = this.domains.get(domainName);
    if (!d) throw new AwsError("InvalidInput", `Domain ${domainName} not found.`, 400);
    d.nameservers = nameservers;
    this.domains.set(domainName, d);
    return crypto.randomUUID();
  }
}
