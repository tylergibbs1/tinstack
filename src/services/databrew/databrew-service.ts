import { InMemoryStorage, type StorageBackend } from "../../core/storage";
import { AwsError } from "../../core/errors";
import { buildArn } from "../../core/arn";

interface BrewRecipe { name: string; arn: string; steps: any[]; publishedDate?: number; createDate: number; lastModifiedDate: number; tags: Record<string, string>; }
interface BrewProject { name: string; arn: string; recipeName: string; datasetName?: string; createDate: number; lastModifiedDate: number; tags: Record<string, string>; }
interface BrewDataset { name: string; arn: string; input: any; format?: string; createDate: number; lastModifiedDate: number; tags: Record<string, string>; }
interface BrewJob { name: string; arn: string; type: string; projectName?: string; datasetName?: string; outputs?: any[]; createDate: number; lastModifiedDate: number; tags: Record<string, string>; }
interface BrewJobRun { runId: string; jobName: string; state: string; startedOn: number; completedOn?: number; }

export class DataBrewService {
  private recipes: StorageBackend<string, BrewRecipe>;
  private projects: StorageBackend<string, BrewProject>;
  private datasets: StorageBackend<string, BrewDataset>;
  private jobs: StorageBackend<string, BrewJob>;
  private jobRuns: StorageBackend<string, BrewJobRun>;

  constructor(private accountId: string) {
    this.recipes = new InMemoryStorage();
    this.projects = new InMemoryStorage();
    this.datasets = new InMemoryStorage();
    this.jobs = new InMemoryStorage();
    this.jobRuns = new InMemoryStorage();
  }

  private rk(region: string, name: string): string { return `${region}#${name}`; }

  createRecipe(name: string, steps: any[], tags: Record<string, string> | undefined, region: string): BrewRecipe {
    const key = this.rk(region, name);
    if (this.recipes.has(key)) throw new AwsError("ConflictException", `Recipe ${name} already exists.`, 409);
    const now = Date.now() / 1000;
    const recipe: BrewRecipe = { name, arn: buildArn("databrew", region, this.accountId, "recipe/", name), steps: steps ?? [], createDate: now, lastModifiedDate: now, tags: tags ?? {} };
    this.recipes.set(key, recipe);
    return recipe;
  }

  listRecipes(region: string): BrewRecipe[] { return this.recipes.values().filter((r) => r.arn.includes(`:${region}:`)); }

  createProject(name: string, recipeName: string, datasetName: string | undefined, tags: Record<string, string> | undefined, region: string): BrewProject {
    const key = this.rk(region, name);
    if (this.projects.has(key)) throw new AwsError("ConflictException", `Project ${name} already exists.`, 409);
    const now = Date.now() / 1000;
    const project: BrewProject = { name, arn: buildArn("databrew", region, this.accountId, "project/", name), recipeName, datasetName, createDate: now, lastModifiedDate: now, tags: tags ?? {} };
    this.projects.set(key, project);
    return project;
  }

  listProjects(region: string): BrewProject[] { return this.projects.values().filter((p) => p.arn.includes(`:${region}:`)); }

  createDataset(name: string, input: any, format: string | undefined, tags: Record<string, string> | undefined, region: string): BrewDataset {
    const key = this.rk(region, name);
    if (this.datasets.has(key)) throw new AwsError("ConflictException", `Dataset ${name} already exists.`, 409);
    const now = Date.now() / 1000;
    const dataset: BrewDataset = { name, arn: buildArn("databrew", region, this.accountId, "dataset/", name), input: input ?? {}, format, createDate: now, lastModifiedDate: now, tags: tags ?? {} };
    this.datasets.set(key, dataset);
    return dataset;
  }

  listDatasets(region: string): BrewDataset[] { return this.datasets.values().filter((d) => d.arn.includes(`:${region}:`)); }

  createProfileJob(name: string, datasetName: string | undefined, projectName: string | undefined, outputs: any[], tags: Record<string, string> | undefined, region: string): BrewJob {
    const key = this.rk(region, name);
    if (this.jobs.has(key)) throw new AwsError("ConflictException", `Job ${name} already exists.`, 409);
    const now = Date.now() / 1000;
    const job: BrewJob = { name, arn: buildArn("databrew", region, this.accountId, "job/", name), type: "PROFILE", datasetName, projectName, outputs, createDate: now, lastModifiedDate: now, tags: tags ?? {} };
    this.jobs.set(key, job);
    return job;
  }

  listJobs(region: string): BrewJob[] { return this.jobs.values().filter((j) => j.arn.includes(`:${region}:`)); }

  startJobRun(jobName: string, region: string): BrewJobRun {
    const key = this.rk(region, jobName);
    if (!this.jobs.has(key)) throw new AwsError("ResourceNotFoundException", `Job ${jobName} not found.`, 404);
    const run: BrewJobRun = { runId: crypto.randomUUID(), jobName, state: "SUCCEEDED", startedOn: Date.now() / 1000, completedOn: Date.now() / 1000 };
    this.jobRuns.set(run.runId, run);
    return run;
  }

  describeJobRun(jobName: string, runId: string): BrewJobRun {
    const run = this.jobRuns.get(runId);
    if (!run || run.jobName !== jobName) throw new AwsError("ResourceNotFoundException", `Job run ${runId} not found.`, 404);
    return run;
  }
}
