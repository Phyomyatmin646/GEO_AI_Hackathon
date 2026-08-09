import { NextResponse } from 'next/server';
import { loadPilotBundle } from '@/app/lib/pilot-data';

const BACKEND_URL =
  process.env.BACKEND_URL ||
  process.env.NEXT_PUBLIC_BACKEND_URL ||
  'http://127.0.0.1:8000';

// Cache canonical polygons to avoid loading large JSONs repeatedly
const polygonCache: Record<string, Record<string, [number, number][]>> = {};

async function getPolygonsForRegion(region: string): Promise<Record<string, [number, number][]>> {
  if (polygonCache[region]) {
    return polygonCache[region];
  }

  try {
    const bundle = await loadPilotBundle(region);
    const polys: Record<string, [number, number][]> = {};
    for (const cell of bundle.cells) {
      if (cell.id && cell.polygon) {
        polys[cell.id] = cell.polygon;
      }
    }
    polygonCache[region] = polys;
    return polys;
  } catch (err) {
    console.error(`Failed to load canonical grid for ${region}:`, err);
    return {};
  }
}

export async function GET(
  _request: Request,
  { params }: { params: { date: string } }
) {
  try {
    const url = new URL(`${BACKEND_URL}/api/v1/daily/${params.date}/map`);

    // This compatibility route calls the public Fastify API. Never reuse the
    // weekly-ingest or model-server credential here.
    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };
    if (process.env.BACKEND_API_KEY) {
      headers['X-API-Key'] = process.env.BACKEND_API_KEY;
    }

    const res = await fetch(url.toString(), {
      method: 'GET',
      headers,
      cache: 'no-store'
    });

    if (!res.ok) {
      if (res.status === 404) {
        return NextResponse.json({ error: 'Map data not found' }, { status: 404 });
      }
      return NextResponse.json(
        { error: `Backend returned ${res.status}` },
        { status: res.status }
      );
    }

    const data = await res.json();

    // Attach canonical polygons to the daily data
    if (Array.isArray(data)) {
      // Group by region to load canonical grids efficiently
      const uniqueRegions = [...new Set(data.map(c => c.region))];
      
      for (const region of uniqueRegions) {
        const polys = await getPolygonsForRegion(region);
        for (const cell of data) {
          if (cell.region === region && polys[cell.index]) {
            cell.polygon = polys[cell.index];
          }
        }
      }
    }

    return NextResponse.json(data);
  } catch (err: unknown) {
    console.error('Failed to proxy map request:', err);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}
