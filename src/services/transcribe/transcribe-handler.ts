import type { RequestContext } from "../../core/context";
import { AwsError, jsonErrorResponse } from "../../core/errors";
import type { TranscribeService, TranscriptionJob, MedicalTranscriptionJob } from "./transcribe-service";

export class TranscribeHandler {
  constructor(private service: TranscribeService) {}

  handle(action: string, body: any, ctx: RequestContext): Response {
    try {
      switch (action) {
        case "StartTranscriptionJob": {
          const job = this.service.startTranscriptionJob(body);
          return this.json({ TranscriptionJob: this.jobToJson(job) }, ctx);
        }
        case "GetTranscriptionJob": {
          const job = this.service.getTranscriptionJob(body.TranscriptionJobName);
          return this.json({ TranscriptionJob: this.jobToJson(job) }, ctx);
        }
        case "ListTranscriptionJobs": {
          const jobs = this.service.listTranscriptionJobs();
          return this.json({
            TranscriptionJobSummaries: jobs.map((j) => ({
              TranscriptionJobName: j.transcriptionJobName,
              TranscriptionJobStatus: j.transcriptionJobStatus,
              LanguageCode: j.languageCode,
              CreationTime: this.toEpoch(j.creationTime),
            })),
          }, ctx);
        }
        case "DeleteTranscriptionJob":
          this.service.deleteTranscriptionJob(body.TranscriptionJobName);
          return this.json({}, ctx);
        case "CreateVocabulary": {
          const vocab = this.service.createVocabulary(body);
          return this.json({
            VocabularyName: vocab.vocabularyName,
            LanguageCode: vocab.languageCode,
            VocabularyState: vocab.vocabularyState,
            LastModifiedTime: this.toEpoch(vocab.lastModifiedTime),
          }, ctx);
        }
        case "GetVocabulary": {
          const vocab = this.service.getVocabulary(body.VocabularyName);
          return this.json({
            VocabularyName: vocab.vocabularyName,
            LanguageCode: vocab.languageCode,
            VocabularyState: vocab.vocabularyState,
            LastModifiedTime: this.toEpoch(vocab.lastModifiedTime),
          }, ctx);
        }
        case "ListVocabularies": {
          const vocabs = this.service.listVocabularies();
          return this.json({
            Vocabularies: vocabs.map((v) => ({
              VocabularyName: v.vocabularyName,
              LanguageCode: v.languageCode,
              VocabularyState: v.vocabularyState,
              LastModifiedTime: this.toEpoch(v.lastModifiedTime),
            })),
          }, ctx);
        }
        case "DeleteVocabulary":
          this.service.deleteVocabulary(body.VocabularyName);
          return this.json({}, ctx);
        case "StartMedicalTranscriptionJob": {
          const job = this.service.startMedicalTranscriptionJob(body);
          return this.json({ MedicalTranscriptionJob: this.medicalJobToJson(job) }, ctx);
        }
        case "GetMedicalTranscriptionJob": {
          const job = this.service.getMedicalTranscriptionJob(body.MedicalTranscriptionJobName);
          return this.json({ MedicalTranscriptionJob: this.medicalJobToJson(job) }, ctx);
        }
        default:
          return jsonErrorResponse(
            new AwsError("UnsupportedOperation", `Operation ${action} is not supported.`, 400),
            ctx.requestId,
          );
      }
    } catch (e) {
      if (e instanceof AwsError) return jsonErrorResponse(e, ctx.requestId);
      throw e;
    }
  }

  private toEpoch(ts?: string): number | undefined {
    return ts ? Math.floor(new Date(ts).getTime() / 1000) : undefined;
  }

  private jobToJson(job: TranscriptionJob): any {
    return {
      TranscriptionJobName: job.transcriptionJobName,
      TranscriptionJobStatus: job.transcriptionJobStatus,
      LanguageCode: job.languageCode,
      MediaSampleRateHertz: job.mediaSampleRateHertz,
      MediaFormat: job.mediaFormat,
      Media: job.media,
      Transcript: job.transcript,
      CreationTime: this.toEpoch(job.creationTime),
      StartTime: this.toEpoch(job.startTime),
      CompletionTime: this.toEpoch(job.completionTime),
      Settings: job.settings,
    };
  }

  private medicalJobToJson(job: MedicalTranscriptionJob): any {
    return {
      MedicalTranscriptionJobName: job.medicalTranscriptionJobName,
      TranscriptionJobStatus: job.transcriptionJobStatus,
      LanguageCode: job.languageCode,
      Media: job.media,
      Specialty: job.specialty,
      Type: job.type,
      Transcript: job.transcript,
      CreationTime: this.toEpoch(job.creationTime),
      CompletionTime: this.toEpoch(job.completionTime),
    };
  }

  private json(data: any, ctx: RequestContext): Response {
    return new Response(JSON.stringify(data), {
      headers: { "Content-Type": "application/x-amz-json-1.1", "x-amzn-RequestId": ctx.requestId },
    });
  }
}
