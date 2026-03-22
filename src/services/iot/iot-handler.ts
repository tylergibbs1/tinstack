import type { RequestContext } from "../../core/context";
import { AwsError, jsonErrorResponse } from "../../core/errors";
import type { IoTService } from "./iot-service";

export class IoTHandler {
  constructor(private service: IoTService) {}

  async handleRoute(req: Request, ctx: RequestContext): Promise<Response> {
    const url = new URL(req.url);
    const path = url.pathname;
    const method = req.method;

    try {
      // --- Things ---

      // /things/{thingName} — CreateThing (POST), DescribeThing (GET), DeleteThing (DELETE), UpdateThing (PATCH)
      const thingMatch = path.match(/^\/things\/([^/]+)$/);
      if (thingMatch) {
        const thingName = decodeURIComponent(thingMatch[1]);
        if (method === "POST") {
          const body = await req.json().catch(() => ({}));
          const thing = this.service.createThing(
            thingName,
            body.thingTypeName,
            body.attributePayload?.attributes,
          );
          return this.json({
            thingName: thing.thingName,
            thingId: thing.thingId,
            thingArn: thing.thingArn,
          }, ctx);
        }
        if (method === "GET") {
          const thing = this.service.describeThing(thingName);
          return this.json({
            thingName: thing.thingName,
            thingId: thing.thingId,
            thingArn: thing.thingArn,
            thingTypeName: thing.thingTypeName,
            attributes: thing.attributes,
            version: thing.version,
            defaultClientId: thing.thingName,
          }, ctx);
        }
        if (method === "DELETE") {
          this.service.deleteThing(thingName);
          return this.json({}, ctx);
        }
        if (method === "PATCH") {
          const body = await req.json();
          this.service.updateThing(
            thingName,
            body.thingTypeName,
            body.attributePayload?.attributes,
            body.removeThingType,
          );
          return this.json({}, ctx);
        }
      }

      // GET /things
      if (path === "/things" && method === "GET") {
        const things = this.service.listThings();
        return this.json({
          things: things.map((t) => ({
            thingName: t.thingName,
            thingArn: t.thingArn,
            attributes: t.attributes,
            version: t.version,
          })),
        }, ctx);
      }

      // POST /things/{thingName} (CreateThing)
      // Note: IoT SDK uses path-style: the thingName is in the URL
      // Actually CreateThing is also a PUT in some SDK versions. Handle both via the thingMatch above for GET/DELETE/PATCH
      // For CreateThing via the SDK, it's actually a different path pattern
      // The AWS IoT SDK sends CreateThing as a REST call

      // --- Thing Types ---

      const thingTypeMatch = path.match(/^\/thing-types\/([^/]+)$/);
      if (thingTypeMatch) {
        const typeName = decodeURIComponent(thingTypeMatch[1]);
        if (method === "POST" || method === "PUT") {
          const body = await req.json().catch(() => ({}));
          const tt = this.service.createThingType(typeName, body.thingTypeProperties);
          return this.json({
            thingTypeName: tt.thingTypeName,
            thingTypeArn: tt.thingTypeArn,
            thingTypeId: tt.thingTypeId,
          }, ctx);
        }
      }

      if (path === "/thing-types" && method === "GET") {
        const types = this.service.listThingTypes();
        return this.json({
          thingTypes: types.map((t) => ({
            thingTypeName: t.thingTypeName,
            thingTypeArn: t.thingTypeArn,
            thingTypeProperties: t.thingTypeProperties,
          })),
        }, ctx);
      }

      // --- Thing Groups ---

      const thingGroupMatch = path.match(/^\/thing-groups\/([^/]+)$/);
      if (thingGroupMatch) {
        const groupName = decodeURIComponent(thingGroupMatch[1]);
        if (method === "POST" || method === "PUT") {
          const body = await req.json().catch(() => ({}));
          const tg = this.service.createThingGroup(groupName);
          return this.json({
            thingGroupName: tg.thingGroupName,
            thingGroupArn: tg.thingGroupArn,
            thingGroupId: tg.thingGroupId,
          }, ctx);
        }
      }

      if (path === "/thing-groups" && method === "GET") {
        const groups = this.service.listThingGroups();
        return this.json({
          thingGroups: groups.map((g) => ({
            groupName: g.thingGroupName,
            groupArn: g.thingGroupArn,
          })),
        }, ctx);
      }

      // PUT /thing-groups/addThingToThingGroup — AddThingToThingGroup
      if (path === "/thing-groups/addThingToThingGroup" && method === "PUT") {
        const body = await req.json();
        this.service.addThingToThingGroup(body.thingName, body.thingGroupName);
        return this.json({}, ctx);
      }

      // POST /target-policies/{policyName} — AttachPolicy
      const attachPolicyMatch = path.match(/^\/target-policies\/([^/]+)$/);
      if (attachPolicyMatch && (method === "POST" || method === "PUT")) {
        const policyName = decodeURIComponent(attachPolicyMatch[1]);
        const body = await req.json();
        this.service.attachPolicy(policyName, body.target);
        return this.json({}, ctx);
      }

      // POST /detach-policy/{policyName} — DetachPolicy
      const detachPolicyMatch = path.match(/^\/detach-policy\/([^/]+)$/);
      if (detachPolicyMatch && method === "POST") {
        const policyName = decodeURIComponent(detachPolicyMatch[1]);
        const body = await req.json();
        this.service.detachPolicy(policyName, body.target);
        return this.json({}, ctx);
      }

      // --- Policies ---

      const policyMatch = path.match(/^\/policies\/([^/]+)$/);
      if (policyMatch) {
        const policyName = decodeURIComponent(policyMatch[1]);
        if (method === "GET") {
          const policy = this.service.getPolicy(policyName);
          return this.json({
            policyName: policy.policyName,
            policyArn: policy.policyArn,
            policyDocument: policy.policyDocument,
            defaultVersionId: policy.policyVersionId,
          }, ctx);
        }
        if (method === "POST" || method === "PUT") {
          const body = await req.json();
          const policy = this.service.createPolicy(policyName, body.policyDocument);
          return this.json({
            policyName: policy.policyName,
            policyArn: policy.policyArn,
            policyDocument: policy.policyDocument,
            policyVersionId: policy.policyVersionId,
          }, ctx);
        }
        if (method === "DELETE") {
          this.service.deletePolicy(policyName);
          return this.json({}, ctx);
        }
      }

      if (path === "/policies" && method === "GET") {
        const policies = this.service.listPolicies();
        return this.json({
          policies: policies.map((p) => ({
            policyName: p.policyName,
            policyArn: p.policyArn,
          })),
        }, ctx);
      }

      // --- Topic Rules ---

      const topicRuleMatch = path.match(/^\/rules\/([^/]+)$/);
      if (topicRuleMatch) {
        const ruleName = decodeURIComponent(topicRuleMatch[1]);
        if (method === "GET") {
          const rule = this.service.getTopicRule(ruleName);
          return this.json({
            ruleArn: rule.ruleArn,
            rule: {
              ruleName: rule.ruleName,
              sql: rule.sql,
              description: rule.description,
              actions: rule.actions,
              ruleDisabled: rule.ruleDisabled,
              createdAt: rule.createdAt,
            },
          }, ctx);
        }
        if (method === "POST" || method === "PUT") {
          const body = await req.json();
          const rp = body.topicRulePayload ?? body;
          const rule = this.service.createTopicRule(
            ruleName,
            rp.sql,
            rp.actions,
            rp.description,
            rp.ruleDisabled,
          );
          return this.json({
            ruleName: rule.ruleName,
            ruleArn: rule.ruleArn,
          }, ctx);
        }
        if (method === "DELETE") {
          this.service.deleteTopicRule(ruleName);
          return this.json({}, ctx);
        }
      }

      if (path === "/rules" && method === "GET") {
        const rules = this.service.listTopicRules();
        return this.json({
          rules: rules.map((r) => ({
            ruleName: r.ruleName,
            ruleArn: r.ruleArn,
            ruleDisabled: r.ruleDisabled,
            createdAt: r.createdAt,
          })),
        }, ctx);
      }

      // --- Certificates ---

      if (path === "/certificates" && method === "POST") {
        const body = await req.json().catch(() => ({}));
        const setAsActive = url.searchParams.get("setAsActive") === "true" || body.setAsActive;
        const cert = this.service.createCertificateFromCsr(body.certificateSigningRequest ?? "mock-csr", !!setAsActive);
        return this.json({
          certificateId: cert.certificateId,
          certificateArn: cert.certificateArn,
          certificatePem: cert.certificatePem,
        }, ctx);
      }

      if (path === "/certificates" && method === "GET") {
        const certs = this.service.listCertificates();
        return this.json({
          certificates: certs.map((c) => ({
            certificateId: c.certificateId,
            certificateArn: c.certificateArn,
            status: c.status,
            creationDate: c.createdAt,
          })),
        }, ctx);
      }

      // --- Endpoint ---

      if (path === "/endpoint" && method === "GET") {
        const endpointType = url.searchParams.get("endpointType") ?? undefined;
        const address = this.service.describeEndpoint(endpointType);
        return this.json({ endpointAddress: address }, ctx);
      }

      return jsonErrorResponse(
        new AwsError("UnknownOperationException", `Unknown IoT operation: ${method} ${path}`, 400),
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
