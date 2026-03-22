import type { RequestContext } from "../../core/context";
import { AwsError, jsonErrorResponse } from "../../core/errors";
import type { GuardDutyService } from "./guardduty-service";

export class GuardDutyHandler {
  constructor(private service: GuardDutyService) {}

  async handleRoute(req: Request, ctx: RequestContext): Promise<Response> {
    const url = new URL(req.url);
    const path = url.pathname;
    const method = req.method;

    try {
      // --- Detectors ---

      // POST /detector
      if (path === "/detector" && method === "POST") {
        const body = await req.json();
        const detectorId = this.service.createDetector(
          body.enable ?? true,
          body.findingPublishingFrequency,
          body.dataSources,
          body.tags,
          body.features,
          ctx.region,
        );
        return this.json({ detectorId }, ctx);
      }

      // GET /detector
      if (path === "/detector" && method === "GET") {
        const detectorIds = this.service.listDetectors();
        return this.json({ detectorIds }, ctx);
      }

      // GET /detector/{detectorId}
      const detectorGetMatch = path.match(/^\/detector\/([^/]+)$/);
      if (detectorGetMatch && method === "GET") {
        const detector = this.service.getDetector(detectorGetMatch[1]);
        return this.json(detectorToJson(detector), ctx);
      }

      // POST /detector/{detectorId} (UpdateDetector)
      const detectorUpdateMatch = path.match(/^\/detector\/([^/]+)$/);
      if (detectorUpdateMatch && method === "POST") {
        const body = await req.json();
        this.service.updateDetector(
          detectorUpdateMatch[1],
          body.enable,
          body.findingPublishingFrequency,
          body.dataSources,
          body.features,
        );
        return this.json({}, ctx);
      }

      // DELETE /detector/{detectorId}
      const detectorDeleteMatch = path.match(/^\/detector\/([^/]+)$/);
      if (detectorDeleteMatch && method === "DELETE") {
        this.service.deleteDetector(detectorDeleteMatch[1]);
        return this.json({}, ctx);
      }

      // --- Filters ---

      // POST /detector/{detectorId}/filter
      const filterCreateMatch = path.match(/^\/detector\/([^/]+)\/filter$/);
      if (filterCreateMatch && method === "POST") {
        const body = await req.json();
        const name = this.service.createFilter(
          filterCreateMatch[1],
          body.name,
          body.action,
          body.description,
          body.findingCriteria,
          body.rank,
        );
        return this.json({ name }, ctx);
      }

      // GET /detector/{detectorId}/filter
      const filterListMatch = path.match(/^\/detector\/([^/]+)\/filter$/);
      if (filterListMatch && method === "GET") {
        const filterNames = this.service.listFilters(filterListMatch[1]);
        return this.json({ filterNames }, ctx);
      }

      // GET /detector/{detectorId}/filter/{filterName}
      const filterGetMatch = path.match(/^\/detector\/([^/]+)\/filter\/([^/]+)$/);
      if (filterGetMatch && method === "GET") {
        const filter = this.service.getFilter(filterGetMatch[1], filterGetMatch[2]);
        return this.json({
          name: filter.name,
          action: filter.action,
          description: filter.description,
          findingCriteria: filter.findingCriteria,
          rank: filter.rank,
        }, ctx);
      }

      // DELETE /detector/{detectorId}/filter/{filterName}
      const filterDeleteMatch = path.match(/^\/detector\/([^/]+)\/filter\/([^/]+)$/);
      if (filterDeleteMatch && method === "DELETE") {
        this.service.deleteFilter(filterDeleteMatch[1], filterDeleteMatch[2]);
        return this.json({}, ctx);
      }

      // --- IPSets ---

      // POST /detector/{detectorId}/ipset
      const ipsetCreateMatch = path.match(/^\/detector\/([^/]+)\/ipset$/);
      if (ipsetCreateMatch && method === "POST") {
        const body = await req.json();
        const ipSetId = this.service.createIPSet(
          ipsetCreateMatch[1],
          body.name,
          body.format,
          body.location,
          body.activate,
          body.tags,
        );
        return this.json({ ipSetId }, ctx);
      }

      // GET /detector/{detectorId}/ipset
      const ipsetListMatch = path.match(/^\/detector\/([^/]+)\/ipset$/);
      if (ipsetListMatch && method === "GET") {
        const ipSetIds = this.service.listIPSets(ipsetListMatch[1]);
        return this.json({ ipSetIds }, ctx);
      }

      // GET /detector/{detectorId}/ipset/{ipSetId}
      const ipsetGetMatch = path.match(/^\/detector\/([^/]+)\/ipset\/([^/]+)$/);
      if (ipsetGetMatch && method === "GET") {
        const ipSet = this.service.getIPSet(ipsetGetMatch[1], ipsetGetMatch[2]);
        return this.json({
          name: ipSet.name,
          format: ipSet.format,
          location: ipSet.location,
          status: ipSet.status,
          tags: ipSet.tags,
        }, ctx);
      }

      // DELETE /detector/{detectorId}/ipset/{ipSetId}
      const ipsetDeleteMatch = path.match(/^\/detector\/([^/]+)\/ipset\/([^/]+)$/);
      if (ipsetDeleteMatch && method === "DELETE") {
        this.service.deleteIPSet(ipsetDeleteMatch[1], ipsetDeleteMatch[2]);
        return this.json({}, ctx);
      }

      // --- ThreatIntelSets ---

      // POST /detector/{detectorId}/threatintelset
      const tisCreateMatch = path.match(/^\/detector\/([^/]+)\/threatintelset$/);
      if (tisCreateMatch && method === "POST") {
        const body = await req.json();
        const threatIntelSetId = this.service.createThreatIntelSet(
          tisCreateMatch[1],
          body.name,
          body.format,
          body.location,
          body.activate,
          body.tags,
        );
        return this.json({ threatIntelSetId }, ctx);
      }

      // --- Findings ---

      // POST /detector/{detectorId}/findings
      const findingsListMatch = path.match(/^\/detector\/([^/]+)\/findings$/);
      if (findingsListMatch && method === "POST") {
        const findingIds = this.service.listFindings(findingsListMatch[1]);
        return this.json({ findingIds }, ctx);
      }

      // POST /detector/{detectorId}/findings/get
      const findingsGetMatch = path.match(/^\/detector\/([^/]+)\/findings\/get$/);
      if (findingsGetMatch && method === "POST") {
        const body = await req.json();
        const findings = this.service.getFindings(findingsGetMatch[1], body.findingIds ?? []);
        return this.json({
          findings: findings.map((f) => ({
            id: f.id,
            type: f.type,
            severity: f.severity,
            title: f.title,
            description: f.description,
            accountId: f.accountId,
            region: f.region,
            createdAt: f.createdAt,
            updatedAt: f.updatedAt,
          })),
        }, ctx);
      }

      // POST /detector/{detectorId}/findings/archive
      const findingsArchiveMatch = path.match(/^\/detector\/([^/]+)\/findings\/archive$/);
      if (findingsArchiveMatch && method === "POST") {
        const body = await req.json();
        this.service.archiveFindings(findingsArchiveMatch[1], body.findingIds ?? []);
        return this.json({}, ctx);
      }

      // POST /detector/{detectorId}/findings/unarchive
      const findingsUnarchiveMatch = path.match(/^\/detector\/([^/]+)\/findings\/unarchive$/);
      if (findingsUnarchiveMatch && method === "POST") {
        const body = await req.json();
        this.service.unarchiveFindings(findingsUnarchiveMatch[1], body.findingIds ?? []);
        return this.json({}, ctx);
      }

      return jsonErrorResponse(
        new AwsError("UnknownOperationException", `Unknown GuardDuty operation: ${method} ${path}`, 404),
        ctx.requestId,
      );
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

function detectorToJson(detector: any) {
  return {
    createdAt: detector.createdAt,
    findingPublishingFrequency: detector.findingPublishingFrequency,
    serviceRole: detector.serviceRole,
    status: detector.status,
    updatedAt: detector.updatedAt,
    tags: detector.tags,
    features: detector.features,
  };
}
