import type { RequestContext } from "../../core/context";
import { AwsError, jsonErrorResponse } from "../../core/errors";
import type { AthenaService } from "./athena-service";

export class AthenaHandler {
  constructor(private service: AthenaService) {}

  handle(action: string, body: any, ctx: RequestContext): Response {
    try {
      switch (action) {
        case "CreateWorkGroup": return this.createWorkGroup(body, ctx);
        case "GetWorkGroup": return this.getWorkGroup(body, ctx);
        case "ListWorkGroups": return this.listWorkGroups(ctx);
        case "DeleteWorkGroup": return this.deleteWorkGroup(body, ctx);
        case "UpdateWorkGroup": return this.updateWorkGroup(body, ctx);
        case "StartQueryExecution": return this.startQueryExecution(body, ctx);
        case "GetQueryExecution": return this.getQueryExecution(body, ctx);
        case "ListQueryExecutions": return this.listQueryExecutions(ctx);
        case "GetQueryResults": return this.getQueryResults(body, ctx);
        case "StopQueryExecution": return this.stopQueryExecution(body, ctx);
        case "CreateNamedQuery": return this.createNamedQuery(body, ctx);
        case "GetNamedQuery": return this.getNamedQuery(body, ctx);
        case "ListNamedQueries": return this.listNamedQueries(ctx);
        case "DeleteNamedQuery": return this.deleteNamedQuery(body, ctx);
        case "CreateDataCatalog": return this.createDataCatalog(body, ctx);
        case "GetDataCatalog": return this.getDataCatalog(body, ctx);
        case "ListDataCatalogs": return this.listDataCatalogs(ctx);
        case "UpdateDataCatalog": return this.updateDataCatalog(body, ctx);
        case "DeleteDataCatalog": return this.deleteDataCatalog(body, ctx);
        case "CreatePreparedStatement": return this.createPreparedStatement(body, ctx);
        case "GetPreparedStatement": return this.getPreparedStatement(body, ctx);
        case "ListPreparedStatements": return this.listPreparedStatements(body, ctx);
        case "DeletePreparedStatement": return this.deletePreparedStatement(body, ctx);
        default:
          return jsonErrorResponse(new AwsError("UnsupportedOperation", `Operation ${action} is not supported.`, 400), ctx.requestId);
      }
    } catch (e) {
      if (e instanceof AwsError) return jsonErrorResponse(e, ctx.requestId);
      throw e;
    }
  }

  private json(data: any, ctx: RequestContext): Response {
    return new Response(JSON.stringify(data), {
      headers: { "Content-Type": "application/x-amz-json-1.1", "x-amzn-RequestId": ctx.requestId },
    });
  }

  private createWorkGroup(body: any, ctx: RequestContext): Response {
    this.service.createWorkGroup(
      body.Name,
      body.Description,
      body.Configuration ? {
        resultConfiguration: body.Configuration.ResultConfiguration ? {
          outputLocation: body.Configuration.ResultConfiguration.OutputLocation,
        } : undefined,
        enforceWorkGroupConfiguration: body.Configuration.EnforceWorkGroupConfiguration,
      } : undefined,
      ctx.region,
    );
    return this.json({}, ctx);
  }

  private getWorkGroup(body: any, ctx: RequestContext): Response {
    const wg = this.service.getWorkGroup(body.WorkGroup, ctx.region);
    return this.json({
      WorkGroup: {
        Name: wg.name,
        State: wg.state,
        Description: wg.description,
        CreationTime: wg.creationTime,
        Configuration: {
          ResultConfiguration: wg.configuration.resultConfiguration ? {
            OutputLocation: wg.configuration.resultConfiguration.outputLocation,
          } : undefined,
          EnforceWorkGroupConfiguration: wg.configuration.enforceWorkGroupConfiguration,
        },
      },
    }, ctx);
  }

  private listWorkGroups(ctx: RequestContext): Response {
    const workGroups = this.service.listWorkGroups(ctx.region);
    return this.json({
      WorkGroups: workGroups.map((wg) => ({
        Name: wg.name,
        State: wg.state,
        Description: wg.description,
        CreationTime: wg.creationTime,
      })),
    }, ctx);
  }

  private deleteWorkGroup(body: any, ctx: RequestContext): Response {
    this.service.deleteWorkGroup(body.WorkGroup, ctx.region);
    return this.json({}, ctx);
  }

  private updateWorkGroup(body: any, ctx: RequestContext): Response {
    this.service.updateWorkGroup(
      body.WorkGroup,
      body.Description,
      body.ConfigurationUpdates ? {
        resultConfiguration: body.ConfigurationUpdates.ResultConfigurationUpdates ? {
          outputLocation: body.ConfigurationUpdates.ResultConfigurationUpdates.OutputLocation,
        } : undefined,
        enforceWorkGroupConfiguration: body.ConfigurationUpdates.EnforceWorkGroupConfiguration,
      } : undefined,
      ctx.region,
    );
    return this.json({}, ctx);
  }

  private startQueryExecution(body: any, ctx: RequestContext): Response {
    const queryExecutionId = this.service.startQueryExecution(
      body.QueryString,
      body.QueryExecutionContext,
      body.ResultConfiguration,
      body.WorkGroup,
      ctx.region,
    );
    return this.json({ QueryExecutionId: queryExecutionId }, ctx);
  }

  private getQueryExecution(body: any, ctx: RequestContext): Response {
    const qe = this.service.getQueryExecution(body.QueryExecutionId, ctx.region);
    return this.json({
      QueryExecution: {
        QueryExecutionId: qe.queryExecutionId,
        Query: qe.queryString,
        QueryExecutionContext: {
          Database: qe.database,
          Catalog: qe.catalog,
        },
        ResultConfiguration: qe.resultConfiguration ? {
          OutputLocation: qe.resultConfiguration.outputLocation,
        } : undefined,
        Status: {
          State: qe.status.state,
          SubmissionDateTime: qe.status.submissionDateTime,
          CompletionDateTime: qe.status.completionDateTime,
        },
        WorkGroup: qe.workGroup,
      },
    }, ctx);
  }

  private listQueryExecutions(ctx: RequestContext): Response {
    const ids = this.service.listQueryExecutions(ctx.region);
    return this.json({ QueryExecutionIds: ids }, ctx);
  }

  private getQueryResults(body: any, ctx: RequestContext): Response {
    const result = this.service.getQueryResults(body.QueryExecutionId, ctx.region);
    return this.json({
      ResultSet: {
        ResultSetMetadata: {
          ColumnInfo: result.columns.map((c) => ({ Name: c.Name, Type: c.Type })),
        },
        Rows: [
          { Data: result.columns.map((c) => ({ VarCharValue: c.Name })) },
          ...result.rows,
        ],
      },
    }, ctx);
  }

  private stopQueryExecution(body: any, ctx: RequestContext): Response {
    this.service.stopQueryExecution(body.QueryExecutionId, ctx.region);
    return this.json({}, ctx);
  }

  private createNamedQuery(body: any, ctx: RequestContext): Response {
    const namedQueryId = this.service.createNamedQuery(
      body.Name,
      body.Database,
      body.QueryString,
      body.Description,
      body.WorkGroup,
      ctx.region,
    );
    return this.json({ NamedQueryId: namedQueryId }, ctx);
  }

  private getNamedQuery(body: any, ctx: RequestContext): Response {
    const nq = this.service.getNamedQuery(body.NamedQueryId, ctx.region);
    return this.json({
      NamedQuery: {
        NamedQueryId: nq.namedQueryId,
        Name: nq.name,
        Database: nq.database,
        QueryString: nq.queryString,
        Description: nq.description,
        WorkGroup: nq.workGroup,
      },
    }, ctx);
  }

  private listNamedQueries(ctx: RequestContext): Response {
    const ids = this.service.listNamedQueries(ctx.region);
    return this.json({ NamedQueryIds: ids }, ctx);
  }

  private deleteNamedQuery(body: any, ctx: RequestContext): Response {
    this.service.deleteNamedQuery(body.NamedQueryId, ctx.region);
    return this.json({}, ctx);
  }

  // Data Catalogs
  private createDataCatalog(body: any, ctx: RequestContext): Response {
    this.service.createDataCatalog(body.Name, body.Type, body.Description, body.Parameters, ctx.region);
    return this.json({}, ctx);
  }

  private getDataCatalog(body: any, ctx: RequestContext): Response {
    const catalog = this.service.getDataCatalog(body.Name, ctx.region);
    return this.json({
      DataCatalog: {
        Name: catalog.name,
        Type: catalog.type,
        Description: catalog.description,
        Parameters: catalog.parameters,
      },
    }, ctx);
  }

  private listDataCatalogs(ctx: RequestContext): Response {
    const catalogs = this.service.listDataCatalogs(ctx.region);
    return this.json({
      DataCatalogsSummary: catalogs.map((c) => ({
        CatalogName: c.name,
        Type: c.type,
      })),
    }, ctx);
  }

  private updateDataCatalog(body: any, ctx: RequestContext): Response {
    this.service.updateDataCatalog(body.Name, body.Type, body.Description, body.Parameters, ctx.region);
    return this.json({}, ctx);
  }

  private deleteDataCatalog(body: any, ctx: RequestContext): Response {
    this.service.deleteDataCatalog(body.Name, ctx.region);
    return this.json({}, ctx);
  }

  // Prepared Statements
  private createPreparedStatement(body: any, ctx: RequestContext): Response {
    this.service.createPreparedStatement(body.StatementName, body.WorkGroup, body.QueryStatement, body.Description, ctx.region);
    return this.json({}, ctx);
  }

  private getPreparedStatement(body: any, ctx: RequestContext): Response {
    const stmt = this.service.getPreparedStatement(body.StatementName, body.WorkGroup, ctx.region);
    return this.json({
      PreparedStatement: {
        StatementName: stmt.statementName,
        WorkGroupName: stmt.workGroupName,
        QueryStatement: stmt.queryStatement,
        Description: stmt.description,
        LastModifiedTime: stmt.lastModifiedTime,
      },
    }, ctx);
  }

  private listPreparedStatements(body: any, ctx: RequestContext): Response {
    const stmts = this.service.listPreparedStatements(body.WorkGroup, ctx.region);
    return this.json({
      PreparedStatements: stmts.map((s) => ({
        StatementName: s.statementName,
        LastModifiedTime: s.lastModifiedTime,
      })),
    }, ctx);
  }

  private deletePreparedStatement(body: any, ctx: RequestContext): Response {
    this.service.deletePreparedStatement(body.StatementName, body.WorkGroup, ctx.region);
    return this.json({}, ctx);
  }
}
