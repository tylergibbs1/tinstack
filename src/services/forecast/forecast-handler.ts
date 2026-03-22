import type { RequestContext } from "../../core/context";
import { AwsError, jsonErrorResponse } from "../../core/errors";
import type { ForecastService } from "./forecast-service";

function toEpoch(ts: string): number {
  return Math.floor(new Date(ts).getTime() / 1000);
}

export class ForecastHandler {
  constructor(private service: ForecastService) {}

  handle(action: string, body: any, ctx: RequestContext): Response {
    try {
      switch (action) {
        case "CreateDataset": {
          const ds = this.service.createDataset(body, ctx.region);
          return this.json({ DatasetArn: ds.datasetArn }, ctx);
        }
        case "DescribeDataset": {
          const ds = this.service.describeDataset(body.DatasetArn);
          return this.json({
            DatasetArn: ds.datasetArn, DatasetName: ds.datasetName,
            DatasetType: ds.datasetType, Domain: ds.domain,
            Schema: ds.schema, DataFrequency: ds.frequency,
            Status: ds.status, CreationTime: toEpoch(ds.creationTime),
            LastModificationTime: toEpoch(ds.lastModificationTime),
          }, ctx);
        }
        case "ListDatasets": {
          const datasets = this.service.listDatasets();
          return this.json({
            Datasets: datasets.map((d) => ({
              DatasetArn: d.datasetArn, DatasetName: d.datasetName,
              DatasetType: d.datasetType, Domain: d.domain,
              CreationTime: toEpoch(d.creationTime), LastModificationTime: toEpoch(d.lastModificationTime),
            })),
          }, ctx);
        }
        case "DeleteDataset":
          this.service.deleteDataset(body.DatasetArn);
          return this.json({}, ctx);
        case "CreateDatasetGroup": {
          const dg = this.service.createDatasetGroup(body, ctx.region);
          return this.json({ DatasetGroupArn: dg.datasetGroupArn }, ctx);
        }
        case "DescribeDatasetGroup": {
          const dg = this.service.describeDatasetGroup(body.DatasetGroupArn);
          return this.json({
            DatasetGroupArn: dg.datasetGroupArn, DatasetGroupName: dg.datasetGroupName,
            Domain: dg.domain, DatasetArns: dg.datasetArns,
            Status: dg.status, CreationTime: toEpoch(dg.creationTime),
            LastModificationTime: toEpoch(dg.lastModificationTime),
          }, ctx);
        }
        case "ListDatasetGroups": {
          const groups = this.service.listDatasetGroups();
          return this.json({
            DatasetGroups: groups.map((g) => ({
              DatasetGroupArn: g.datasetGroupArn, DatasetGroupName: g.datasetGroupName,
              CreationTime: toEpoch(g.creationTime), LastModificationTime: toEpoch(g.lastModificationTime),
            })),
          }, ctx);
        }
        case "DeleteDatasetGroup":
          this.service.deleteDatasetGroup(body.DatasetGroupArn);
          return this.json({}, ctx);
        case "CreatePredictor": {
          const p = this.service.createPredictor(body, ctx.region);
          return this.json({ PredictorArn: p.predictorArn }, ctx);
        }
        case "DescribePredictor": {
          const p = this.service.describePredictor(body.PredictorArn);
          return this.json({
            PredictorArn: p.predictorArn, PredictorName: p.predictorName,
            AlgorithmArn: p.algorithmArn, ForecastHorizon: p.forecastHorizon,
            InputDataConfig: p.inputDataConfig, FeaturizationConfig: p.featurizationConfig,
            Status: p.status, CreationTime: toEpoch(p.creationTime),
            LastModificationTime: toEpoch(p.lastModificationTime),
          }, ctx);
        }
        case "ListPredictors": {
          const predictors = this.service.listPredictors();
          return this.json({
            Predictors: predictors.map((p) => ({
              PredictorArn: p.predictorArn, PredictorName: p.predictorName,
              Status: p.status, CreationTime: toEpoch(p.creationTime),
              LastModificationTime: toEpoch(p.lastModificationTime),
            })),
          }, ctx);
        }
        case "DeletePredictor":
          this.service.deletePredictor(body.PredictorArn);
          return this.json({}, ctx);
        case "CreateForecast": {
          const f = this.service.createForecast(body, ctx.region);
          return this.json({ ForecastArn: f.forecastArn }, ctx);
        }
        case "DescribeForecast": {
          const f = this.service.describeForecast(body.ForecastArn);
          return this.json({
            ForecastArn: f.forecastArn, ForecastName: f.forecastName,
            PredictorArn: f.predictorArn, DatasetGroupArn: f.datasetGroupArn,
            Status: f.status, CreationTime: toEpoch(f.creationTime),
            LastModificationTime: toEpoch(f.lastModificationTime),
          }, ctx);
        }
        case "ListForecasts": {
          const forecasts = this.service.listForecasts();
          return this.json({
            Forecasts: forecasts.map((f) => ({
              ForecastArn: f.forecastArn, ForecastName: f.forecastName,
              PredictorArn: f.predictorArn, Status: f.status,
              CreationTime: toEpoch(f.creationTime), LastModificationTime: toEpoch(f.lastModificationTime),
            })),
          }, ctx);
        }
        case "DeleteForecast":
          this.service.deleteForecast(body.ForecastArn);
          return this.json({}, ctx);
        case "TagResource":
          this.service.tagResource(body.ResourceArn, body.Tags ?? []);
          return this.json({}, ctx);
        case "UntagResource":
          this.service.untagResource(body.ResourceArn, body.TagKeys ?? []);
          return this.json({}, ctx);
        case "ListTagsForResource": {
          const tags = this.service.listTagsForResource(body.ResourceArn);
          return this.json({ Tags: tags }, ctx);
        }
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

  private json(data: any, ctx: RequestContext): Response {
    return new Response(JSON.stringify(data), {
      headers: { "Content-Type": "application/x-amz-json-1.1", "x-amzn-RequestId": ctx.requestId },
    });
  }
}
