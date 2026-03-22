import { AwsError } from "../../core/errors";

export class SageMakerRuntimeService {
  private endpoints = new Set<string>();

  constructor(private accountId: string) {}

  invokeEndpoint(endpointName: string, body: string, contentType: string): { body: string; contentType: string } {
    // Auto-register endpoint on first call (mock behavior)
    this.endpoints.add(endpointName);
    // Return a mock prediction
    return {
      body: JSON.stringify({ predictions: [{ score: 0.95, label: "positive" }] }),
      contentType: "application/json",
    };
  }
}
