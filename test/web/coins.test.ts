import { describe, expect, test } from "bun:test";
import { curveQueryCode, parseMints } from "../../web/src/lib/coins";

const MINT = "9BB6NFEcjBCtnNLFko2FqVQBq8HHM13kCyYcdQbgpump";

describe("coin explorer helpers", () => {
  test("parses and deduplicates up to eight base58 mints", () => {
    expect(parseMints(`${MINT}, ${MINT}`)).toEqual([MINT]);
    expect(() => parseMints("not-a-key")).toThrow("Invalid base58 mint");
    expect(() => parseMints("")).toThrow("at least one");
    expect(() => parseMints(Array.from({ length: 9 }, (_, index) => `${MINT.slice(0, -1)}${"123456789"[index]}`).join("\n"))).toThrow("up to eight");
  });

  test("batches reads with allSettled and validated quote parameters", () => {
    const code = curveQueryCode([MINT], "0.25", "1000");
    expect(code).toContain("Promise.allSettled");
    expect(code).toContain('{"buyAmount":0.25,"sellTokens":1000}');
    expect(code).toContain(MINT);
    expect(() => curveQueryCode([MINT], "-1")).toThrow("positive number");
    expect(() => curveQueryCode([MINT], "", "nope")).toThrow("positive number");
  });
});
