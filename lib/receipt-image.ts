export const RECEIPT_MAX_BYTES=1024*1024;
export const RECEIPT_TARGET_BYTES=350*1024;
export const RECEIPT_MAX_EDGE=2200;
export function receiptDimensions(width:number,height:number,maxEdge=RECEIPT_MAX_EDGE) {
  if(!Number.isFinite(width)||!Number.isFinite(height)||width<=0||height<=0||width*height>40000000)throw new Error('Choose a receipt photo under 40 megapixels.');
  // Long, narrow receipts must not become tiny strips just to meet the target.
  const shortEdge=Math.min(width,height);
  const scale=Math.min(1,Math.max(maxEdge/Math.max(width,height),Math.min(1000,shortEdge)/shortEdge));
  return {width:Math.max(1,Math.round(width*scale)),height:Math.max(1,Math.round(height*scale))};
}
/** No network calls. Keep legible dimensions and never store a larger recompression. */
export async function compressReceipt(file:File):Promise<File> {
  if(file.size>20*1024*1024)throw new Error('Choose a receipt photo under 20 MB.');
  if(!['image/jpeg','image/png','image/webp'].includes(file.type))throw new Error('Choose a JPEG, PNG or WebP receipt photo. Export HEIC as JPEG first.');
  let bitmap:ImageBitmap;
  try {bitmap=await createImageBitmap(file);}catch{throw new Error('This photo could not be opened. Try a JPEG or PNG.');}
  try {
    const size=receiptDimensions(bitmap.width,bitmap.height),canvas=document.createElement('canvas');
    canvas.width=size.width;canvas.height=size.height;
    const ctx=canvas.getContext('2d');if(!ctx)throw new Error('Photo processing is unavailable in this browser.');
    ctx.fillStyle='#ffffff';ctx.fillRect(0,0,size.width,size.height);ctx.drawImage(bitmap,0,0,size.width,size.height);
    let best:Blob=file;
    for(const quality of [0.86,0.8,0.74]){
      const candidate=await new Promise<Blob|null>(resolve=>canvas.toBlob(resolve,'image/jpeg',quality));
      if(candidate&&candidate.size<best.size)best=candidate;
      if(best.size<=RECEIPT_TARGET_BYTES)break;
    }
    if(best.size>RECEIPT_MAX_BYTES)throw new Error('This photo is still over 1 MB at readable quality. Crop closer to the receipt or retake it.');
    return best===file?file:new File([best],file.name.replace(/\.[^.]*$/,'')+'.jpg',{type:'image/jpeg',lastModified:file.lastModified});
  }finally{bitmap.close();}
}
