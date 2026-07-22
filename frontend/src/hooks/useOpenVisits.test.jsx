import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import useOpenVisits from "./useOpenVisits";
import api from "../services/api";

vi.mock("../services/api", () => ({
  default: {
    get: vi.fn(),
  },
}));

describe("useOpenVisits", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    Object.defineProperty(document, "hidden", {
      configurable: true,
      value: false,
    });
  });

  it("carrega visitas abertas, faz polling e limpa intervalo ao desmontar", async () => {
    const setIntervalSpy = vi.spyOn(window, "setInterval").mockReturnValue(123);
    const clearIntervalSpy = vi.spyOn(window, "clearInterval").mockImplementation(() => {});
    const onError = vi.fn();
    api.get.mockResolvedValue({ data: { items: [{ id: 1 }] } });

    const { unmount } = renderHook(() => useOpenVisits({ onError }));

    await waitFor(() => expect(api.get).toHaveBeenCalledWith("/visits/open"));
    expect(setIntervalSpy).toHaveBeenCalledWith(expect.any(Function), 5000);

    await act(async () => {
      setIntervalSpy.mock.calls[0][0]();
      await Promise.resolve();
    });

    expect(api.get).toHaveBeenCalledTimes(2);

    unmount();

    expect(clearIntervalSpy).toHaveBeenCalledWith(123);
  });

  it("reporta erro e encerra loading inicial quando a carga falha", async () => {
    const onError = vi.fn();
    api.get.mockRejectedValue({ response: { data: { message: "Falha API" } } });

    const { result } = renderHook(() => useOpenVisits({ onError }));

    await act(async () => {
      await Promise.resolve();
    });

    expect(onError).toHaveBeenCalledWith("Falha API");
    expect(result.current.openVisits).toEqual([]);
    expect(result.current.initialLoadingOpenVisits).toBe(false);
  });
});
