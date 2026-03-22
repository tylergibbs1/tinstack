import type { RequestContext } from "../../core/context";
import { AwsError, jsonErrorResponse } from "../../core/errors";
import type { CloudWatchMetricsService } from "./metrics-service";

export class CloudWatchMetricsHandler {
  constructor(private service: CloudWatchMetricsService) {}

  handle(action: string, body: any, ctx: RequestContext): Response {
    try {
      switch (action) {
        case "PutMetricData":
          this.service.putMetricData(body.Namespace, body.MetricData, ctx.region);
          return this.json({}, ctx);
        case "GetMetricData": {
          const r = this.service.getMetricData(body.MetricDataQueries, body.StartTime, body.EndTime, ctx.region);
          return this.json({ MetricDataResults: r.metricDataResults }, ctx);
        }
        case "GetMetricStatistics": {
          const r = this.service.getMetricStatistics(
            body.Namespace, body.MetricName, body.StartTime, body.EndTime,
            body.Period, body.Statistics, body.Dimensions, ctx.region,
          );
          return this.json({ Datapoints: r.datapoints, Label: body.MetricName }, ctx);
        }
        case "ListMetrics": {
          const r = this.service.listMetrics(body.Namespace, body.MetricName, ctx.region);
          return this.json({ Metrics: r.metrics }, ctx);
        }
        case "PutMetricAlarm":
          this.service.putMetricAlarm({
            alarmName: body.AlarmName, metricName: body.MetricName, namespace: body.Namespace,
            statistic: body.Statistic, period: body.Period, evaluationPeriods: body.EvaluationPeriods,
            threshold: body.Threshold, comparisonOperator: body.ComparisonOperator,
            dimensions: body.Dimensions, actionsEnabled: body.ActionsEnabled,
            alarmActions: body.AlarmActions, okActions: body.OKActions,
            insufficientDataActions: body.InsufficientDataActions,
            description: body.AlarmDescription, unit: body.Unit,
            treatMissingData: body.TreatMissingData,
          }, ctx.region);
          return this.json({}, ctx);
        case "DescribeAlarms":
          return this.json({ MetricAlarms: this.service.describeAlarms(body.AlarmNames, ctx.region).map(alarmToJson) }, ctx);
        case "DeleteAlarms":
          this.service.deleteAlarms(body.AlarmNames, ctx.region);
          return this.json({}, ctx);
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
      headers: { "Content-Type": "application/x-amz-json-1.0", "x-amzn-RequestId": ctx.requestId },
    });
  }
}

function alarmToJson(a: any) {
  return {
    AlarmName: a.alarmName, AlarmArn: a.alarmArn, MetricName: a.metricName,
    Namespace: a.namespace, Statistic: a.statistic, Period: a.period,
    EvaluationPeriods: a.evaluationPeriods, Threshold: a.threshold,
    ComparisonOperator: a.comparisonOperator, Dimensions: a.dimensions,
    ActionsEnabled: a.actionsEnabled, AlarmActions: a.alarmActions,
    OKActions: a.okActions, InsufficientDataActions: a.insufficientDataActions,
    StateValue: a.stateValue, StateReason: a.stateReason,
    StateUpdatedTimestamp: a.stateUpdatedTimestamp, AlarmDescription: a.description,
    Unit: a.unit, TreatMissingData: a.treatMissingData,
  };
}
