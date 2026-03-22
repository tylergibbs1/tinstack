import { InMemoryStorage, type StorageBackend } from "../../core/storage";
import { AwsError } from "../../core/errors";
import { buildArn } from "../../core/arn";

export interface FoundationModel {
  modelId: string;
  modelName: string;
  providerName: string;
  inputModalities: string[];
  outputModalities: string[];
  modelArn: string;
  responseStreamingSupported: boolean;
  customizationsSupported: string[];
}

export interface ModelCustomizationJob {
  jobArn: string;
  jobName: string;
  baseModelIdentifier: string;
  outputModelName: string;
  status: string;
  creationTime: string;
  lastModifiedTime: string;
}

const FOUNDATION_MODELS: Omit<FoundationModel, "modelArn">[] = [
  {
    modelId: "anthropic.claude-3-sonnet-20240229-v1:0",
    modelName: "Claude 3 Sonnet",
    providerName: "Anthropic",
    inputModalities: ["TEXT", "IMAGE"],
    outputModalities: ["TEXT"],
    responseStreamingSupported: true,
    customizationsSupported: [],
  },
  {
    modelId: "anthropic.claude-3-haiku-20240307-v1:0",
    modelName: "Claude 3 Haiku",
    providerName: "Anthropic",
    inputModalities: ["TEXT", "IMAGE"],
    outputModalities: ["TEXT"],
    responseStreamingSupported: true,
    customizationsSupported: [],
  },
  {
    modelId: "anthropic.claude-3-opus-20240229-v1:0",
    modelName: "Claude 3 Opus",
    providerName: "Anthropic",
    inputModalities: ["TEXT", "IMAGE"],
    outputModalities: ["TEXT"],
    responseStreamingSupported: true,
    customizationsSupported: [],
  },
  {
    modelId: "amazon.titan-text-express-v1",
    modelName: "Titan Text Express",
    providerName: "Amazon",
    inputModalities: ["TEXT"],
    outputModalities: ["TEXT"],
    responseStreamingSupported: true,
    customizationsSupported: ["FINE_TUNING"],
  },
  {
    modelId: "amazon.titan-embed-text-v1",
    modelName: "Titan Embeddings",
    providerName: "Amazon",
    inputModalities: ["TEXT"],
    outputModalities: ["EMBEDDING"],
    responseStreamingSupported: false,
    customizationsSupported: [],
  },
  {
    modelId: "meta.llama3-8b-instruct-v1:0",
    modelName: "Llama 3 8B Instruct",
    providerName: "Meta",
    inputModalities: ["TEXT"],
    outputModalities: ["TEXT"],
    responseStreamingSupported: true,
    customizationsSupported: [],
  },
];

export class BedrockService {
  private jobs: StorageBackend<string, ModelCustomizationJob>;

  constructor(private accountId: string) {
    this.jobs = new InMemoryStorage();
  }

  listFoundationModels(region: string): FoundationModel[] {
    return FOUNDATION_MODELS.map((m) => ({
      ...m,
      modelArn: `arn:aws:bedrock:${region}::foundation-model/${m.modelId}`,
    }));
  }

  invokeModel(modelId: string, body: any): any {
    // Claude-style messages format
    if (body.messages || body.anthropic_version) {
      return {
        id: `msg_${crypto.randomUUID().replace(/-/g, "").slice(0, 24)}`,
        type: "message",
        role: "assistant",
        content: [
          {
            type: "text",
            text: `Mock response from ${modelId}. This is a simulated response for testing purposes.`,
          },
        ],
        model: modelId,
        stop_reason: "end_turn",
        stop_sequence: null,
        usage: {
          input_tokens: 25,
          output_tokens: 20,
        },
      };
    }

    // Titan / generic format
    if (body.inputText !== undefined) {
      return {
        inputTextTokenCount: 10,
        results: [
          {
            tokenCount: 20,
            outputText: `Mock response from ${modelId}. This is a simulated response for testing purposes.`,
            completionReason: "FINISH",
          },
        ],
      };
    }

    // Fallback generic
    return {
      completion: `Mock response from ${modelId}.`,
      stop_reason: "stop",
    };
  }

  createModelCustomizationJob(
    jobName: string,
    baseModelIdentifier: string,
    outputModelName: string,
    region: string,
  ): string {
    const jobId = crypto.randomUUID();
    const jobArn = buildArn("bedrock", region, this.accountId, "model-customization-job/", jobId);
    const now = new Date().toISOString();

    const job: ModelCustomizationJob = {
      jobArn,
      jobName,
      baseModelIdentifier,
      outputModelName,
      status: "Completed",
      creationTime: now,
      lastModifiedTime: now,
    };
    this.jobs.set(jobArn, job);
    return jobArn;
  }

  getModelCustomizationJob(jobIdentifier: string): ModelCustomizationJob {
    // Try direct ARN lookup first
    let job = this.jobs.get(jobIdentifier);
    if (job) return job;

    // Try by job name
    for (const j of this.jobs.values()) {
      if (j.jobName === jobIdentifier) return j;
    }

    throw new AwsError(
      "ResourceNotFoundException",
      `Model customization job ${jobIdentifier} not found.`,
      404,
    );
  }
}
