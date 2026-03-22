import { InMemoryStorage, type StorageBackend } from "../../core/storage";
import { AwsError } from "../../core/errors";

export interface ServiceQuota {
  serviceCode: string;
  serviceName: string;
  quotaCode: string;
  quotaName: string;
  value: number;
  unit: string;
  adjustable: boolean;
  globalQuota: boolean;
}

export interface QuotaChangeRequest {
  id: string;
  serviceCode: string;
  quotaCode: string;
  desiredValue: number;
  status: string;
  caseId?: string;
  created: number;
}

const DEFAULT_QUOTAS: ServiceQuota[] = [
  { serviceCode: "ec2", serviceName: "Amazon EC2", quotaCode: "L-1216C47A", quotaName: "Running On-Demand Standard instances", value: 1152, unit: "None", adjustable: true, globalQuota: false },
  { serviceCode: "s3", serviceName: "Amazon S3", quotaCode: "L-DC2B2D3D", quotaName: "Buckets", value: 100, unit: "None", adjustable: true, globalQuota: false },
  { serviceCode: "lambda", serviceName: "AWS Lambda", quotaCode: "L-B99A9384", quotaName: "Concurrent executions", value: 1000, unit: "None", adjustable: true, globalQuota: false },
];

export class ServiceQuotasService {
  private overrides: StorageBackend<string, ServiceQuota>;
  private requests: StorageBackend<string, QuotaChangeRequest>;

  constructor(private accountId: string) {
    this.overrides = new InMemoryStorage();
    this.requests = new InMemoryStorage();
  }

  private key(serviceCode: string, quotaCode: string): string {
    return `${serviceCode}|${quotaCode}`;
  }

  getServiceQuota(serviceCode: string, quotaCode: string): ServiceQuota {
    const override = this.overrides.get(this.key(serviceCode, quotaCode));
    if (override) return override;
    const def = DEFAULT_QUOTAS.find((q) => q.serviceCode === serviceCode && q.quotaCode === quotaCode);
    if (!def) throw new AwsError("NoSuchResourceException", `Quota ${quotaCode} for ${serviceCode} not found.`, 404);
    return def;
  }

  getAWSDefaultServiceQuota(serviceCode: string, quotaCode: string): ServiceQuota {
    const def = DEFAULT_QUOTAS.find((q) => q.serviceCode === serviceCode && q.quotaCode === quotaCode);
    if (!def) throw new AwsError("NoSuchResourceException", `Default quota ${quotaCode} for ${serviceCode} not found.`, 404);
    return def;
  }

  listServiceQuotas(serviceCode: string): ServiceQuota[] {
    const defaults = DEFAULT_QUOTAS.filter((q) => q.serviceCode === serviceCode);
    return defaults.map((d) => this.overrides.get(this.key(d.serviceCode, d.quotaCode)) ?? d);
  }

  requestServiceQuotaIncrease(serviceCode: string, quotaCode: string, desiredValue: number): QuotaChangeRequest {
    this.getServiceQuota(serviceCode, quotaCode); // validate exists
    const req: QuotaChangeRequest = {
      id: crypto.randomUUID(),
      serviceCode, quotaCode, desiredValue,
      status: "APPROVED",
      created: Date.now() / 1000,
    };
    this.requests.set(req.id, req);
    // Auto-apply the increase
    const quota = { ...this.getServiceQuota(serviceCode, quotaCode), value: desiredValue };
    this.overrides.set(this.key(serviceCode, quotaCode), quota);
    return req;
  }

  listRequestedServiceQuotaChangeHistory(serviceCode?: string): QuotaChangeRequest[] {
    const all = this.requests.values();
    return serviceCode ? all.filter((r) => r.serviceCode === serviceCode) : all;
  }
}
