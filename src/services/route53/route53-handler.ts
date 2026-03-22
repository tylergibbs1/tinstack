import type { RequestContext } from "../../core/context";
import { AwsError, xmlErrorResponse } from "../../core/errors";
import { XmlBuilder } from "../../core/xml";
import type { Route53Service, ResourceRecordSet } from "./route53-service";

const NS = "https://route53.amazonaws.com/doc/2013-04-01/";

export class Route53Handler {
  constructor(private service: Route53Service) {}

  async handleRoute(req: Request, ctx: RequestContext): Promise<Response> {
    const url = new URL(req.url);
    const path = url.pathname;
    const method = req.method;

    try {
      // GetChange: GET /2013-04-01/change/{id}
      const changeMatch = path.match(/^\/2013-04-01\/change\/(.+)$/);
      if (changeMatch && method === "GET") {
        return this.xml(
          new XmlBuilder()
            .start("GetChangeResponse", { xmlns: NS })
            .start("ChangeInfo")
            .elem("Id", `/change/${changeMatch[1]}`)
            .elem("Status", "INSYNC")
            .elem("SubmittedAt", new Date().toISOString())
            .end("ChangeInfo")
            .end("GetChangeResponse")
            .build(),
          ctx,
        );
      }

      // Tags: GET/POST /2013-04-01/tags/hostedzone/{id}
      const tagsMatch = path.match(/^\/2013-04-01\/tags\/hostedzone\/(.+)$/);
      if (tagsMatch) {
        const zoneId = tagsMatch[1];
        if (method === "GET") {
          return this.listTagsForResource(zoneId, ctx);
        }
        if (method === "POST") {
          const body = await req.text();
          return this.changeTagsForResource(zoneId, body, ctx);
        }
      }

      // ChangeResourceRecordSets: POST /2013-04-01/hostedzone/{id}/rrset
      const rrsetMatch = path.match(/^\/2013-04-01\/hostedzone\/([^/]+)\/rrset$/);
      if (rrsetMatch) {
        const zoneId = rrsetMatch[1];
        if (method === "POST") {
          const body = await req.text();
          return this.changeResourceRecordSets(zoneId, body, ctx);
        }
        if (method === "GET") {
          return this.listResourceRecordSets(zoneId, ctx);
        }
      }

      // Single zone: GET/DELETE /2013-04-01/hostedzone/{id}
      const zoneMatch = path.match(/^\/2013-04-01\/hostedzone\/([^/]+)$/);
      if (zoneMatch) {
        const zoneId = zoneMatch[1];
        if (method === "GET") {
          return this.getHostedZone(zoneId, ctx);
        }
        if (method === "DELETE") {
          this.service.deleteHostedZone(zoneId);
          return this.xml(
            new XmlBuilder()
              .start("DeleteHostedZoneResponse", { xmlns: NS })
              .start("ChangeInfo")
              .elem("Id", "/change/C0000000001")
              .elem("Status", "INSYNC")
              .elem("SubmittedAt", new Date().toISOString())
              .end("ChangeInfo")
              .end("DeleteHostedZoneResponse")
              .build(),
            ctx,
          );
        }
      }

      // List/Create hosted zones: GET/POST /2013-04-01/hostedzone
      if ((path === "/2013-04-01/hostedzone" || path === "/2013-04-01/hostedzone/") && method === "POST") {
        const body = await req.text();
        return this.createHostedZone(body, ctx);
      }

      if ((path === "/2013-04-01/hostedzone" || path === "/2013-04-01/hostedzone/") && method === "GET") {
        return this.listHostedZones(ctx);
      }

      return xmlErrorResponse(
        new AwsError("UnknownOperationException", `Unknown Route53 operation: ${method} ${path}`, 400),
        ctx.requestId,
      );
    } catch (e) {
      if (e instanceof AwsError) return xmlErrorResponse(e, ctx.requestId);
      throw e;
    }
  }

  private createHostedZone(body: string, ctx: RequestContext): Response {
    const name = this.extractXmlValue(body, "Name") ?? "";
    const callerReference = this.extractXmlValue(body, "CallerReference") ?? crypto.randomUUID();
    const comment = this.extractXmlValue(body, "Comment");

    const zone = this.service.createHostedZone(name, callerReference, comment);

    const xml = new XmlBuilder()
      .start("CreateHostedZoneResponse", { xmlns: NS })
      .start("HostedZone")
      .elem("Id", `/hostedzone/${zone.id}`)
      .elem("Name", zone.name)
      .elem("CallerReference", zone.callerReference);
    if (zone.comment) {
      xml.start("Config").elem("Comment", zone.comment).end("Config");
    }
    xml.elem("ResourceRecordSetCount", zone.resourceRecordSetCount)
      .end("HostedZone")
      .start("ChangeInfo")
      .elem("Id", "/change/C0000000001")
      .elem("Status", "INSYNC")
      .elem("SubmittedAt", new Date().toISOString())
      .end("ChangeInfo")
      .start("DelegationSet")
      .start("NameServers")
      .elem("NameServer", "ns-1.tinstack.local")
      .elem("NameServer", "ns-2.tinstack.local")
      .elem("NameServer", "ns-3.tinstack.local")
      .elem("NameServer", "ns-4.tinstack.local")
      .end("NameServers")
      .end("DelegationSet")
      .end("CreateHostedZoneResponse");

    return this.xml(xml.build(), ctx, 201);
  }

  private getHostedZone(zoneId: string, ctx: RequestContext): Response {
    const zone = this.service.getHostedZone(zoneId);

    const xml = new XmlBuilder()
      .start("GetHostedZoneResponse", { xmlns: NS })
      .start("HostedZone")
      .elem("Id", `/hostedzone/${zone.id}`)
      .elem("Name", zone.name)
      .elem("CallerReference", zone.callerReference);
    if (zone.comment) {
      xml.start("Config").elem("Comment", zone.comment).end("Config");
    }
    xml.elem("ResourceRecordSetCount", zone.resourceRecordSetCount)
      .end("HostedZone")
      .start("DelegationSet")
      .start("NameServers")
      .elem("NameServer", "ns-1.tinstack.local")
      .elem("NameServer", "ns-2.tinstack.local")
      .elem("NameServer", "ns-3.tinstack.local")
      .elem("NameServer", "ns-4.tinstack.local")
      .end("NameServers")
      .end("DelegationSet")
      .end("GetHostedZoneResponse");

    return this.xml(xml.build(), ctx);
  }

  private listHostedZones(ctx: RequestContext): Response {
    const zones = this.service.listHostedZones();

    const xml = new XmlBuilder()
      .start("ListHostedZonesResponse", { xmlns: NS })
      .start("HostedZones");

    for (const zone of zones) {
      xml.start("HostedZone")
        .elem("Id", `/hostedzone/${zone.id}`)
        .elem("Name", zone.name)
        .elem("CallerReference", zone.callerReference);
      if (zone.comment) {
        xml.start("Config").elem("Comment", zone.comment).end("Config");
      }
      xml.elem("ResourceRecordSetCount", zone.resourceRecordSetCount)
        .end("HostedZone");
    }

    xml.end("HostedZones")
      .elem("IsTruncated", false)
      .elem("MaxItems", 100)
      .end("ListHostedZonesResponse");

    return this.xml(xml.build(), ctx);
  }

  private changeResourceRecordSets(zoneId: string, body: string, ctx: RequestContext): Response {
    const changes: { action: string; recordSet: ResourceRecordSet }[] = [];

    // Parse Change blocks
    const changeRegex = /<Change>([\s\S]*?)<\/Change>/g;
    let changeMatch;
    while ((changeMatch = changeRegex.exec(body)) !== null) {
      const changeBlock = changeMatch[1];
      const action = this.extractXmlValue(changeBlock, "Action") ?? "CREATE";
      const name = this.extractXmlValue(changeBlock, "Name") ?? "";
      const type = this.extractXmlValue(changeBlock, "Type") ?? "";
      const ttlStr = this.extractXmlValue(changeBlock, "TTL");
      const ttl = ttlStr ? parseInt(ttlStr, 10) : undefined;

      const resourceRecords: { value: string }[] = [];
      const valueRegex = /<Value>([^<]+)<\/Value>/g;
      let valueMatch;
      while ((valueMatch = valueRegex.exec(changeBlock)) !== null) {
        resourceRecords.push({ value: valueMatch[1] });
      }

      changes.push({
        action,
        recordSet: { name: name.endsWith(".") ? name : name + ".", type, ttl, resourceRecords },
      });
    }

    const changeId = this.service.changeResourceRecordSets(zoneId, changes);

    const xml = new XmlBuilder()
      .start("ChangeResourceRecordSetsResponse", { xmlns: NS })
      .start("ChangeInfo")
      .elem("Id", `/change/${changeId}`)
      .elem("Status", "INSYNC")
      .elem("SubmittedAt", new Date().toISOString())
      .end("ChangeInfo")
      .end("ChangeResourceRecordSetsResponse");

    return this.xml(xml.build(), ctx);
  }

  private listResourceRecordSets(zoneId: string, ctx: RequestContext): Response {
    const records = this.service.listResourceRecordSets(zoneId);

    const xml = new XmlBuilder()
      .start("ListResourceRecordSetsResponse", { xmlns: NS })
      .start("ResourceRecordSets");

    for (const record of records) {
      xml.start("ResourceRecordSet")
        .elem("Name", record.name)
        .elem("Type", record.type);
      if (record.ttl !== undefined) xml.elem("TTL", record.ttl);
      xml.start("ResourceRecords");
      for (const rr of record.resourceRecords) {
        xml.start("ResourceRecord").elem("Value", rr.value).end("ResourceRecord");
      }
      xml.end("ResourceRecords").end("ResourceRecordSet");
    }

    xml.end("ResourceRecordSets")
      .elem("IsTruncated", false)
      .elem("MaxItems", 100)
      .end("ListResourceRecordSetsResponse");

    return this.xml(xml.build(), ctx);
  }

  private listTagsForResource(zoneId: string, ctx: RequestContext): Response {
    const tags = this.service.getTagsForResource(zoneId);

    const xml = new XmlBuilder()
      .start("ListTagsForResourceResponse", { xmlns: NS })
      .start("ResourceTagSet")
      .elem("ResourceType", "hostedzone")
      .elem("ResourceId", zoneId)
      .start("Tags");

    for (const [key, value] of Object.entries(tags)) {
      xml.start("Tag").elem("Key", key).elem("Value", value).end("Tag");
    }

    xml.end("Tags").end("ResourceTagSet").end("ListTagsForResourceResponse");
    return this.xml(xml.build(), ctx);
  }

  private changeTagsForResource(zoneId: string, body: string, ctx: RequestContext): Response {
    const addTags: { key: string; value: string }[] = [];
    const removeTagKeys: string[] = [];

    // Parse AddTags
    const addTagsBlock = body.match(/<AddTags>([\s\S]*?)<\/AddTags>/);
    if (addTagsBlock) {
      const tagRegex = /<Tag>([\s\S]*?)<\/Tag>/g;
      let tagMatch;
      while ((tagMatch = tagRegex.exec(addTagsBlock[1])) !== null) {
        const key = this.extractXmlValue(tagMatch[1], "Key") ?? "";
        const value = this.extractXmlValue(tagMatch[1], "Value") ?? "";
        addTags.push({ key, value });
      }
    }

    // Parse RemoveTagKeys
    const removeBlock = body.match(/<RemoveTagKeys>([\s\S]*?)<\/RemoveTagKeys>/);
    if (removeBlock) {
      const keyRegex = /<Key>([^<]+)<\/Key>/g;
      let keyMatch;
      while ((keyMatch = keyRegex.exec(removeBlock[1])) !== null) {
        removeTagKeys.push(keyMatch[1]);
      }
    }

    this.service.changeTagsForResource(zoneId, addTags, removeTagKeys);

    const xml = new XmlBuilder()
      .start("ChangeTagsForResourceResponse", { xmlns: NS })
      .end("ChangeTagsForResourceResponse");

    return this.xml(xml.build(), ctx);
  }

  private xml(body: string, ctx: RequestContext, status = 200): Response {
    return new Response(`<?xml version="1.0" encoding="UTF-8"?>${body}`, {
      status,
      headers: {
        "Content-Type": "application/xml",
        "x-amzn-RequestId": ctx.requestId,
      },
    });
  }

  private extractXmlValue(xml: string, tag: string): string | undefined {
    const match = new RegExp(`<${tag}>([^<]*)</${tag}>`).exec(xml);
    return match?.[1];
  }
}
