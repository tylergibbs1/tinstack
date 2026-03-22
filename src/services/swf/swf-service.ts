import { InMemoryStorage, type StorageBackend } from "../../core/storage";
import { AwsError } from "../../core/errors";

export interface SwfDomain { name: string; status: string; description: string; }
export interface WorkflowType { name: string; version: string; domain: string; status: string; }
export interface ActivityType { name: string; version: string; domain: string; status: string; }

export class SwfService {
  private domains: StorageBackend<string, SwfDomain>;
  private workflowTypes: StorageBackend<string, WorkflowType>;
  private activityTypes: StorageBackend<string, ActivityType>;

  constructor(private accountId: string) {
    this.domains = new InMemoryStorage();
    this.workflowTypes = new InMemoryStorage();
    this.activityTypes = new InMemoryStorage();
  }

  registerDomain(name: string, description: string, workflowExecutionRetentionPeriodInDays: string): void {
    if (this.domains.has(name)) throw new AwsError("DomainAlreadyExistsFault", `Domain ${name} already exists`, 400);
    this.domains.set(name, { name, status: "REGISTERED", description: description ?? "" });
  }

  listDomains(registrationStatus: string): SwfDomain[] {
    return this.domains.values().filter((d) => d.status === registrationStatus);
  }

  describeDomain(name: string): SwfDomain {
    const d = this.domains.get(name);
    if (!d) throw new AwsError("UnknownResourceFault", `Domain ${name} not found`, 400);
    return d;
  }

  deprecateDomain(name: string): void {
    const d = this.domains.get(name);
    if (!d) throw new AwsError("UnknownResourceFault", `Domain ${name} not found`, 400);
    d.status = "DEPRECATED";
  }

  registerWorkflowType(domain: string, name: string, version: string): void {
    const key = `${domain}:${name}:${version}`;
    if (this.workflowTypes.has(key)) throw new AwsError("TypeAlreadyExistsFault", `Workflow type already exists`, 400);
    this.workflowTypes.set(key, { name, version, domain, status: "REGISTERED" });
  }

  listWorkflowTypes(domain: string): WorkflowType[] {
    return this.workflowTypes.values().filter((w) => w.domain === domain);
  }

  registerActivityType(domain: string, name: string, version: string): void {
    const key = `${domain}:${name}:${version}`;
    if (this.activityTypes.has(key)) throw new AwsError("TypeAlreadyExistsFault", `Activity type already exists`, 400);
    this.activityTypes.set(key, { name, version, domain, status: "REGISTERED" });
  }

  listActivityTypes(domain: string): ActivityType[] {
    return this.activityTypes.values().filter((a) => a.domain === domain);
  }
}
