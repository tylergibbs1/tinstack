import { AwsError } from "../../core/errors";

export interface ForecastDataset {
  datasetArn: string;
  datasetName: string;
  datasetType: string;
  domain: string;
  schema: any;
  frequency?: string;
  status: string;
  creationTime: string;
  lastModificationTime: string;
}

export interface DatasetGroup {
  datasetGroupArn: string;
  datasetGroupName: string;
  domain: string;
  datasetArns: string[];
  status: string;
  creationTime: string;
  lastModificationTime: string;
}

export interface Predictor {
  predictorArn: string;
  predictorName: string;
  algorithmArn?: string;
  forecastHorizon: number;
  inputDataConfig: any;
  featurizationConfig: any;
  status: string;
  creationTime: string;
  lastModificationTime: string;
}

export interface Forecast {
  forecastArn: string;
  forecastName: string;
  predictorArn: string;
  datasetGroupArn?: string;
  status: string;
  creationTime: string;
  lastModificationTime: string;
}

export interface TaggedResource {
  tags: Array<{ Key: string; Value: string }>;
}

export class ForecastService {
  private datasets = new Map<string, ForecastDataset>();
  private datasetGroups = new Map<string, DatasetGroup>();
  private predictors = new Map<string, Predictor>();
  private forecasts = new Map<string, Forecast>();
  private tags = new Map<string, Array<{ Key: string; Value: string }>>();

  constructor(private accountId: string) {}

  createDataset(body: any, region: string): ForecastDataset {
    const name = body.DatasetName;
    const arn = `arn:aws:forecast:${region}:${this.accountId}:dataset/${name}`;
    if (this.datasets.has(arn)) {
      throw new AwsError("ResourceAlreadyExistsException", `Dataset ${name} already exists.`, 400);
    }
    const now = new Date().toISOString();
    const dataset: ForecastDataset = {
      datasetArn: arn,
      datasetName: name,
      datasetType: body.DatasetType ?? "TARGET_TIME_SERIES",
      domain: body.Domain ?? "CUSTOM",
      schema: body.Schema,
      frequency: body.DataFrequency,
      status: "ACTIVE",
      creationTime: now,
      lastModificationTime: now,
    };
    this.datasets.set(arn, dataset);
    if (body.Tags) this.tags.set(arn, body.Tags);
    return dataset;
  }

  describeDataset(arn: string): ForecastDataset {
    const dataset = this.datasets.get(arn);
    if (!dataset) {
      throw new AwsError("ResourceNotFoundException", `Dataset ${arn} not found.`, 400);
    }
    return dataset;
  }

  listDatasets(): ForecastDataset[] {
    return Array.from(this.datasets.values());
  }

  deleteDataset(arn: string): void {
    if (!this.datasets.has(arn)) {
      throw new AwsError("ResourceNotFoundException", `Dataset ${arn} not found.`, 400);
    }
    this.datasets.delete(arn);
    this.tags.delete(arn);
  }

  createDatasetGroup(body: any, region: string): DatasetGroup {
    const name = body.DatasetGroupName;
    const arn = `arn:aws:forecast:${region}:${this.accountId}:dataset-group/${name}`;
    if (this.datasetGroups.has(arn)) {
      throw new AwsError("ResourceAlreadyExistsException", `Dataset group ${name} already exists.`, 400);
    }
    const now = new Date().toISOString();
    const group: DatasetGroup = {
      datasetGroupArn: arn,
      datasetGroupName: name,
      domain: body.Domain ?? "CUSTOM",
      datasetArns: body.DatasetArns ?? [],
      status: "ACTIVE",
      creationTime: now,
      lastModificationTime: now,
    };
    this.datasetGroups.set(arn, group);
    if (body.Tags) this.tags.set(arn, body.Tags);
    return group;
  }

  describeDatasetGroup(arn: string): DatasetGroup {
    const group = this.datasetGroups.get(arn);
    if (!group) {
      throw new AwsError("ResourceNotFoundException", `Dataset group ${arn} not found.`, 400);
    }
    return group;
  }

  listDatasetGroups(): DatasetGroup[] {
    return Array.from(this.datasetGroups.values());
  }

  deleteDatasetGroup(arn: string): void {
    if (!this.datasetGroups.has(arn)) {
      throw new AwsError("ResourceNotFoundException", `Dataset group ${arn} not found.`, 400);
    }
    this.datasetGroups.delete(arn);
    this.tags.delete(arn);
  }

  createPredictor(body: any, region: string): Predictor {
    const name = body.PredictorName;
    const arn = `arn:aws:forecast:${region}:${this.accountId}:predictor/${name}`;
    if (this.predictors.has(arn)) {
      throw new AwsError("ResourceAlreadyExistsException", `Predictor ${name} already exists.`, 400);
    }
    const now = new Date().toISOString();
    const predictor: Predictor = {
      predictorArn: arn,
      predictorName: name,
      algorithmArn: body.AlgorithmArn,
      forecastHorizon: body.ForecastHorizon ?? 10,
      inputDataConfig: body.InputDataConfig,
      featurizationConfig: body.FeaturizationConfig,
      status: "ACTIVE",
      creationTime: now,
      lastModificationTime: now,
    };
    this.predictors.set(arn, predictor);
    if (body.Tags) this.tags.set(arn, body.Tags);
    return predictor;
  }

  describePredictor(arn: string): Predictor {
    const predictor = this.predictors.get(arn);
    if (!predictor) {
      throw new AwsError("ResourceNotFoundException", `Predictor ${arn} not found.`, 400);
    }
    return predictor;
  }

  listPredictors(): Predictor[] {
    return Array.from(this.predictors.values());
  }

  deletePredictor(arn: string): void {
    if (!this.predictors.has(arn)) {
      throw new AwsError("ResourceNotFoundException", `Predictor ${arn} not found.`, 400);
    }
    this.predictors.delete(arn);
    this.tags.delete(arn);
  }

  createForecast(body: any, region: string): Forecast {
    const name = body.ForecastName;
    const arn = `arn:aws:forecast:${region}:${this.accountId}:forecast/${name}`;
    if (this.forecasts.has(arn)) {
      throw new AwsError("ResourceAlreadyExistsException", `Forecast ${name} already exists.`, 400);
    }
    const now = new Date().toISOString();
    const forecast: Forecast = {
      forecastArn: arn,
      forecastName: name,
      predictorArn: body.PredictorArn,
      datasetGroupArn: body.DatasetGroupArn,
      status: "ACTIVE",
      creationTime: now,
      lastModificationTime: now,
    };
    this.forecasts.set(arn, forecast);
    if (body.Tags) this.tags.set(arn, body.Tags);
    return forecast;
  }

  describeForecast(arn: string): Forecast {
    const forecast = this.forecasts.get(arn);
    if (!forecast) {
      throw new AwsError("ResourceNotFoundException", `Forecast ${arn} not found.`, 400);
    }
    return forecast;
  }

  listForecasts(): Forecast[] {
    return Array.from(this.forecasts.values());
  }

  deleteForecast(arn: string): void {
    if (!this.forecasts.has(arn)) {
      throw new AwsError("ResourceNotFoundException", `Forecast ${arn} not found.`, 400);
    }
    this.forecasts.delete(arn);
    this.tags.delete(arn);
  }

  tagResource(arn: string, newTags: Array<{ Key: string; Value: string }>): void {
    const existing = this.tags.get(arn) ?? [];
    for (const tag of newTags) {
      const idx = existing.findIndex((t) => t.Key === tag.Key);
      if (idx >= 0) {
        existing[idx] = tag;
      } else {
        existing.push(tag);
      }
    }
    this.tags.set(arn, existing);
  }

  untagResource(arn: string, tagKeys: string[]): void {
    const existing = this.tags.get(arn) ?? [];
    this.tags.set(arn, existing.filter((t) => !tagKeys.includes(t.Key)));
  }

  listTagsForResource(arn: string): Array<{ Key: string; Value: string }> {
    return this.tags.get(arn) ?? [];
  }
}
