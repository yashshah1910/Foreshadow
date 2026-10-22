import { describe, expect, it } from "vitest";
import { UwHttp } from "../src/http";
import { UwApiError } from "../src/errors";

describe("UwHttp deadline", () => {
  it("fails fast once the deadline has passed, without calling fetch", async () => {
    let calls = 0;
    const http = new UwHttp({
      apiKey: "k",
      fetch: async () => {
        calls++;
        return new Response(JSON.stringify({ data: [] }), { status: 200 });
      },
      now: () => 2_000,
      sleep: async () => {},
      deadlineAt: 1_000,
    });
    await expect(http.request("/api/x")).rejects.toBeInstanceOf(UwApiError);
    expect(calls).toBe(0);
  });

  it("works normally before the deadline", async () => {
    const http = new UwHttp({
      apiKey: "k",
      fetch: async () => new Response(JSON.stringify({ data: [1] }), { status: 200 }),
      now: () => 500,
      sleep: async () => {},
      deadlineAt: 1_000,
    });
    await expect(http.request("/api/x")).resolves.toEqual([1]);
  });
});
