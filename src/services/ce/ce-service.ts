import { InMemoryStorage, type StorageBackend } from "../../core/storage";
import { AwsError } from "../../core/errors";

export interface CostCategoryDefinition {
  costCategoryArn: string;
  name: string;
  ruleVersion: string;
  rules: any[];
  defaultValue?: string;
  splitChargeRules?: any[];
  effectiveStart: string;
  effectiveEnd?: string;
}

export class CostExplorerService {
  private costCategories: StorageBackend<string, CostCategoryDefinition>;

  constructor(private accountId: string) {
    this.costCategories = new InMemoryStorage();
  }

  getCostAndUsage(body: any): Record<string, any> {
    const timePeriod = body.TimePeriod ?? { Start: "2024-01-01", End: "2024-02-01" };
    const granularity = body.Granularity ?? "MONTHLY";
    const metrics = body.Metrics ?? ["UnblendedCost"];

    const resultsByTime = [{
      TimePeriod: timePeriod,
      Total: Object.fromEntries(metrics.map((m: string) => [m, { Amount: "42.50", Unit: "USD" }])),
      Groups: [],
      Estimated: true,
    }];

    return {
      ResultsByTime: resultsByTime,
      DimensionValueAttributes: [],
    };
  }

  getCostForecast(body: any): Record<string, any> {
    return {
      Total: { Amount: "150.00", Unit: "USD" },
      ForecastResultsByTime: [{
        TimePeriod: body.TimePeriod ?? { Start: "2024-02-01", End: "2024-03-01" },
        MeanValue: "150.00",
        PredictionIntervalLowerBound: "120.00",
        PredictionIntervalUpperBound: "180.00",
      }],
    };
  }

  getDimensionValues(body: any): Record<string, any> {
    return {
      DimensionValues: [
        { Value: "Amazon Simple Storage Service", Attributes: {} },
        { Value: "Amazon Elastic Compute Cloud - Compute", Attributes: {} },
        { Value: "Amazon DynamoDB", Attributes: {} },
      ],
      ReturnSize: 3,
      TotalSize: 3,
    };
  }

  getTags(body: any): Record<string, any> {
    return {
      Tags: ["Environment", "Team", "Project"],
      ReturnSize: 3,
      TotalSize: 3,
    };
  }

  createCostCategoryDefinition(body: any): { CostCategoryArn: string; EffectiveStart: string } {
    const name = body.Name;
    if (this.costCategories.has(name)) {
      throw new AwsError("ResourceExistsException", `Cost category ${name} already exists.`, 400);
    }

    const now = new Date();
    const effectiveStart = body.EffectiveStart ?? `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01T00:00:00Z`;
    const arn = `arn:aws:ce::${this.accountId}:costcategory/${crypto.randomUUID()}`;

    const category: CostCategoryDefinition = {
      costCategoryArn: arn,
      name,
      ruleVersion: body.RuleVersion ?? "CostCategoryExpression.v1",
      rules: body.Rules ?? [],
      defaultValue: body.DefaultValue,
      splitChargeRules: body.SplitChargeRules,
      effectiveStart,
    };

    this.costCategories.set(name, category);
    return { CostCategoryArn: arn, EffectiveStart: effectiveStart };
  }

  describeCostCategoryDefinition(costCategoryArn: string): Record<string, any> {
    const category = this.costCategories.values().find((c) => c.costCategoryArn === costCategoryArn);
    if (!category) {
      throw new AwsError("ResourceNotFoundException", `Cost category not found.`, 400);
    }
    return {
      CostCategory: {
        CostCategoryArn: category.costCategoryArn,
        Name: category.name,
        RuleVersion: category.ruleVersion,
        Rules: category.rules,
        DefaultValue: category.defaultValue,
        SplitChargeRules: category.splitChargeRules,
        EffectiveStart: category.effectiveStart,
      },
    };
  }

  listCostCategoryDefinitions(): Record<string, any>[] {
    return this.costCategories.values().map((c) => ({
      CostCategoryArn: c.costCategoryArn,
      Name: c.name,
      EffectiveStart: c.effectiveStart,
    }));
  }

  deleteCostCategoryDefinition(costCategoryArn: string): { CostCategoryArn: string; EffectiveEnd: string } {
    const category = this.costCategories.values().find((c) => c.costCategoryArn === costCategoryArn);
    if (!category) {
      throw new AwsError("ResourceNotFoundException", `Cost category not found.`, 400);
    }
    this.costCategories.delete(category.name);
    return { CostCategoryArn: costCategoryArn, EffectiveEnd: new Date().toISOString() };
  }

  updateCostCategoryDefinition(costCategoryArn: string, body: any): { CostCategoryArn: string; EffectiveStart: string } {
    const category = this.costCategories.values().find((c) => c.costCategoryArn === costCategoryArn);
    if (!category) {
      throw new AwsError("ResourceNotFoundException", `Cost category not found.`, 400);
    }

    if (body.RuleVersion !== undefined) category.ruleVersion = body.RuleVersion;
    if (body.Rules !== undefined) category.rules = body.Rules;
    if (body.DefaultValue !== undefined) category.defaultValue = body.DefaultValue;
    if (body.SplitChargeRules !== undefined) category.splitChargeRules = body.SplitChargeRules;
    if (body.EffectiveStart !== undefined) category.effectiveStart = body.EffectiveStart;

    this.costCategories.set(category.name, category);
    return { CostCategoryArn: costCategoryArn, EffectiveStart: category.effectiveStart };
  }
}
