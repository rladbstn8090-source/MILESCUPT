// The Pages artifact includes a coarse, real elevation fallback for the entire peninsula.
import { mkdir, writeFile } from 'node:fs/promises';
const zoom = 6;
const x = lon => Math.floor((lon+180)/360*2**zoom);
const y = lat => Math.floor((1-Math.asinh(Math.tan(lat*Math.PI/180))/Math.PI)/2*2**zoom);
for (let col=x(124);col<=x(132.1);col++) {
  const dir = `dist/data/terrain/${zoom}/${col}`;
  await mkdir(dir,{recursive:true});
  for (let row=y(43.1);row<=y(32.8);row++) {
    const url = `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${zoom}/${col}/${row}.png`;
    for(let attempt=1;attempt<=3;attempt++){
      try {
        const res=await fetch(url,{signal:AbortSignal.timeout(20000)});
        if(!res.ok) throw Error(`DEM ${res.status} ${url}`);
        const bytes=Buffer.from(await res.arrayBuffer());
        if(bytes.readUInt32BE(0)!==0x89504e47 || bytes.readUInt32BE(16)!==256 || bytes.readUInt32BE(20)!==256) throw Error('Invalid elevation PNG');
        await writeFile(`${dir}/${row}.png`,bytes);
        break;
      } catch(error){if(attempt===3) throw error;}
    }
  }
}
