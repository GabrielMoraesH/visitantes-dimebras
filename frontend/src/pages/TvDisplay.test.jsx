import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useNavigate } from "react-router-dom";
import TvDisplay from "./TvDisplay";
import { getTvWelcomeVisitors } from "../services/agendaService";
import { getPublicActiveTvContents } from "../services/tvContentService";

vi.mock("../services/agendaService", () => ({
  getTvWelcomeVisitors: vi.fn(),
}));

vi.mock("../services/tvContentService", () => ({
  getPublicActiveTvContents: vi.fn(),
}));

function renderTvAt(path) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/tv" element={<TvDisplay />} />
        <Route path="*" element={<TvDisplay />} />
      </Routes>
    </MemoryRouter>
  );
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });

  return { promise, resolve, reject };
}

function NavigateTvDisplay() {
  const navigate = useNavigate();

  return (
    <>
      <button type="button" onClick={() => navigate("/tv1")}>
        Ir TV 1
      </button>
      <button type="button" onClick={() => navigate("/tv2")}>
        Ir TV 2
      </button>
      <TvDisplay />
    </>
  );
}

function renderNavigableTvAt(path) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/tv" element={<NavigateTvDisplay />} />
        <Route path="*" element={<NavigateTvDisplay />} />
      </Routes>
    </MemoryRouter>
  );
}

function playlistItem(id, fileUrl) {
  return {
    id,
    title: `Conteudo ${id}`,
    type: "IMAGE",
    fileUrl,
    order: id,
    createdAt: "2026-01-01T00:00:00.000Z",
  };
}

describe("TvDisplay branch routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getTvWelcomeVisitors.mockResolvedValue([]);
    getPublicActiveTvContents.mockResolvedValue({ data: [] });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it.each([
    ["/tv1", 1],
    ["/tv2", 2],
    ["/tv3", 3],
    ["/tv5", 5],
    ["/tv6", 6],
    ["/tv?branchId=1", 1],
    ["/tv?branchId=2", 2],
    ["/tv?branchId=3", 3],
    ["/tv?branchId=5", 5],
    ["/tv?branchId=6", 6],
  ])("loads public TV data for %s", async (path, expectedBranchId) => {
    renderTvAt(path);

    await waitFor(() => {
      expect(getPublicActiveTvContents).toHaveBeenCalledWith(expectedBranchId);
      expect(getTvWelcomeVisitors).toHaveBeenCalledWith(expectedBranchId);
    });
  });

  it.each([
    "/tv4",
    "/tv0",
    "/tv-1",
    "/tv999",
    "/tvabc",
    "/tv1abc",
    "/tv",
    "/tv?branchId=4",
    "/tv?branchId=abc",
  ])("does not load data for invalid TV URL %s", async (path) => {
    renderTvAt(path);

    expect(await screen.findByText(/Filial/)).toBeInTheDocument();
    expect(getPublicActiveTvContents).not.toHaveBeenCalled();
    expect(getTvWelcomeVisitors).not.toHaveBeenCalled();
  });

  it("gives the short route priority over a conflicting legacy query string", async () => {
    renderTvAt("/tv2?branchId=1");

    await waitFor(() => {
      expect(getPublicActiveTvContents).toHaveBeenCalledWith(2);
      expect(getTvWelcomeVisitors).toHaveBeenCalledWith(2);
    });
    expect(getPublicActiveTvContents).not.toHaveBeenCalledWith(1);
    expect(getTvWelcomeVisitors).not.toHaveBeenCalledWith(1);
  });

  it("clears previous branch content while loading after client-side navigation", async () => {
    const branchTwoPlaylist = deferred();

    getTvWelcomeVisitors.mockResolvedValue([]);
    getPublicActiveTvContents.mockImplementation((branchId) => {
      if (branchId === 1) {
        return Promise.resolve({ data: [playlistItem(1, "/branch-1.jpg")] });
      }

      return branchTwoPlaylist.promise;
    });

    renderNavigableTvAt("/tv1");

    await waitFor(() => {
      expect(document.querySelector('img[src$="/branch-1.jpg"]')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Ir TV 2" }));

    expect(screen.getByText("Carregando conteudo")).toBeInTheDocument();
    expect(document.querySelector('img[src$="/branch-1.jpg"]')).not.toBeInTheDocument();

    branchTwoPlaylist.resolve({ data: [playlistItem(2, "/branch-2.jpg")] });

    await waitFor(() => {
      expect(document.querySelector('img[src$="/branch-2.jpg"]')).toBeInTheDocument();
    });
    expect(document.querySelector('img[src$="/branch-1.jpg"]')).not.toBeInTheDocument();
  });

  it("ignores delayed responses from a previous branch and keeps polling on the current branch", async () => {
    vi.useFakeTimers();

    const branchOnePlaylist = deferred();
    const branchTwoPlaylist = deferred();

    getTvWelcomeVisitors.mockResolvedValue([]);
    getPublicActiveTvContents.mockImplementation((branchId) => {
      if (branchId === 1) return branchOnePlaylist.promise;
      if (branchId === 2) return branchTwoPlaylist.promise;
      return Promise.resolve({ data: [] });
    });

    const { unmount } = renderNavigableTvAt("/tv1");

    expect(getPublicActiveTvContents).toHaveBeenCalledWith(1);

    fireEvent.click(screen.getByRole("button", { name: "Ir TV 2" }));

    expect(getPublicActiveTvContents).toHaveBeenCalledWith(2);

    await act(async () => {
      branchTwoPlaylist.resolve({ data: [playlistItem(2, "/branch-2.jpg")] });
      await Promise.resolve();
    });

    expect(document.querySelector('img[src$="/branch-2.jpg"]')).toBeInTheDocument();

    await act(async () => {
      branchOnePlaylist.resolve({ data: [playlistItem(1, "/branch-1.jpg")] });
      await Promise.resolve();
    });

    expect(document.querySelector('img[src$="/branch-2.jpg"]')).toBeInTheDocument();
    expect(document.querySelector('img[src$="/branch-1.jpg"]')).not.toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60000);
    });

    expect(getPublicActiveTvContents).toHaveBeenCalledTimes(3);
    expect(getPublicActiveTvContents).toHaveBeenLastCalledWith(2);

    unmount();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60000);
    });

    expect(getPublicActiveTvContents).toHaveBeenCalledTimes(3);
  });
});
