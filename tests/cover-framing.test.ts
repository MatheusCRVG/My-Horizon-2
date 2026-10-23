import { describe, expect, it } from "vitest";
import {
  coverFrame,
  MAX_COVER_ZOOM,
  MIN_COVER_ZOOM,
  panCover,
  resetCoverFrame,
  transformCover,
  zoomCover,
  type ImageFrame,
  type Point,
  type Size,
} from "../src/core/cover-framing";
import { validateCover, type Cover } from "../src/core/horizons";
import { compressCover } from "../src/components/HorizonCover";

const cover = (patch: Partial<Cover> = {}): Cover => ({
  type: "gallery",
  image: "travel-coast",
  framing: "focal",
  x: 50,
  y: 50,
  zoom: 1,
  ...patch,
});
const box = { width: 400, height: 300 };
const image = { width: 1200, height: 800 };
const nearFrame = (actual: ImageFrame, expected: ImageFrame) => {
  for (const key of ["width", "height", "left", "top"] as const)
    expect(actual[key]).toBeCloseTo(expected[key], 8);
};
const covers = (frame: ImageFrame, area: Size) => {
  expect(Object.values(frame).every(Number.isFinite)).toBe(true);
  expect(frame.width).toBeGreaterThanOrEqual(area.width - 1e-7);
  expect(frame.height).toBeGreaterThanOrEqual(area.height - 1e-7);
  expect(frame.left).toBeLessThanOrEqual(1e-7);
  expect(frame.top).toBeLessThanOrEqual(1e-7);
  expect(frame.left + frame.width).toBeGreaterThanOrEqual(area.width - 1e-7);
  expect(frame.top + frame.height).toBeGreaterThanOrEqual(area.height - 1e-7);
};
const fractionAt = (point: Point, frame: ImageFrame) => ({
  x: (point.x - frame.left) / frame.width,
  y: (point.y - frame.top) / frame.height,
});

describe("cover geometry without distortion or uncovered edges", () => {
  it("fits a landscape image and crops only the necessary horizontal overflow", () => {
    const frame = coverFrame(cover(), box, image);
    nearFrame(frame, { width: 450, height: 300, left: -25, top: 0 });
    expect(frame.width / frame.height).toBe(image.width / image.height);
    covers(frame, box);
  });
  it("fits a portrait image and crops only the necessary vertical overflow", () => {
    const portrait = { width: 800, height: 1200 };
    const frame = coverFrame(cover(), box, portrait);
    nearFrame(frame, { width: 400, height: 600, left: 0, top: -150 });
    expect(frame.width / frame.height).toBe(portrait.width / portrait.height);
    covers(frame, box);
  });
  it("uses the minimal full-cover scale for wide, tall, square and matching aspect ratios", () => {
    for (const natural of [
      image,
      { width: 800, height: 1200 },
      { width: 1000, height: 1000 },
      { width: 1600, height: 400 },
      { width: 1600, height: 1200 },
    ]) {
      const frame = coverFrame(cover(), box, natural);
      covers(frame, box);
      expect(
        Math.min(frame.width / box.width, frame.height / box.height),
      ).toBeCloseTo(1, 10);
      expect(frame.width / frame.height).toBeCloseTo(
        natural.width / natural.height,
        10,
      );
    }
  });
  it("clamps large pans against all four edges instead of revealing empty space", () => {
    const c = cover({ zoom: 3 });
    const start = coverFrame(c, box, image);
    for (const delta of [
      { x: 1e5, y: 1e5 },
      { x: -1e5, y: -1e5 },
      { x: 1e5, y: -1e5 },
      { x: -1e5, y: 1e5 },
    ]) {
      const next = panCover(c, box, image, delta),
        frame = coverFrame(next, box, image);
      covers(frame, box);
      expect(frame.left).toBeCloseTo(
        delta.x > 0 ? 0 : box.width - start.width,
        8,
      );
      expect(frame.top).toBeCloseTo(
        delta.y > 0 ? 0 : box.height - start.height,
        8,
      );
      expect(() => validateCover(next)).not.toThrow();
    }
  });
  it("keeps every edge covered through repeated pan and zoom gestures at different image orientations", () => {
    for (const natural of [
      image,
      { width: 600, height: 1800 },
      { width: 2400, height: 400 },
    ]) {
      let c = cover();
      for (let i = 0; i < 40; i++) {
        c = zoomCover(c, box, natural, 1 + (i % 4), {
          x: (i * 67) % box.width,
          y: (i * 43) % box.height,
        });
        c = panCover(c, box, natural, {
          x: (i % 2 ? -1 : 1) * 135,
          y: (i % 3 ? -1 : 1) * 88,
        });
        covers(coverFrame(c, box, natural), box);
        expect(() => validateCover(c)).not.toThrow();
      }
    }
  });
});

describe("cursor zoom and moving pinch centres", () => {
  it("keeps the precise image point under the zoom cursor when unclamped", () => {
    const natural = { width: 800, height: 800 },
      c = cover({ zoom: 2 });
    const cursor = { x: 100, y: 120 },
      before = coverFrame(c, box, natural);
    const result = zoomCover(c, box, natural, 3, cursor),
      after = coverFrame(result, box, natural);
    expect(result.zoom).toBe(3);
    expect(fractionAt(cursor, after).x).toBeCloseTo(
      fractionAt(cursor, before).x,
      10,
    );
    expect(fractionAt(cursor, after).y).toBeCloseTo(
      fractionAt(cursor, before).y,
      10,
    );
    nearFrame(after, { width: 1200, height: 1200, left: -350, top: -435 });
  });
  it("anchors a pinch point to its moving centre while changing scale", () => {
    const natural = { width: 800, height: 1200 },
      c = cover({ zoom: 2 });
    const from = { x: 140, y: 100 },
      to = { x: 190, y: 130 };
    const before = coverFrame(c, box, natural),
      result = transformCover(c, box, natural, from, to, 2.5),
      after = coverFrame(result, box, natural);
    nearFrame(after, { width: 1000, height: 1500, left: -235, top: -557.5 });
    expect(fractionAt(to, after).x).toBeCloseTo(fractionAt(from, before).x, 10);
    expect(fractionAt(to, after).y).toBeCloseTo(fractionAt(from, before).y, 10);
    covers(after, box);
  });
  it("pans with a moving pinch centre even when scale is unchanged", () => {
    const c = cover({ zoom: 2 }),
      center = { x: 200, y: 150 },
      to = { x: 225, y: 137 };
    nearFrame(
      coverFrame(transformCover(c, box, image, center, to, 2), box, image),
      coverFrame(panCover(c, box, image, { x: 25, y: -13 }), box, image),
    );
  });
  it("prioritises covering the box when zooming out makes exact cursor anchoring impossible", () => {
    const c = panCover(cover({ zoom: 4 }), box, image, { x: 1e5, y: 1e5 });
    const result = zoomCover(c, box, image, 1, { x: 399, y: 299 });
    covers(coverFrame(result, box, image), box);
    expect(result.zoom).toBe(1);
    expect(() => validateCover(result)).not.toThrow();
  });
  it("does not mutate the persisted original cover during mouse or touch calculations", () => {
    const c = cover({ zoom: 2 }),
      original = JSON.stringify(c);
    panCover(c, box, image, { x: 20, y: 10 });
    zoomCover(c, box, image, 3);
    transformCover(c, box, image, { x: 100, y: 100 }, { x: 120, y: 150 }, 2.5);
    expect(JSON.stringify(c)).toBe(original);
  });
});

describe("persistent focal coordinates and compatibility", () => {
  it("round-trips a composed gesture through JSON persistence with the identical framing", () => {
    let c = zoomCover(cover(), box, image, 2.75, { x: 130, y: 80 });
    c = panCover(c, box, image, { x: -43, y: 29 });
    expect(c.framing).toBe("focal");
    expect(c.x).toBeGreaterThanOrEqual(0);
    expect(c.x).toBeLessThanOrEqual(100);
    expect(c.y).toBeGreaterThanOrEqual(0);
    expect(c.y).toBeLessThanOrEqual(100);
    const reloaded = JSON.parse(JSON.stringify(c)) as Cover;
    nearFrame(coverFrame(reloaded, box, image), coverFrame(c, box, image));
  });
  it("renders the same relative crop in another viewport with the same aspect ratio", () => {
    const c = cover({ x: 64, y: 38, zoom: 2.25 });
    const large = coverFrame(c, box, image),
      smallBox = { width: 200, height: 150 },
      small = coverFrame(c, smallBox, image);
    nearFrame(small, {
      width: large.width / 2,
      height: large.height / 2,
      left: large.left / 2,
      top: large.top / 2,
    });
    covers(small, smallBox);
  });
  it("keeps the focal image point at the centre when the target aspect ratio changes", () => {
    const natural = { width: 1000, height: 1000 },
      c = cover({ x: 60, y: 40, zoom: 2 });
    for (const area of [
      box,
      { width: 800, height: 200 },
      { width: 240, height: 500 },
    ]) {
      const frame = coverFrame(c, area, natural);
      expect(frame.left + frame.width * 0.6).toBeCloseTo(area.width / 2, 10);
      expect(frame.top + frame.height * 0.4).toBeCloseTo(area.height / 2, 10);
      covers(frame, area);
    }
  });
  it("respects focal edges through safe clamping rather than distorting the image", () => {
    for (const x of [0, 100])
      for (const y of [0, 100]) {
        const frame = coverFrame(cover({ x, y, zoom: 2 }), box, image);
        covers(frame, box);
        expect(frame.left).toBeCloseTo(
          x === 0 ? 0 : box.width - frame.width,
          10,
        );
        expect(frame.top).toBeCloseTo(
          y === 0 ? 0 : box.height - frame.height,
          10,
        );
        expect(frame.width / frame.height).toBeCloseTo(
          image.width / image.height,
          10,
        );
      }
  });
  it("preserves legacy CSS object-position plus scale around transform-origin exactly", () => {
    for (const natural of [
      image,
      { width: 800, height: 1200 },
      { width: 1000, height: 1000 },
    ]) {
      for (const zoom of [1, 1.5, 2.3, 4])
        for (const p of [0, 0.27, 0.5, 0.73, 1]) {
          const c = cover({
            framing: undefined,
            x: p * 100,
            y: (1 - p) * 100,
            zoom,
          });
          // Independent CSS construction: object-fit bitmap offset, then the element's transform.
          const coverScale = Math.max(
            box.width / natural.width,
            box.height / natural.height,
          );
          const bitmapWidth = natural.width * coverScale,
            bitmapHeight = natural.height * coverScale;
          const objectLeft = (box.width - bitmapWidth) * p,
            objectTop = (box.height - bitmapHeight) * (1 - p);
          nearFrame(coverFrame(c, box, natural), {
            width: bitmapWidth * zoom,
            height: bitmapHeight * zoom,
            left: objectLeft * zoom + box.width * p * (1 - zoom),
            top: objectTop * zoom + box.height * (1 - p) * (1 - zoom),
          });
        }
    }
  });
  it("converts a legacy crop only on an explicit gesture and keeps its current visible framing", () => {
    const old = cover({ framing: undefined, x: 27, y: 73, zoom: 2.3 });
    const before = coverFrame(old, box, image),
      result = panCover(old, box, image, { x: 0, y: 0 });
    expect(old.framing).toBeUndefined();
    expect(result.framing).toBe("focal");
    nearFrame(coverFrame(result, box, image), before);
    expect(() => validateCover(result)).not.toThrow();
  });
});

describe("limits and invalid geometry", () => {
  it("clamps zoom to the supported range, including zero and negative finite requests", () => {
    expect(MIN_COVER_ZOOM).toBe(1);
    expect(MAX_COVER_ZOOM).toBe(4);
    for (const value of [-100, 0, 0.5])
      expect(zoomCover(cover({ zoom: 2 }), box, image, value).zoom).toBe(1);
    for (const value of [4.1, 100])
      expect(zoomCover(cover(), box, image, value).zoom).toBe(4);
    nearFrame(
      coverFrame(cover({ zoom: 0 }), box, image),
      coverFrame(cover({ zoom: 1 }), box, image),
    );
    nearFrame(
      coverFrame(cover({ zoom: Infinity }), box, image),
      coverFrame(cover({ zoom: 1 }), box, image),
    );
  });
  it("resets the crop to centred minimum zoom without discarding the image or upload bytes", () => {
    const c = cover({
      type: "upload",
      data: "data:image/webp;base64,UklGRg==",
      x: 15,
      y: 88,
      zoom: 4,
    });
    expect(resetCoverFrame(c)).toEqual({
      ...c,
      framing: "focal",
      x: 50,
      y: 50,
      zoom: 1,
    });
    expect(c.zoom).toBe(4);
  });
  it("ignores transforms when dimensions or gesture coordinates are zero or nonfinite", () => {
    const c = cover(),
      centre = { x: 200, y: 150 };
    for (const badSize of [
      { width: 0, height: 300 },
      { width: 400, height: 0 },
      { width: -1, height: 300 },
      { width: NaN, height: 300 },
      { width: 400, height: Infinity },
    ]) {
      expect(transformCover(c, badSize, image, centre, centre, 2)).toBe(c);
      expect(transformCover(c, box, badSize, centre, centre, 2)).toBe(c);
    }
    for (const invalid of [NaN, Infinity, -Infinity]) {
      expect(zoomCover(c, box, image, invalid)).toBe(c);
      expect(panCover(c, box, image, { x: invalid, y: 0 })).toBe(c);
      expect(
        transformCover(c, box, image, { x: 0, y: invalid }, centre, 2),
      ).toBe(c);
    }
  });
  it("returns finite nonnegative fallback geometry for invalid container or image dimensions", () => {
    for (const badSize of [
      { width: 0, height: 300 },
      { width: -1, height: 300 },
      { width: NaN, height: 300 },
      { width: 400, height: Infinity },
    ]) {
      for (const frame of [
        coverFrame(cover(), badSize, image),
        coverFrame(cover(), box, badSize),
      ]) {
        expect(Object.values(frame).every(Number.isFinite)).toBe(true);
        expect(frame.width).toBeGreaterThanOrEqual(0);
        expect(frame.height).toBeGreaterThanOrEqual(0);
      }
    }
  });
  it("does not propagate invalid focal coordinates into nonfinite render geometry", () => {
    for (const invalid of [NaN, Infinity, -Infinity]) {
      for (const c of [
        cover({ x: invalid, zoom: 2 }),
        cover({ y: invalid, zoom: 2 }),
      ]) {
        const frame = coverFrame(c, box, image);
        expect(Object.values(frame).every(Number.isFinite)).toBe(true);
        covers(frame, box);
      }
    }
  });
});

describe("cover validation and upload safety remain enforced", () => {
  it("accepts valid focal crops through maximum zoom and legacy crops without framing metadata", () => {
    expect(() => validateCover(cover({ x: 0, y: 100, zoom: 4 }))).not.toThrow();
    expect(() =>
      validateCover(cover({ framing: undefined, x: 100, y: 0, zoom: 1 })),
    ).not.toThrow();
    expect(() =>
      validateCover(cover({ type: "icon", image: undefined })),
    ).not.toThrow();
  });
  it("rejects out-of-range coordinates, invalid framing, unknown gallery images and zoom beyond four", () => {
    const invalid: unknown[] = [
      cover({ x: -0.01 }),
      cover({ x: 100.01 }),
      cover({ y: -1 }),
      cover({ y: 101 }),
      cover({ x: NaN }),
      cover({ y: Infinity }),
      cover({ zoom: NaN }),
      cover({ zoom: 0.99 }),
      cover({ zoom: 4.01 }),
      { ...cover(), framing: "pixels" },
      cover({ image: "not-in-gallery" }),
      { ...cover(), type: "url" },
    ];
    for (const c of invalid) expect(() => validateCover(c as Cover)).toThrow();
  });
  it("permits only bounded WebP data URIs for compressed saved uploads", () => {
    const upload = cover({
      type: "upload",
      image: undefined,
      data: "data:image/webp;base64,UklGRg==",
      zoom: 4,
    });
    expect(() => validateCover(upload)).not.toThrow();
    for (const data of [
      undefined,
      "https://example.com/photo.webp",
      "javascript:alert(1)",
      "data:image/svg+xml;base64,PHN2Zz4=",
      "data:image/png;base64,iVBORw==",
      "data:image/webp;base64,not base64!",
      "data:image/webp;base64," + "A".repeat(300000),
    ])
      expect(() => validateCover({ ...upload, data })).toThrow();
  });
  it("rejects SVG uploads, large raw files and mime/signature mismatch before decoding", async () => {
    await expect(
      compressCover(
        new File(["<svg/>"], "fake.svg", { type: "image/svg+xml" }),
      ),
    ).rejects.toThrow();
    await expect(
      compressCover(
        new File([new Uint8Array(8 * 1024 * 1024 + 1)], "large.jpg", {
          type: "image/jpeg",
        }),
      ),
    ).rejects.toThrow(/8 MB/);
    await expect(
      compressCover(
        new File(
          [new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0])],
          "fake.jpg",
          { type: "image/jpeg" },
        ),
      ),
    ).rejects.toThrow(/corresponde/);
  });
});
