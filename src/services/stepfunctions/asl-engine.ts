import { logger } from "../../core/logger";

export interface AslDefinition {
  Comment?: string;
  StartAt: string;
  States: Record<string, AslState>;
  TimeoutSeconds?: number;
}

export interface AslState {
  Type: string;
  Comment?: string;
  InputPath?: string;
  OutputPath?: string;
  ResultPath?: string;
  ResultSelector?: Record<string, any>;
  Next?: string;
  End?: boolean;
  // Task
  Resource?: string;
  Parameters?: Record<string, any>;
  TimeoutSeconds?: number;
  HeartbeatSeconds?: number;
  Retry?: RetryRule[];
  Catch?: CatchRule[];
  // Pass
  Result?: any;
  // Wait
  Seconds?: number;
  Timestamp?: string;
  SecondsPath?: string;
  TimestampPath?: string;
  // Choice
  Choices?: ChoiceRule[];
  Default?: string;
  // Parallel / Map
  Branches?: AslDefinition[];
  Iterator?: AslDefinition;
  ItemsPath?: string;
  MaxConcurrency?: number;
  // Fail
  Error?: string;
  Cause?: string;
}

export interface RetryRule {
  ErrorEquals: string[];
  IntervalSeconds?: number;
  MaxAttempts?: number;
  BackoffRate?: number;
}

export interface CatchRule {
  ErrorEquals: string[];
  Next: string;
  ResultPath?: string;
}

export interface ChoiceRule {
  Next: string;
  // Comparison
  Variable?: string;
  StringEquals?: string;
  StringEqualsPath?: string;
  StringGreaterThan?: string;
  StringLessThan?: string;
  NumericEquals?: number;
  NumericEqualsPath?: string;
  NumericGreaterThan?: number;
  NumericLessThan?: number;
  NumericGreaterThanEquals?: number;
  NumericLessThanEquals?: number;
  BooleanEquals?: boolean;
  IsPresent?: boolean;
  IsNull?: boolean;
  IsString?: boolean;
  IsNumeric?: boolean;
  IsBoolean?: boolean;
  StringMatches?: string;
  // Logical
  And?: ChoiceRule[];
  Or?: ChoiceRule[];
  Not?: ChoiceRule;
}

export interface ExecutionEvent {
  timestamp: number;
  type: string;
  id: number;
  previousEventId: number;
  details?: any;
}

export type TaskInvoker = (resource: string, input: any) => Promise<any>;

export class AslEngine {
  private eventCounter = 0;
  private events: ExecutionEvent[] = [];

  constructor(private taskInvoker: TaskInvoker) {}

  async execute(definition: AslDefinition, input: any): Promise<{ output: any; events: ExecutionEvent[] }> {
    this.events = [];
    this.eventCounter = 0;
    this.addEvent("ExecutionStarted", 0, { input: JSON.stringify(input) });

    try {
      const output = await this.executeState(definition, definition.StartAt, input);
      this.addEvent("ExecutionSucceeded", this.eventCounter, { output: JSON.stringify(output) });
      return { output, events: this.events };
    } catch (e: any) {
      this.addEvent("ExecutionFailed", this.eventCounter, { error: e.name ?? "Error", cause: e.message });
      throw e;
    }
  }

  private async executeState(definition: AslDefinition, stateName: string, input: any): Promise<any> {
    const state = definition.States[stateName];
    if (!state) throw new AslError("States.Runtime", `State '${stateName}' not found in definition`);

    this.addEvent("StateEntered", this.eventCounter, { name: stateName, input: JSON.stringify(input) });

    // Apply InputPath
    let effectiveInput = this.applyPath(input, state.InputPath);

    let result: any;

    switch (state.Type) {
      case "Task":
        result = await this.executeTask(state, effectiveInput);
        break;
      case "Pass":
        result = this.executePass(state, effectiveInput);
        break;
      case "Wait":
        result = await this.executeWait(state, effectiveInput);
        break;
      case "Choice":
        return this.executeChoice(definition, state, effectiveInput);
      case "Parallel":
        result = await this.executeParallel(state, effectiveInput);
        break;
      case "Map":
        result = await this.executeMap(state, effectiveInput);
        break;
      case "Succeed":
        this.addEvent("StateExited", this.eventCounter, { name: stateName, output: JSON.stringify(effectiveInput) });
        return effectiveInput;
      case "Fail":
        throw new AslError(state.Error ?? "States.Fail", state.Cause ?? "State machine failed");
      default:
        throw new AslError("States.Runtime", `Unknown state type: ${state.Type}`);
    }

    // Apply ResultSelector
    if (state.ResultSelector) {
      result = this.applyParameters(state.ResultSelector, result);
    }

    // Apply ResultPath
    let output = this.applyResultPath(input, result, state.ResultPath);

    // Apply OutputPath
    output = this.applyPath(output, state.OutputPath);

    this.addEvent("StateExited", this.eventCounter, { name: stateName, output: JSON.stringify(output) });

    // Transition to next state
    if (state.End) return output;
    if (state.Next) return this.executeState(definition, state.Next, output);

    throw new AslError("States.Runtime", `State '${stateName}' has no Next or End`);
  }

  private async executeTask(state: AslState, input: any): Promise<any> {
    const resource = state.Resource!;

    // Apply Parameters
    let taskInput = input;
    if (state.Parameters) {
      taskInput = this.applyParameters(state.Parameters, input);
    }

    this.addEvent("TaskStateEntered", this.eventCounter);

    // Retry logic
    const maxRetries = state.Retry ?? [];
    let lastError: any;

    for (let attempt = 0; attempt <= this.getMaxAttempts(maxRetries); attempt++) {
      try {
        const result = await this.taskInvoker(resource, taskInput);
        this.addEvent("TaskSucceeded", this.eventCounter, { output: JSON.stringify(result) });
        return result;
      } catch (e: any) {
        lastError = e;
        const retryRule = this.findMatchingRetry(maxRetries, e.name ?? "Error", attempt);
        if (retryRule && attempt < (retryRule.MaxAttempts ?? 3)) {
          const delay = (retryRule.IntervalSeconds ?? 1) * Math.pow(retryRule.BackoffRate ?? 2, attempt);
          this.addEvent("TaskRetried", this.eventCounter, { error: e.name, attempt: attempt + 1 });
          await new Promise((r) => setTimeout(r, Math.min(delay * 1000, 5000))); // Cap at 5s for emulator
          continue;
        }
        break;
      }
    }

    // Check Catch rules
    if (state.Catch) {
      for (const catchRule of state.Catch) {
        if (this.errorMatches(catchRule.ErrorEquals, lastError?.name ?? "Error")) {
          const errorOutput = { Error: lastError?.name ?? "Error", Cause: lastError?.message ?? "" };
          const catchInput = this.applyResultPath(input, errorOutput, catchRule.ResultPath);
          this.addEvent("TaskCaught", this.eventCounter, { error: lastError?.name });
          // Catch transitions are handled by returning a special marker
          return { __aslCatchNext: catchRule.Next, __aslCatchInput: catchInput };
        }
      }
    }

    this.addEvent("TaskFailed", this.eventCounter, { error: lastError?.name, cause: lastError?.message });
    throw lastError;
  }

  private executePass(state: AslState, input: any): any {
    if (state.Result !== undefined) return state.Result;
    if (state.Parameters) return this.applyParameters(state.Parameters, input);
    return input;
  }

  private async executeWait(state: AslState, input: any): Promise<any> {
    let waitMs = 0;
    if (state.Seconds) {
      waitMs = state.Seconds * 1000;
    } else if (state.SecondsPath) {
      waitMs = (this.resolvePath(input, state.SecondsPath) ?? 0) * 1000;
    } else if (state.Timestamp) {
      waitMs = new Date(state.Timestamp).getTime() - Date.now();
    } else if (state.TimestampPath) {
      const ts = this.resolvePath(input, state.TimestampPath);
      waitMs = new Date(ts).getTime() - Date.now();
    }

    // Cap wait time for emulator — don't actually wait long
    waitMs = Math.min(Math.max(waitMs, 0), 100);
    if (waitMs > 0) await new Promise((r) => setTimeout(r, waitMs));

    return input;
  }

  private async executeChoice(definition: AslDefinition, state: AslState, input: any): Promise<any> {
    for (const rule of state.Choices ?? []) {
      if (this.evaluateChoiceRule(rule, input)) {
        this.addEvent("StateExited", this.eventCounter, { name: "Choice", output: JSON.stringify(input) });
        return this.executeState(definition, rule.Next, input);
      }
    }

    if (state.Default) {
      this.addEvent("StateExited", this.eventCounter, { name: "Choice", output: JSON.stringify(input) });
      return this.executeState(definition, state.Default, input);
    }

    throw new AslError("States.NoChoiceMatched", "No choice rule matched and no default specified");
  }

  private async executeParallel(state: AslState, input: any): Promise<any> {
    if (!state.Branches) return [];

    const results = await Promise.all(
      state.Branches.map(async (branch) => {
        const engine = new AslEngine(this.taskInvoker);
        const { output } = await engine.execute(branch, input);
        return output;
      }),
    );

    return results;
  }

  private async executeMap(state: AslState, input: any): Promise<any> {
    const iterator = state.Iterator;
    if (!iterator) return [];

    const itemsPath = state.ItemsPath ?? "$";
    const items = this.resolvePath(input, itemsPath);

    if (!Array.isArray(items)) {
      throw new AslError("States.Runtime", `Map state items is not an array`);
    }

    const maxConcurrency = state.MaxConcurrency ?? 0; // 0 = unlimited

    if (maxConcurrency === 0 || maxConcurrency >= items.length) {
      return Promise.all(
        items.map(async (item: any) => {
          const engine = new AslEngine(this.taskInvoker);
          const { output } = await engine.execute(iterator, item);
          return output;
        }),
      );
    }

    // Limited concurrency
    const results: any[] = new Array(items.length);
    let idx = 0;
    const runNext = async (): Promise<void> => {
      while (idx < items.length) {
        const i = idx++;
        const engine = new AslEngine(this.taskInvoker);
        const { output } = await engine.execute(iterator, items[i]);
        results[i] = output;
      }
    };
    await Promise.all(Array.from({ length: Math.min(maxConcurrency, items.length) }, () => runNext()));
    return results;
  }

  // --- Path resolution helpers ---

  private applyPath(data: any, path: string | undefined): any {
    if (path === undefined || path === "$") return data;
    if (path === null) return {};
    return this.resolvePath(data, path);
  }

  private resolvePath(data: any, path: string): any {
    if (!path || path === "$") return data;
    const parts = path.replace(/^\$\.?/, "").split(".");
    let current = data;
    for (const part of parts) {
      if (part === "") continue;
      // Handle array index
      const arrayMatch = part.match(/^(\w+)\[(\d+)\]$/);
      if (arrayMatch) {
        current = current?.[arrayMatch[1]]?.[parseInt(arrayMatch[2])];
      } else {
        current = current?.[part];
      }
      if (current === undefined) return undefined;
    }
    return current;
  }

  private applyResultPath(originalInput: any, result: any, resultPath: string | undefined): any {
    if (resultPath === undefined) return result;
    if (resultPath === null) return originalInput;
    if (resultPath === "$") return result;

    const path = resultPath.replace(/^\$\.?/, "");
    const output = JSON.parse(JSON.stringify(originalInput ?? {}));
    const parts = path.split(".");
    let current = output;
    for (let i = 0; i < parts.length - 1; i++) {
      if (current[parts[i]] === undefined) current[parts[i]] = {};
      current = current[parts[i]];
    }
    current[parts[parts.length - 1]] = result;
    return output;
  }

  private applyParameters(parameters: Record<string, any>, input: any): any {
    const result: any = {};
    for (const [key, value] of Object.entries(parameters)) {
      if (key.endsWith(".$")) {
        const realKey = key.slice(0, -2);
        result[realKey] = this.resolvePath(input, value as string);
      } else if (typeof value === "object" && value !== null && !Array.isArray(value)) {
        result[key] = this.applyParameters(value, input);
      } else {
        result[key] = value;
      }
    }
    return result;
  }

  // --- Choice evaluation ---

  private evaluateChoiceRule(rule: ChoiceRule, input: any): boolean {
    if (rule.And) return rule.And.every((r) => this.evaluateChoiceRule(r, input));
    if (rule.Or) return rule.Or.some((r) => this.evaluateChoiceRule(r, input));
    if (rule.Not) return !this.evaluateChoiceRule(rule.Not, input);

    const value = rule.Variable ? this.resolvePath(input, rule.Variable) : undefined;

    if (rule.StringEquals !== undefined) return value === rule.StringEquals;
    if (rule.StringEqualsPath !== undefined) return value === this.resolvePath(input, rule.StringEqualsPath);
    if (rule.StringGreaterThan !== undefined) return typeof value === "string" && value > rule.StringGreaterThan;
    if (rule.StringLessThan !== undefined) return typeof value === "string" && value < rule.StringLessThan;
    if (rule.NumericEquals !== undefined) return value === rule.NumericEquals;
    if (rule.NumericEqualsPath !== undefined) return value === this.resolvePath(input, rule.NumericEqualsPath);
    if (rule.NumericGreaterThan !== undefined) return typeof value === "number" && value > rule.NumericGreaterThan;
    if (rule.NumericLessThan !== undefined) return typeof value === "number" && value < rule.NumericLessThan;
    if (rule.NumericGreaterThanEquals !== undefined) return typeof value === "number" && value >= rule.NumericGreaterThanEquals;
    if (rule.NumericLessThanEquals !== undefined) return typeof value === "number" && value <= rule.NumericLessThanEquals;
    if (rule.BooleanEquals !== undefined) return value === rule.BooleanEquals;
    if (rule.IsPresent !== undefined) return rule.IsPresent ? value !== undefined : value === undefined;
    if (rule.IsNull !== undefined) return rule.IsNull ? value === null : value !== null;
    if (rule.IsString !== undefined) return rule.IsString ? typeof value === "string" : typeof value !== "string";
    if (rule.IsNumeric !== undefined) return rule.IsNumeric ? typeof value === "number" : typeof value !== "number";
    if (rule.IsBoolean !== undefined) return rule.IsBoolean ? typeof value === "boolean" : typeof value !== "boolean";
    if (rule.StringMatches !== undefined) {
      if (typeof value !== "string") return false;
      const regex = new RegExp("^" + rule.StringMatches.replace(/\*/g, ".*").replace(/\?/g, ".") + "$");
      return regex.test(value);
    }

    return false;
  }

  // --- Error matching ---

  private errorMatches(errorEquals: string[], errorName: string): boolean {
    return errorEquals.some((e) => e === "States.ALL" || e === errorName);
  }

  private findMatchingRetry(retries: RetryRule[], errorName: string, attempt: number): RetryRule | undefined {
    return retries.find((r) => this.errorMatches(r.ErrorEquals, errorName) && attempt < (r.MaxAttempts ?? 3));
  }

  private getMaxAttempts(retries: RetryRule[]): number {
    if (retries.length === 0) return 0;
    return Math.max(...retries.map((r) => r.MaxAttempts ?? 3));
  }

  private addEvent(type: string, previousId: number, details?: any): void {
    this.events.push({
      timestamp: Date.now() / 1000,
      type,
      id: ++this.eventCounter,
      previousEventId: previousId,
      details,
    });
  }
}

export class AslError extends Error {
  constructor(
    public readonly errorCode: string,
    message: string,
  ) {
    super(message);
    this.name = errorCode;
  }
}
