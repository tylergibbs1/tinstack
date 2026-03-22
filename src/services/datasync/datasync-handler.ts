import type { RequestContext } from "../../core/context";
import { AwsError, jsonErrorResponse } from "../../core/errors";
import type { DataSyncService } from "./datasync-service";

export class DataSyncHandler {
  constructor(private service: DataSyncService) {}

  handle(action: string, body: any, ctx: RequestContext): Response {
    try {
      switch (action) {
        case "CreateAgent": {
          const arn = this.service.createAgent(body.AgentName, body.ActivationKey, body.Tags, ctx.region);
          return this.json({ AgentArn: arn }, ctx);
        }
        case "ListAgents": {
          const agents = this.service.listAgents();
          return this.json({ Agents: agents.map(agentToJson) }, ctx);
        }
        case "DeleteAgent": {
          this.service.deleteAgent(body.AgentArn);
          return this.json({}, ctx);
        }
        case "CreateLocationS3": {
          const arn = this.service.createLocationS3(body.S3BucketArn, body.S3Config, body.Subdirectory, body.Tags, ctx.region);
          return this.json({ LocationArn: arn }, ctx);
        }
        case "CreateLocationNfs": {
          const arn = this.service.createLocationNfs(body.ServerHostname, body.Subdirectory, body.OnPremConfig, body.Tags, ctx.region);
          return this.json({ LocationArn: arn }, ctx);
        }
        case "CreateLocationEfs": {
          const arn = this.service.createLocationEfs(body.EfsFilesystemArn, body.Ec2Config, body.Subdirectory, body.Tags, ctx.region);
          return this.json({ LocationArn: arn }, ctx);
        }
        case "DescribeLocation": {
          const loc = this.service.describeLocation(body.LocationArn);
          return this.json({
            LocationArn: loc.locationArn,
            LocationUri: loc.locationUri,
            CreationTime: loc.createdAt,
          }, ctx);
        }
        case "ListLocations": {
          const locs = this.service.listLocations();
          return this.json({ Locations: locs.map((l) => ({ LocationArn: l.locationArn, LocationUri: l.locationUri })) }, ctx);
        }
        case "DeleteLocation": {
          this.service.deleteLocation(body.LocationArn);
          return this.json({}, ctx);
        }
        case "CreateTask": {
          const arn = this.service.createTask(body.SourceLocationArn, body.DestinationLocationArn, body.Name, body.Tags, ctx.region);
          return this.json({ TaskArn: arn }, ctx);
        }
        case "DescribeTask": {
          const task = this.service.describeTask(body.TaskArn);
          return this.json({
            TaskArn: task.taskArn,
            Name: task.name,
            SourceLocationArn: task.sourceLocationArn,
            DestinationLocationArn: task.destinationLocationArn,
            Status: task.status,
            CreationTime: task.createdAt,
            CurrentTaskExecutionArn: task.currentTaskExecutionArn,
          }, ctx);
        }
        case "ListTasks": {
          const tasks = this.service.listTasks();
          return this.json({ Tasks: tasks.map((t) => ({ TaskArn: t.taskArn, Name: t.name, Status: t.status })) }, ctx);
        }
        case "DeleteTask": {
          this.service.deleteTask(body.TaskArn);
          return this.json({}, ctx);
        }
        case "StartTaskExecution": {
          const arn = this.service.startTaskExecution(body.TaskArn);
          return this.json({ TaskExecutionArn: arn }, ctx);
        }
        case "DescribeTaskExecution": {
          const exec = this.service.describeTaskExecution(body.TaskExecutionArn);
          return this.json({
            TaskExecutionArn: exec.taskExecutionArn,
            Status: exec.status,
            StartTime: exec.startTime,
          }, ctx);
        }
        case "ListTaskExecutions": {
          const execs = this.service.listTaskExecutions(body.TaskArn);
          return this.json({ TaskExecutions: execs.map((e) => ({ TaskExecutionArn: e.taskExecutionArn, Status: e.status })) }, ctx);
        }
        case "CancelTaskExecution": {
          this.service.cancelTaskExecution(body.TaskExecutionArn);
          return this.json({}, ctx);
        }
        case "TagResource": {
          this.service.tagResource(body.ResourceArn, body.Tags ?? []);
          return this.json({}, ctx);
        }
        case "UntagResource": {
          this.service.untagResource(body.ResourceArn, body.Keys ?? []);
          return this.json({}, ctx);
        }
        case "ListTagsForResource": {
          const tags = this.service.listTagsForResource(body.ResourceArn);
          return this.json({ Tags: tags }, ctx);
        }
        default:
          return jsonErrorResponse(new AwsError("UnsupportedOperation", `Operation ${action} is not supported.`, 400), ctx.requestId);
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

function agentToJson(agent: any): any {
  return {
    AgentArn: agent.agentArn,
    Name: agent.name,
    Status: agent.status,
  };
}
