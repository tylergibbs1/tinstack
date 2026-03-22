import { InMemoryStorage, type StorageBackend } from "../../core/storage";
import { AwsError } from "../../core/errors";
import { buildArn } from "../../core/arn";
import { AslEngine, type AslDefinition, type ExecutionEvent, type TaskInvoker } from "./asl-engine";

export interface StateMachine {
  stateMachineArn: string;
  name: string;
  definition: string;
  roleArn: string;
  type: "STANDARD" | "EXPRESS";
  status: string;
  creationDate: number;
  loggingConfiguration?: any;
  tags: Record<string, string>;
}

export interface Execution {
  executionArn: string;
  stateMachineArn: string;
  name: string;
  status: "RUNNING" | "SUCCEEDED" | "FAILED" | "TIMED_OUT" | "ABORTED";
  startDate: number;
  stopDate?: number;
  input: string;
  output?: string;
  error?: string;
  cause?: string;
  events: ExecutionEvent[];
}

export interface Activity {
  activityArn: string;
  name: string;
  creationDate: number;
}

export interface TaskResult {
  status: "succeeded" | "failed";
  output?: string;
  error?: string;
  cause?: string;
}

export class StepFunctionsService {
  private stateMachines: StorageBackend<string, StateMachine>;
  private executions: StorageBackend<string, Execution>;
  private activities: StorageBackend<string, Activity>;
  private taskResults: Map<string, TaskResult> = new Map();
  private executionCounter = 0;

  constructor(
    private accountId: string,
    private taskInvoker: TaskInvoker,
  ) {
    this.stateMachines = new InMemoryStorage();
    this.executions = new InMemoryStorage();
    this.activities = new InMemoryStorage();
  }

  private regionKey(region: string, name: string): string {
    return `${region}#${name}`;
  }

  createStateMachine(name: string, definition: string, roleArn: string, type: string, tags: Record<string, string>, region: string): StateMachine {
    const key = this.regionKey(region, name);
    if (this.stateMachines.has(key)) {
      throw new AwsError("StateMachineAlreadyExists", `State machine '${name}' already exists.`, 409);
    }

    // Validate definition is valid JSON
    try {
      JSON.parse(definition);
    } catch {
      throw new AwsError("InvalidDefinition", "Invalid state machine definition.", 400);
    }

    const sm: StateMachine = {
      stateMachineArn: buildArn("states", region, this.accountId, "stateMachine:", name),
      name,
      definition,
      roleArn,
      type: (type as StateMachine["type"]) ?? "STANDARD",
      status: "ACTIVE",
      creationDate: Date.now() / 1000,
      tags,
    };
    this.stateMachines.set(key, sm);
    return sm;
  }

  describeStateMachine(stateMachineArn: string, region: string): StateMachine {
    return this.findStateMachine(stateMachineArn, region);
  }

  updateStateMachine(stateMachineArn: string, definition: string | undefined, roleArn: string | undefined, region: string): StateMachine {
    const sm = this.findStateMachine(stateMachineArn, region);
    if (definition) {
      try { JSON.parse(definition); } catch { throw new AwsError("InvalidDefinition", "Invalid definition.", 400); }
      sm.definition = definition;
    }
    if (roleArn) sm.roleArn = roleArn;
    return sm;
  }

  deleteStateMachine(stateMachineArn: string, region: string): void {
    const sm = this.findStateMachine(stateMachineArn, region);
    this.stateMachines.delete(this.regionKey(region, sm.name));
  }

  listStateMachines(region: string): StateMachine[] {
    return this.stateMachines.values().filter((sm) => sm.stateMachineArn.includes(`:${region}:`));
  }

  async startExecution(stateMachineArn: string, input: string, executionName: string | undefined, region: string): Promise<Execution> {
    const sm = this.findStateMachine(stateMachineArn, region);
    const name = executionName ?? `exec-${++this.executionCounter}-${Date.now()}`;
    const executionArn = `${stateMachineArn}:${name}`;

    // Check for existing execution with the same name
    if (executionName) {
      const existing = this.executions.get(executionArn);
      if (existing) {
        if (existing.input !== input) {
          throw new AwsError("ExecutionAlreadyExists", `Execution already exists for name '${executionName}' with different input.`, 409);
        }
        // Idempotent: same name and same input, return existing
        return existing;
      }
    }

    const execution: Execution = {
      executionArn,
      stateMachineArn,
      name,
      status: "RUNNING",
      startDate: Date.now() / 1000,
      input,
      events: [],
    };
    this.executions.set(executionArn, execution);

    // Execute asynchronously
    this.runExecution(execution, sm).catch((e) => {
      execution.status = "FAILED";
      execution.error = e.name ?? "Error";
      execution.cause = e.message;
      execution.stopDate = Date.now() / 1000;
    });

    return execution;
  }

  async startSyncExecution(stateMachineArn: string, input: string, executionName: string | undefined, region: string): Promise<Execution> {
    const sm = this.findStateMachine(stateMachineArn, region);
    const name = executionName ?? `exec-${++this.executionCounter}-${Date.now()}`;
    const executionArn = `${stateMachineArn}:${name}`;

    const execution: Execution = {
      executionArn,
      stateMachineArn,
      name,
      status: "RUNNING",
      startDate: Date.now() / 1000,
      input,
      events: [],
    };
    this.executions.set(executionArn, execution);

    await this.runExecution(execution, sm);
    return execution;
  }

  describeExecution(executionArn: string): Execution {
    const execution = this.executions.get(executionArn);
    if (!execution) throw new AwsError("ExecutionDoesNotExist", `Execution '${executionArn}' not found.`, 400);
    return execution;
  }

  listExecutions(stateMachineArn: string, statusFilter?: string): Execution[] {
    return this.executions.values().filter((e) => {
      if (e.stateMachineArn !== stateMachineArn) return false;
      if (statusFilter && e.status !== statusFilter) return false;
      return true;
    });
  }

  stopExecution(executionArn: string, error: string | undefined, cause: string | undefined): Execution {
    const execution = this.executions.get(executionArn);
    if (!execution) throw new AwsError("ExecutionDoesNotExist", `Execution not found.`, 400);
    execution.status = "ABORTED";
    execution.error = error;
    execution.cause = cause;
    execution.stopDate = Date.now() / 1000;
    return execution;
  }

  getExecutionHistory(executionArn: string): ExecutionEvent[] {
    const execution = this.describeExecution(executionArn);
    return execution.events;
  }

  tagResource(arn: string, tags: Record<string, string>): void {
    for (const sm of this.stateMachines.values()) {
      if (sm.stateMachineArn === arn) { Object.assign(sm.tags, tags); return; }
    }
  }

  listTagsForResource(arn: string): Record<string, string> {
    for (const sm of this.stateMachines.values()) {
      if (sm.stateMachineArn === arn) return sm.tags;
    }
    return {};
  }

  untagResource(arn: string, tagKeys: string[]): void {
    for (const sm of this.stateMachines.values()) {
      if (sm.stateMachineArn === arn) {
        for (const key of tagKeys) delete sm.tags[key];
        return;
      }
    }
  }

  createActivity(name: string, region: string): Activity {
    const key = this.regionKey(region, `activity:${name}`);
    if (this.activities.has(key)) {
      throw new AwsError("ActivityAlreadyExists", `Activity '${name}' already exists.`, 409);
    }
    const activity: Activity = {
      activityArn: buildArn("states", region, this.accountId, "activity:", name),
      name,
      creationDate: Date.now() / 1000,
    };
    this.activities.set(key, activity);
    return activity;
  }

  describeActivity(activityArn: string): Activity {
    for (const a of this.activities.values()) {
      if (a.activityArn === activityArn) return a;
    }
    throw new AwsError("ActivityDoesNotExist", `Activity '${activityArn}' not found.`, 400);
  }

  listActivities(region: string): Activity[] {
    return this.activities.values().filter((a) => a.activityArn.includes(`:${region}:`));
  }

  deleteActivity(activityArn: string): void {
    for (const key of this.activities.keys()) {
      const a = this.activities.get(key)!;
      if (a.activityArn === activityArn) {
        this.activities.delete(key);
        return;
      }
    }
  }

  sendTaskSuccess(taskToken: string, output: string): void {
    this.taskResults.set(taskToken, { status: "succeeded", output });
  }

  sendTaskFailure(taskToken: string, error: string | undefined, cause: string | undefined): void {
    this.taskResults.set(taskToken, { status: "failed", error, cause });
  }

  sendTaskHeartbeat(_taskToken: string): void {
    // No-op in emulator — just acknowledge receipt
  }

  private async runExecution(execution: Execution, sm: StateMachine): Promise<void> {
    const definition: AslDefinition = JSON.parse(sm.definition);
    const inputData = execution.input ? JSON.parse(execution.input) : {};

    const engine = new AslEngine(this.taskInvoker);

    try {
      const { output, events } = await engine.execute(definition, inputData);
      execution.output = JSON.stringify(output);
      execution.status = "SUCCEEDED";
      execution.events = events;
    } catch (e: any) {
      execution.status = "FAILED";
      execution.error = e.errorCode ?? e.name ?? "Error";
      execution.cause = e.message;
      execution.events = [];
    }
    execution.stopDate = Date.now() / 1000;
  }

  private findStateMachine(arn: string, region: string): StateMachine {
    for (const sm of this.stateMachines.values()) {
      if (sm.stateMachineArn === arn) return sm;
    }
    // Try by name
    for (const sm of this.stateMachines.values()) {
      if (sm.name === arn) return sm;
    }
    throw new AwsError("StateMachineDoesNotExist", `State machine '${arn}' not found.`, 400);
  }
}
