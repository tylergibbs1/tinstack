import type { RequestContext } from "../../core/context";
import { AwsError, jsonErrorResponse } from "../../core/errors";
import type { PersonalizeService } from "./personalize-service";

export class PersonalizeHandler {
  constructor(private service: PersonalizeService) {}

  handle(action: string, body: any, ctx: RequestContext): Response {
    try {
      switch (action) {
        case "CreateDatasetGroup": {
          const dg = this.service.createDatasetGroup(body.name);
          return this.json({ datasetGroupArn: dg.datasetGroupArn }, ctx);
        }
        case "DescribeDatasetGroup": {
          const dg = this.service.describeDatasetGroup(body.datasetGroupArn);
          return this.json({ datasetGroup: dg }, ctx);
        }
        case "ListDatasetGroups":
          return this.json({ datasetGroups: this.service.listDatasetGroups() }, ctx);
        case "DeleteDatasetGroup":
          this.service.deleteDatasetGroup(body.datasetGroupArn);
          return this.json({}, ctx);
        case "CreateSolution": {
          const sol = this.service.createSolution(body.name, body.datasetGroupArn);
          return this.json({ solutionArn: sol.solutionArn }, ctx);
        }
        case "DescribeSolution": {
          const sol = this.service.describeSolution(body.solutionArn);
          return this.json({ solution: sol }, ctx);
        }
        case "ListSolutions":
          return this.json({ solutions: this.service.listSolutions() }, ctx);
        case "CreateCampaign": {
          const c = this.service.createCampaign(body.name, body.solutionVersionArn);
          return this.json({ campaignArn: c.campaignArn }, ctx);
        }
        default:
          return jsonErrorResponse(new AwsError("InvalidAction", `Unknown action ${action}`, 400), ctx.requestId);
      }
    } catch (e) {
      if (e instanceof AwsError) return jsonErrorResponse(e, ctx.requestId);
      throw e;
    }
  }

  private json(data: any, ctx: RequestContext): Response {
    return new Response(JSON.stringify(data), {
      headers: { "Content-Type": "application/x-amz-json-1.1", "x-amzn-RequestId": ctx.requestId },
    });
  }
}
