import type { RequestContext } from "../../core/context";
import { AwsError, jsonErrorResponse } from "../../core/errors";
import type { StepFunctionsService } from "./stepfunctions-service";

export class StepFunctionsHandler {
  constructor(private service: StepFunctionsService) {}

  async handle(action: string, body: any, ctx: RequestContext): Promise<Response> {
    try {
      switch (action) {
        case "CreateStateMachine": return this.createStateMachine(body, ctx);
        case "DescribeStateMachine": return this.describeStateMachine(body, ctx);
        case "UpdateStateMachine": return this.updateStateMachine(body, ctx);
        case "DeleteStateMachine": this.service.deleteStateMachine(body.stateMachineArn, ctx.region); return this.json({}, ctx);
        case "ListStateMachines": return this.json({ stateMachines: this.service.listStateMachines(ctx.region).map(smSummary) }, ctx);
        case "StartExecution": return this.startExecution(body, ctx);
        case "StartSyncExecution": return this.startSyncExecution(body, ctx);
        case "DescribeExecution": return this.describeExecution(body, ctx);
        case "ListExecutions": return this.listExecutions(body, ctx);
        case "StopExecution": return this.stopExecution(body, ctx);
        case "GetExecutionHistory": return this.getExecutionHistory(body, ctx);
        case "TagResource": {
          const tags: Record<string, string> = {};
          for (const t of body.tags ?? []) tags[t.key] = t.value;
          this.service.tagResource(body.resourceArn, tags);
          return this.json({}, ctx);
        }
        case "ValidateStateMachineDefinition": {
          // Terraform calls this during plan - just return valid
          return this.json({ result: "OK", diagnostics: [] }, ctx);
        }
        case "ListTagsForResource": {
          const tags = this.service.listTagsForResource(body.resourceArn);
          return this.json({ tags: Object.entries(tags).map(([key, value]) => ({ key, value })) }, ctx);
        }
        case "ListStateMachineVersions": {
          return this.json({ stateMachineVersions: [] }, ctx);
        }
        default:
          return jsonErrorResponse(new AwsError("UnsupportedOperation", `Operation ${action} is not supported.`, 400), ctx.requestId);
      }
    } catch (e) {
      if (e instanceof AwsError) return jsonErrorResponse(e, ctx.requestId);
      throw e;
    }
  }

  private json(data: any, ctx: RequestContext, status = 200): Response {
    return new Response(JSON.stringify(data), {
      status,
      headers: { "Content-Type": "application/x-amz-json-1.0", "x-amzn-RequestId": ctx.requestId },
    });
  }

  private createStateMachine(body: any, ctx: RequestContext): Response {
    const tags: Record<string, string> = {};
    if (body.tags) for (const t of body.tags) tags[t.key] = t.value;
    const sm = this.service.createStateMachine(
      body.name, body.definition, body.roleArn,
      body.type ?? "STANDARD", tags, ctx.region,
    );
    return this.json({
      stateMachineArn: sm.stateMachineArn,
      creationDate: sm.creationDate,
    }, ctx);
  }

  private describeStateMachine(body: any, ctx: RequestContext): Response {
    const sm = this.service.describeStateMachine(body.stateMachineArn, ctx.region);
    return this.json({
      stateMachineArn: sm.stateMachineArn,
      name: sm.name,
      definition: sm.definition,
      roleArn: sm.roleArn,
      type: sm.type,
      status: sm.status,
      creationDate: sm.creationDate,
    }, ctx);
  }

  private updateStateMachine(body: any, ctx: RequestContext): Response {
    const sm = this.service.updateStateMachine(body.stateMachineArn, body.definition, body.roleArn, ctx.region);
    return this.json({ stateMachineArn: sm.stateMachineArn, updateDate: Date.now() / 1000 }, ctx);
  }

  private async startExecution(body: any, ctx: RequestContext): Promise<Response> {
    const exec = await this.service.startExecution(body.stateMachineArn, body.input ?? "{}", body.name, ctx.region);
    return this.json({ executionArn: exec.executionArn, startDate: exec.startDate }, ctx);
  }

  private async startSyncExecution(body: any, ctx: RequestContext): Promise<Response> {
    const exec = await this.service.startSyncExecution(body.stateMachineArn, body.input ?? "{}", body.name, ctx.region);
    return this.json({
      executionArn: exec.executionArn,
      stateMachineArn: exec.stateMachineArn,
      name: exec.name,
      status: exec.status,
      startDate: exec.startDate,
      stopDate: exec.stopDate,
      input: exec.input,
      output: exec.output,
      error: exec.error,
      cause: exec.cause,
    }, ctx);
  }

  private describeExecution(body: any, ctx: RequestContext): Response {
    const exec = this.service.describeExecution(body.executionArn);
    return this.json({
      executionArn: exec.executionArn,
      stateMachineArn: exec.stateMachineArn,
      name: exec.name,
      status: exec.status,
      startDate: exec.startDate,
      stopDate: exec.stopDate,
      input: exec.input,
      output: exec.output,
      error: exec.error,
      cause: exec.cause,
    }, ctx);
  }

  private listExecutions(body: any, ctx: RequestContext): Response {
    const execs = this.service.listExecutions(body.stateMachineArn, body.statusFilter);
    return this.json({
      executions: execs.map((e) => ({
        executionArn: e.executionArn,
        stateMachineArn: e.stateMachineArn,
        name: e.name,
        status: e.status,
        startDate: e.startDate,
        stopDate: e.stopDate,
      })),
    }, ctx);
  }

  private stopExecution(body: any, ctx: RequestContext): Response {
    const exec = this.service.stopExecution(body.executionArn, body.error, body.cause);
    return this.json({ stopDate: exec.stopDate }, ctx);
  }

  private getExecutionHistory(body: any, ctx: RequestContext): Response {
    const events = this.service.getExecutionHistory(body.executionArn);
    return this.json({
      events: events.map((e) => ({
        timestamp: e.timestamp,
        type: e.type,
        id: e.id,
        previousEventId: e.previousEventId,
        ...e.details,
      })),
    }, ctx);
  }
}

function smSummary(sm: any) {
  return {
    stateMachineArn: sm.stateMachineArn,
    name: sm.name,
    type: sm.type,
    creationDate: sm.creationDate,
  };
}
