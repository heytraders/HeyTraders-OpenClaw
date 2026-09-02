import { describe, expect, it } from "vitest";

import { RequestContractError, normalizeHeyTradersRequest } from "./request-contract.js";

describe("normalizeHeyTradersRequest", () => {
  it("preserves UTF-8 structured arguments and trims the selector", () => {
    expect(
      normalizeHeyTradersRequest({
        command: "  docs search  ",
        args: { query: "이동평균 전략", filters: ["한글", "日本語"] },
      }),
    ).toEqual({
      command: "docs search",
      args: { query: "이동평균 전략", filters: ["한글", "日本語"] },
    });
  });

  it.each(["", "   ", "help\nstatus", `help${String.fromCharCode(0)}`])(
    "rejects an invalid selector %j",
    (command) => {
      expect(() => normalizeHeyTradersRequest({ command, args: {} })).toThrow(RequestContractError);
    },
  );

  it.each([null, [], "not-an-object", 1])("rejects non-object args: %j", (args) => {
    expect(() => normalizeHeyTradersRequest({ command: "help", args })).toThrow(RequestContractError);
  });

  it.each([
    { apiKey: "secret" },
    { token: "secret" },
    { access_token: "secret" },
    { nested: { refresh_token: "secret" } },
    { wallet: { privateKey: "secret" } },
    { localStorage: { session: "secret" } },
  ])("rejects credential-bearing keys: %j", (args) => {
    expect(() => normalizeHeyTradersRequest({ command: "exchange connect", args })).toThrow(
      /credential/i,
    );
  });

  it("allows public market-token identifiers without treating them as credentials", () => {
    expect(
      normalizeHeyTradersRequest({
        command: "market inspect",
        args: {
          tokenId: "1234567890",
          tokenSymbol: "YES",
          assetTokenAddress: "0x1234",
        },
      }),
    ).toEqual({
      command: "market inspect",
      args: {
        tokenId: "1234567890",
        tokenSymbol: "YES",
        assetTokenAddress: "0x1234",
      },
    });
  });

  it.each([
    JSON.parse('{"__proto__":{"polluted":true}}') as unknown,
    { nested: JSON.parse('{"constructor":{"prototype":{"polluted":true}}}') as unknown },
  ])("rejects prototype-polluting keys", (args) => {
    expect(() => normalizeHeyTradersRequest({ command: "help", args })).toThrow(
      /unsafe object key/i,
    );
  });
});
