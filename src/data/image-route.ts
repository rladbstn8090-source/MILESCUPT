import type { Point } from '../types';
export type Pixel = [number, number];
export interface Calibration { pixel: Pixel; coordinate: Point }
const mercator=(p:Point):Pixel=>[p[1]*Math.PI/180,Math.log(Math.tan(Math.PI/4+p[0]*Math.PI/360))];
export function georeference(path:Pixel[],a:Calibration,b:Calibration):Point[]{
 const [x,y]=a.pixel,dx=b.pixel[0]-x,dy=-(b.pixel[1]-y),d=dx*dx+dy*dy;
 if(d<400)throw Error('사진 기준점 두 곳을 20 픽셀 이상 떨어뜨려 선택하세요.');
 const u=mercator(a.coordinate),v=mercator(b.coordinate),gx=v[0]-u[0],gy=v[1]-u[1];
 if(Math.hypot(gx,gy)<1e-7)throw Error('지도 기준점 두 곳이 너무 가깝습니다.');
 const c=(gx*dx+gy*dy)/d,s=(gy*dx-gx*dy)/d;
 // Screenshot Y runs down; a two-point similarity in projected coordinates supports rotation.
 return path.map(([px,py])=>{const xx=px-x,yy=-(py-y);const mx=u[0]+c*xx-s*yy,my=u[1]+s*xx+c*yy;return [(2*Math.atan(Math.exp(my))-Math.PI/2)*180/Math.PI,mx*180/Math.PI];});
}
export function simplify(points:Pixel[],tolerance=1.5):Pixel[]{
 if(points.length<3)return points;
 const [a,b]=[points[0],points.at(-1)!];let max=0,index=0;
 for(let i=1;i<points.length-1;i++){const p=points[i],dx=b[0]-a[0],dy=b[1]-a[1],d=dx*dx+dy*dy;const t=d?Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/d)):0;const dist=Math.hypot(p[0]-a[0]-t*dx,p[1]-a[1]-t*dy);if(dist>max){max=dist;index=i;}}
 return max>tolerance?[...simplify(points.slice(0,index+1),tolerance).slice(0,-1),...simplify(points.slice(index),tolerance)]:[a,b];
}
function largestComponent(mask:Uint8Array,w:number){
 const offsets=[-w-1,-w,-w+1,-1,1,w-1,w,w+1];let best:number[]=[];let components=0;const seen=new Uint8Array(mask.length);
 for(let i=0;i<mask.length;i++)if(mask[i]&&!seen[i]){const group=[i];seen[i]=1;for(let k=0;k<group.length;k++)for(const off of offsets){const j=group[k]+off;if(j>=0&&j<mask.length&&mask[j]&&!seen[j]){seen[j]=1;group.push(j);}}if(group.length>8)components++;if(group.length>best.length)best=group;}
 return {best,components};
}

function fillSmallHoles(mask:Uint8Array,w:number,h:number,maxArea:number){
 const seen=new Uint8Array(mask.length);const offsets=[-w,-1,1,w];
 for(let i=0;i<mask.length;i++)if(!mask[i]&&!seen[i]){const group=[i];let touchesEdge=false;seen[i]=1;
  for(let k=0;k<group.length;k++){const p=group[k],x=p%w,y=Math.floor(p/w);if(x===0||y===0||x===w-1||y===h-1)touchesEdge=true;for(const off of offsets){const j=p+off;if(j<0||j>=mask.length||seen[j]||mask[j])continue;if(Math.abs(off)===1&&Math.floor(j/w)!==y)continue;seen[j]=1;group.push(j);}}
  if(!touchesEdge&&group.length<=maxArea)group.forEach(j=>mask[j]=1);
 }
}

function traceMask(source:Uint8Array,w:number,h:number,total:number,allowBranches=false){
 let mask=source;let {best,components}=largestComponent(mask,w);const offsets=[-w-1,-w,-w+1,-1,1,w-1,w,w+1];
 if(best.length<25)throw Error('이어진 코스 선을 찾지 못했습니다. 선 색상·허용 범위를 바꾸거나 직접 따라 그리세요.');
 if(best.length>w*h*.3)throw Error('배경이 선택된 것 같습니다. 코스 선의 가운데를 클릭해 색상을 선택하세요.');
 mask=new Uint8Array(w*h);best.forEach(i=>mask[i]=1);
 // Zhang–Suen thinning: reduce the selected stroke to a one-pixel centreline.
 for(let iteration=0;iteration<100;iteration++){let changed=false;for(let pass=0;pass<2;pass++){const remove:number[]=[];for(const i of best){if(!mask[i])continue;const p=[mask[i-w],mask[i-w+1],mask[i+1],mask[i+w+1],mask[i+w],mask[i+w-1],mask[i-1],mask[i-w-1]];const sum=p.reduce((a,b)=>a+b,0);let transitions=0;for(let k=0;k<8;k++)if(!p[k]&&p[(k+1)%8])transitions++;if(sum<2||sum>6||transitions!==1)continue;const m1=pass?p[0]*p[2]*p[6]:p[0]*p[2]*p[4],m2=pass?p[0]*p[4]*p[6]:p[2]*p[4]*p[6];if(!m1&&!m2)remove.push(i);}remove.forEach(i=>mask[i]=0);changed ||= remove.length>0;}if(!changed)break;}
 const neighbors=(i:number)=>offsets.filter(o=>mask[i+o]&&(!(Math.abs(o)===w+1||Math.abs(o)===w-1)||(!mask[i+(o>0?w:-w)]&&!mask[i+(o%w===1||o===-w+1?1:-1)]))).map(o=>i+o);
 // Prune short digitisation spurs, but leave meaningful branches for manual review.
 for(let pass=0;pass<3;pass++)for(const i of best){if(!mask[i]||neighbors(i).length!==1)continue;let prev=-1,current=i;const spur:number[]=[];while(spur.length<7){spur.push(current);const next=neighbors(current).filter(j=>j!==prev);if(next.length!==1){if(next.length>1)spur.slice(0,-1).forEach(j=>mask[j]=0);break;}prev=current;current=next[0];}}
 const active=best.filter(i=>mask[i]);const ends=active.filter(i=>neighbors(i).length===1);const branched=active.some(i=>neighbors(i).length>2)||ends.length>2;
 if(branched&&!allowBranches)throw Error('교차·분기 또는 색상 잡음 때문에 진행 순서를 확정할 수 없습니다. 사진에서 코스를 직접 따라 그려 주세요.');
 let ordered:Pixel[]=[];
 if(branched){
  // Naver's repeated direction arrows can leave tiny skeleton spurs. The two
  // farthest sweeps keep the long route through the ribbon and ignore them.
  const farthest=(start:number,remember=false)=>{const queue=[start],distance=new Int32Array(mask.length);distance.fill(-1);distance[start]=0;const previous=remember?new Int32Array(mask.length):undefined;previous?.fill(-1);let far=start;
   for(let k=0;k<queue.length;k++){const current=queue[k];if(distance[current]>distance[far])far=current;for(const next of neighbors(current))if(distance[next]<0){distance[next]=distance[current]+1;if(previous)previous[next]=current;queue.push(next);}}
   return {far,previous};
  };
  const first=farthest(ends[0]??active[0]).far;const sweep=farthest(first,true);const indices:number[]=[];let current=sweep.far;
  while(current>=0){indices.push(current);if(current===first)break;current=sweep.previous![current];}
  ordered=indices.reverse().map(i=>[i%w,Math.floor(i/w)] as Pixel);
 }else{
  let current=ends[0]??active[0],previous=-1;const visited=new Set<number>();
  while(current!==undefined&&!visited.has(current)){visited.add(current);ordered.push([current%w,Math.floor(current/w)]);const next=neighbors(current).filter(i=>i!==previous&&!visited.has(i));previous=current;current=next[0];}
  if(ordered.length<10||visited.size<active.length*.85)throw Error('코스가 여러 조각으로 끊어져 있습니다. 직접 따라 그리기로 보정해 주세요.');
  if(ends.length===0)ordered.push(ordered[0]);
 }
 if(ordered.length<10)throw Error('코스가 여러 조각으로 끊어져 있습니다. 지도만 보이게 자르거나 직접 따라 그려 주세요.');
 const path=simplify(ordered);if(path.length<2)throw Error('코스가 너무 짧습니다.');
 return {path,components,coverage:best.length/total};
}

export function extractRoute(rgba:Uint8ClampedArray,w:number,h:number,color:number[],tolerance:number,crop:[number,number,number,number]){
 const mask=new Uint8Array(w*h);let total=0;const [left,top,right,bottom]=crop;
 for(let y=Math.max(1,top);y<Math.min(h-1,bottom);y++)for(let x=Math.max(1,left);x<Math.min(w-1,right);x++){const i=y*w+x,j=i*4;if(rgba[j+3]>128&&Math.hypot(rgba[j]-color[0],rgba[j+1]-color[1],rgba[j+2]-color[2])<=tolerance){mask[i]=1;total++;}}
 return traceMask(mask,w,h,total);
}

/**
 * Naver bicycle directions use a saturated blue ribbon with white arrowheads.
 * Select the ribbon by colour, discard the smaller blue map symbols, then fill
 * only arrow-sized holes before tracing its centreline. Large enclosed route
 * loops stay empty and therefore keep their original geometry.
 */
export function extractNaverRoute(rgba:Uint8ClampedArray,w:number,h:number,crop:[number,number,number,number]){
 let mask=new Uint8Array(w*h);let total=0;const [left,top,right,bottom]=crop;
 for(let y=Math.max(1,top);y<Math.min(h-1,bottom);y++)for(let x=Math.max(1,left);x<Math.min(w-1,right);x++){
  const i=y*w+x,j=i*4,r=rgba[j],g=rgba[j+1],b=rgba[j+2];
  // Includes the bright route fill and its dark-blue edge, while excluding pale water.
  if(rgba[j+3]>128&&b>105&&b-r>62&&b-g>38&&b>g*1.32){mask[i]=1;total++;}
 }
 const selected=largestComponent(mask,w);
 if(selected.best.length<Math.max(80,w*h*.0015))throw Error('네이버의 파란 길찾기 선을 찾지 못했습니다. 지도만 보이게 자르거나 선 색상을 직접 선택해 주세요.');
 mask=new Uint8Array(w*h);selected.best.forEach(i=>mask[i]=1);
 // At the importer resolution, directional arrow holes are normally under 120 px.
 fillSmallHoles(mask,w,h,Math.max(120,Math.round(w*h*.00035)));
 const result=traceMask(mask,w,h,selected.best.length,true);
 return {...result,confidence:selected.best.length/Math.max(1,total)};
}

// Find prominent saturated stroke colours, then score connected, long, thin traces.
// Area fills (parks, water) and small map symbols should not outrank the route.
export function detectRouteColour(data: Uint8ClampedArray, width: number, height: number, crop: [number,number,number,number]) {
  const bins = new Map<number,{count:number; sums:number[]}>();
  for (let y=crop[1]; y<crop[3]; y+=2) for (let x=crop[0]; x<crop[2]; x+=2) {
    const i=(y*width+x)*4, rgb=[data[i],data[i+1],data[i+2]];
    if (data[i+3]<128 || Math.max(...rgb)-Math.min(...rgb)<75) continue;
    const key=(rgb[0]>>5)*64+(rgb[1]>>5)*8+(rgb[2]>>5);
    const bin=bins.get(key) ?? {count:0,sums:[0,0,0]};
    bin.count++; rgb.forEach((v,j)=>bin.sums[j]+=v); bins.set(key,bin);
  }
  let best: {path:Pixel[];color:number[];score:number}|undefined;
  for (const bin of [...bins.values()].sort((a,b)=>b.count-a.count).slice(0,6)) {
    if (bin.count < 12) continue;
    const color=bin.sums.map(sum=>Math.round(sum/bin.count));
    try {
      const result=extractRoute(data,width,height,color,60,crop);
      const length=result.path.slice(1).reduce((sum,p,i)=>sum+Math.hypot(p[0]-result.path[i][0],p[1]-result.path[i][1]),0);
      if (length < Math.max(width,height)*.15 || result.coverage < .35 || bin.count*4*result.coverage/length > 22) continue;
      const score=length*result.coverage;
      if (!best || score>best.score) best={path:result.path,color,score};
    } catch { /* Try the next colour. */ }
  }
  // Pace maps often change from green to yellow to red along a single stroke.
  // Inspect connected saturated pixels together so a single hue cannot truncate it.
  const mask=new Uint8Array(width*height);
  for(let y=Math.max(1,crop[1]);y<Math.min(height-1,crop[3]);y++){
    for(let x=Math.max(1,crop[0]);x<Math.min(width-1,crop[2]);x++){
      const i=y*width+x,j=i*4;
      const high=Math.max(data[j],data[j+1],data[j+2]),low=Math.min(data[j],data[j+1],data[j+2]);
      if(data[j+3]>128 && high>=110 && high-low>=88) mask[i]=1;
    }
  }
  const group=largestComponent(mask,width).best;
  if(group.length>=40 && group.length<width*height*.22){
    const stroke=new Uint8Array(mask.length);
    for(const i of group) stroke[i]=1;
    try{
      const trace=traceMask(stroke,width,height,group.length);
      const length=trace.path.slice(1).reduce((sum,p,i)=>sum+Math.hypot(p[0]-trace.path[i][0],p[1]-trace.path[i][1]),0);
      if(length>Math.max(width,height)*.2 && group.length/length<18 && (!best || length>best.score*1.25)){
        const offset=group[Math.floor(group.length/2)]*4;
        best={path:trace.path,color:Array.from(data.slice(offset,offset+3)),score:length};
      }
    }catch{ /* Intersecting or filled map areas remain available for manual tracing. */ }
  }
  return best;
}

// Compare curves at equal arc-length intervals to handle different screenshot scales.
// Only distinctive shapes with a single unambiguous saved GPS match get a proposal.
function curveSamples(curve:Pixel[], count=32): Pixel[] {
  const lengths=[0];
  for(let i=1;i<curve.length;i++) lengths.push(lengths[i-1]+Math.hypot(curve[i][0]-curve[i-1][0],curve[i][1]-curve[i-1][1]));
  const total=lengths.at(-1) ?? 0;
  if(total<=0) return [];
  let j=1;
  return Array.from({length:count},(_,i)=>{
    const target=total*i/(count-1);
    while(j<curve.length-1 && lengths[j]<target) j++;
    const t=(target-lengths[j-1])/(lengths[j]-lengths[j-1] || 1);
    return [curve[j-1][0]+t*(curve[j][0]-curve[j-1][0]),curve[j-1][1]+t*(curve[j][1]-curve[j-1][1])];
  });
}

export function matchSavedCourse(path:Pixel[], courses:{name:string;route:Point[]}[]) {
  if(path.length<6) return;
  const sample=curveSamples(path);
  if(!sample.length) return;
  const first=sample[0];
  const far=sample.reduce((idx,p,i)=>Math.hypot(p[0]-first[0],p[1]-first[1])>Math.hypot(sample[idx][0]-first[0],sample[idx][1]-first[1])?i:idx,0);
  const dx=sample[far][0]-first[0],dy=sample[far][1]-first[1],span=Math.hypot(dx,dy);
  if(span<25 || !sample.some(p=>Math.abs((p[0]-first[0])*dy-(p[1]-first[1])*dx)>span*span*.14)) return;
  const loop=Math.hypot(sample[31][0]-first[0],sample[31][1]-first[1])<span*.04;
  const results=[];
  for(const course of courses) {
    if(course.route.length<6) continue;
    const points=curveSamples(course.route.map(p=>{const [x,y]=mercator(p);return [x,-y];}));
    if(!points.length) continue;
    let best;
    for(const order of [points,[...points].reverse()]) {
      for(let shift=0;shift<(loop?31:1);shift++){
        const at=(i:number)=>order[loop?(shift+i)%31:i];
        const origin=at(0),other=at(far),gx=other[0]-origin[0],gy=other[1]-origin[1],scale=Math.hypot(gx,gy);
        if(scale<1e-7) continue;
        const c=(gx*dx+gy*dy)/(span*span),s=(gy*dx-gx*dy)/(span*span);
        const error=Math.sqrt(sample.reduce((sum,p,i)=>{
          const x=p[0]-first[0],y=p[1]-first[1],target=at(i);
          return sum+(origin[0]+c*x-s*y-target[0])**2+(origin[1]+s*x+c*y-target[1])**2;
        },0)/sample.length)/scale;
        if(!best || error<best.error){
          const inverse=(p:Pixel):Point=>[(2*Math.atan(Math.exp(-p[1]))-Math.PI/2)*180/Math.PI,p[0]*180/Math.PI];
          best={name:course.name,error,a:{pixel:first,coordinate:inverse(origin)},b:{pixel:sample[far],coordinate:inverse(other)}};
        }
      }
    }
    if(best) results.push(best);
  }
  results.sort((a,b)=>a.error-b.error);
  if(results[0]?.error<.035 && (!results[1] || results[1].error-results[0].error>.025)) return results[0];
}
