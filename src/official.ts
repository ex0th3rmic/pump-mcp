/**
 * Official pump.fun Developer API (docs.pump.fun). Read-only social data: profiles, follow graph,
 * callouts/posts, leaderboards, wallet positions. Needs an approved organisation key (pf_live_...)
 * from https://developers.pump.fun. The public OpenAPI document is merged with the community spec so
 * one Code Mode server covers both; `matchOfficialPath` decides which upstream a request goes to.
 */

export const OFFICIAL_OPENAPI_URL = "https://docs.pump.fun/openapi.public.json";
export const OFFICIAL_API_ORIGIN = "https://api.pump.fun/v1";

export interface OfficialSpec {
  spec: Record<string, unknown>;
  /** servers[0].url of the fetched document (production). */
  origin: string | undefined;
  /** Path templates such as `/users/{id}` compiled to matchers. */
  matchers: Array<{ template: string; re: RegExp }>;
}

const HTTP_METHODS = new Set(["get", "post", "put", "patch", "delete"]);

export function compileMatchers(spec: Record<string, unknown>): Array<{ template: string; re: RegExp }> {
  const paths = (spec.paths ?? {}) as Record<string, unknown>;
  return Object.keys(paths).map((template) => {
    const re = new RegExp(
      "^" +
        template
          .split("/")
          .map((seg) => (/^\{[^}]+\}$/.test(seg) ? "[^/]+" : seg.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")))
          .join("/") +
        "$",
    );
    return { template, re };
  });
}

export function matchOfficialPath(matchers: OfficialSpec["matchers"], path: string): string | null {
  for (const m of matchers) if (m.re.test(path)) return m.template;
  return null;
}

export function prepareOfficialSpec(spec: Record<string, unknown>): OfficialSpec {
  const servers = spec.servers as Array<{ url?: string }> | undefined;
  return { spec, origin: servers?.[0]?.url, matchers: compileMatchers(spec) };
}

/**
 * Merge the official document with the community spec. Official paths win on collision (none today).
 * Community tags/paths are appended; the official info/servers/components are kept so $refs resolve.
 */
export function mergeSpecs(official: Record<string, unknown>, community: Record<string, unknown>): Record<string, unknown> {
  const oPaths = (official.paths ?? {}) as Record<string, unknown>;
  const cPaths = (community.paths ?? {}) as Record<string, unknown>;
  const paths: Record<string, unknown> = { ...cPaths, ...oPaths };
  // Community operations carry no security; mark them so the model does not expect a key for them.
  for (const [p, item] of Object.entries(cPaths)) {
    if (p in oPaths) continue;
    const copy: Record<string, unknown> = { ...(item as Record<string, unknown>) };
    for (const m of Object.keys(copy)) {
      if (HTTP_METHODS.has(m)) copy[m] = { ...(copy[m] as Record<string, unknown>), security: [] };
    }
    paths[p] = copy;
  }
  const oInfo = (official.info ?? {}) as Record<string, unknown>;
  const cInfo = (community.info ?? {}) as Record<string, unknown>;
  const oTags = (official.tags ?? []) as Array<{ name: string; description?: string }>;
  const cTags = (community.tags ?? []) as Array<{ name: string; description?: string }>;
  const seen = new Set(oTags.map((t) => t.name));
  return {
    ...official,
    info: {
      ...oInfo,
      title: "pump.fun (official Developer API + on-chain/trading routes)",
      description: [
        `OFFICIAL (needs pf_live_ key, scopes, 2 rps / 50k per day): ${String(oInfo.description ?? "")}`,
        `--- ADDITIONAL ROUTES served by this server, no pump.fun key needed: ${String(cInfo.description ?? "")}`,
        "Attribution: results are 'Data from pump.fun'.",
      ].join("\n\n"),
    },
    tags: [...oTags, ...cTags.filter((t) => !seen.has(t.name))],
    paths,
  };
}
