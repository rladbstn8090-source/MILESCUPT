import test from 'node:test';
import assert from 'node:assert/strict';
import {detectRouteColour,matchSavedCourse,extractNaverRoute,extractRoute,georeference} from './image-route';
function fixture(loop=false){const w=160,h=120,data=new Uint8ClampedArray(w*h*4);data.fill(255);function dot(x:number,y:number){for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++){const i=((y+dy)*w+x+dx)*4;data.set([235,75,40,255],i);}}for(let x=25;x<=125;x++){dot(x,25);if(loop)dot(x,90);}for(let y=25;y<=90;y++){dot(125,y);if(loop)dot(25,y);}return {data,w,h};}
test('extracts a coloured open stroke and preserves its bends',()=>{const f=fixture();const r=extractRoute(f.data,f.w,f.h,[235,75,40],50,[0,0,f.w,f.h]);assert(r.path.length>=3);const xs=r.path.map(p=>p[0]),ys=r.path.map(p=>p[1]);assert(Math.max(...xs)-Math.min(...xs)>90);assert(Math.max(...ys)-Math.min(...ys)>55);});
test('closed screenshot loops remain closed',()=>{const f=fixture(true);const r=extractRoute(f.data,f.w,f.h,[235,75,40],50,[0,0,f.w,f.h]);assert.deepEqual(r.path[0],r.path.at(-1));assert(r.path.length>=5);});
test('Naver blue route ignores white direction arrows',()=>{const w=220,h=130,data=new Uint8ClampedArray(w*h*4);data.fill(255);const paint=(x:number,y:number,color=[0,103,245])=>{const i=(y*w+x)*4;data.set([...color,255],i);};
 for(let x=18;x<=190;x++)for(let d=-5;d<=5;d++)paint(x,35+d);
 for(let y=35;y<=105;y++)for(let d=-5;d<=5;d++)paint(190+d,y);
 // The real Naver ribbon keeps a blue edge around its repeated white arrowheads.
 for(const x of [48,78,108,138,168])for(let yy=33;yy<=37;yy++)for(let xx=x-2;xx<=x+2;xx++)paint(xx,yy,[255,255,255]);
 const r=extractNaverRoute(data,w,h,[0,0,w,h]);assert(r.path.length>=3);assert(r.path[0][0]<30||r.path.at(-1)![0]<30);assert(r.path.some(p=>p[1]>95));
});
test('two landmark calibration respects north-up and rotated images',()=>{const a={pixel:[0,0] as [number,number],coordinate:[35.2,128.0] as [number,number]},b={pixel:[100,100] as [number,number],coordinate:[35.1,128.1] as [number,number]};const result=georeference([[0,0],[100,100],[100,0]],a,b);assert(Math.abs(result[0][0]-35.2)<1e-8);assert(Math.abs(result[1][1]-128.1)<1e-8);assert(result[2][0]>35.15);assert(result[2][1]>128.05);assert.throws(()=>georeference([[0,0]],a,{...b,pixel:[1,1]}),/20 픽셀/);});
test('rejects missing stroke and selected background',()=>{const f=fixture();assert.throws(()=>extractRoute(f.data,f.w,f.h,[0,0,255],20,[0,0,f.w,f.h]),/찾지 못/);assert.throws(()=>extractRoute(f.data,f.w,f.h,[255,255,255],20,[0,0,f.w,f.h]),/배경/);});

test('recognizes coloured screenshot routes without sampling by hand',()=>{
  for(const colour of [[245,76,35],[40,190,95],[150,75,230],[30,150,235]]) {
    const f=fixture(true);
    for(let i=0;i<f.data.length;i+=4) if(f.data[i]!==255) f.data.set(colour,i);
    const found=detectRouteColour(f.data,f.w,f.h,[0,0,f.w,f.h]);
    assert(found && found.path.length>=5);
    assert.deepEqual(found.path[0],found.path.at(-1));
  }
  const blank=new Uint8ClampedArray(100*100*4).fill(255);
  assert.equal(detectRouteColour(blank,100,100,[0,0,100,100]),undefined);
});

test('only a distinctive, unambiguous saved shape supplies geographic anchors',()=>{
 const path: [number,number][]=[[20,30],[60,15],[82,34],[66,52],[96,65],[114,40],[155,83]];
 const route=georeference(path,{pixel:path[0],coordinate:[35.2,128]},{pixel:path[6],coordinate:[35.17,128.04]});
 const saved={name:'test',route};
 assert(matchSavedCourse([...path].reverse(),[saved]));
 assert.equal(matchSavedCourse(path,[saved,saved]),undefined);
 assert.equal(matchSavedCourse(path,[]),undefined);
});

test('a continuous multi-colour pace trace keeps both ends',()=>{
 const f=fixture();
 for(let y=0;y<f.h;y++)for(let x=0;x<f.w;x++){
   const j=4*(y*f.w+x);
   if(f.data[j]!==255) f.data.set(x<65?[20,200,65]:x<100?[245,190,25]:[235,55,45],j);
 }
 const found=detectRouteColour(f.data,f.w,f.h,[0,0,f.w,f.h]);
 assert(found && found.path.some(p=>p[0]<35) && found.path.some(p=>p[1]>80));
});
