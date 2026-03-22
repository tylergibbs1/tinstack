import type { RequestContext } from "../../core/context";
import { AwsError, jsonErrorResponse } from "../../core/errors";
import type { DataBrewService } from "./databrew-service";

export class DataBrewHandler {
  constructor(private service: DataBrewService) {}

  async handleRoute(req: Request, ctx: RequestContext): Promise<Response> {
    const url = new URL(req.url);
    const path = url.pathname;
    const method = req.method;

    try {
      // Recipes
      if (path === "/recipes" || path === "/recipes/") {
        if (method === "GET") {
          const recipes = this.service.listRecipes(ctx.region);
          return this.json({ Recipes: recipes.map((r) => ({ Name: r.name, ResourceArn: r.arn, CreateDate: r.createDate, LastModifiedDate: r.lastModifiedDate, Tags: r.tags })) }, ctx);
        }
        if (method === "POST") {
          const body = await req.json();
          const recipe = this.service.createRecipe(body.Name, body.Steps, body.Tags, ctx.region);
          return this.json({ Name: recipe.name }, ctx);
        }
      }

      // Projects
      if (path === "/projects" || path === "/projects/") {
        if (method === "GET") {
          const projects = this.service.listProjects(ctx.region);
          return this.json({ Projects: projects.map((p) => ({ Name: p.name, ResourceArn: p.arn, RecipeName: p.recipeName, DatasetName: p.datasetName, CreateDate: p.createDate, LastModifiedDate: p.lastModifiedDate, Tags: p.tags })) }, ctx);
        }
        if (method === "POST") {
          const body = await req.json();
          const project = this.service.createProject(body.Name, body.RecipeName, body.DatasetName, body.Tags, ctx.region);
          return this.json({ Name: project.name }, ctx);
        }
      }

      // Datasets
      if (path === "/datasets" || path === "/datasets/") {
        if (method === "GET") {
          const datasets = this.service.listDatasets(ctx.region);
          return this.json({ Datasets: datasets.map((d) => ({ Name: d.name, ResourceArn: d.arn, Input: d.input, Format: d.format, CreateDate: d.createDate, LastModifiedDate: d.lastModifiedDate, Tags: d.tags })) }, ctx);
        }
        if (method === "POST") {
          const body = await req.json();
          const dataset = this.service.createDataset(body.Name, body.Input, body.Format, body.Tags, ctx.region);
          return this.json({ Name: dataset.name }, ctx);
        }
      }

      // Jobs
      if (path === "/jobs" || path === "/jobs/") {
        if (method === "GET") {
          const jobs = this.service.listJobs(ctx.region);
          return this.json({ Jobs: jobs.map((j) => ({ Name: j.name, ResourceArn: j.arn, Type: j.type, CreateDate: j.createDate, Tags: j.tags })) }, ctx);
        }
      }

      // Profile jobs
      if (path === "/profileJobs" || path === "/profileJobs/") {
        if (method === "POST") {
          const body = await req.json();
          const job = this.service.createProfileJob(body.Name, body.DatasetName, body.ProjectName, body.Outputs ?? [], body.Tags, ctx.region);
          return this.json({ Name: job.name }, ctx);
        }
      }

      // Start job run: POST /jobs/{name}/startJobRun
      const startMatch = path.match(/^\/jobs\/([^/]+)\/startJobRun$/);
      if (startMatch && method === "POST") {
        const run = this.service.startJobRun(decodeURIComponent(startMatch[1]), ctx.region);
        return this.json({ RunId: run.runId }, ctx);
      }

      // Describe job run: GET /jobs/{name}/jobRuns/{runId}
      const runMatch = path.match(/^\/jobs\/([^/]+)\/jobRuns\/([^/]+)$/);
      if (runMatch && method === "GET") {
        const run = this.service.describeJobRun(decodeURIComponent(runMatch[1]), decodeURIComponent(runMatch[2]));
        return this.json({ RunId: run.runId, JobName: run.jobName, State: run.state, StartedOn: run.startedOn, CompletedOn: run.completedOn }, ctx);
      }

      return jsonErrorResponse(new AwsError("UnknownOperationException", `Unknown DataBrew operation: ${method} ${path}`, 400), ctx.requestId);
    } catch (e) {
      if (e instanceof AwsError) return jsonErrorResponse(e, ctx.requestId);
      throw e;
    }
  }

  private json(data: any, ctx: RequestContext): Response {
    return new Response(JSON.stringify(data), { headers: { "Content-Type": "application/json", "x-amzn-RequestId": ctx.requestId } });
  }
}
