import { AwsError } from "../../core/errors";

export interface MeteringRecord {
  meteringRecordId: string;
  timestamp: string;
  productCode: string;
  usageDimension: string;
  usageQuantity: number;
  status: string;
}

export class MeteringMarketplaceService {
  private records: MeteringRecord[] = [];

  constructor(private accountId: string) {}

  meterUsage(productCode: string, timestamp: string, usageDimension: string, usageQuantity: number): MeteringRecord {
    if (!productCode) throw new AwsError("InvalidProductCodeException", "ProductCode is required.", 400);
    const record: MeteringRecord = {
      meteringRecordId: crypto.randomUUID(),
      timestamp: timestamp ?? new Date().toISOString(),
      productCode, usageDimension: usageDimension ?? "",
      usageQuantity: usageQuantity ?? 0, status: "Success",
    };
    this.records.push(record);
    return record;
  }

  batchMeterUsage(productCode: string, usageRecords: any[]): { results: any[]; unprocessedRecords: any[] } {
    if (!productCode) throw new AwsError("InvalidProductCodeException", "ProductCode is required.", 400);
    const results = (usageRecords ?? []).map(r => {
      const record = this.meterUsage(productCode, r.Timestamp, r.Dimension, r.Quantity ?? 0);
      return {
        usageRecord: r,
        meteringRecordId: record.meteringRecordId,
        status: "Success",
      };
    });
    return { results, unprocessedRecords: [] };
  }

  registerUsage(productCode: string, publicKeyVersion: number): { signature: string; expirationDate: string } {
    if (!productCode) throw new AwsError("InvalidProductCodeException", "ProductCode is required.", 400);
    return {
      signature: crypto.randomUUID(),
      expirationDate: new Date(Date.now() + 3600000).toISOString(),
    };
  }

  resolveCustomer(registrationToken: string): { customerIdentifier: string; productCode: string; customerAWSAccountId: string } {
    if (!registrationToken) throw new AwsError("InvalidTokenException", "RegistrationToken is required.", 400);
    return {
      customerIdentifier: `customer-${crypto.randomUUID().slice(0, 8)}`,
      productCode: "test-product-code",
      customerAWSAccountId: this.accountId,
    };
  }
}
