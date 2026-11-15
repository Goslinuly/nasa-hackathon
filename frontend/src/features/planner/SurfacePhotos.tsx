// «Что ждёт на месте»: снимки с поверхности из ближайшей к маршруту точки трека ровера NASA.
import { useEffect, useState } from 'react';

import { fetchRoverPhotos } from '@/shared/api/client';
import type { RoverPhotosResponse } from '@/shared/api/evaTypes';
import { locale, tr, useLang, useT } from '@/shared/i18n/lang';
import { findNearTrack, type LonLat, type NearTrackHit } from '@/shared/rovers/nearTrack';

const MAX_DISTANCE_M = 6000;

const km = (m: number) => `${(m / 1000).toLocaleString(locale(), { maximumFractionDigits: 1 })} ${tr('км', 'km')}`;

export function SurfacePhotos({ points }: { points: LonLat[] }) {
  const [hit, setHit] = useState<NearTrackHit | null | 'searching'>('searching');
  const [photos, setPhotos] = useState<RoverPhotosResponse | null>(null);
  const t = useT();
  const lang = useLang();

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
      () => alive && setPhotos({ status: 'source_unavailable', detail: tr('сеть недоступна', 'network unavailable') }),
    );
    return () => {
      alive = false;
    };
  }, [hit, lang]);

  if (hit === 'searching' || hit === null) return null;

  return (
    <section aria-label={t('Вид с поверхности', 'View from the surface')}>
      <h2 className="planner-subtitle">{t('Вид с поверхности', 'View from the surface')}</h2>
      <p className="planner-note">
        {t(
          `Маршрут проходит в ${km(hit.distanceM)} от трека ${hit.title} (sol ${hit.sol}): снимки оттуда показывают, какая местность ждёт экипаж.`,
          `The route passes ${km(hit.distanceM)} from the ${hit.title} track (sol ${hit.sol}): images from there show what terrain awaits the crew.`,
        )}
      </p>
      {photos === null && <p className="dim">{t('Загрузка снимков…', 'Loading images…')}</p>}
      {photos?.status === 'source_unavailable' && (
        <p className="planner-note">{t('Лента снимков NASA сейчас недоступна', 'The NASA image feed is unavailable right now')}: {photos.detail}</p>
      )}
      {photos?.status === 'ok' && photos.count === 0 && (
        <p className="planner-note">{t('За этот сол в ленте NASA нет подходящих снимков.', 'The NASA feed has no suitable images for this sol.')}</p>
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
