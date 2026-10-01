import type { Map as MLMap } from "maplibre-gl";

// Silhouettes from EarthRanger (Apache 2.0), see public/icons/er/NOTICE.md.
const GROUPS = ["bird", "mammal", "amphibian", "reptile", "camera", "generic"] as const;
const SOURCES: Record<string, string> = { birdweather: "#0891b2", inaturalist: "#65a30d", wdx: "#db2777" };
const SIZE = 64;

function svgToImage(svg: string): Promise<HTMLImageElement> {
  const vb = /viewBox="([\d.\s-]+)"/.exec(svg)?.[1].split(/\s+/).map(Number) ?? [0, 0, 32, 32];
  const white = svg
    .replace(/fill:#[0-9a-fA-F]{3,6}/g, "fill:#fff")
    .replace(/fill="(#[0-9a-fA-F]{3,6}|black|currentColor)"/g, 'fill="#fff"')
    .replace(/<svg([^>]*)>/, (_m, attrs: string) => {
      const kept = attrs.replace(/\s(width|height|fill)="[^"]*"/g, "");
      return `<svg${kept} fill="#fff" width="${vb[2]}" height="${vb[3]}">`;
    });
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(white)}`;
  });
}

/** Registers "<group>-<source>" images: a white silhouette on a disc in the source colour. */
export async function registerIcons(map: MLMap): Promise<void> {
  await Promise.all(GROUPS.map(async (g) => {
    const svg = await fetch(`/icons/er/${g}.svg`).then((r) => r.text());
    const img = await svgToImage(svg);
    for (const [source, color] of Object.entries(SOURCES)) {
      const c = document.createElement("canvas");
      c.width = c.height = SIZE;
      const ctx = c.getContext("2d")!;
      ctx.beginPath(); ctx.arc(SIZE / 2, SIZE / 2, SIZE / 2 - 2, 0, Math.PI * 2);
      ctx.fillStyle = color; ctx.fill();
      ctx.lineWidth = 3; ctx.strokeStyle = "#020617"; ctx.stroke();
      const box = SIZE * 0.6, ratio = img.width / img.height;
      const w = ratio >= 1 ? box : box * ratio, h = ratio >= 1 ? box / ratio : box;
      ctx.drawImage(img, (SIZE - w) / 2, (SIZE - h) / 2, w, h);
      const id = `${g}-${source}`;
      if (!map.hasImage(id)) map.addImage(id, ctx.getImageData(0, 0, SIZE, SIZE), { pixelRatio: 2 });
    }
  }));
}

export const ICON_IMAGE = ["concat",
  ["match", ["get", "group"], "Aves", "bird", "Mammalia", "mammal", "Amphibia", "amphibian", "Reptilia", "reptile", "camera", "camera", "generic"],
  "-",
  ["match", ["get", "source"], "birdweather", "birdweather", "inaturalist", "inaturalist", "wdx"],
];
