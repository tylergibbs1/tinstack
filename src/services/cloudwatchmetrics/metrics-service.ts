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
  // StatisticValues fields (when present, use these instead of value)
  sampleCount?: number;
  sum?: number;
  minimum?: number;
  maximum?: number;
}

const TWO_WEEKS_SECONDS = 14 * 24 * 60 * 60;
const PRUNE_INTERVAL = 1000;

export interface Dashboard {
  dashboardName: string;
  dashboardArn: string;
  dashboardBody: string;
  lastModified: number;
}

export interface InsightRule {
  ruleName: string;
  ruleDefinition: string;
  ruleState: string;
}

export class CloudWatchMetricsService {
  private datapoints: StoredDatapoint[] = [];
  private alarms: StorageBackend<string, MetricAlarm>;
  private dashboards: StorageBackend<string, Dashboard>;
  private resourceTags: StorageBackend<string, Record<string, string>>;
  private insightRules: StorageBackend<string, InsightRule>;
  private insertsSincePrune = 0;

  constructor(private accountId: string) {
    this.alarms = new InMemoryStorage();
    this.dashboards = new InMemoryStorage();
    this.resourceTags = new InMemoryStorage();
    this.insightRules = new InMemoryStorage();
  }

  private maybePrune(): void {
    this.insertsSincePrune++;
    if (this.insertsSincePrune >= PRUNE_INTERVAL) {
      this.insertsSincePrune = 0;
      const cutoff = Date.now() / 1000 - TWO_WEEKS_SECONDS;
      this.datapoints = this.datapoints.filter((dp) => dp.timestamp >= cutoff);
    }
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
        this.maybePrune();
      } else if (datum.Values) {
        const counts = datum.Counts ?? datum.Values.map(() => 1);
        for (let i = 0; i < datum.Values.length; i++) {
          for (let c = 0; c < (counts[i] ?? 1); c++) {
            this.datapoints.push({ namespace, metricName: datum.MetricName, dimensions: dims, timestamp: ts, value: datum.Values[i], unit });
            this.maybePrune();
          }
        }
      } else if (datum.StatisticValues) {
        const sv = datum.StatisticValues;
        this.datapoints.push({
          namespace, metricName: datum.MetricName, dimensions: dims, timestamp: ts,
          value: 0, unit,
          sampleCount: sv.SampleCount, sum: sv.Sum, minimum: sv.Minimum, maximum: sv.Maximum,
        });
        this.maybePrune();
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
      const buckets = new Map<number, StoredDatapoint[]>();
      for (const dp of matching) {
        const bucket = Math.floor(dp.timestamp / period) * period;
        if (!buckets.has(bucket)) buckets.set(bucket, []);
        buckets.get(bucket)!.push(dp);
      }

      const timestamps: number[] = [];
      const values: number[] = [];
      for (const [ts, dps] of [...buckets.entries()].sort((a, b) => a[0] - b[0])) {
        timestamps.push(ts);
        values.push(computeStat(dps, stat));
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

    const buckets = new Map<number, StoredDatapoint[]>();
    for (const dp of matching) {
      const bucket = Math.floor(dp.timestamp / period) * period;
      if (!buckets.has(bucket)) buckets.set(bucket, []);
      buckets.get(bucket)!.push(dp);
    }

    const datapoints = [...buckets.entries()].sort((a, b) => a[0] - b[0]).map(([ts, dps]) => {
      const dp: any = { Timestamp: ts, Unit: matching[0]?.unit ?? "None" };
      for (const stat of statistics) {
        dp[stat] = computeStat(dps, stat);
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

  setAlarmState(alarmName: string, stateValue: string, stateReason: string, region: string): void {
    const key = this.regionKey(region, alarmName);
    const alarm = this.alarms.get(key);
    if (!alarm) throw new AwsError("ResourceNotFound", `Alarm ${alarmName} does not exist.`, 404);
    alarm.stateValue = stateValue;
    alarm.stateReason = stateReason;
    alarm.stateUpdatedTimestamp = Date.now() / 1000;
    this.alarms.set(key, alarm);
  }

  enableAlarmActions(alarmNames: string[], region: string): void {
    for (const name of alarmNames) {
      const key = this.regionKey(region, name);
      const alarm = this.alarms.get(key);
      if (alarm) {
        alarm.actionsEnabled = true;
        this.alarms.set(key, alarm);
      }
    }
  }

  disableAlarmActions(alarmNames: string[], region: string): void {
    for (const name of alarmNames) {
      const key = this.regionKey(region, name);
      const alarm = this.alarms.get(key);
      if (alarm) {
        alarm.actionsEnabled = false;
        this.alarms.set(key, alarm);
      }
    }
  }

  describeAlarmsForMetric(metricName: string, namespace: string, region: string): MetricAlarm[] {
    return this.alarms.values().filter((a) => {
      if (!a.alarmArn.includes(`:${region}:`)) return false;
      return a.metricName === metricName && a.namespace === namespace;
    });
  }

  putDashboard(dashboardName: string, dashboardBody: string, region: string): void {
    const key = this.regionKey(region, dashboardName);
    const dashboard: Dashboard = {
      dashboardName,
      dashboardArn: buildArn("cloudwatch", region, this.accountId, "dashboard/", dashboardName),
      dashboardBody,
      lastModified: Date.now() / 1000,
    };
    this.dashboards.set(key, dashboard);
  }

  getDashboard(dashboardName: string, region: string): Dashboard {
    const key = this.regionKey(region, dashboardName);
    const dashboard = this.dashboards.get(key);
    if (!dashboard) throw new AwsError("ResourceNotFound", `Dashboard ${dashboardName} does not exist.`, 404);
    return dashboard;
  }

  listDashboards(region: string, prefix?: string): Dashboard[] {
    return this.dashboards.values().filter((d) => {
      if (!d.dashboardArn.includes(`:${region}:`)) return false;
      if (prefix && !d.dashboardName.startsWith(prefix)) return false;
      return true;
    });
  }

  deleteDashboards(dashboardNames: string[], region: string): void {
    for (const name of dashboardNames) {
      const key = this.regionKey(region, name);
      if (!this.dashboards.has(key)) {
        throw new AwsError("ResourceNotFound", `Dashboard ${name} does not exist.`, 404);
      }
      this.dashboards.delete(key);
    }
  }

  // --- Tagging ---

  tagResource(resourceArn: string, tags: { Key: string; Value: string }[]): void {
    const existing = this.resourceTags.get(resourceArn) ?? {};
    for (const tag of tags) {
      existing[tag.Key] = tag.Value;
    }
    this.resourceTags.set(resourceArn, existing);
  }

  untagResource(resourceArn: string, tagKeys: string[]): void {
    const existing = this.resourceTags.get(resourceArn);
    if (existing) {
      for (const key of tagKeys) {
        delete existing[key];
      }
      this.resourceTags.set(resourceArn, existing);
    }
  }

  listTagsForResource(resourceArn: string): { Key: string; Value: string }[] {
    const existing = this.resourceTags.get(resourceArn) ?? {};
    return Object.entries(existing).map(([Key, Value]) => ({ Key, Value }));
  }

  // --- Insight Rules ---

  putInsightRule(ruleName: string, ruleDefinition: string, ruleState: string | undefined, region: string): void {
    const key = this.regionKey(region, ruleName);
    this.insightRules.set(key, {
      ruleName,
      ruleDefinition,
      ruleState: ruleState ?? "ENABLED",
    });
  }

  describeInsightRules(region: string): InsightRule[] {
    return this.insightRules.values().filter((r) =>
      this.insightRules.has(this.regionKey(region, r.ruleName)),
    );
  }

  enableInsightRules(ruleNames: string[], region: string): { failures: any[] } {
    for (const name of ruleNames) {
      const key = this.regionKey(region, name);
      const rule = this.insightRules.get(key);
      if (rule) {
        rule.ruleState = "ENABLED";
        this.insightRules.set(key, rule);
      }
    }
    return { failures: [] };
  }

  disableInsightRules(ruleNames: string[], region: string): { failures: any[] } {
    for (const name of ruleNames) {
      const key = this.regionKey(region, name);
      const rule = this.insightRules.get(key);
      if (rule) {
        rule.ruleState = "DISABLED";
        this.insightRules.set(key, rule);
      }
    }
    return { failures: [] };
  }

  deleteInsightRules(ruleNames: string[], region: string): { failures: any[] } {
    for (const name of ruleNames) {
      this.insightRules.delete(this.regionKey(region, name));
    }
    return { failures: [] };
  }
}

function computeStat(dps: StoredDatapoint[], stat: string): number {
  let totalSum = 0;
  let totalCount = 0;
  let min = Infinity;
  let max = -Infinity;

  for (const dp of dps) {
    if (dp.sampleCount !== undefined) {
      // StatisticValues datapoint
      totalSum += dp.sum!;
      totalCount += dp.sampleCount;
      if (dp.minimum! < min) min = dp.minimum!;
      if (dp.maximum! > max) max = dp.maximum!;
    } else {
      // Raw value datapoint
      totalSum += dp.value;
      totalCount += 1;
      if (dp.value < min) min = dp.value;
      if (dp.value > max) max = dp.value;
    }
  }

  switch (stat) {
    case "Sum": return totalSum;
    case "SampleCount": return totalCount;
    case "Average": return totalCount > 0 ? totalSum / totalCount : 0;
    case "Minimum": return min;
    case "Maximum": return max;
    default: return totalCount > 0 ? totalSum / totalCount : 0;
  }
}
