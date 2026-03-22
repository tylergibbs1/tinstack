import { InMemoryStorage, type StorageBackend } from "../../core/storage";
import { AwsError } from "../../core/errors";
import { buildArn } from "../../core/arn";

export interface DataSyncAgent {
  agentArn: string;
  name: string;
  status: string;
  createdAt: number;
  tags: { Key: string; Value: string }[];
}

export interface DataSyncLocation {
  locationArn: string;
  locationUri: string;
  locationType: string;
  createdAt: number;
  tags: { Key: string; Value: string }[];
}

export interface DataSyncTask {
  taskArn: string;
  name: string;
  sourceLocationArn: string;
  destinationLocationArn: string;
  status: string;
  createdAt: number;
  currentTaskExecutionArn: string | null;
  tags: { Key: string; Value: string }[];
}

export interface TaskExecution {
  taskExecutionArn: string;
  taskArn: string;
  status: string;
  startTime: number;
}

export class DataSyncService {
  private agents: StorageBackend<string, DataSyncAgent>;
  private locations: StorageBackend<string, DataSyncLocation>;
  private tasks: StorageBackend<string, DataSyncTask>;
  private taskExecutions: StorageBackend<string, TaskExecution>;
  private counter = 0;

  constructor(private accountId: string) {
    this.agents = new InMemoryStorage();
    this.locations = new InMemoryStorage();
    this.tasks = new InMemoryStorage();
    this.taskExecutions = new InMemoryStorage();
  }

  private nextId(prefix: string): string {
    this.counter++;
    return `${prefix}-${String(this.counter).padStart(17, "0")}`;
  }

  createAgent(
    name: string | undefined,
    activationKey: string | undefined,
    tags: { Key: string; Value: string }[] | undefined,
    region: string,
  ): string {
    const agentId = this.nextId("agent");
    const arn = buildArn("datasync", region, this.accountId, "agent/", agentId);
    this.agents.set(arn, {
      agentArn: arn,
      name: name ?? agentId,
      status: "ONLINE",
      createdAt: Date.now() / 1000,
      tags: tags ?? [],
    });
    return arn;
  }

  listAgents(): DataSyncAgent[] {
    return this.agents.values();
  }

  deleteAgent(arn: string): void {
    if (!this.agents.has(arn)) throw new AwsError("InvalidRequestException", `Agent ${arn} not found.`, 400);
    this.agents.delete(arn);
  }

  createLocationS3(
    s3BucketArn: string,
    s3Config: any,
    subdirectory: string | undefined,
    tags: { Key: string; Value: string }[] | undefined,
    region: string,
  ): string {
    const locId = this.nextId("loc");
    const arn = buildArn("datasync", region, this.accountId, "location/", locId);
    const bucket = s3BucketArn.split(":::").pop() ?? "bucket";
    this.locations.set(arn, {
      locationArn: arn,
      locationUri: `s3://${bucket}${subdirectory ?? "/"}`,
      locationType: "S3",
      createdAt: Date.now() / 1000,
      tags: tags ?? [],
    });
    return arn;
  }

  createLocationNfs(
    serverHostname: string,
    subdirectory: string,
    onPremConfig: any,
    tags: { Key: string; Value: string }[] | undefined,
    region: string,
  ): string {
    const locId = this.nextId("loc");
    const arn = buildArn("datasync", region, this.accountId, "location/", locId);
    this.locations.set(arn, {
      locationArn: arn,
      locationUri: `nfs://${serverHostname}${subdirectory}`,
      locationType: "NFS",
      createdAt: Date.now() / 1000,
      tags: tags ?? [],
    });
    return arn;
  }

  createLocationEfs(
    efsFilesystemArn: string,
    ec2Config: any,
    subdirectory: string | undefined,
    tags: { Key: string; Value: string }[] | undefined,
    region: string,
  ): string {
    const locId = this.nextId("loc");
    const arn = buildArn("datasync", region, this.accountId, "location/", locId);
    this.locations.set(arn, {
      locationArn: arn,
      locationUri: `efs://${efsFilesystemArn.split("/").pop()}${subdirectory ?? "/"}`,
      locationType: "EFS",
      createdAt: Date.now() / 1000,
      tags: tags ?? [],
    });
    return arn;
  }

  describeLocation(arn: string): DataSyncLocation {
    const loc = this.locations.get(arn);
    if (!loc) throw new AwsError("InvalidRequestException", `Location ${arn} not found.`, 400);
    return loc;
  }

  listLocations(): DataSyncLocation[] {
    return this.locations.values();
  }

  deleteLocation(arn: string): void {
    if (!this.locations.has(arn)) throw new AwsError("InvalidRequestException", `Location ${arn} not found.`, 400);
    this.locations.delete(arn);
  }

  createTask(
    sourceLocationArn: string,
    destinationLocationArn: string,
    name: string | undefined,
    tags: { Key: string; Value: string }[] | undefined,
    region: string,
  ): string {
    const taskId = this.nextId("task");
    const arn = buildArn("datasync", region, this.accountId, "task/", taskId);
    this.tasks.set(arn, {
      taskArn: arn,
      name: name ?? taskId,
      sourceLocationArn,
      destinationLocationArn,
      status: "AVAILABLE",
      createdAt: Date.now() / 1000,
      currentTaskExecutionArn: null,
      tags: tags ?? [],
    });
    return arn;
  }

  describeTask(arn: string): DataSyncTask {
    const task = this.tasks.get(arn);
    if (!task) throw new AwsError("InvalidRequestException", `Task ${arn} not found.`, 400);
    return task;
  }

  listTasks(): DataSyncTask[] {
    return this.tasks.values();
  }

  deleteTask(arn: string): void {
    if (!this.tasks.has(arn)) throw new AwsError("InvalidRequestException", `Task ${arn} not found.`, 400);
    this.tasks.delete(arn);
  }

  startTaskExecution(taskArn: string): string {
    const task = this.tasks.get(taskArn);
    if (!task) throw new AwsError("InvalidRequestException", `Task ${taskArn} not found.`, 400);

    const execId = this.nextId("exec");
    const execArn = `${taskArn}/execution/${execId}`;
    const exec: TaskExecution = {
      taskExecutionArn: execArn,
      taskArn,
      status: "LAUNCHING",
      startTime: Date.now() / 1000,
    };
    this.taskExecutions.set(execArn, exec);
    task.status = "RUNNING";
    task.currentTaskExecutionArn = execArn;
    return execArn;
  }

  describeTaskExecution(arn: string): TaskExecution {
    const exec = this.taskExecutions.get(arn);
    if (!exec) throw new AwsError("InvalidRequestException", `Task execution ${arn} not found.`, 400);
    return exec;
  }

  listTaskExecutions(taskArn?: string): TaskExecution[] {
    const all = this.taskExecutions.values();
    if (taskArn) return all.filter((e) => e.taskArn === taskArn);
    return all;
  }

  cancelTaskExecution(arn: string): void {
    const exec = this.taskExecutions.get(arn);
    if (!exec) throw new AwsError("InvalidRequestException", `Task execution ${arn} not found.`, 400);
    exec.status = "ERROR";
    const task = this.tasks.get(exec.taskArn);
    if (task) {
      task.status = "AVAILABLE";
      task.currentTaskExecutionArn = null;
    }
  }

  tagResource(arn: string, tags: { Key: string; Value: string }[]): void {
    const resource = this.resolveResource(arn);
    if (!resource) throw new AwsError("InvalidRequestException", `Resource ${arn} not found.`, 400);
    for (const tag of tags) {
      const existing = resource.tags.find((t) => t.Key === tag.Key);
      if (existing) existing.Value = tag.Value;
      else resource.tags.push(tag);
    }
  }

  untagResource(arn: string, keys: string[]): void {
    const resource = this.resolveResource(arn);
    if (!resource) throw new AwsError("InvalidRequestException", `Resource ${arn} not found.`, 400);
    resource.tags = resource.tags.filter((t) => !keys.includes(t.Key));
  }

  listTagsForResource(arn: string): { Key: string; Value: string }[] {
    const resource = this.resolveResource(arn);
    if (!resource) throw new AwsError("InvalidRequestException", `Resource ${arn} not found.`, 400);
    return resource.tags;
  }

  private resolveResource(arn: string): { tags: { Key: string; Value: string }[] } | undefined {
    return this.agents.get(arn) ?? this.locations.get(arn) ?? this.tasks.get(arn) ?? undefined;
  }
}
