import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useNavigate } from "react-router-dom";
import TvDisplay from "./TvDisplay";
import { getTvWelcomeVisitors } from "../services/agendaService";
import { getPublicActiveTvContents } from "../services/tvContentService";

const originalImage = window.Image;

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

function playlistItem(id, fileUrl, type = "IMAGE") {
  return {
    id,
    title: `Conteúdo ${id}`,
    type,
    fileUrl,
    order: id,
    createdAt: "2026-01-01T00:00:00.000Z",
  };
}

function currentStageMedia() {
  return document.querySelector(".tvDisplay-stage .tvDisplay-media");
}

function mockVideoPlayback({ rejectPlay = false } = {}) {
  const play = vi
    .spyOn(window.HTMLMediaElement.prototype, "play")
    .mockImplementation(() => (rejectPlay ? Promise.reject(new Error("blocked")) : Promise.resolve()));
  const load = vi.spyOn(window.HTMLMediaElement.prototype, "load").mockImplementation(() => {});
  const pause = vi.spyOn(window.HTMLMediaElement.prototype, "pause").mockImplementation(() => {});

  return { load, pause, play };
}

async function flushAsyncUpdates() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("TvDisplay branch routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getTvWelcomeVisitors.mockResolvedValue([]);
    getPublicActiveTvContents.mockResolvedValue({ data: [] });
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    window.Image = originalImage;
    vi.restoreAllMocks();
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

    expect(screen.getByText("Carregando conteúdo")).toBeInTheDocument();
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

  it("preloads the next image without changing the active media", async () => {
    const createdImages = [];

    window.Image = class {
      constructor() {
        createdImages.push(this);
      }
    };

    getPublicActiveTvContents.mockResolvedValue({
      data: [playlistItem(1, "/first.jpg"), playlistItem(2, "/second.jpg")],
    });

    renderTvAt("/tv1");

    await flushAsyncUpdates();
    expect(document.querySelector('img[src$="/first.jpg"]')).toBeInTheDocument();

    expect(createdImages).toHaveLength(1);
    expect(createdImages[0].src).toBe("http://localhost:3001/second.jpg");
    expect(document.querySelector('img[src$="/second.jpg"]')).not.toBeInTheDocument();
  });

  it("preloads the next video as metadata without playing it", async () => {
    const { play } = mockVideoPlayback();
    const createdVideos = [];
    const originalCreateElement = document.createElement.bind(document);

    vi.spyOn(document, "createElement").mockImplementation((tagName, options) => {
      const element = originalCreateElement(tagName, options);
      if (String(tagName).toLowerCase() === "video") {
        createdVideos.push(element);
      }
      return element;
    });

    getPublicActiveTvContents.mockResolvedValue({
      data: [playlistItem(1, "/first.jpg"), playlistItem(2, "/next.mp4", "VIDEO")],
    });

    renderTvAt("/tv1");

    await waitFor(() => {
      expect(createdVideos).toHaveLength(1);
    });

    expect(createdVideos[0].preload).toBe("metadata");
    expect(createdVideos[0].muted).toBe(true);
    expect(createdVideos[0].src).toBe("http://localhost:3001/next.mp4");
    expect(play).not.toHaveBeenCalled();
  });

  it("does not advance when only image preload fails", async () => {
    const createdImages = [];

    window.Image = class {
      constructor() {
        createdImages.push(this);
      }
    };

    getPublicActiveTvContents.mockResolvedValue({
      data: [playlistItem(1, "/first.jpg"), playlistItem(2, "/broken.jpg")],
    });

    renderTvAt("/tv1");

    await waitFor(() => {
      expect(createdImages).toHaveLength(1);
    });

    createdImages[0].onerror?.();

    expect(document.querySelector('img[src$="/first.jpg"]')).toBeInTheDocument();
    expect(document.querySelector('img[src$="/broken.jpg"]')).not.toBeInTheDocument();
  });

  it("keeps image playback at 10000 ms before advancing", async () => {
    vi.useFakeTimers();
    getPublicActiveTvContents.mockResolvedValue({
      data: [playlistItem(1, "/first.jpg"), playlistItem(2, "/second.jpg")],
    });

    renderTvAt("/tv1");

    await flushAsyncUpdates();
    expect(document.querySelector('img[src$="/first.jpg"]')).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(9999);
    });

    expect(document.querySelector('img[src$="/first.jpg"]')).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });

    expect(document.querySelector('img[src$="/second.jpg"]')).toBeInTheDocument();
  });

  it("advances video by ended and not by the image timer", async () => {
    vi.useFakeTimers();
    mockVideoPlayback();
    getPublicActiveTvContents.mockResolvedValue({
      data: [playlistItem(1, "/video.mp4", "VIDEO"), playlistItem(2, "/next.jpg")],
    });

    renderTvAt("/tv1");

    await flushAsyncUpdates();
    expect(document.querySelector('video[src$="/video.mp4"]')).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10000);
    });

    const video = document.querySelector('video[src$="/video.mp4"]');
    expect(video).toBeInTheDocument();

    fireEvent.ended(video);

    expect(document.querySelector('img[src$="/next.jpg"]')).toBeInTheDocument();
  });

  it("advances only once for repeated active media errors", async () => {
    getPublicActiveTvContents.mockResolvedValue({
      data: [
        playlistItem(1, "/first.jpg"),
        playlistItem(2, "/second.jpg"),
        playlistItem(3, "/third.jpg"),
      ],
    });

    renderTvAt("/tv1");

    await waitFor(() => {
      expect(document.querySelector('img[src$="/first.jpg"]')).toBeInTheDocument();
    });

    const first = currentStageMedia();
    fireEvent.error(first);
    fireEvent.error(first);

    expect(document.querySelector('img[src$="/second.jpg"]')).toBeInTheDocument();
    expect(document.querySelector('img[src$="/third.jpg"]')).not.toBeInTheDocument();
  });

  it("uses the 5000 ms autoplay fallback when video play is rejected", async () => {
    vi.useFakeTimers();
    mockVideoPlayback({ rejectPlay: true });
    getPublicActiveTvContents.mockResolvedValue({
      data: [playlistItem(1, "/video.mp4", "VIDEO"), playlistItem(2, "/next.jpg")],
    });

    renderTvAt("/tv1");

    await flushAsyncUpdates();
    expect(document.querySelector('video[src$="/video.mp4"]')).toBeInTheDocument();

    await act(async () => {
      await Promise.resolve();
      await vi.advanceTimersByTimeAsync(4999);
    });

    expect(document.querySelector('video[src$="/video.mp4"]')).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });

    expect(document.querySelector('img[src$="/next.jpg"]')).toBeInTheDocument();
  });

  it("does not remount current media when polling returns the same playlist", async () => {
    vi.useFakeTimers();
    mockVideoPlayback();
    const playlist = [playlistItem(1, "/video.mp4", "VIDEO"), playlistItem(2, "/next.jpg")];
    getPublicActiveTvContents.mockResolvedValue({ data: playlist });

    renderTvAt("/tv1");

    await flushAsyncUpdates();
    expect(document.querySelector('video[src$="/video.mp4"]')).toBeInTheDocument();

    const initialVideo = currentStageMedia();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60000);
    });

    expect(getPublicActiveTvContents).toHaveBeenCalledTimes(2);

    expect(currentStageMedia()).toBe(initialVideo);
  });
});
