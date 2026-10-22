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

  it("cuts a 429 reset wait short at the deadline and then fails fast", async () => {
    let t = 0;
    const sleeps: number[] = [];
    let calls = 0;
    const http = new UwHttp({
      apiKey: "k",
      fetch: async () => {
        calls++;
        return new Response(JSON.stringify({ message: "slow down" }), { status: 429, headers: { "x-uw-req-per-minute-reset": "60000" } });
      },
      now: () => t,
      sleep: async (ms) => {
        sleeps.push(ms);
        t += ms;
      },
      deadlineAt: 2_000,
    });
    await expect(http.request("/api/x")).rejects.toThrow(/Time budget exceeded/);
    expect(calls).toBe(1);
    expect(sleeps).toEqual([2_001]);
  });
});
