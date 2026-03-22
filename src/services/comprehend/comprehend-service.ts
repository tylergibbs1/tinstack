import { AwsError } from "../../core/errors";

export interface DocumentClassifier {
  documentClassifierArn: string;
  name: string;
  languageCode: string;
  status: string;
  inputDataConfig: any;
  dataAccessRoleArn: string;
  createdAt: string;
}

export interface EntitiesDetectionJob {
  jobId: string;
  jobArn: string;
  jobName?: string;
  jobStatus: string;
  inputDataConfig: any;
  outputDataConfig: any;
  dataAccessRoleArn: string;
  languageCode: string;
  submitTime: string;
  endTime?: string;
}

const MOCK_SENTIMENT = {
  Sentiment: "NEUTRAL",
  SentimentScore: {
    Positive: 0.008,
    Negative: 0.0003,
    Neutral: 0.9916,
    Mixed: 0.00001,
  },
};

const MOCK_ENTITIES = [
  { Score: 0.9999, Type: "PERSON", Text: "Mock Person", BeginOffset: 0, EndOffset: 11 },
  { Score: 0.9998, Type: "ORGANIZATION", Text: "Mock Corp", BeginOffset: 15, EndOffset: 24 },
];

const MOCK_KEY_PHRASES = [
  { Score: 0.9999, Text: "mock phrase", BeginOffset: 0, EndOffset: 11 },
  { Score: 0.9997, Text: "another phrase", BeginOffset: 15, EndOffset: 29 },
];

const MOCK_LANGUAGES = [
  { LanguageCode: "en", Score: 0.9987 },
  { LanguageCode: "es", Score: 0.0013 },
];

export class ComprehendService {
  private classifiers = new Map<string, DocumentClassifier>();
  private jobs = new Map<string, EntitiesDetectionJob>();

  constructor(private accountId: string) {}

  detectSentiment(_text: string, _languageCode: string): any {
    return MOCK_SENTIMENT;
  }

  detectEntities(_text: string, _languageCode: string): { Entities: any[] } {
    return { Entities: MOCK_ENTITIES };
  }

  detectKeyPhrases(_text: string, _languageCode: string): { KeyPhrases: any[] } {
    return { KeyPhrases: MOCK_KEY_PHRASES };
  }

  detectDominantLanguage(_text: string): { Languages: any[] } {
    return { Languages: MOCK_LANGUAGES };
  }

  batchDetectSentiment(textList: string[], _languageCode: string): any {
    return {
      ResultList: textList.map((_, i) => ({
        Index: i,
        ...MOCK_SENTIMENT,
      })),
      ErrorList: [],
    };
  }

  batchDetectEntities(textList: string[], _languageCode: string): any {
    return {
      ResultList: textList.map((_, i) => ({
        Index: i,
        Entities: MOCK_ENTITIES,
      })),
      ErrorList: [],
    };
  }

  startEntitiesDetectionJob(body: any, region: string): EntitiesDetectionJob {
    const jobId = crypto.randomUUID();
    const job: EntitiesDetectionJob = {
      jobId,
      jobArn: `arn:aws:comprehend:${region}:${this.accountId}:entities-detection-job/${jobId}`,
      jobName: body.JobName,
      jobStatus: "SUBMITTED",
      inputDataConfig: body.InputDataConfig,
      outputDataConfig: body.OutputDataConfig,
      dataAccessRoleArn: body.DataAccessRoleArn,
      languageCode: body.LanguageCode,
      submitTime: new Date().toISOString(),
    };
    this.jobs.set(jobId, job);
    return job;
  }

  describeEntitiesDetectionJob(jobId: string): EntitiesDetectionJob {
    const job = this.jobs.get(jobId);
    if (!job) {
      throw new AwsError("ResourceNotFoundException", `Job ${jobId} not found.`, 400);
    }
    // Simulate completion
    job.jobStatus = "COMPLETED";
    job.endTime = new Date().toISOString();
    return job;
  }

  listEntitiesDetectionJobs(): EntitiesDetectionJob[] {
    return Array.from(this.jobs.values());
  }

  stopEntitiesDetectionJob(jobId: string): string {
    const job = this.jobs.get(jobId);
    if (!job) {
      throw new AwsError("ResourceNotFoundException", `Job ${jobId} not found.`, 400);
    }
    if (job.jobStatus === "SUBMITTED" || job.jobStatus === "IN_PROGRESS") {
      job.jobStatus = "STOP_REQUESTED";
    }
    return job.jobStatus;
  }

  createDocumentClassifier(body: any, region: string): string {
    const name = body.DocumentClassifierName;
    const arn = `arn:aws:comprehend:${region}:${this.accountId}:document-classifier/${name}`;
    if (this.classifiers.has(arn)) {
      throw new AwsError("ResourceInUseException", `Classifier ${name} already exists.`, 400);
    }
    const classifier: DocumentClassifier = {
      documentClassifierArn: arn,
      name,
      languageCode: body.LanguageCode ?? "en",
      status: "TRAINING",
      inputDataConfig: body.InputDataConfig,
      dataAccessRoleArn: body.DataAccessRoleArn,
      createdAt: new Date().toISOString(),
    };
    this.classifiers.set(arn, classifier);
    return arn;
  }

  describeDocumentClassifier(arn: string): DocumentClassifier {
    const classifier = this.classifiers.get(arn);
    if (!classifier) {
      throw new AwsError("ResourceNotFoundException", `Classifier ${arn} not found.`, 400);
    }
    return classifier;
  }

  listDocumentClassifiers(): DocumentClassifier[] {
    return Array.from(this.classifiers.values());
  }

  deleteDocumentClassifier(arn: string): void {
    if (!this.classifiers.has(arn)) {
      throw new AwsError("ResourceNotFoundException", `Classifier ${arn} not found.`, 400);
    }
    this.classifiers.delete(arn);
  }
}
