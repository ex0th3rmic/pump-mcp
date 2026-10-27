export interface OpenApiDocument {
  info?: { title?: string; version?: string };
  paths?: Record<string, Record<string, unknown>>;
}

export interface ApiOperation {
  key: string;
  path: string;
  method: string;
  summary: string;
  description: string;
  tags: string[];
  deprecated: boolean;
  security?: unknown[];
  parameters?: Array<Record<string, unknown>>;
  requestBody?: Record<string, unknown>;
  responses?: Record<string, unknown>;
}

const METHODS = new Set(["get", "post", "put", "patch", "delete"]);

export function listOperations(document: OpenApiDocument): ApiOperation[] {
  const operations: ApiOperation[] = [];
  for (const [path, item] of Object.entries(document.paths ?? {})) {
    for (const [method, value] of Object.entries(item)) {
      if (!METHODS.has(method) || !value || typeof value !== "object") continue;
      const operation = value as Record<string, unknown>;
      operations.push({
        key: `${method.toUpperCase()} ${path}`,
        path,
        method: method.toUpperCase(),
        summary: typeof operation.summary === "string" ? operation.summary : "No summary",
        description: typeof operation.description === "string" ? operation.description : "",
        tags: Array.isArray(operation.tags) ? operation.tags.filter((tag): tag is string => typeof tag === "string") : [],
        deprecated: operation.deprecated === true,
        security: Array.isArray(operation.security) ? operation.security : undefined,
        parameters: Array.isArray(operation.parameters) ? operation.parameters as Array<Record<string, unknown>> : undefined,
        requestBody: operation.requestBody && typeof operation.requestBody === "object" ? operation.requestBody as Record<string, unknown> : undefined,
        responses: operation.responses && typeof operation.responses === "object" ? operation.responses as Record<string, unknown> : undefined,
      });
    }
  }
  return operations.sort((a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method));
}

export function filterOperations(operations: ApiOperation[], query: string): ApiOperation[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return operations;
  return operations.filter((operation) => [operation.key, operation.summary, operation.description, ...operation.tags]
    .join(" ").toLowerCase().includes(needle));
}

export function resolveLocalRef(document: OpenApiDocument, value: unknown, depth = 0): unknown {
  if (depth > 10 || !value || typeof value !== "object") return value;
  const ref = (value as { $ref?: unknown }).$ref;
  if (typeof ref !== "string" || !ref.startsWith("#/")) return value;
  const target = ref.slice(2).split("/").reduce<unknown>((current, part) => {
    if (!current || typeof current !== "object") return undefined;
    return (current as Record<string, unknown>)[part.replaceAll("~1", "/").replaceAll("~0", "~")];
  }, document);
  return target ? resolveLocalRef(document, target, depth + 1) : value;
}

export function operationSnippet(operation: ApiOperation): string {
  const lines = [
    "async () => codemode.request({",
    `  method: ${JSON.stringify(operation.method)},`,
    `  path: ${JSON.stringify(operation.path)},`,
    "  query: {},",
  ];
  if (["POST", "PUT", "PATCH"].includes(operation.method)) lines.push("  body: {},");
  lines.push("})");
  return lines.join("\n");
}
