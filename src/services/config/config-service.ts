import { AwsError } from "../../core/errors";
import { buildArn } from "../../core/arn";

export interface ConfigurationRecorder {
  name: string;
  roleARN: string;
  recordingGroup?: {
    allSupported?: boolean;
    includeGlobalResourceTypes?: boolean;
    resourceTypes?: string[];
  };
  recording: boolean;
}

export interface DeliveryChannel {
  name: string;
  s3BucketName: string;
  s3KeyPrefix?: string;
  snsTopicARN?: string;
  configSnapshotDeliveryProperties?: {
    deliveryFrequency?: string;
  };
}

export interface ConfigRule {
  configRuleName: string;
  configRuleArn: string;
  configRuleId: string;
  description?: string;
  source: {
    Owner: string;
    SourceIdentifier: string;
    SourceDetails?: any[];
  };
  inputParameters?: string;
  scope?: {
    ComplianceResourceTypes?: string[];
    TagKey?: string;
    TagValue?: string;
  };
  configRuleState: string;
  maximumExecutionFrequency?: string;
}

export interface Evaluation {
  complianceResourceType: string;
  complianceResourceId: string;
  complianceType: string;
  annotation?: string;
  orderingTimestamp: number;
}

export class ConfigService {
  private recorders = new Map<string, ConfigurationRecorder>();
  private channels = new Map<string, DeliveryChannel>();
  private rules = new Map<string, ConfigRule>();
  private evaluations = new Map<string, Evaluation[]>(); // ruleKey -> evaluations

  constructor(private accountId: string) {}

  private regionKey(region: string, name: string): string {
    return `${region}#${name}`;
  }

  putConfigurationRecorder(params: { ConfigurationRecorder: any }, region: string): void {
    const rec = params.ConfigurationRecorder;
    if (!rec.name) rec.name = "default";
    const key = this.regionKey(region, rec.name);

    // AWS allows only 1 recorder per account/region
    const existing = Array.from(this.recorders.keys()).filter((k) => k.startsWith(`${region}#`));
    if (existing.length > 0 && !existing.includes(key)) {
      throw new AwsError("MaxNumberOfConfigurationRecordersExceededException", "Only one configuration recorder per region is supported.", 400);
    }

    this.recorders.set(key, {
      name: rec.name,
      roleARN: rec.roleARN,
      recordingGroup: rec.recordingGroup,
      recording: false,
    });
  }

  describeConfigurationRecorders(names: string[] | undefined, region: string): ConfigurationRecorder[] {
    if (names && names.length > 0) {
      return names.map((n) => {
        const key = this.regionKey(region, n);
        const rec = this.recorders.get(key);
        if (!rec) throw new AwsError("NoSuchConfigurationRecorderException", `Recorder ${n} not found.`, 400);
        return rec;
      });
    }
    return Array.from(this.recorders.entries())
      .filter(([k]) => k.startsWith(`${region}#`))
      .map(([, v]) => v);
  }

  deleteConfigurationRecorder(name: string, region: string): void {
    const key = this.regionKey(region, name);
    if (!this.recorders.has(key)) {
      throw new AwsError("NoSuchConfigurationRecorderException", `Recorder ${name} not found.`, 400);
    }
    this.recorders.delete(key);
  }

  putDeliveryChannel(params: { DeliveryChannel: any }, region: string): void {
    const ch = params.DeliveryChannel;
    if (!ch.name) ch.name = "default";

    // Must have a recorder first
    const recorders = Array.from(this.recorders.keys()).filter((k) => k.startsWith(`${region}#`));
    if (recorders.length === 0) {
      throw new AwsError("NoAvailableConfigurationRecorderException", "No configuration recorder available.", 400);
    }

    const key = this.regionKey(region, ch.name);
    const existing = Array.from(this.channels.keys()).filter((k) => k.startsWith(`${region}#`));
    if (existing.length > 0 && !existing.includes(key)) {
      throw new AwsError("MaxNumberOfDeliveryChannelsExceededException", "Only one delivery channel per region is supported.", 400);
    }

    this.channels.set(key, {
      name: ch.name,
      s3BucketName: ch.s3BucketName,
      s3KeyPrefix: ch.s3KeyPrefix,
      snsTopicARN: ch.snsTopicARN,
      configSnapshotDeliveryProperties: ch.configSnapshotDeliveryProperties,
    });
  }

  describeDeliveryChannels(names: string[] | undefined, region: string): DeliveryChannel[] {
    if (names && names.length > 0) {
      return names.map((n) => {
        const key = this.regionKey(region, n);
        const ch = this.channels.get(key);
        if (!ch) throw new AwsError("NoSuchDeliveryChannelException", `Channel ${n} not found.`, 400);
        return ch;
      });
    }
    return Array.from(this.channels.entries())
      .filter(([k]) => k.startsWith(`${region}#`))
      .map(([, v]) => v);
  }

  deleteDeliveryChannel(name: string, region: string): void {
    const key = this.regionKey(region, name);
    if (!this.channels.has(key)) {
      throw new AwsError("NoSuchDeliveryChannelException", `Channel ${name} not found.`, 400);
    }
    this.channels.delete(key);
  }

  startConfigurationRecorder(name: string, region: string): void {
    const key = this.regionKey(region, name);
    const rec = this.recorders.get(key);
    if (!rec) throw new AwsError("NoSuchConfigurationRecorderException", `Recorder ${name} not found.`, 400);

    // Must have delivery channel
    const channels = Array.from(this.channels.keys()).filter((k) => k.startsWith(`${region}#`));
    if (channels.length === 0) {
      throw new AwsError("NoAvailableDeliveryChannelException", "No delivery channel available.", 400);
    }
    rec.recording = true;
  }

  stopConfigurationRecorder(name: string, region: string): void {
    const key = this.regionKey(region, name);
    const rec = this.recorders.get(key);
    if (!rec) throw new AwsError("NoSuchConfigurationRecorderException", `Recorder ${name} not found.`, 400);
    rec.recording = false;
  }

  putConfigRule(params: { ConfigRule: any }, region: string): ConfigRule {
    const r = params.ConfigRule;
    const name = r.ConfigRuleName;
    const key = this.regionKey(region, name);
    const existing = this.rules.get(key);

    if (existing) {
      // Update
      if (r.Description !== undefined) existing.description = r.Description;
      if (r.Source !== undefined) existing.source = r.Source;
      if (r.InputParameters !== undefined) existing.inputParameters = r.InputParameters;
      if (r.Scope !== undefined) existing.scope = r.Scope;
      if (r.MaximumExecutionFrequency !== undefined) existing.maximumExecutionFrequency = r.MaximumExecutionFrequency;
      return existing;
    }

    const ruleId = `config-rule-${crypto.randomUUID().replace(/-/g, "").slice(0, 6)}`;
    const rule: ConfigRule = {
      configRuleName: name,
      configRuleArn: buildArn("config", region, this.accountId, "config-rule/", ruleId),
      configRuleId: ruleId,
      description: r.Description,
      source: r.Source,
      inputParameters: r.InputParameters,
      scope: r.Scope,
      configRuleState: "ACTIVE",
      maximumExecutionFrequency: r.MaximumExecutionFrequency,
    };
    this.rules.set(key, rule);
    return rule;
  }

  describeConfigRules(names: string[] | undefined, region: string): ConfigRule[] {
    if (names && names.length > 0) {
      return names.map((n) => {
        const key = this.regionKey(region, n);
        const rule = this.rules.get(key);
        if (!rule) throw new AwsError("NoSuchConfigRuleException", `Rule ${n} not found.`, 400);
        return rule;
      });
    }
    return Array.from(this.rules.entries())
      .filter(([k]) => k.startsWith(`${region}#`))
      .map(([, v]) => v);
  }

  deleteConfigRule(name: string, region: string): void {
    const key = this.regionKey(region, name);
    if (!this.rules.has(key)) {
      throw new AwsError("NoSuchConfigRuleException", `Rule ${name} not found.`, 400);
    }
    this.rules.delete(key);
    this.evaluations.delete(key);
  }

  putEvaluations(resultToken: string, evaluations: any[], region: string): any[] {
    // Store evaluations keyed by rule (in a real implementation, resultToken would map to a rule)
    // For simplicity, just store them by token
    const stored = evaluations.map((e: any) => ({
      complianceResourceType: e.ComplianceResourceType,
      complianceResourceId: e.ComplianceResourceId,
      complianceType: e.ComplianceType,
      annotation: e.Annotation,
      orderingTimestamp: e.OrderingTimestamp ?? Date.now() / 1000,
    }));
    this.evaluations.set(resultToken, stored);
    return evaluations;
  }

  getComplianceDetailsByConfigRule(ruleName: string, region: string): any[] {
    const key = this.regionKey(region, ruleName);
    if (!this.rules.has(key)) {
      throw new AwsError("NoSuchConfigRuleException", `Rule ${ruleName} not found.`, 400);
    }
    // Return any evaluations stored
    const results: any[] = [];
    for (const evals of this.evaluations.values()) {
      results.push(...evals);
    }
    return results;
  }

  describeComplianceByConfigRule(ruleNames: string[] | undefined, region: string): any[] {
    const rules = ruleNames && ruleNames.length > 0
      ? ruleNames.map((n) => {
          const key = this.regionKey(region, n);
          const r = this.rules.get(key);
          if (!r) throw new AwsError("NoSuchConfigRuleException", `Rule ${n} not found.`, 400);
          return r;
        })
      : Array.from(this.rules.entries())
          .filter(([k]) => k.startsWith(`${region}#`))
          .map(([, v]) => v);

    return rules.map((r) => ({
      ConfigRuleName: r.configRuleName,
      Compliance: { ComplianceType: "COMPLIANT" },
    }));
  }
}
