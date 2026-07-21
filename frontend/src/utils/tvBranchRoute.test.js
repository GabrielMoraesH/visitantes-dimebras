import { describe, expect, it } from "vitest";
import { resolveTvBranchId } from "./tvBranchRoute";

describe("resolveTvBranchId", () => {
  it.each([
    ["/tv1", 1],
    ["/tv2", 2],
    ["/tv3", 3],
    ["/tv5", 5],
    ["/tv6", 6],
  ])("accepts short TV route %s", (pathname, expectedBranchId) => {
    expect(resolveTvBranchId({ pathname, search: "" })).toEqual({
      branchId: expectedBranchId,
      source: "route",
    });
  });

  it.each([
    "/tv4",
    "/tv0",
    "/tv-1",
    "/tv999",
    "/tvabc",
    "/tv1abc",
    "/tv01",
    "/tv02",
    "/tv05",
    "/tv001",
    "/tv00",
  ])(
    "rejects invalid short TV route %s",
    (pathname) => {
      expect(resolveTvBranchId({ pathname, search: "" })).toEqual({
        branchId: undefined,
        source: "route",
      });
    }
  );

  it.each([
    ["?branchId=1", 1],
    ["?branchId=2", 2],
    ["?branchId=3", 3],
    ["?branchId=5", 5],
    ["?branchId=6", 6],
  ])("keeps legacy query URL %s working", (search, expectedBranchId) => {
    expect(resolveTvBranchId({ pathname: "/tv", search })).toEqual({
      branchId: expectedBranchId,
      source: "query",
    });
  });

  it.each([
    "?branchId=4",
    "?branchId=abc",
    "?branchId=999",
    "?branchId=01",
    "?branchId=02",
    "?branchId=05",
    "?branchId=001",
    "?branchId=1.0",
    "?branchId=+1",
    "?branchId=%201",
    "?branchId=1%20",
    "",
  ])(
    "does not silently fall back to branch 1 for invalid legacy URL %s",
    (search) => {
      expect(resolveTvBranchId({ pathname: "/tv", search })).toEqual({
        branchId: undefined,
        source: search ? "query" : "missing",
      });
    }
  );

  it("prioritizes the short route over a conflicting query string", () => {
    expect(resolveTvBranchId({ pathname: "/tv2", search: "?branchId=1" })).toEqual({
      branchId: 2,
      source: "route",
    });
  });

  it("prioritizes a valid short route over a non-canonical query string", () => {
    expect(resolveTvBranchId({ pathname: "/tv2", search: "?branchId=01" })).toEqual({
      branchId: 2,
      source: "route",
    });
  });

  it("does not use a valid query string when the short route value is invalid", () => {
    expect(resolveTvBranchId({ pathname: "/tv4", search: "?branchId=1" })).toEqual({
      branchId: undefined,
      source: "route",
    });
  });
});
