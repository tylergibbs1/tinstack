export interface MetricQuery {
  metricName: string;
  timestamp: number;
  value: number;
  step: number;
}

export class SageMakerMetricsService {
  private metrics: MetricQuery[] = [];

  constructor(private accountId: string) {}

  batchPutMetrics(trialComponentName: string, metricData: MetricQuery[]): { errors: any[] } {
    this.metrics.push(...metricData);
    return { errors: [] };
  }
}
