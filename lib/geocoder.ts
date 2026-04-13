// Google Maps Geocoding — resolves free-text "Other" location entries to GPS.
// Called after incident creation when locationRecord is null.
// On any failure: returns null — caller sets needsLocationReview=true.
// Implementation plan unhappy paths U4 and U5.

// Kenya bounding box — restricts geocoding results to within Kenya
const KE_BOUNDS = "countryCode:KE";
const GEOCODE_URL = "https://maps.googleapis.com/maps/api/geocode/json";

export type GeoPoint = { lat: number; lng: number };

/**
 * Geocode a free-text location string within Kenya.
 * Returns null on API failure, quota exceeded, or no result found.
 */
export async function geocode(text: string): Promise<GeoPoint | null> {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    console.warn("[Geocoder] GOOGLE_MAPS_API_KEY not set");
    return null;
  }

  const params = new URLSearchParams({
    address: `${text}, Kisauni, Mombasa, Kenya`,
    components: KE_BOUNDS,
    key: apiKey,
  });

  try {
    const res = await fetch(`${GEOCODE_URL}?${params}`, {
      signal: AbortSignal.timeout(5000), // 5s timeout — never block incident creation
    });

    if (!res.ok) {
      console.error(`[Geocoder] HTTP ${res.status}`);
      return null;
    }

    const data = (await res.json()) as {
      status: string;
      results: Array<{ geometry: { location: { lat: number; lng: number } } }>;
    };

    if (data.status !== "OK" || data.results.length === 0) {
      console.warn("[Geocoder] no results for:", text, "status:", data.status);
      return null;
    }

    const { lat, lng } = data.results[0].geometry.location;
    return { lat, lng };
  } catch (err) {
    console.error("[Geocoder] request failed:", err);
    return null;
  }
}
