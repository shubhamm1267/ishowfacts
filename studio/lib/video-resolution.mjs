// Require source HD; an upscaled 360p export cannot recover real detail.
export const MIN_VIDEO_SHORT_EDGE=720;
export function usableVideoDimensions(width,height){
 return Number.isFinite(Number(width))&&Number.isFinite(Number(height))&&Math.min(Number(width),Number(height))>=MIN_VIDEO_SHORT_EDGE;
}
export function preferredVideoFile(a,b){
 const tier=f=>Math.min(Number(f.width)||0,Number(f.height)||0)>=1080?0:Math.min(Number(f.width)||0,Number(f.height)||0)>=720?1:2;
 const cost=f=>Number(f.size_in_bytes)||Number(f.width)*Number(f.height)||Infinity;
 return tier(a)-tier(b)||cost(a)-cost(b);
}
