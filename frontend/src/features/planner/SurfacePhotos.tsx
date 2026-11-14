// «Что ждёт на месте»: снимки с поверхности из ближайшей к маршруту точки трека ровера NASA.
import { useEffect, useState } from 'react';

import { fetchRoverPhotos } from '@/shared/api/client';
import type { RoverPhotosResponse } from '@/shared/api/evaTypes';
import { findNearTrack, type LonLat, type NearTrackHit } from '@/shared/rovers/nearTrack';

const MAX_DISTANCE_M = 6000;

const km = (m: number) => `${(m / 1000).toLocaleString('ru-RU', { maximumFractionDigits: 1 })} км`;

export function SurfacePhotos({ points }: { points: LonLat[] }) {
  const [hit, setHit] = useState<NearTrackHit | null | 'searching'>('searching');
  const [photos, setPhotos] = useState<RoverPhotosResponse | null>(null);

  useEffect(() => {
    let alive = true;
    setHit('searching');
    setPhotos(null);
    void findNearTrack(points, MAX_DISTANCE_M).then((found) => {
      if (alive) setHit(found);
    });
    return () => {
      alive = false;
    };
  }, [points]);

  useEffect(() => {
    if (!hit || hit === 'searching') return;
    let alive = true;
    void fetchRoverPhotos(hit.rover, hit.sol, 3).then(
      (data) => alive && setPhotos(data),
      () => alive && setPhotos({ status: 'source_unavailable', detail: 'сеть недоступна' }),
    );
    return () => {
      alive = false;
    };
  }, [hit]);

  if (hit === 'searching' || hit === null) return null;

  return (
    <section aria-label="Вид с поверхности">
      <h2 className="planner-subtitle">Вид с поверхности</h2>
      <p className="planner-note">
        Маршрут проходит в {km(hit.distanceM)} от трека {hit.title} (sol {hit.sol}): снимки оттуда
        показывают, какая местность ждёт экипаж.
      </p>
      {photos === null && <p className="dim">Загрузка снимков…</p>}
      {photos?.status === 'source_unavailable' && (
        <p className="planner-note">Лента снимков NASA сейчас недоступна: {photos.detail}</p>
      )}
      {photos?.status === 'ok' && photos.count === 0 && (
        <p className="planner-note">За этот сол в ленте NASA нет подходящих снимков.</p>
      )}
      {photos?.status === 'ok' && photos.count > 0 && (
        <>
          <div className="surface-photos">
            {photos.photos.map((photo) => (
              <a key={photo.url} href={photo.url} target="_blank" rel="noreferrer">
                <img src={photo.url} alt={`${photos.rover}, sol ${photo.sol}, ${photo.instrument}`} decoding="async" />
                <span>{photo.instrument}</span>
              </a>
            ))}
          </div>
          <p className="planner-note">
            {photos.credit} · sol {photos.sol} · {photos.caveat}
          </p>
        </>
      )}
    </section>
  );
}
