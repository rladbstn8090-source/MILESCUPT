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

export function paintTile(ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, bytes: ArrayBuffer, zoom: number, ratio: number) {
  ctx.scale(ratio, ratio);
  ctx.fillStyle = '#f1eddf';
  ctx.fillRect(0, 0, 256, 256);
  const tile=new VectorTile(new PbfReader(bytes));
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
      else{ctx.strokeStyle=color;ctx.lineWidth=id==='streets' && zoom>=12?2:1;ctx.stroke();}
    }
  }
  const used:{x:number;y:number;r:number}[]=[];
  for(const id of (zoom>=9 ? ['place_labels','street_labels','pois'] : [])){
    if(id!=='place_labels' && zoom<13) continue;
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
}
