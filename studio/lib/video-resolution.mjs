// Keep HD when available, but do not discard usable lower-resolution footage.
export const MIN_VIDEO_SHORT_EDGE=360;
export function usableVideoDimensions(width,height){
 return Number.isFinite(Number(width))&&Number.isFinite(Number(height))&&Math.min(Number(width),Number(height))>=MIN_VIDEO_SHORT_EDGE;
}
export function preferredVideoFile(a,b){
 const tier=f=>Math.min(Number(f.width)||0,Number(f.height)||0)>=720?0:1;
 const cost=f=>Number(f.size_in_bytes)||Number(f.width)*Number(f.height)||Infinity;
 return tier(a)-tier(b)||cost(a)-cost(b);
}
