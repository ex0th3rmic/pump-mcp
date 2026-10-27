import { describe, expect, test } from "bun:test";
import { filterOperations, listOperations, operationSnippet, resolveLocalRef } from "../../web/src/lib/openapi";

const document = {
  paths: {
    "/curve/{mint}": {
      get: { summary: "Read curve", tags: ["chain"], security: [], parameters: [{ name: "mint", in: "path", required: true }] },
    },
    "/trade": {
      post: { summary: "Build trade", requestBody: { content: { "application/json": { schema: { $ref: "#/components/schemas/Trade" } } } }, responses: { "200": { description: "ok" } } },
    },
  },
  components: { schemas: { Trade: { type: "object", properties: { mint: { type: "string" } } } } },
};

describe("OpenAPI inspector", () => {
  test("lists, filters, and generates method-aware execute templates", () => {
    const operations = listOperations(document);
    expect(operations.map((operation) => operation.key)).toEqual(["GET /curve/{mint}", "POST /trade"]);
    expect(filterOperations(operations, "chain")).toHaveLength(1);
    expect(filterOperations(operations, "POST")).toHaveLength(1);
    expect(operationSnippet(operations[0]!)).not.toContain("body:");
    expect(operationSnippet(operations[1]!)).toContain("body: {}");
  });

  test("resolves local schemas for request and response display", () => {
    const request = document.paths["/trade"]!.post.requestBody.content["application/json"].schema;
    expect(resolveLocalRef(document, request)).toEqual({ type: "object", properties: { mint: { type: "string" } } });
  });
});
