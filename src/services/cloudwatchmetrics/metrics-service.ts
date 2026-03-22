import { InMemoryStorage, type StorageBackend } from "../../core/storage";
import { AwsError } from "../../core/errors";
import { buildArn } from "../../core/arn";

export interface MetricDatum {
  MetricName: string;
  Namespace: string;
  Dimensions?: { Name: string; Value: string }[];
  Value?: number;
  Values?: number[];
  Counts?: number[];
  StatisticValues?: { SampleCount: number; Sum: number; Minimum: number; Maximum: number };
  Unit?: string;
  Timestamp?: number;
  StorageResolution?: number;
}

export interface MetricAlarm {
  alarmName: string;
  alarmArn: string;
  metricName: string;
  namespace: string;
  statistic: string;
  period: number;
  evaluationPeriods: number;
  threshold: number;
  comparisonOperator: string;
  dimensions?: { Name: string; Value: string }[];
  actionsEnabled: boolean;
  alarmActions: string[];
  okActions: string[];
  insufficientDataActions: string[];
  stateValue: string;
  stateReason: string;
  stateUpdatedTimestamp: number;
  description?: string;
  unit?: string;
  treatMissingData?: string;
}

interface StoredDatapoint {
  namespace: string;
  metricName: string;
  dimensions: { Name: string; Value: string }[];
  timestamp: number;
  value: number;
  unit: string;
}

export class CloudWatchMetricsService {
  private datapoints: StoredDatapoint[] = [];
  private alarms: StorageBackend<string, MetricAlarm>;

  constructor(private accountId: string) {
    this.alarms = new InMemoryStorage();
  }

  private regionKey(region: string, name: string): string {
    return `${region}#${name}`;
  }

  putMetricData(namespace: string, metricData: MetricDatum[], region: string): void {
    const now = Date.now() / 1000;
    for (const datum of metricData) {
      const dims = datum.Dimensions ?? [];
      const ts = datum.Timestamp ?? now;
      const unit = datum.Unit ?? "None";

      if (datum.Value !== undefined) {
        this.datapoints.push({ namespace, metricName: datum.MetricName, dimensions: dims, timestamp: ts, value: datum.Value, unit });
      } else if (datum.Values) {
        const counts = datum.Counts ?? datum.Values.map(() => 1);
        for (let i = 0; i < datum.Values.length; i++) {
          for (let c = 0; c < (counts[i] ?? 1); c++) {
            this.datapoints.push({ namespace, metricName: datum.MetricName, dimensions: dims, timestamp: ts, value: datum.Values[i], unit });
          }
        }
      } else if (datum.StatisticValues) {
        const sv = datum.StatisticValues;
        // Store as individual aggregate record
        this.datapoints.push({ namespace, metricName: datum.MetricName, dimensions: dims, timestamp: ts, value: sv.Sum / sv.SampleCount, unit });
      }
    }
  }

  getMetricData(queries: any[], startTime: number, endTime: number, region: string): { metricDataResults: any[] } {
    const results = queries.map((q: any) => {
      const metricStat = q.MetricStat;
      if (!metricStat) return { Id: q.Id, Label: q.Label ?? q.Id, Timestamps: [], Values: [], StatusCode: "Complete" };

      const metric = metricStat.Metric;
      const period = metricStat.Period ?? 60;
      const stat = metricStat.Stat ?? "Average";

      const matching = this.datapoints.filter((dp) => {
        if (dp.namespace !== metric.Namespace) return false;
        if (dp.metricName !== metric.MetricName) return false;
        if (dp.timestamp < startTime || dp.timestamp > endTime) return false;
        if (metric.Dimensions) {
          for (const dim of metric.Dimensions) {
            if (!dp.dimensions.some((d: any) => d.Name === dim.Name && d.Value === dim.Value)) return false;
          }
        }
        return true;
      });

      // Aggregate by period
      const buckets = new Map<number, number[]>();
      for (const dp of matching) {
        const bucket = Math.floor(dp.timestamp / period) * period;
        if (!buckets.has(bucket)) buckets.set(bucket, []);
        buckets.get(bucket)!.push(dp.value);
      }

      const timestamps: number[] = [];
      const values: number[] = [];
      for (const [ts, vals] of [...buckets.entries()].sort((a, b) => a[0] - b[0])) {
        timestamps.push(ts);
        switch (stat) {
          case "Sum": values.push(vals.reduce((a, b) => a + b, 0)); break;
          case "Average": values.push(vals.reduce((a, b) => a + b, 0) / vals.length); break;
          case "Minimum": values.push(Math.min(...vals)); break;
          case "Maximum": values.push(Math.max(...vals)); break;
          case "SampleCount": values.push(vals.length); break;
          default: values.push(vals.reduce((a, b) => a + b, 0) / vals.length);
        }
      }

      return { Id: q.Id, Label: q.Label ?? metric.MetricName, Timestamps: timestamps, Values: values, StatusCode: "Complete" };
    });

    return { metricDataResults: results };
  }

  getMetricStatistics(namespace: string, metricName: string, startTime: number, endTime: number, period: number, statistics: string[], dimensions: any[], region: string): { datapoints: any[] } {
    const matching = this.datapoints.filter((dp) => {
      if (dp.namespace !== namespace || dp.metricName !== metricName) return false;
      if (dp.timestamp < startTime || dp.timestamp > endTime) return false;
      if (dimensions) {
        for (const dim of dimensions) {
          if (!dp.dimensions.some((d: any) => d.Name === dim.Name && d.Value === dim.Value)) return false;
        }
      }
      return true;
    });

    const buckets = new Map<number, number[]>();
    for (const dp of matching) {
      const bucket = Math.floor(dp.timestamp / period) * period;
      if (!buckets.has(bucket)) buckets.set(bucket, []);
      buckets.get(bucket)!.push(dp.value);
    }

    const datapoints = [...buckets.entries()].sort((a, b) => a[0] - b[0]).map(([ts, vals]) => {
      const dp: any = { Timestamp: ts, Unit: matching[0]?.unit ?? "None" };
      for (const stat of statistics) {
        switch (stat) {
          case "Sum": dp.Sum = vals.reduce((a, b) => a + b, 0); break;
          case "Average": dp.Average = vals.reduce((a, b) => a + b, 0) / vals.length; break;
          case "Minimum": dp.Minimum = Math.min(...vals); break;
          case "Maximum": dp.Maximum = Math.max(...vals); break;
          case "SampleCount": dp.SampleCount = vals.length; break;
        }
      }
      return dp;
    });

    return { datapoints };
  }

  listMetrics(namespace: string | undefined, metricName: string | undefined, region: string): { metrics: any[] } {
    const seen = new Set<string>();
    const metrics: any[] = [];

    for (const dp of this.datapoints) {
      if (namespace && dp.namespace !== namespace) continue;
      if (metricName && dp.metricName !== metricName) continue;
      const key = `${dp.namespace}|${dp.metricName}|${JSON.stringify(dp.dimensions)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      metrics.push({ Namespace: dp.namespace, MetricName: dp.metricName, Dimensions: dp.dimensions });
    }

    return { metrics };
  }

  putMetricAlarm(alarm: Partial<MetricAlarm>, region: string): void {
    const key = this.regionKey(region, alarm.alarmName!);
    const now = Date.now() / 1000;
    const full: MetricAlarm = {
      alarmName: alarm.alarmName!,
      alarmArn: buildArn("cloudwatch", region, this.accountId, "alarm:", alarm.alarmName!),
      metricName: alarm.metricName!,
      namespace: alarm.namespace!,
      statistic: alarm.statistic ?? "Average",
      period: alarm.period ?? 60,
      evaluationPeriods: alarm.evaluationPeriods ?? 1,
      threshold: alarm.threshold ?? 0,
      comparisonOperator: alarm.comparisonOperator ?? "GreaterThanThreshold",
      dimensions: alarm.dimensions,
      actionsEnabled: alarm.actionsEnabled ?? true,
      alarmActions: alarm.alarmActions ?? [],
      okActions: alarm.okActions ?? [],
      insufficientDataActions: alarm.insufficientDataActions ?? [],
      stateValue: "INSUFFICIENT_DATA",
      stateReason: "Unchecked: Initial alarm creation",
      stateUpdatedTimestamp: now,
      description: alarm.description,
      unit: alarm.unit,
      treatMissingData: alarm.treatMissingData ?? "missing",
    };
    this.alarms.set(key, full);
  }

  describeAlarms(alarmNames: string[] | undefined, region: string): MetricAlarm[] {
    const all = this.alarms.values().filter((a) => a.alarmArn.includes(`:${region}:`));
    if (alarmNames && alarmNames.length > 0) {
      return all.filter((a) => alarmNames.includes(a.alarmName));
    }
    return all;
  }

  deleteAlarms(alarmNames: string[], region: string): void {
    for (const name of alarmNames) {
      this.alarms.delete(this.regionKey(region, name));
    }
  }
}
