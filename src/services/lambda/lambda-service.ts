import { InMemoryStorage, type StorageBackend } from "../../core/storage";
import { AwsError } from "../../core/errors";
import { buildArn } from "../../core/arn";
import { logger } from "../../core/logger";
import { mkdirSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";

export interface LambdaFunction {
  functionName: string;
  functionArn: string;
  runtime: string;
  role: string;
  handler: string;
  description: string;
  timeout: number;
  memorySize: number;
  codeSize: number;
  codeSha256: string;
  lastModified: string;
  version: string;
  environment: Record<string, string>;
  state: string;
  lastUpdateStatus: string;
  architectures: string[];
  layers: string[];
  tags: Record<string, string>;
  // Internal
  codeZip?: Buffer;
  codePath?: string;
}

export interface InvocationResult {
  statusCode: number;
  payload: string;
  functionError?: string;
  logResult?: string;
}

export interface EventSourceMapping {
  uuid: string;
  functionArn: string;
  eventSourceArn: string;
  batchSize: number;
  enabled: boolean;
  state: string;
  lastModified: number;
}

export class LambdaService {
  private functions: StorageBackend<string, LambdaFunction>;
  private eventSourceMappings: StorageBackend<string, EventSourceMapping>;
  private storagePath: string;

  constructor(
    private accountId: string,
    storagePath: string,
  ) {
    this.functions = new InMemoryStorage();
    this.eventSourceMappings = new InMemoryStorage();
    this.storagePath = resolve(join(storagePath, "lambda"));
  }

  private regionKey(region: string, name: string): string {
    return `${region}#${name}`;
  }

  createFunction(params: any, region: string): LambdaFunction {
    const name = params.FunctionName;
    const key = this.regionKey(region, name);
    if (this.functions.has(key)) {
      throw new AwsError("ResourceConflictException", `Function already exist: ${name}`, 409);
    }

    const codeZip = params.Code?.ZipFile ? Buffer.from(params.Code.ZipFile, "base64") : undefined;
    const hasher = new Bun.CryptoHasher("sha256");
    if (codeZip) hasher.update(codeZip);
    const codeSha256 = hasher.digest("base64") as string;

    // Store code on disk
    let codePath: string | undefined;
    if (codeZip) {
      codePath = join(this.storagePath, region, name);
      mkdirSync(codePath, { recursive: true });
      writeFileSync(join(codePath, "code.zip"), codeZip);
    }

    const fn: LambdaFunction = {
      functionName: name,
      functionArn: buildArn("lambda", region, this.accountId, "function:", name),
      runtime: params.Runtime ?? "nodejs20.x",
      role: params.Role ?? `arn:aws:iam::${this.accountId}:role/lambda-role`,
      handler: params.Handler ?? "index.handler",
      description: params.Description ?? "",
      timeout: params.Timeout ?? 3,
      memorySize: params.MemorySize ?? 128,
      codeSize: codeZip?.length ?? 0,
      codeSha256,
      lastModified: new Date().toISOString(),
      version: "$LATEST",
      environment: params.Environment?.Variables ?? {},
      state: "Active",
      lastUpdateStatus: "Successful",
      architectures: params.Architectures ?? ["x86_64"],
      layers: params.Layers ?? [],
      tags: params.Tags ?? {},
      codeZip,
      codePath,
    };

    this.functions.set(key, fn);
    return fn;
  }

  getFunction(functionName: string, region: string): LambdaFunction {
    const fn = this.findFunction(functionName, region);
    return fn;
  }

  deleteFunction(functionName: string, region: string): void {
    const key = this.regionKey(region, functionName);
    const fn = this.functions.get(key);
    if (!fn) throw new AwsError("ResourceNotFoundException", `Function not found: ${functionName}`, 404);
    // Clean up code on disk
    if (fn.codePath && existsSync(fn.codePath)) {
      rmSync(fn.codePath, { recursive: true, force: true });
    }
    this.functions.delete(key);
  }

  listFunctions(region: string): LambdaFunction[] {
    return this.functions.values().filter((f) => f.functionArn.includes(`:${region}:`));
  }

  updateFunctionCode(functionName: string, zipFile: string | undefined, region: string): LambdaFunction {
    const fn = this.findFunction(functionName, region);
    if (zipFile) {
      fn.codeZip = Buffer.from(zipFile, "base64");
      const hasher = new Bun.CryptoHasher("sha256");
      hasher.update(fn.codeZip);
      fn.codeSha256 = hasher.digest("base64") as string;
      fn.codeSize = fn.codeZip.length;

      if (fn.codePath) {
        writeFileSync(join(fn.codePath, "code.zip"), fn.codeZip);
      }
    }
    fn.lastModified = new Date().toISOString();
    fn.lastUpdateStatus = "Successful";
    return fn;
  }

  updateFunctionConfiguration(functionName: string, params: any, region: string): LambdaFunction {
    const fn = this.findFunction(functionName, region);
    if (params.Runtime) fn.runtime = params.Runtime;
    if (params.Handler) fn.handler = params.Handler;
    if (params.Description !== undefined) fn.description = params.Description;
    if (params.Timeout) fn.timeout = params.Timeout;
    if (params.MemorySize) fn.memorySize = params.MemorySize;
    if (params.Role) fn.role = params.Role;
    if (params.Environment?.Variables) fn.environment = params.Environment.Variables;
    if (params.Layers) fn.layers = params.Layers;
    fn.lastModified = new Date().toISOString();
    fn.lastUpdateStatus = "Successful";
    return fn;
  }

  async invoke(functionName: string, payload: string, invocationType: string, region: string): Promise<InvocationResult> {
    const fn = this.findFunction(functionName, region);

    // Try Docker-based invocation first (only with valid ZIP starting with PK header)
    const isValidZip = fn.codeZip && fn.codeZip.length > 30 && fn.codeZip[0] === 0x50 && fn.codeZip[1] === 0x4B;
    if (fn.codePath && isValidZip && await this.isDockerAvailable()) {
      try {
        const result = await this.invokeViaDocker(fn, payload, region);
        if (!result.functionError) return result;
      } catch (e) {
        logger.debug(`Docker invocation failed, falling back: ${e}`);
      }
    }

    // Fallback: try in-process invocation for simple Node.js handlers
    if (fn.codePath && isValidZip && (fn.runtime.startsWith("nodejs") || fn.runtime.startsWith("bun"))) {
      try {
        return await this.invokeInProcess(fn, payload);
      } catch (e) {
        logger.debug(`In-process invocation failed, falling back: ${e}`);
      }
    }

    // Last resort: echo-style mock invocation
    return this.invokeMock(fn, payload);
  }

  // Event source mappings
  createEventSourceMapping(functionName: string, eventSourceArn: string, batchSize: number, enabled: boolean, region: string): EventSourceMapping {
    const fn = this.findFunction(functionName, region);
    const uuid = crypto.randomUUID();
    const mapping: EventSourceMapping = {
      uuid,
      functionArn: fn.functionArn,
      eventSourceArn,
      batchSize: batchSize || 10,
      enabled,
      state: enabled ? "Enabled" : "Disabled",
      lastModified: Date.now() / 1000,
    };
    this.eventSourceMappings.set(uuid, mapping);
    return mapping;
  }

  listEventSourceMappings(functionName: string | undefined, eventSourceArn: string | undefined, region: string): EventSourceMapping[] {
    return this.eventSourceMappings.values().filter((m) => {
      if (functionName && !m.functionArn.includes(functionName)) return false;
      if (eventSourceArn && m.eventSourceArn !== eventSourceArn) return false;
      return true;
    });
  }

  deleteEventSourceMapping(uuid: string): void {
    if (!this.eventSourceMappings.has(uuid)) throw new AwsError("ResourceNotFoundException", "Event source mapping not found.", 404);
    this.eventSourceMappings.delete(uuid);
  }

  getEventSourceMapping(uuid: string): EventSourceMapping {
    const mapping = this.eventSourceMappings.get(uuid);
    if (!mapping) throw new AwsError("ResourceNotFoundException", "Event source mapping not found.", 404);
    return mapping;
  }

  tagResource(arn: string, tags: Record<string, string>, region: string): void {
    for (const fn of this.functions.values()) {
      if (fn.functionArn === arn) {
        Object.assign(fn.tags, tags);
        return;
      }
    }
  }

  listTags(arn: string): Record<string, string> {
    for (const fn of this.functions.values()) {
      if (fn.functionArn === arn) return fn.tags;
    }
    return {};
  }

  // --- Invocation methods ---

  private async invokeViaDocker(fn: LambdaFunction, payload: string, region: string): Promise<InvocationResult> {
    if (!fn.codePath) return this.invokeMock(fn, payload);

    const runtimeImage = this.getRuntimeImage(fn.runtime);
    const containerName = `tinstack-lambda-${fn.functionName}-${Date.now()}`;

    try {
      // Extract ZIP
      const extractDir = join(fn.codePath, "extracted");
      mkdirSync(extractDir, { recursive: true });
      const unzipProc = Bun.spawn(["unzip", "-o", join(fn.codePath, "code.zip"), "-d", extractDir], {
        stdout: "pipe", stderr: "pipe",
      });
      await unzipProc.exited;

      // Build env vars
      const envArgs: string[] = [];
      for (const [k, v] of Object.entries(fn.environment)) {
        envArgs.push("-e", `${k}=${v}`);
      }
      envArgs.push("-e", `AWS_REGION=${region}`);
      envArgs.push("-e", `AWS_DEFAULT_REGION=${region}`);
      envArgs.push("-e", `AWS_LAMBDA_FUNCTION_NAME=${fn.functionName}`);
      envArgs.push("-e", `AWS_LAMBDA_FUNCTION_MEMORY_SIZE=${fn.memorySize}`);
      envArgs.push("-e", `AWS_LAMBDA_FUNCTION_VERSION=${fn.version}`);

      // Run container
      const args = [
        "docker", "run", "--rm", "--name", containerName,
        "-v", `${extractDir}:/var/task:ro`,
        ...envArgs,
        "--network", "host",
        runtimeImage,
        fn.handler,
      ];

      const proc = Bun.spawn(args, {
        stdin: new Blob([payload]),
        stdout: "pipe",
        stderr: "pipe",
      });

      const timeoutMs = fn.timeout * 1000;
      const timer = setTimeout(() => { proc.kill(); }, timeoutMs);

      const exitCode = await proc.exited;
      clearTimeout(timer);

      const stdout = await new Response(proc.stdout).text();
      const stderr = await new Response(proc.stderr).text();

      if (exitCode !== 0) {
        logger.warn(`Lambda ${fn.functionName} exited with code ${exitCode}: ${stderr}`);
        return {
          statusCode: 200,
          payload: JSON.stringify({ errorMessage: stderr.trim() || "Function error", errorType: "Runtime.ExitError" }),
          functionError: "Unhandled",
          logResult: Buffer.from(stderr).toString("base64"),
        };
      }

      return {
        statusCode: 200,
        payload: stdout.trim(),
        logResult: stderr ? Buffer.from(stderr).toString("base64") : undefined,
      };
    } catch (e: any) {
      logger.error(`Docker invocation failed for ${fn.functionName}: ${e.message}`);
      return this.invokeMock(fn, payload);
    }
  }

  private async invokeInProcess(fn: LambdaFunction, payload: string): Promise<InvocationResult> {
    if (!fn.codePath) return this.invokeMock(fn, payload);

    try {
      const extractDir = join(fn.codePath, "extracted");
      if (!existsSync(extractDir)) {
        mkdirSync(extractDir, { recursive: true });
        const proc = Bun.spawn(["unzip", "-o", join(fn.codePath, "code.zip"), "-d", extractDir], {
          stdout: "pipe", stderr: "pipe",
        });
        await proc.exited;
      }

      const [moduleName, functionName] = fn.handler.split(".");
      const modulePath = join(extractDir, moduleName);

      // Try to import the module
      let handler: Function;
      try {
        const mod = await import(modulePath);
        handler = mod[functionName] ?? mod.default?.[functionName];
      } catch {
        // Try with .js extension
        const mod = await import(modulePath + ".js");
        handler = mod[functionName] ?? mod.default?.[functionName];
      }

      if (typeof handler !== "function") {
        return {
          statusCode: 200,
          payload: JSON.stringify({ errorMessage: `Handler '${fn.handler}' not found`, errorType: "Runtime.HandlerNotFound" }),
          functionError: "Unhandled",
        };
      }

      const event = payload ? JSON.parse(payload) : {};
      const context = {
        functionName: fn.functionName,
        functionVersion: fn.version,
        invokedFunctionArn: fn.functionArn,
        memoryLimitInMB: String(fn.memorySize),
        awsRequestId: crypto.randomUUID(),
        logGroupName: `/aws/lambda/${fn.functionName}`,
        logStreamName: `${new Date().toISOString().slice(0, 10).replace(/-/g, "/")}/${fn.version}/${crypto.randomUUID()}`,
        getRemainingTimeInMillis: () => fn.timeout * 1000,
        callbackWaitsForEmptyEventLoop: true,
      };

      const result = await Promise.resolve(handler(event, context));
      return {
        statusCode: 200,
        payload: typeof result === "string" ? result : JSON.stringify(result),
      };
    } catch (e: any) {
      return {
        statusCode: 200,
        payload: JSON.stringify({ errorMessage: e.message, errorType: e.name ?? "Error", stackTrace: e.stack?.split("\n") }),
        functionError: "Unhandled",
      };
    }
  }

  private invokeMock(fn: LambdaFunction, payload: string): InvocationResult {
    // Return a mock response indicating the function was "invoked"
    let event: any;
    try {
      event = payload ? JSON.parse(payload) : {};
    } catch {
      event = {};
    }

    return {
      statusCode: 200,
      payload: JSON.stringify({
        statusCode: 200,
        body: JSON.stringify({
          message: `Function ${fn.functionName} invoked (mock mode)`,
          event,
        }),
      }),
    };
  }

  private dockerAvailable: boolean | null = null;

  private async isDockerAvailable(): Promise<boolean> {
    if (this.dockerAvailable !== null) return this.dockerAvailable;
    try {
      const proc = Bun.spawn(["docker", "version", "--format", "{{.Server.Version}}"], { stdout: "pipe", stderr: "pipe" });
      const timeout = new Promise<number>((resolve) => setTimeout(() => { proc.kill(); resolve(1); }, 2000));
      const code = await Promise.race([proc.exited, timeout]);
      this.dockerAvailable = code === 0;
      return this.dockerAvailable;
    } catch {
      this.dockerAvailable = false;
      return false;
    }
  }

  private getRuntimeImage(runtime: string): string {
    const map: Record<string, string> = {
      "nodejs18.x": "public.ecr.aws/lambda/nodejs:18",
      "nodejs20.x": "public.ecr.aws/lambda/nodejs:20",
      "nodejs22.x": "public.ecr.aws/lambda/nodejs:22",
      "python3.11": "public.ecr.aws/lambda/python:3.11",
      "python3.12": "public.ecr.aws/lambda/python:3.12",
      "python3.13": "public.ecr.aws/lambda/python:3.13",
    };
    return map[runtime] ?? `public.ecr.aws/lambda/nodejs:20`;
  }

  private findFunction(functionName: string, region: string): LambdaFunction {
    // Try by name
    const key = this.regionKey(region, functionName);
    let fn = this.functions.get(key);
    if (fn) return fn;

    // Try by ARN
    for (const f of this.functions.values()) {
      if (f.functionArn === functionName) return f;
    }

    throw new AwsError("ResourceNotFoundException", `Function not found: ${functionName}`, 404);
  }
}
