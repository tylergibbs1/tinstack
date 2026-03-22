import { InMemoryStorage, type StorageBackend } from "../../core/storage";
import { AwsError } from "../../core/errors";

export interface ManagedConnection {
  connectionId: string;
  connectedAt: string;
  identity: { sourceIp: string; userAgent: string };
  lastActiveAt: string;
}

export class ApiGatewayManagementService {
  private connections: StorageBackend<string, ManagedConnection>;

  constructor(private accountId: string) {
    this.connections = new InMemoryStorage();
  }

  postToConnection(connectionId: string, _data: string): void {
    // In a real system this pushes data to a WebSocket client — we just validate the connection exists
    if (!this.connections.has(connectionId)) {
      // Auto-create for mock purposes
      this.connections.set(connectionId, {
        connectionId,
        connectedAt: new Date().toISOString(),
        identity: { sourceIp: "127.0.0.1", userAgent: "tinstack" },
        lastActiveAt: new Date().toISOString(),
      });
    }
    const conn = this.connections.get(connectionId)!;
    conn.lastActiveAt = new Date().toISOString();
  }

  getConnection(connectionId: string): ManagedConnection {
    const conn = this.connections.get(connectionId);
    if (!conn) throw new AwsError("GoneException", `Connection ${connectionId} is gone.`, 410);
    return conn;
  }

  deleteConnection(connectionId: string): void {
    this.connections.delete(connectionId);
  }
}
