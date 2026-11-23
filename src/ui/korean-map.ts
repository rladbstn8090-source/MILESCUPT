import L from 'leaflet';
import { VectorTile } from '@mapbox/vector-tile';
import { PbfReader } from 'pbf';

const layers = [
  ['land', '#dce3cc'], ['ocean', '#b9d8df'], ['water_polygons', '#b9d8df'],
  ['water_lines', '#94bfcb'], ['buildings', '#d3cabb'], ['streets', '#fffdf4'],
  ['boundaries', '#999e90'],
] as const;

function koreanName(properties: Record<string, unknown>) {
  for (const key of ['name:ko','name_ko','name']) {
    const name = properties[key];
    if (typeof name !== 'string') continue;
    const parts = name.split(/[;\/()]/);
    const korean = parts.map(s=>s.trim()).find(s=>/[가-힣]/.test(s) && /^[가-힣ㄱ-ㅎㅏ-ㅣ0-9 ·.,()\-]+$/.test(s));
    if (korean) return korean;
  }
  return '';
}

class KoreanBase extends L.GridLayer {
  createTile(coords: L.Coords, done: L.DoneCallback) {
    const canvas = document.createElement('canvas');
    const ratio=Math.min(2,window.devicePixelRatio || 1);
    canvas.width=canvas.height=256*ratio;
    const ctx=canvas.getContext('2d')!;
    ctx.scale(ratio,ratio);
    ctx.fillStyle='#f1eddf';ctx.fillRect(0,0,256,256);
    const draw=async()=>{
      const response=await fetch(`https://vector.openstreetmap.org/shortbread_v1/${coords.z}/${coords.x}/${coords.y}.mvt`,{signal:AbortSignal.timeout(20000)});
      if(!response.ok) throw Error('배경 지도를 불러오지 못했습니다.');
      const tile=new VectorTile(new PbfReader(await response.arrayBuffer()));
      for(const [id,color] of layers){
        const layer=tile.layers[id]; if(!layer) continue;
        for(let i=0;i<layer.length;i++){
          const f=layer.feature(i), scale=256/f.extent;
          ctx.beginPath();
          for(const ring of f.loadGeometry()){
            ring.forEach((p,j)=>j?ctx.lineTo(p.x*scale,p.y*scale):ctx.moveTo(p.x*scale,p.y*scale));
            if(f.type===3)ctx.closePath();
          }
          if(f.type===3){ctx.fillStyle=color;ctx.fill('evenodd');}
          else{ctx.strokeStyle=color;ctx.lineWidth=id==='streets' && coords.z>=12?2:1;ctx.stroke();}
        }
      }
      const used:{x:number;y:number;r:number}[]=[];
      for(const id of (coords.z>=9 ? ['place_labels','street_labels','pois'] : [])){
        if(id!=='place_labels' && coords.z<13) continue;
        const layer=tile.layers[id];if(!layer)continue;
        for(let i=0;i<layer.length;i++){
          const feature=layer.feature(i),name=koreanName(feature.properties);
          if(!name)continue;
          const line=feature.loadGeometry()[0];if(!line?.length)continue;
          const anchor=line[Math.floor(line.length/2)],x=anchor.x*256/feature.extent,y=anchor.y*256/feature.extent;
          ctx.font=id==='place_labels'?'600 13px sans-serif':'11px sans-serif';ctx.textAlign='center';
          const r=ctx.measureText(name).width/2+3;
          if(x-r<0||x+r>256||y<13||y>254||used.some(b=>Math.abs(y-b.y)<16 && Math.abs(x-b.x)<r+b.r))continue;
          used.push({x,y,r});ctx.lineWidth=3;ctx.strokeStyle='#f6f2e6';ctx.strokeText(name,x,y);ctx.fillStyle='#304b38';ctx.fillText(name,x,y);
        }
      }
    };
    draw().then(()=>done(undefined,canvas)).catch(err=>done(err,canvas));
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
  return new KoreanBase({maxNativeZoom:14,maxZoom:19,attribution:'© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'}).addTo(map);
}
