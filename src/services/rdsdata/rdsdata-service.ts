import { InMemoryStorage, type StorageBackend } from "../../core/storage";
import { AwsError } from "../../core/errors";

export interface RdsTransaction { transactionId: string; status: string; }

export class RdsDataService {
  private transactions: StorageBackend<string, RdsTransaction>;

  constructor(private accountId: string) {
    this.transactions = new InMemoryStorage();
  }

  executeStatement(resourceArn: string, secretArn: string, sql: string, transactionId?: string): any {
    return {
      numberOfRecordsUpdated: 0,
      records: [[{ stringValue: "mock-result" }]],
      columnMetadata: [{ name: "col1", type: 12, typeName: "VARCHAR" }],
    };
  }

  batchExecuteStatement(resourceArn: string, secretArn: string, sql: string, parameterSets: any[]): any {
    return { updateResults: parameterSets.map(() => ({ generatedFields: [] })) };
  }

  beginTransaction(resourceArn: string, secretArn: string, database?: string): string {
    const id = crypto.randomUUID();
    this.transactions.set(id, { transactionId: id, status: "ACTIVE" });
    return id;
  }

  commitTransaction(resourceArn: string, secretArn: string, transactionId: string): string {
    const tx = this.transactions.get(transactionId);
    if (!tx) throw new AwsError("NotFoundException", `Transaction ${transactionId} not found`, 404);
    tx.status = "COMMITTED";
    return "Transaction Committed";
  }

  rollbackTransaction(resourceArn: string, secretArn: string, transactionId: string): string {
    const tx = this.transactions.get(transactionId);
    if (!tx) throw new AwsError("NotFoundException", `Transaction ${transactionId} not found`, 404);
    tx.status = "ROLLED_BACK";
    return "Transaction Rolled Back";
  }
}
