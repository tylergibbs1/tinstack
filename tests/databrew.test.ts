import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import {
  DataBrewClient,
  CreateRecipeCommand,
  ListRecipesCommand,
  CreateDatasetCommand,
  ListDatasetsCommand,
  CreateProjectCommand,
  ListProjectsCommand,
} from "@aws-sdk/client-databrew";
import { startServer, stopServer, clientConfig } from "./helpers";

const client = new DataBrewClient({
  ...clientConfig,
});

beforeAll(() => startServer());
afterAll(() => stopServer());

describe("DataBrew", () => {
  const recipeName = "test-recipe-" + Date.now();
  const datasetName = "test-dataset-" + Date.now();
  const projectName = "test-project-" + Date.now();

  test("CreateRecipe", async () => {
    const result = await client.send(new CreateRecipeCommand({
      Name: recipeName,
      Steps: [{ Action: { Operation: "UPPER_CASE", Parameters: { sourceColumn: "name" } } }],
    }));
    expect(result.Name).toBe(recipeName);
  });

  test("ListRecipes", async () => {
    const result = await client.send(new ListRecipesCommand({}));
    expect(result.Recipes?.some((r) => r.Name === recipeName)).toBe(true);
  });

  test("CreateDataset", async () => {
    const result = await client.send(new CreateDatasetCommand({
      Name: datasetName,
      Input: { S3InputDefinition: { Bucket: "test-bucket", Key: "data.csv" } },
    }));
    expect(result.Name).toBe(datasetName);
  });

  test("ListDatasets", async () => {
    const result = await client.send(new ListDatasetsCommand({}));
    expect(result.Datasets?.some((d) => d.Name === datasetName)).toBe(true);
  });

  test("CreateProject", async () => {
    const result = await client.send(new CreateProjectCommand({
      Name: projectName,
      RecipeName: recipeName,
      DatasetName: datasetName,
      RoleArn: "arn:aws:iam::000000000000:role/test-role",
    }));
    expect(result.Name).toBe(projectName);
  });

  test("ListProjects", async () => {
    const result = await client.send(new ListProjectsCommand({}));
    expect(result.Projects?.some((p) => p.Name === projectName)).toBe(true);
  });
});
