import { paintTile } from './paint-tile';

self.onmessage = ({ data }) => {
  try {
    const canvas = new OffscreenCanvas(data.size, data.size);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw Error('Canvas unavailable');
    paintTile(ctx, data.bytes, data.zoom, data.size / 256);
    const bitmap = canvas.transferToImageBitmap();
    self.postMessage(bitmap, { transfer: [bitmap] });
  } catch {
    self.postMessage(null);
  }
};
