import { InMemoryStorage, type StorageBackend } from "../../core/storage";
import { AwsError } from "../../core/errors";
import { buildArn } from "../../core/arn";

export interface StackEvent {
  eventId: string;
  stackId: string;
  stackName: string;
  logicalResourceId: string;
  physicalResourceId: string;
  resourceType: string;
  resourceStatus: string;
  resourceStatusReason: string;
  timestamp: number;
}

export interface StackResource {
  logicalResourceId: string;
  physicalResourceId: string;
  resourceType: string;
  resourceStatus: string;
  timestamp: number;
}

export interface Stack {
  stackId: string;
  stackName: string;
  templateBody: string;
  parameters: { ParameterKey: string; ParameterValue: string }[];
  tags: { Key: string; Value: string }[];
  status: string;
  statusReason: string;
  outputs: { OutputKey: string; OutputValue: string; Description?: string }[];
  creationTime: number;
  lastUpdatedTime: number;
  events: StackEvent[];
  resources: StackResource[];
}

export interface ChangeSet {
  changeSetId: string;
  changeSetName: string;
  stackId: string;
  stackName: string;
  templateBody: string;
  parameters: { ParameterKey: string; ParameterValue: string }[];
  status: string;
  statusReason: string;
  creationTime: number;
}

export interface StackSet {
  stackSetId: string;
  stackSetName: string;
  stackSetArn: string;
  templateBody: string;
  parameters: { ParameterKey: string; ParameterValue: string }[];
  capabilities: string[];
  administrationRoleARN?: string;
  status: string;
  createdAt: number;
}

export interface StackInstance {
  stackSetId: string;
  stackSetName: string;
  account: string;
  region: string;
  status: string;
}

export interface TemplateSummary {
  parameters: { ParameterKey: string; ParameterType: string; DefaultValue?: string; Description?: string }[];
  resourceTypes: string[];
  description?: string;
  capabilities: string[];
}

export class CloudFormationService {
  private stacks: StorageBackend<string, Stack>;
  private changeSets: StorageBackend<string, ChangeSet>;
  private stackSets: StorageBackend<string, StackSet>;
  private stackInstances: StorageBackend<string, StackInstance>;

  constructor(private accountId: string) {
    this.stacks = new InMemoryStorage();
    this.changeSets = new InMemoryStorage();
    this.stackSets = new InMemoryStorage();
    this.stackInstances = new InMemoryStorage();
  }

  createStack(
    stackName: string,
    templateBody: string,
    parameters: { ParameterKey: string; ParameterValue: string }[],
    tags: { Key: string; Value: string }[],
    region: string,
  ): Stack {
    if (this.findStackByName(stackName, region)) {
      throw new AwsError("AlreadyExistsException", `Stack [${stackName}] already exists`, 400);
    }

    const uuid = crypto.randomUUID();
    const stackId = buildArn("cloudformation", region, this.accountId, "stack/", `${stackName}/${uuid}`);
    const now = Date.now() / 1000;

    const stack: Stack = {
      stackId,
      stackName,
      templateBody,
      parameters: parameters ?? [],
      tags: tags ?? [],
      status: "CREATE_COMPLETE",
      statusReason: "Stack creation completed",
      outputs: this.parseOutputs(templateBody),
      creationTime: now,
      lastUpdatedTime: now,
      events: [],
      resources: [],
    };

    this.addEvent(stack, "AWS::CloudFormation::Stack", "CREATE_COMPLETE", "Stack creation completed");
    stack.resources = this.parseResources(templateBody, stack);
    this.stacks.set(stackId, stack);
    return stack;
  }

  describeStacks(stackName: string | undefined, region: string): Stack[] {
    if (stackName) {
      // Could be a name or ARN
      const stack = this.findStack(stackName, region);
      return [stack];
    }
    return this.stacks.values().filter((s) => s.stackId.includes(`:${region}:`) && s.status !== "DELETE_COMPLETE");
  }

  updateStack(
    stackName: string,
    templateBody: string | undefined,
    parameters: { ParameterKey: string; ParameterValue: string }[] | undefined,
    region: string,
  ): Stack {
    const stack = this.findStack(stackName, region);
    if (stack.status === "DELETE_COMPLETE") {
      throw new AwsError("ValidationError", `Stack [${stackName}] does not exist`, 400);
    }

    if (templateBody) stack.templateBody = templateBody;
    if (parameters) stack.parameters = parameters;
    stack.status = "UPDATE_COMPLETE";
    stack.statusReason = "Stack update completed";
    stack.lastUpdatedTime = Date.now() / 1000;
    stack.outputs = this.parseOutputs(stack.templateBody);
    stack.resources = this.parseResources(stack.templateBody, stack);
    this.addEvent(stack, "AWS::CloudFormation::Stack", "UPDATE_COMPLETE", "Stack update completed");
    return stack;
  }

  deleteStack(stackName: string, region: string): void {
    const stack = this.findStack(stackName, region);
    stack.status = "DELETE_COMPLETE";
    stack.statusReason = "Stack deletion completed";
    stack.lastUpdatedTime = Date.now() / 1000;
    this.addEvent(stack, "AWS::CloudFormation::Stack", "DELETE_COMPLETE", "Stack deletion completed");
  }

  listStacks(region: string): Stack[] {
    return this.stacks.values().filter((s) => s.stackId.includes(`:${region}:`));
  }

  getTemplate(stackName: string, region: string): string {
    const stack = this.findStack(stackName, region);
    return stack.templateBody;
  }

  describeStackResources(stackName: string, region: string): StackResource[] {
    const stack = this.findStack(stackName, region);
    return stack.resources;
  }

  describeStackEvents(stackName: string, region: string): StackEvent[] {
    const stack = this.findStack(stackName, region);
    return stack.events;
  }

  createChangeSet(
    stackName: string,
    changeSetName: string,
    templateBody: string,
    parameters: { ParameterKey: string; ParameterValue: string }[],
    region: string,
  ): ChangeSet {
    const stack = this.findStack(stackName, region);

    const uuid = crypto.randomUUID();
    const changeSetId = buildArn("cloudformation", region, this.accountId, "changeSet/", `${changeSetName}/${uuid}`);

    const cs: ChangeSet = {
      changeSetId,
      changeSetName,
      stackId: stack.stackId,
      stackName,
      templateBody,
      parameters: parameters ?? [],
      status: "CREATE_COMPLETE",
      statusReason: "Change set creation completed",
      creationTime: Date.now() / 1000,
    };

    this.changeSets.set(changeSetId, cs);
    return cs;
  }

  describeChangeSet(changeSetName: string, stackName: string | undefined, region: string): ChangeSet {
    // changeSetName could be an ARN or a name
    if (changeSetName.startsWith("arn:")) {
      const cs = this.changeSets.get(changeSetName);
      if (!cs) throw new AwsError("ChangeSetNotFoundException", `ChangeSet [${changeSetName}] not found`, 404);
      return cs;
    }

    for (const cs of this.changeSets.values()) {
      if (cs.changeSetName === changeSetName && cs.stackId.includes(`:${region}:`)) {
        if (!stackName || cs.stackName === stackName) return cs;
      }
    }
    throw new AwsError("ChangeSetNotFoundException", `ChangeSet [${changeSetName}] not found`, 404);
  }

  executeChangeSet(changeSetName: string, stackName: string | undefined, region: string): void {
    const cs = this.describeChangeSet(changeSetName, stackName, region);
    if (cs.status !== "CREATE_COMPLETE") {
      throw new AwsError("InvalidChangeSetStatusException", `ChangeSet [${changeSetName}] is in status ${cs.status}`, 400);
    }

    const stack = this.stacks.get(cs.stackId);
    if (!stack) throw new AwsError("StackNotFoundException", `Stack [${cs.stackName}] not found`, 404);

    stack.templateBody = cs.templateBody;
    if (cs.parameters.length > 0) stack.parameters = cs.parameters;
    stack.status = "UPDATE_COMPLETE";
    stack.statusReason = "Change set executed";
    stack.lastUpdatedTime = Date.now() / 1000;
    stack.outputs = this.parseOutputs(stack.templateBody);
    stack.resources = this.parseResources(stack.templateBody, stack);
    this.addEvent(stack, "AWS::CloudFormation::Stack", "UPDATE_COMPLETE", "Change set executed");

    cs.status = "EXECUTE_COMPLETE";
  }

  validateTemplate(templateBody: string): { ParameterKey: string; DefaultValue?: string; Description?: string }[] {
    let parsed: any;
    try {
      parsed = JSON.parse(templateBody);
    } catch {
      throw new AwsError("ValidationError", "Template format error: invalid JSON", 400);
    }

    if (!parsed.Resources && !parsed.AWSTemplateFormatVersion) {
      throw new AwsError("ValidationError", "Template must contain a Resources or AWSTemplateFormatVersion section", 400);
    }

    const params: { ParameterKey: string; DefaultValue?: string; Description?: string }[] = [];
    if (parsed.Parameters) {
      for (const [key, val] of Object.entries(parsed.Parameters) as [string, any][]) {
        params.push({
          ParameterKey: key,
          DefaultValue: val.Default,
          Description: val.Description,
        });
      }
    }
    return params;
  }

  getTemplateSummary(templateBody: string): TemplateSummary {
    let parsed: any;
    try {
      parsed = JSON.parse(templateBody);
    } catch {
      throw new AwsError("ValidationError", "Template format error: invalid JSON", 400);
    }

    const parameters: TemplateSummary["parameters"] = [];
    if (parsed.Parameters) {
      for (const [key, val] of Object.entries(parsed.Parameters) as [string, any][]) {
        parameters.push({
          ParameterKey: key,
          ParameterType: val.Type ?? "String",
          DefaultValue: val.Default,
          Description: val.Description,
        });
      }
    }

    const resourceTypes: string[] = [];
    if (parsed.Resources) {
      for (const val of Object.values(parsed.Resources) as any[]) {
        const t = val.Type;
        if (t && !resourceTypes.includes(t)) resourceTypes.push(t);
      }
    }

    const capabilities: string[] = [];
    if (parsed.Transform) capabilities.push("CAPABILITY_AUTO_EXPAND");

    return {
      parameters,
      resourceTypes,
      description: parsed.Description,
      capabilities,
    };
  }

  listStackResources(stackName: string, region: string): StackResource[] {
    const stack = this.findStack(stackName, region);
    return stack.resources;
  }

  // --- Stack Sets ---

  createStackSet(
    stackSetName: string,
    templateBody: string,
    parameters: { ParameterKey: string; ParameterValue: string }[],
    capabilities: string[],
    administrationRoleARN: string | undefined,
    region: string,
  ): StackSet {
    const key = `${region}#${stackSetName}`;
    if (this.stackSets.has(key)) {
      throw new AwsError("NameAlreadyExistsException", `StackSet [${stackSetName}] already exists`, 400);
    }

    const uuid = crypto.randomUUID();
    const stackSetId = uuid;
    const stackSetArn = buildArn("cloudformation", region, this.accountId, "stackset/", `${stackSetName}:${uuid}`);

    const ss: StackSet = {
      stackSetId,
      stackSetName,
      stackSetArn,
      templateBody,
      parameters: parameters ?? [],
      capabilities: capabilities ?? [],
      administrationRoleARN,
      status: "ACTIVE",
      createdAt: Date.now() / 1000,
    };
    this.stackSets.set(key, ss);
    return ss;
  }

  describeStackSet(stackSetName: string, region: string): StackSet {
    const key = `${region}#${stackSetName}`;
    const ss = this.stackSets.get(key);
    if (!ss) throw new AwsError("StackSetNotFoundException", `StackSet [${stackSetName}] not found`, 404);
    return ss;
  }

  listStackSets(region: string): StackSet[] {
    return this.stackSets.values().filter((ss) => ss.stackSetArn.includes(`:${region}:`) && ss.status === "ACTIVE");
  }

  deleteStackSet(stackSetName: string, region: string): void {
    const key = `${region}#${stackSetName}`;
    const ss = this.stackSets.get(key);
    if (!ss) throw new AwsError("StackSetNotFoundException", `StackSet [${stackSetName}] not found`, 404);

    // Check for remaining instances
    const instances = this.stackInstances.values().filter(
      (si) => si.stackSetName === stackSetName,
    );
    if (instances.length > 0) {
      throw new AwsError("StackSetNotEmptyException", `StackSet [${stackSetName}] still has instances`, 400);
    }

    ss.status = "DELETED";
    this.stackSets.delete(key);
  }

  createStackInstances(
    stackSetName: string,
    accounts: string[],
    regions: string[],
    region: string,
  ): string {
    this.describeStackSet(stackSetName, region);
    const operationId = crypto.randomUUID();

    for (const account of accounts) {
      for (const targetRegion of regions) {
        const key = `${stackSetName}#${account}#${targetRegion}`;
        if (!this.stackInstances.has(key)) {
          this.stackInstances.set(key, {
            stackSetId: this.describeStackSet(stackSetName, region).stackSetId,
            stackSetName,
            account,
            region: targetRegion,
            status: "CURRENT",
          });
        }
      }
    }
    return operationId;
  }

  listStackInstances(stackSetName: string, region: string): StackInstance[] {
    this.describeStackSet(stackSetName, region);
    return this.stackInstances.values().filter((si) => si.stackSetName === stackSetName);
  }

  deleteStackInstances(
    stackSetName: string,
    accounts: string[],
    regions: string[],
    region: string,
  ): string {
    this.describeStackSet(stackSetName, region);
    const operationId = crypto.randomUUID();

    for (const account of accounts) {
      for (const targetRegion of regions) {
        const key = `${stackSetName}#${account}#${targetRegion}`;
        this.stackInstances.delete(key);
      }
    }
    return operationId;
  }

  private findStack(nameOrArn: string, region: string): Stack {
    // Check by ARN first
    const byArn = this.stacks.get(nameOrArn);
    if (byArn) return byArn;

    // Check by name
    const byName = this.findStackByName(nameOrArn, region);
    if (byName) return byName;

    throw new AwsError("StackNotFoundException", `Stack [${nameOrArn}] does not exist`, 400);
  }

  private findStackByName(name: string, region: string): Stack | undefined {
    return this.stacks.values().find(
      (s) => s.stackName === name && s.stackId.includes(`:${region}:`) && s.status !== "DELETE_COMPLETE",
    );
  }

  private addEvent(stack: Stack, resourceType: string, status: string, reason: string): void {
    stack.events.push({
      eventId: crypto.randomUUID(),
      stackId: stack.stackId,
      stackName: stack.stackName,
      logicalResourceId: stack.stackName,
      physicalResourceId: stack.stackId,
      resourceType,
      resourceStatus: status,
      resourceStatusReason: reason,
      timestamp: Date.now() / 1000,
    });
  }

  private parseOutputs(templateBody: string): { OutputKey: string; OutputValue: string; Description?: string }[] {
    try {
      const parsed = JSON.parse(templateBody);
      if (!parsed.Outputs) return [];
      return Object.entries(parsed.Outputs).map(([key, val]: [string, any]) => ({
        OutputKey: key,
        OutputValue: val.Value ?? "",
        Description: val.Description,
      }));
    } catch {
      return [];
    }
  }

  private parseResources(templateBody: string, stack: Stack): StackResource[] {
    try {
      const parsed = JSON.parse(templateBody);
      if (!parsed.Resources) return [];
      return Object.entries(parsed.Resources).map(([key, val]: [string, any]) => ({
        logicalResourceId: key,
        physicalResourceId: `${stack.stackName}-${key}-${crypto.randomUUID().slice(0, 12)}`,
        resourceType: val.Type ?? "AWS::CloudFormation::WaitConditionHandle",
        resourceStatus: stack.status,
        timestamp: Date.now() / 1000,
      }));
    } catch {
      return [];
    }
  }
}
