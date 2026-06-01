// Pull open-source trail geometry from OpenStreetMap via the Overpass API.
// Free, no API key. Button-triggered (not automatic) to respect rate limits.

export interface TrailWay {
  id: number;
  name: string | null;
  highway: string;
  /** OSM mtb:scale difficulty (0–6), if tagged. */
  mtbScale: string | null;
  latlngs: [number, number][];
}

export interface Bounds {
  south: number;
  west: number;
  north: number;
  east: number;
}

const ENDPOINT = "https://overpass-api.de/api/interpreter";

export async function fetchTrails(b: Bounds): Promise<TrailWay[]> {
  // `out geom` inlines node coordinates so we can draw without a second lookup.
  const query = `[out:json][timeout:25];
(
  way["highway"~"^(path|track|bridleway|cycleway|footway)$"](${b.south},${b.west},${b.north},${b.east});
);
out geom;`;

  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: "data=" + encodeURIComponent(query),
  });
  if (!res.ok) throw new Error(`Overpass returned ${res.status}`);

  const json = await res.json();
  const elements: any[] = json.elements ?? [];
  return elements
    .filter((e) => e.type === "way" && Array.isArray(e.geometry))
    .map((e) => ({
      id: e.id,
      name: e.tags?.name ?? null,
      highway: e.tags?.highway ?? "path",
      mtbScale: e.tags?.["mtb:scale"] ?? null,
      latlngs: e.geometry.map((g: any) => [g.lat, g.lon] as [number, number]),
    }));
}
