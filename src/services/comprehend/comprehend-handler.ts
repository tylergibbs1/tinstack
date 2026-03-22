import type { RequestContext } from "../../core/context";
import { AwsError, jsonErrorResponse } from "../../core/errors";
import type { ComprehendService } from "./comprehend-service";

export class ComprehendHandler {
  constructor(private service: ComprehendService) {}

  handle(action: string, body: any, ctx: RequestContext): Response {
    try {
      switch (action) {
        case "DetectSentiment":
          return this.json(this.service.detectSentiment(body.Text, body.LanguageCode), ctx);
        case "DetectEntities":
          return this.json(this.service.detectEntities(body.Text, body.LanguageCode), ctx);
        case "DetectKeyPhrases":
          return this.json(this.service.detectKeyPhrases(body.Text, body.LanguageCode), ctx);
        case "DetectDominantLanguage":
          return this.json(this.service.detectDominantLanguage(body.Text), ctx);
        case "BatchDetectSentiment":
          return this.json(this.service.batchDetectSentiment(body.TextList, body.LanguageCode), ctx);
        case "BatchDetectEntities":
          return this.json(this.service.batchDetectEntities(body.TextList, body.LanguageCode), ctx);
        case "StartEntitiesDetectionJob": {
          const job = this.service.startEntitiesDetectionJob(body, ctx.region);
          return this.json({ JobId: job.jobId, JobArn: job.jobArn, JobStatus: job.jobStatus }, ctx);
        }
        case "DescribeEntitiesDetectionJob": {
          const job = this.service.describeEntitiesDetectionJob(body.JobId);
          return this.json({ EntitiesDetectionJobProperties: this.jobToJson(job) }, ctx);
        }
        case "ListEntitiesDetectionJobs": {
          const jobs = this.service.listEntitiesDetectionJobs();
          return this.json({ EntitiesDetectionJobPropertiesList: jobs.map((j) => this.jobToJson(j)) }, ctx);
        }
        case "StopEntitiesDetectionJob": {
          const status = this.service.stopEntitiesDetectionJob(body.JobId);
          return this.json({ JobId: body.JobId, JobStatus: status }, ctx);
        }
        case "CreateDocumentClassifier": {
          const arn = this.service.createDocumentClassifier(body, ctx.region);
          return this.json({ DocumentClassifierArn: arn }, ctx);
        }
        case "DescribeDocumentClassifier": {
          const classifier = this.service.describeDocumentClassifier(body.DocumentClassifierArn);
          return this.json({
            DocumentClassifierProperties: {
              DocumentClassifierArn: classifier.documentClassifierArn,
              LanguageCode: classifier.languageCode,
              Status: classifier.status,
              InputDataConfig: classifier.inputDataConfig,
              DataAccessRoleArn: classifier.dataAccessRoleArn,
            },
          }, ctx);
        }
        case "ListDocumentClassifiers": {
          const classifiers = this.service.listDocumentClassifiers();
          return this.json({
            DocumentClassifierPropertiesList: classifiers.map((c) => ({
              DocumentClassifierArn: c.documentClassifierArn,
              LanguageCode: c.languageCode,
              Status: c.status,
            })),
          }, ctx);
        }
        case "DeleteDocumentClassifier":
          this.service.deleteDocumentClassifier(body.DocumentClassifierArn);
          return this.json({}, ctx);
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

  private jobToJson(job: any): any {
    return {
      JobId: job.jobId,
      JobArn: job.jobArn,
      JobName: job.jobName,
      JobStatus: job.jobStatus,
      SubmitTime: Math.floor(new Date(job.submitTime).getTime() / 1000),
      EndTime: job.endTime ? Math.floor(new Date(job.endTime).getTime() / 1000) : undefined,
      InputDataConfig: job.inputDataConfig,
      OutputDataConfig: job.outputDataConfig,
      DataAccessRoleArn: job.dataAccessRoleArn,
      LanguageCode: job.languageCode,
    };
  }

  private json(data: any, ctx: RequestContext): Response {
    return new Response(JSON.stringify(data), {
      headers: { "Content-Type": "application/x-amz-json-1.1", "x-amzn-RequestId": ctx.requestId },
    });
  }
}
