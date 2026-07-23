import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import useVisitorRegistrationMedia from "./useVisitorRegistrationMedia";

describe("useVisitorRegistrationMedia", () => {
  let createObjectURL;
  let revokeObjectURL;

  beforeEach(() => {
    createObjectURL = vi.fn((file) => `blob:${file.name}`);
    revokeObjectURL = vi.fn();

    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: createObjectURL,
    });

    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: revokeObjectURL,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("revoga object URLs ao trocar arquivo, remover arquivo e desmontar", () => {
    const { result, unmount } = renderHook(() => useVisitorRegistrationMedia());
    const firstPhoto = new File(["first"], "first.jpg", { type: "image/jpeg" });
    const secondPhoto = new File(["second"], "second.jpg", { type: "image/jpeg" });
    const docFront = new File(["front"], "front.jpg", { type: "image/jpeg" });

    act(() => {
      result.current.setMediaFile("photo", firstPhoto);
    });

    expect(result.current.photo).toBe(firstPhoto);
    expect(result.current.photoPreview).toBe("blob:first.jpg");
    expect(revokeObjectURL).not.toHaveBeenCalled();

    act(() => {
      result.current.setMediaFile("photo", secondPhoto);
    });

    expect(result.current.photo).toBe(secondPhoto);
    expect(result.current.photoPreview).toBe("blob:second.jpg");
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:first.jpg");

    act(() => {
      result.current.setMediaFile("docFront", docFront);
    });

    act(() => {
      result.current.clearMediaFile("photo");
    });

    expect(result.current.photo).toBeNull();
    expect(result.current.photoPreview).toBe("");
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:second.jpg");

    unmount();

    expect(revokeObjectURL).toHaveBeenCalledWith("blob:front.jpg");
  });
});
