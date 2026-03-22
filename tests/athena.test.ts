import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import {
  AthenaClient,
  CreateWorkGroupCommand,
  GetWorkGroupCommand,
  ListWorkGroupsCommand,
  UpdateWorkGroupCommand,
  DeleteWorkGroupCommand,
  StartQueryExecutionCommand,
  GetQueryExecutionCommand,
  ListQueryExecutionsCommand,
  GetQueryResultsCommand,
  StopQueryExecutionCommand,
  CreateNamedQueryCommand,
  GetNamedQueryCommand,
  ListNamedQueriesCommand,
  DeleteNamedQueryCommand,
  CreateDataCatalogCommand,
  GetDataCatalogCommand,
  ListDataCatalogsCommand,
  UpdateDataCatalogCommand,
  DeleteDataCatalogCommand,
  CreatePreparedStatementCommand,
  GetPreparedStatementCommand,
  ListPreparedStatementsCommand,
  DeletePreparedStatementCommand,
} from "@aws-sdk/client-athena";
import { startServer, stopServer, clientConfig } from "./helpers";

const athena = new AthenaClient(clientConfig);

beforeAll(() => startServer());
afterAll(() => stopServer());

describe("Athena", () => {
  const workGroupName = "test-workgroup";

  // --- WorkGroups ---

  test("CreateWorkGroup", async () => {
    const res = await athena.send(new CreateWorkGroupCommand({
      Name: workGroupName,
      Description: "Test workgroup",
      Configuration: {
        ResultConfiguration: {
          OutputLocation: "s3://my-bucket/results/",
        },
        EnforceWorkGroupConfiguration: true,
      },
    }));
    expect(res.$metadata.httpStatusCode).toBe(200);
  });

  test("CreateWorkGroup duplicate throws", async () => {
    await expect(
      athena.send(new CreateWorkGroupCommand({ Name: workGroupName })),
    ).rejects.toThrow();
  });

  test("GetWorkGroup", async () => {
    const res = await athena.send(new GetWorkGroupCommand({ WorkGroup: workGroupName }));
    expect(res.WorkGroup?.Name).toBe(workGroupName);
    expect(res.WorkGroup?.Description).toBe("Test workgroup");
    expect(res.WorkGroup?.Configuration?.ResultConfiguration?.OutputLocation).toBe("s3://my-bucket/results/");
    expect(res.WorkGroup?.Configuration?.EnforceWorkGroupConfiguration).toBe(true);
  });

  test("ListWorkGroups", async () => {
    const res = await athena.send(new ListWorkGroupsCommand({}));
    expect(res.WorkGroups?.some((wg) => wg.Name === workGroupName)).toBe(true);
  });

  test("UpdateWorkGroup", async () => {
    await athena.send(new UpdateWorkGroupCommand({
      WorkGroup: workGroupName,
      Description: "Updated description",
    }));
    const res = await athena.send(new GetWorkGroupCommand({ WorkGroup: workGroupName }));
    expect(res.WorkGroup?.Description).toBe("Updated description");
  });

  // --- Query Execution ---

  let queryExecutionId: string;

  test("StartQueryExecution", async () => {
    const res = await athena.send(new StartQueryExecutionCommand({
      QueryString: "SELECT * FROM my_table",
      QueryExecutionContext: { Database: "my_database" },
      ResultConfiguration: { OutputLocation: "s3://my-bucket/results/" },
      WorkGroup: workGroupName,
    }));
    queryExecutionId = res.QueryExecutionId!;
    expect(queryExecutionId).toBeDefined();
  });

  test("GetQueryExecution", async () => {
    const res = await athena.send(new GetQueryExecutionCommand({
      QueryExecutionId: queryExecutionId,
    }));
    expect(res.QueryExecution?.QueryExecutionId).toBe(queryExecutionId);
    expect(res.QueryExecution?.Query).toBe("SELECT * FROM my_table");
    expect(res.QueryExecution?.Status?.State).toBe("SUCCEEDED");
    expect(res.QueryExecution?.WorkGroup).toBe(workGroupName);
  });

  test("ListQueryExecutions", async () => {
    const res = await athena.send(new ListQueryExecutionsCommand({}));
    expect(res.QueryExecutionIds?.includes(queryExecutionId)).toBe(true);
  });

  test("GetQueryResults", async () => {
    const res = await athena.send(new GetQueryResultsCommand({
      QueryExecutionId: queryExecutionId,
    }));
    expect(res.ResultSet?.ResultSetMetadata?.ColumnInfo?.length).toBeGreaterThan(0);
    expect(res.ResultSet?.Rows?.length).toBeGreaterThan(0);
  });

  test("StopQueryExecution", async () => {
    // Start a new query to cancel
    const startRes = await athena.send(new StartQueryExecutionCommand({
      QueryString: "SELECT 1",
      WorkGroup: workGroupName,
    }));
    const id = startRes.QueryExecutionId!;
    await athena.send(new StopQueryExecutionCommand({ QueryExecutionId: id }));
    const res = await athena.send(new GetQueryExecutionCommand({ QueryExecutionId: id }));
    expect(res.QueryExecution?.Status?.State).toBe("CANCELLED");
  });

  // --- Named Queries ---

  let namedQueryId: string;

  test("CreateNamedQuery", async () => {
    const res = await athena.send(new CreateNamedQueryCommand({
      Name: "test-named-query",
      Database: "my_database",
      QueryString: "SELECT count(*) FROM my_table",
      Description: "A test named query",
      WorkGroup: workGroupName,
    }));
    namedQueryId = res.NamedQueryId!;
    expect(namedQueryId).toBeDefined();
  });

  test("GetNamedQuery", async () => {
    const res = await athena.send(new GetNamedQueryCommand({
      NamedQueryId: namedQueryId,
    }));
    expect(res.NamedQuery?.Name).toBe("test-named-query");
    expect(res.NamedQuery?.Database).toBe("my_database");
    expect(res.NamedQuery?.QueryString).toBe("SELECT count(*) FROM my_table");
    expect(res.NamedQuery?.WorkGroup).toBe(workGroupName);
  });

  test("ListNamedQueries", async () => {
    const res = await athena.send(new ListNamedQueriesCommand({}));
    expect(res.NamedQueryIds?.includes(namedQueryId)).toBe(true);
  });

  test("DeleteNamedQuery", async () => {
    await athena.send(new DeleteNamedQueryCommand({ NamedQueryId: namedQueryId }));
    await expect(
      athena.send(new GetNamedQueryCommand({ NamedQueryId: namedQueryId })),
    ).rejects.toThrow();
  });

  // --- Data Catalogs ---

  test("CreateDataCatalog", async () => {
    const res = await athena.send(new CreateDataCatalogCommand({
      Name: "test-catalog",
      Type: "GLUE",
      Description: "Test Glue catalog",
      Parameters: { "catalog-id": "123456789012" },
    }));
    expect(res.$metadata.httpStatusCode).toBe(200);
  });

  test("CreateDataCatalog duplicate throws", async () => {
    await expect(
      athena.send(new CreateDataCatalogCommand({ Name: "test-catalog", Type: "GLUE" })),
    ).rejects.toThrow();
  });

  test("GetDataCatalog", async () => {
    const res = await athena.send(new GetDataCatalogCommand({ Name: "test-catalog" }));
    expect(res.DataCatalog?.Name).toBe("test-catalog");
    expect(res.DataCatalog?.Type).toBe("GLUE");
    expect(res.DataCatalog?.Description).toBe("Test Glue catalog");
  });

  test("ListDataCatalogs", async () => {
    const res = await athena.send(new ListDataCatalogsCommand({}));
    expect(res.DataCatalogsSummary?.some((c) => c.CatalogName === "test-catalog")).toBe(true);
  });

  test("UpdateDataCatalog", async () => {
    await athena.send(new UpdateDataCatalogCommand({
      Name: "test-catalog",
      Type: "LAMBDA",
      Description: "Updated catalog",
    }));
    const res = await athena.send(new GetDataCatalogCommand({ Name: "test-catalog" }));
    expect(res.DataCatalog?.Type).toBe("LAMBDA");
    expect(res.DataCatalog?.Description).toBe("Updated catalog");
  });

  test("DeleteDataCatalog", async () => {
    await athena.send(new DeleteDataCatalogCommand({ Name: "test-catalog" }));
    await expect(
      athena.send(new GetDataCatalogCommand({ Name: "test-catalog" })),
    ).rejects.toThrow();
  });

  // --- Prepared Statements ---

  test("CreatePreparedStatement", async () => {
    // Need a workgroup for prepared statements
    await athena.send(new CreateWorkGroupCommand({ Name: "ps-workgroup" }));

    const res = await athena.send(new CreatePreparedStatementCommand({
      StatementName: "test-stmt",
      WorkGroup: "ps-workgroup",
      QueryStatement: "SELECT * FROM my_table WHERE id = ?",
      Description: "Test prepared statement",
    }));
    expect(res.$metadata.httpStatusCode).toBe(200);
  });

  test("GetPreparedStatement", async () => {
    const res = await athena.send(new GetPreparedStatementCommand({
      StatementName: "test-stmt",
      WorkGroup: "ps-workgroup",
    }));
    expect(res.PreparedStatement?.StatementName).toBe("test-stmt");
    expect(res.PreparedStatement?.QueryStatement).toBe("SELECT * FROM my_table WHERE id = ?");
    expect(res.PreparedStatement?.Description).toBe("Test prepared statement");
  });

  test("ListPreparedStatements", async () => {
    const res = await athena.send(new ListPreparedStatementsCommand({
      WorkGroup: "ps-workgroup",
    }));
    expect(res.PreparedStatements?.some((s) => s.StatementName === "test-stmt")).toBe(true);
  });

  test("DeletePreparedStatement", async () => {
    await athena.send(new DeletePreparedStatementCommand({
      StatementName: "test-stmt",
      WorkGroup: "ps-workgroup",
    }));
    await expect(
      athena.send(new GetPreparedStatementCommand({
        StatementName: "test-stmt",
        WorkGroup: "ps-workgroup",
      })),
    ).rejects.toThrow();
  });

  // --- Cleanup ---

  test("DeleteWorkGroup", async () => {
    // Clean up both workgroups
    try { await athena.send(new DeleteWorkGroupCommand({ WorkGroup: "ps-workgroup" })); } catch {}
    await athena.send(new DeleteWorkGroupCommand({ WorkGroup: workGroupName }));
    await expect(
      athena.send(new GetWorkGroupCommand({ WorkGroup: workGroupName })),
    ).rejects.toThrow();
  });
});
