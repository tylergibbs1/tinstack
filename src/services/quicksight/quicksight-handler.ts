import type { RequestContext } from "../../core/context";
import { AwsError, jsonErrorResponse } from "../../core/errors";
import type { QuickSightService } from "./quicksight-service";

export class QuickSightHandler {
  constructor(private service: QuickSightService) {}

  async handleRoute(req: Request, ctx: RequestContext): Promise<Response> {
    const url = new URL(req.url);
    const path = url.pathname;
    const method = req.method;

    try {
      // --- DataSets ---
      const dataSetMatch = path.match(/^\/accounts\/[^/]+\/data-sets\/([^/]+)$/);
      if (dataSetMatch) {
        const dataSetId = dataSetMatch[1];
        if (method === "GET") {
          const ds = this.service.describeDataSet(dataSetId);
          return this.json({ DataSet: dataSetToJson(ds), Status: 200 }, ctx);
        }
        if (method === "DELETE") {
          const ds = this.service.deleteDataSet(dataSetId);
          return this.json({ Arn: ds.arn, DataSetId: ds.dataSetId, Status: 200 }, ctx);
        }
      }

      const dataSetsMatch = path.match(/^\/accounts\/[^/]+\/data-sets$/);
      if (dataSetsMatch) {
        if (method === "POST") {
          const body = await req.json();
          const ds = this.service.createDataSet(body.DataSetId, body.Name, body.ImportMode, ctx.region);
          return this.json({ Arn: ds.arn, DataSetId: ds.dataSetId, Status: 201 }, ctx, 201);
        }
        if (method === "GET") {
          const list = this.service.listDataSets();
          return this.json({ DataSetSummaries: list.map(dataSetToJson), Status: 200 }, ctx);
        }
      }

      // --- DataSources ---
      const dataSourceMatch = path.match(/^\/accounts\/[^/]+\/data-sources\/([^/]+)$/);
      if (dataSourceMatch) {
        const dataSourceId = dataSourceMatch[1];
        if (method === "GET") {
          const ds = this.service.describeDataSource(dataSourceId);
          return this.json({ DataSource: dataSourceToJson(ds), Status: 200 }, ctx);
        }
        if (method === "DELETE") {
          const ds = this.service.deleteDataSource(dataSourceId);
          return this.json({ Arn: ds.arn, DataSourceId: ds.dataSourceId, Status: 200 }, ctx);
        }
      }

      const dataSourcesMatch = path.match(/^\/accounts\/[^/]+\/data-sources$/);
      if (dataSourcesMatch) {
        if (method === "POST") {
          const body = await req.json();
          const ds = this.service.createDataSource(body.DataSourceId, body.Name, body.Type, ctx.region);
          return this.json({ Arn: ds.arn, DataSourceId: ds.dataSourceId, CreationStatus: ds.status, Status: 201 }, ctx, 201);
        }
        if (method === "GET") {
          const list = this.service.listDataSources();
          return this.json({ DataSources: list.map(dataSourceToJson), Status: 200 }, ctx);
        }
      }

      // --- Dashboards ---
      const dashboardMatch = path.match(/^\/accounts\/[^/]+\/dashboards\/([^/]+)$/);
      if (dashboardMatch) {
        const dashboardId = dashboardMatch[1];
        if (method === "POST") {
          const body = await req.json();
          const d = this.service.createDashboard(body.DashboardId ?? dashboardId, body.Name, ctx.region);
          return this.json({ Arn: d.arn, DashboardId: d.dashboardId, CreationStatus: d.status, VersionArn: `${d.arn}/version/1`, Status: 201 }, ctx, 201);
        }
        if (method === "GET") {
          const d = this.service.describeDashboard(dashboardId);
          return this.json({ Dashboard: dashboardToJson(d), Status: 200 }, ctx);
        }
        if (method === "DELETE") {
          this.service.deleteDashboard(dashboardId);
          return this.json({ Status: 200, DashboardId: dashboardId }, ctx);
        }
      }

      const dashboardsMatch = path.match(/^\/accounts\/[^/]+\/dashboards$/);
      if (dashboardsMatch) {
        if (method === "GET") {
          const list = this.service.listDashboards();
          return this.json({ DashboardSummaryList: list.map(dashboardToJson), Status: 200 }, ctx);
        }
      }

      // --- Analyses ---
      const analysisMatch = path.match(/^\/accounts\/[^/]+\/analyses\/([^/]+)$/);
      if (analysisMatch) {
        const analysisId = analysisMatch[1];
        if (method === "POST") {
          const body = await req.json();
          const a = this.service.createAnalysis(body.AnalysisId ?? analysisId, body.Name, ctx.region);
          return this.json({ Arn: a.arn, AnalysisId: a.analysisId, CreationStatus: a.status, Status: 201 }, ctx, 201);
        }
        if (method === "GET") {
          const a = this.service.describeAnalysis(analysisId);
          return this.json({ Analysis: analysisToJson(a), Status: 200 }, ctx);
        }
      }

      const analysesMatch = path.match(/^\/accounts\/[^/]+\/analyses$/);
      if (analysesMatch) {
        if (method === "GET") {
          const list = this.service.listAnalyses();
          return this.json({ AnalysisSummaryList: list.map(analysisToJson), Status: 200 }, ctx);
        }
      }

      // --- Groups ---
      const groupMembersMatch = path.match(/^\/accounts\/[^/]+\/namespaces\/([^/]+)\/groups\/([^/]+)\/members$/);
      if (groupMembersMatch) {
        const [, namespace, groupName] = groupMembersMatch;
        if (method === "GET") {
          const members = this.service.listGroupMemberships(groupName, namespace);
          return this.json({
            GroupMemberList: members.map((m) => ({ MemberName: m, Arn: `arn:aws:quicksight:${ctx.region}:${ctx.accountId}:group/${namespace}/${groupName}/${m}` })),
            Status: 200,
          }, ctx);
        }
      }

      const groupMemberMatch = path.match(/^\/accounts\/[^/]+\/namespaces\/([^/]+)\/groups\/([^/]+)\/members\/([^/]+)$/);
      if (groupMemberMatch) {
        const [, namespace, groupName, memberName] = groupMemberMatch;
        if (method === "PUT") {
          const result = this.service.createGroupMembership(groupName, memberName, namespace);
          return this.json({ GroupMember: { MemberName: result.MemberName, Arn: `arn:aws:quicksight:${ctx.region}:${ctx.accountId}:group/${namespace}/${groupName}/${memberName}` }, Status: 200 }, ctx);
        }
      }

      const groupMatch = path.match(/^\/accounts\/[^/]+\/namespaces\/([^/]+)\/groups\/([^/]+)$/);
      if (groupMatch) {
        const [, namespace, groupName] = groupMatch;
        if (method === "GET") {
          const g = this.service.describeGroup(groupName, namespace);
          return this.json({ Group: groupToJson(g), Status: 200 }, ctx);
        }
        if (method === "DELETE") {
          this.service.deleteGroup(groupName, namespace);
          return this.json({ Status: 200 }, ctx);
        }
      }

      const groupsMatch = path.match(/^\/accounts\/[^/]+\/namespaces\/([^/]+)\/groups$/);
      if (groupsMatch) {
        const namespace = groupsMatch[1];
        if (method === "POST") {
          const body = await req.json();
          const g = this.service.createGroup(body.GroupName, body.Description, namespace, ctx.region);
          return this.json({ Group: groupToJson(g), Status: 200 }, ctx);
        }
        if (method === "GET") {
          const list = this.service.listGroups(namespace);
          return this.json({ GroupList: list.map(groupToJson), Status: 200 }, ctx);
        }
      }

      // --- Tags ---
      // SDK sends: POST /resources/{arn}/tags, DELETE /resources/{arn}/tags, GET /resources/{arn}/tags
      const resourceTagsMatch = path.match(/^\/resources\/(.+)\/tags$/);
      if (resourceTagsMatch) {
        const resourceArn = decodeURIComponent(resourceTagsMatch[1]);
        if (method === "POST") {
          const body = await req.json();
          this.service.tagResource(resourceArn, body.Tags ?? []);
          return this.json({ Status: 200 }, ctx);
        }
        if (method === "DELETE") {
          const tagKeys = url.searchParams.getAll("keys");
          this.service.untagResource(resourceArn, tagKeys);
          return this.json({ Status: 200 }, ctx);
        }
        if (method === "GET") {
          const tags = this.service.listTagsForResource(resourceArn);
          return this.json({ Tags: tags, Status: 200 }, ctx);
        }
      }

      return jsonErrorResponse(new AwsError("UnsupportedOperation", `QuickSight: ${method} ${path} not supported.`, 400), ctx.requestId);
    } catch (e) {
      if (e instanceof AwsError) return jsonErrorResponse(e, ctx.requestId);
      throw e;
    }
  }

  private json(data: any, ctx: RequestContext, status = 200): Response {
    return new Response(JSON.stringify(data), {
      status,
      headers: { "Content-Type": "application/json", "x-amzn-RequestId": ctx.requestId },
    });
  }
}

function dataSetToJson(ds: any) {
  return {
    DataSetId: ds.dataSetId,
    Name: ds.name,
    Arn: ds.arn,
    ImportMode: ds.importMode,
    CreatedTime: ds.createdTime,
    LastUpdatedTime: ds.lastUpdatedTime,
  };
}

function dataSourceToJson(ds: any) {
  return {
    DataSourceId: ds.dataSourceId,
    Name: ds.name,
    Arn: ds.arn,
    Type: ds.type,
    Status: ds.status,
    CreatedTime: ds.createdTime,
    LastUpdatedTime: ds.lastUpdatedTime,
  };
}

function dashboardToJson(d: any) {
  return {
    DashboardId: d.dashboardId,
    Name: d.name,
    Arn: d.arn,
    Version: { VersionNumber: d.versionNumber, Status: d.status },
    CreatedTime: d.createdTime,
    LastUpdatedTime: d.lastUpdatedTime,
    LastPublishedTime: d.lastPublishedTime,
  };
}

function analysisToJson(a: any) {
  return {
    AnalysisId: a.analysisId,
    Name: a.name,
    Arn: a.arn,
    Status: a.status,
    CreatedTime: a.createdTime,
    LastUpdatedTime: a.lastUpdatedTime,
  };
}

function groupToJson(g: any) {
  return {
    GroupName: g.groupName,
    Arn: g.arn,
    Description: g.description,
    PrincipalId: g.principalId,
  };
}
