import { AwsError } from "../../core/errors";

export interface TranscriptionJob {
  transcriptionJobName: string;
  transcriptionJobStatus: string;
  languageCode: string;
  mediaSampleRateHertz?: number;
  mediaFormat?: string;
  media: { MediaFileUri: string };
  transcript?: { TranscriptFileUri: string };
  creationTime: string;
  startTime?: string;
  completionTime?: string;
  settings?: any;
}

export interface Vocabulary {
  vocabularyName: string;
  languageCode: string;
  vocabularyState: string;
  lastModifiedTime: string;
  phrases?: string[];
}

export interface MedicalTranscriptionJob {
  medicalTranscriptionJobName: string;
  transcriptionJobStatus: string;
  languageCode: string;
  media: { MediaFileUri: string };
  specialty: string;
  type: string;
  transcript?: { TranscriptFileUri: string };
  creationTime: string;
  completionTime?: string;
}

export class TranscribeService {
  private jobs = new Map<string, TranscriptionJob>();
  private vocabularies = new Map<string, Vocabulary>();
  private medicalJobs = new Map<string, MedicalTranscriptionJob>();

  constructor(private accountId: string, private region: string) {}

  startTranscriptionJob(body: any): TranscriptionJob {
    const name = body.TranscriptionJobName;
    if (this.jobs.has(name)) {
      throw new AwsError("ConflictException", "The requested job name already exists.", 409);
    }
    const now = new Date().toISOString();
    const job: TranscriptionJob = {
      transcriptionJobName: name,
      transcriptionJobStatus: "COMPLETED",
      languageCode: body.LanguageCode ?? "en-US",
      mediaSampleRateHertz: body.MediaSampleRateHertz,
      mediaFormat: body.MediaFormat ?? "mp3",
      media: body.Media,
      creationTime: now,
      startTime: now,
      completionTime: now,
      settings: body.Settings ?? { ShowAlternatives: false, ShowSpeakerLabels: false },
      transcript: {
        TranscriptFileUri: `https://s3.${this.region}.amazonaws.com/aws-transcribe-${this.region}-prod/${this.accountId}/${name}/${crypto.randomUUID()}/asrOutput.json`,
      },
    };
    this.jobs.set(name, job);
    return job;
  }

  getTranscriptionJob(name: string): TranscriptionJob {
    const job = this.jobs.get(name);
    if (!job) {
      throw new AwsError("BadRequestException", "The requested job couldn't be found.", 400);
    }
    return job;
  }

  listTranscriptionJobs(): TranscriptionJob[] {
    return Array.from(this.jobs.values());
  }

  deleteTranscriptionJob(name: string): void {
    if (!this.jobs.has(name)) {
      throw new AwsError("BadRequestException", "The requested job couldn't be found.", 400);
    }
    this.jobs.delete(name);
  }

  createVocabulary(body: any): Vocabulary {
    const name = body.VocabularyName;
    if (this.vocabularies.has(name)) {
      throw new AwsError("ConflictException", "The requested vocabulary name already exists.", 409);
    }
    const vocab: Vocabulary = {
      vocabularyName: name,
      languageCode: body.LanguageCode ?? "en-US",
      vocabularyState: "READY",
      lastModifiedTime: new Date().toISOString(),
      phrases: body.Phrases,
    };
    this.vocabularies.set(name, vocab);
    return vocab;
  }

  getVocabulary(name: string): Vocabulary {
    const vocab = this.vocabularies.get(name);
    if (!vocab) {
      throw new AwsError("BadRequestException", "The requested vocabulary couldn't be found.", 400);
    }
    return vocab;
  }

  listVocabularies(): Vocabulary[] {
    return Array.from(this.vocabularies.values());
  }

  deleteVocabulary(name: string): void {
    if (!this.vocabularies.has(name)) {
      throw new AwsError("BadRequestException", "The requested vocabulary couldn't be found.", 400);
    }
    this.vocabularies.delete(name);
  }

  startMedicalTranscriptionJob(body: any): MedicalTranscriptionJob {
    const name = body.MedicalTranscriptionJobName;
    if (this.medicalJobs.has(name)) {
      throw new AwsError("ConflictException", "The requested job name already exists.", 409);
    }
    const now = new Date().toISOString();
    const job: MedicalTranscriptionJob = {
      medicalTranscriptionJobName: name,
      transcriptionJobStatus: "COMPLETED",
      languageCode: body.LanguageCode ?? "en-US",
      media: body.Media,
      specialty: body.Specialty ?? "PRIMARYCARE",
      type: body.Type ?? "CONVERSATION",
      creationTime: now,
      completionTime: now,
      transcript: {
        TranscriptFileUri: `https://s3.${this.region}.amazonaws.com/${body.OutputBucketName ?? "mock-bucket"}/medical/${name}.json`,
      },
    };
    this.medicalJobs.set(name, job);
    return job;
  }

  getMedicalTranscriptionJob(name: string): MedicalTranscriptionJob {
    const job = this.medicalJobs.get(name);
    if (!job) {
      throw new AwsError("BadRequestException", "The requested job couldn't be found.", 400);
    }
    return job;
  }
}
