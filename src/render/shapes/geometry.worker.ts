// The geometry worker (spec §21.12, Batch 65): builds the geometry of paths whose build took longer than
// 2 ms on the main thread (`ShapeGeometryCache`), and sends the arrays back as transferables (P5).
import { buildPathGeometry, type PathGeometryInput } from "../../core/shapes/geometry.js";

self.onmessage = (event: MessageEvent<{ id: number; input: PathGeometryInput }>) => {
  const { id, input } = event.data;
  const geometry = buildPathGeometry(input);
  const transfer: ArrayBuffer[] = [];
  if (geometry.fill) transfer.push(geometry.fill.buffer as ArrayBuffer);
  if (geometry.stroke) transfer.push(geometry.stroke.buffer as ArrayBuffer);
  (self as unknown as Worker).postMessage({ id, geometry }, transfer);
};
