type StubCanvasContext = {
  canvas: { width: number; height: number };
  getContext: () => null;
};

export function createCanvas(width: number, height: number) {
  const canvas = {
    width,
    height,
    getContext: () => null,
    toBuffer: () => new Uint8Array(),
  };
  return canvas as unknown as StubCanvasContext & {
    width: number;
    height: number;
    toBuffer: () => Uint8Array;
  };
}

export class DOMMatrix {}
export class ImageData {}
export class Path2D {}

