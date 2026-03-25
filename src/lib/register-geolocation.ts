/**
 * Browser geolocation for lobby registration — real map position on broadcast (anywhere in the world).
 */
export function getRegisterGeolocation(): Promise<{ lng: number; lat: number } | null> {
  if (typeof navigator === "undefined" || !navigator.geolocation) {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    const done = (v: { lng: number; lat: number } | null) => resolve(v);
    const t = window.setTimeout(() => done(null), 14_000);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        window.clearTimeout(t);
        const lng = pos.coords.longitude;
        const lat = pos.coords.latitude;
        if (!Number.isFinite(lng) || !Number.isFinite(lat) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
          done(null);
          return;
        }
        done({ lng, lat });
      },
      () => {
        window.clearTimeout(t);
        done(null);
      },
      { enableHighAccuracy: true, timeout: 12_000, maximumAge: 30_000 }
    );
  });
}
