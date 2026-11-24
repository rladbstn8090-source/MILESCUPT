import L from 'leaflet';
import { paintTile } from './paint-tile';

class KoreanBase extends L.GridLayer {
  private requests = new WeakMap<HTMLElement, AbortController>();
  private worker?: Worker;
  private queue: (() => void)[] = [];
  private painting = false;

  constructor(options: L.GridLayerOptions) {
    super(options);
    if (typeof OffscreenCanvas !== 'undefined' && typeof Worker !== 'undefined') {
      try {
        this.worker = new Worker(new URL('./tile.worker.ts', import.meta.url), { type: 'module' });
      } catch { /* The regular canvas renderer also supports restricted browsers. */ }
    }
    this.on('tileunload', ({ tile }: L.TileEvent) => this.requests.get(tile)?.abort());
  }

  private next() {
    this.painting = false;
    this.queue.shift()?.();
  }

  createTile(coords: L.Coords, done: L.DoneCallback) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = Math.round(256 * Math.min(2, window.devicePixelRatio || 1));
    canvas.style.backgroundColor = '#f1eddf';
    const request = new AbortController();
    this.requests.set(canvas, request);
    const load = async () => {
      const timeout = setTimeout(() => request.abort(), 20000);
      let bytes: ArrayBuffer;
      try {
        const response = await fetch(`https://vector.openstreetmap.org/shortbread_v1/${coords.z}/${coords.x}/${coords.y}.mvt`, { signal: request.signal });
        if (!response.ok) throw Error('배경 지도를 불러오지 못했습니다.');
        bytes = await response.arrayBuffer();
      } finally {
        clearTimeout(timeout);
      }
      const draw = () => {
        this.painting = true;
        const finish = (bitmap?: ImageBitmap) => {
          try {
            if (!request.signal.aborted) {
              const ctx = canvas.getContext('2d')!;
              if (bitmap) ctx.drawImage(bitmap, 0, 0);
              else paintTile(ctx, bytes, coords.z, canvas.width / 256);
              done(undefined, canvas);
            }
          } catch (error) {
            done(error as Error, canvas);
          } finally {
            bitmap?.close();
            this.next();
          }
        };
        if (request.signal.aborted || !this.worker) return finish();
        this.worker.onmessage = event => finish(event.data);
        this.worker.onerror = () => {
          this.worker?.terminate();
          this.worker = undefined;
          finish();
        };
        // Keep the buffer available for a local retry if worker rendering fails.
        this.worker.postMessage({ bytes, zoom: coords.z, size: canvas.width });
      };
      if (this.painting) this.queue.push(draw);
      else draw();
    };
    load().catch(error => { if (!request.signal.aborted || canvas.isConnected) done(error, canvas); });
    return canvas;
  }
}
export function koreanMap(map:L.Map){
  // Overview names are placed in map space so tile seams never split a city name.
  const places: [string,number,number,number][]=[
    ['대한민국',36.12,127.7,3],['북한',40.2,126.9,3],['동해',38.5,130.8,4],['서해',36.5,124.7,4],
    ['서울',37.57,126.98,5],['부산',35.18,129.08,5],['평양',39.04,125.76,5],['제주',33.5,126.53,5],
    ['백두산',42.01,128.06,5],['청진',41.78,129.77,6],['원산',39.15,127.45,6],['강릉',37.75,128.88,6],
    ['대전',36.35,127.38,6],['광주',35.16,126.85,6],['대구',35.87,128.6,6],['울릉도',37.49,130.9,6],
    ['진주',35.18,128.11,7],['독도',37.24,131.87,7],['인천',37.46,126.7,8],['춘천',37.88,127.73,7],
    ['일본',35.7,134.3,4],['중국',40.9,122.8,4],['러시아',44.4,133.3,4]
  ];
  const names=L.layerGroup().addTo(map);
  function updateNames(){
    names.clearLayers();
    const zoom=map.getZoom();if(zoom>8)return;
    const used:L.Point[]=[];
    for(const [name,lat,lon,min] of places){
      if(zoom<min || !map.getBounds().contains([lat,lon]))continue;
      const pt=map.latLngToContainerPoint([lat,lon]);
      if(used.some(p=>Math.abs(p.x-pt.x)<49 && Math.abs(p.y-pt.y)<17))continue;
      used.push(pt);
      L.marker([lat,lon],{interactive:false,keyboard:false,icon:L.divIcon({className:'ko-map-label',html:name,iconSize:[70,18],iconAnchor:[35,9]})}).addTo(names);
    }
  }
  map.on('moveend zoomend resize',updateNames);updateNames();
  return new KoreanBase({updateWhenIdle:true,updateWhenZooming:false,maxNativeZoom:14,maxZoom:19,attribution:'© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'}).addTo(map);
}
