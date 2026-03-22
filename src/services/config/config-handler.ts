import type { RequestContext } from "../../core/context";
import { AwsError, jsonErrorResponse } from "../../core/errors";
import type { ConfigService } from "./config-service";

export class ConfigHandler {
  constructor(private service: ConfigService) {}

  handle(action: string, body: any, ctx: RequestContext): Response {
    try {
      switch (action) {
        case "PutConfigurationRecorder":
          this.service.putConfigurationRecorder(body, ctx.region);
          return this.json({}, ctx);
        case "DescribeConfigurationRecorders": return this.describeConfigurationRecorders(body, ctx);
        case "DeleteConfigurationRecorder":
          this.service.deleteConfigurationRecorder(body.ConfigurationRecorderName, ctx.region);
          return this.json({}, ctx);
        case "PutDeliveryChannel":
          this.service.putDeliveryChannel(body, ctx.region);
          return this.json({}, ctx);
        case "DescribeDeliveryChannels": return this.describeDeliveryChannels(body, ctx);
        case "DeleteDeliveryChannel":
          this.service.deleteDeliveryChannel(body.DeliveryChannelName, ctx.region);
          return this.json({}, ctx);
        case "StartConfigurationRecorder":
          this.service.startConfigurationRecorder(body.ConfigurationRecorderName, ctx.region);
          return this.json({}, ctx);
        case "StopConfigurationRecorder":
          this.service.stopConfigurationRecorder(body.ConfigurationRecorderName, ctx.region);
          return this.json({}, ctx);
        case "PutConfigRule": return this.putConfigRule(body, ctx);
        case "DescribeConfigRules": return this.describeConfigRules(body, ctx);
        case "DeleteConfigRule":
          this.service.deleteConfigRule(body.ConfigRuleName, ctx.region);
          return this.json({}, ctx);
        case "PutEvaluations": return this.putEvaluations(body, ctx);
        case "GetComplianceDetailsByConfigRule": return this.getComplianceDetails(body, ctx);
        case "DescribeComplianceByConfigRule": return this.describeCompliance(body, ctx);
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

  private describeConfigurationRecorders(body: any, ctx: RequestContext): Response {
    const recorders = this.service.describeConfigurationRecorders(body.ConfigurationRecorderNames, ctx.region);
    return this.json({
      ConfigurationRecorders: recorders.map((r) => ({
        name: r.name, roleARN: r.roleARN, recordingGroup: r.recordingGroup,
      })),
    }, ctx);
  }

  private describeDeliveryChannels(body: any, ctx: RequestContext): Response {
    const channels = this.service.describeDeliveryChannels(body.DeliveryChannelNames, ctx.region);
    return this.json({
      DeliveryChannels: channels.map((c) => ({
        name: c.name, s3BucketName: c.s3BucketName, s3KeyPrefix: c.s3KeyPrefix,
        snsTopicARN: c.snsTopicARN, configSnapshotDeliveryProperties: c.configSnapshotDeliveryProperties,
      })),
    }, ctx);
  }

  private putConfigRule(body: any, ctx: RequestContext): Response {
    const rule = this.service.putConfigRule(body, ctx.region);
    return this.json({
      ConfigRuleArn: rule.configRuleArn,
      ConfigRuleId: rule.configRuleId,
    }, ctx);
  }

  private describeConfigRules(body: any, ctx: RequestContext): Response {
    const rules = this.service.describeConfigRules(body.ConfigRuleNames, ctx.region);
    return this.json({
      ConfigRules: rules.map((r) => ({
        ConfigRuleName: r.configRuleName, ConfigRuleArn: r.configRuleArn,
        ConfigRuleId: r.configRuleId, Description: r.description,
        Source: r.source, InputParameters: r.inputParameters,
        Scope: r.scope, ConfigRuleState: r.configRuleState,
        MaximumExecutionFrequency: r.maximumExecutionFrequency,
      })),
    }, ctx);
  }

  private putEvaluations(body: any, ctx: RequestContext): Response {
    const evals = this.service.putEvaluations(body.ResultToken, body.Evaluations ?? [], ctx.region);
    return this.json({ FailedEvaluations: [] }, ctx);
  }

  private getComplianceDetails(body: any, ctx: RequestContext): Response {
    const results = this.service.getComplianceDetailsByConfigRule(body.ConfigRuleName, ctx.region);
    return this.json({
      EvaluationResults: results.map((e: any) => ({
        EvaluationResultIdentifier: {
          EvaluationResultQualifier: {
            ConfigRuleName: body.ConfigRuleName,
            ResourceType: e.complianceResourceType,
            ResourceId: e.complianceResourceId,
          },
        },
        ComplianceType: e.complianceType,
        Annotation: e.annotation,
        ResultRecordedTime: e.orderingTimestamp,
      })),
    }, ctx);
  }

  private describeCompliance(body: any, ctx: RequestContext): Response {
    const results = this.service.describeComplianceByConfigRule(body.ConfigRuleNames, ctx.region);
    return this.json({ ComplianceByConfigRules: results }, ctx);
  }
}
