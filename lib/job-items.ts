// Exact item maths for the Job tab. Money is integer kobo (BigInt); sizes are
// sent as feet with at most six decimals, matching the server's pricing.
import { quotedUnitPrice } from './accounting-entry';

export type JobItem={key:string;materialId:string;description:string;width:string;height:string;unit:'ft'|'in';quantity:string;
  ask?:{totalKobo:string;reason:string};
  // Set when the item came from a saved quote and is unchanged since loading.
  quoted?:{unitPriceKobo:string;currentUnitPriceKobo:string|null;request?:{id:string;status:string;requestedUnitPriceKobo:string;note:string|null}}};
export type JobMaterial={id:string;name:string;width_ft:string;selling_price_per_sqft_kobo:string;remaining_length_ft?:string};
const decimal=/^(0|[1-9][0-9]{0,5})(\.[0-9]{1,6})?$/;

export function toFeet(value:string,unit:'ft'|'in'):string|null {
  if(!decimal.test(value.trim()))return null;
  if(unit==='ft')return Number(value)>0 ? value.trim() : null;
  // inches/12, rounded to six decimals so the server sees exactly what we priced.
  const match=/^([0-9]+)(?:\.([0-9]{1,6}))?$/.exec(value.trim())!;
  const micro=BigInt(match[1])*BigInt(1000000)+BigInt((match[2]||'').padEnd(6,'0'));
  const feetMicro=(micro+BigInt(6))/BigInt(12);
  if(feetMicro<=BigInt(0))return null;
  const whole=feetMicro/BigInt(1000000),fraction=(feetMicro%BigInt(1000000)).toString().padStart(6,'0').replace(/0+$/,'');
  return fraction ? `${whole}.${fraction}` : whole.toString();
}
export const validQuantity=(value:string)=>/^[1-9][0-9]{0,4}$/.test(value)&&Number(value)<=10000;

export function itemFigures(item:JobItem,material:JobMaterial|undefined) {
  const w=toFeet(item.width,item.unit),h=toFeet(item.height,item.unit);
  if(!material||!w||!h||!validQuantity(item.quantity))return null;
  const roll=Number(material.width_ft),wn=Number(w),hn=Number(h),q=Number(item.quantity);
  const normal=wn<=roll ? Math.ceil(q/Math.floor(roll/wn))*hn : null;
  const rotated=hn<=roll ? Math.ceil(q/Math.floor(roll/hn))*wn : null;
  const lengths=[normal,rotated].filter((v):v is number=>v!==null);
  const listUnit=quotedUnitPrice(w,h,material.selling_price_per_sqft_kobo);
  return {widthFt:w,heightFt:h,fits:lengths.length>0,rollLengthFt:lengths.length ? Math.min(...lengths) : null,
    rotated:rotated!==null&&(normal===null||rotated<normal),areaSqft:wn*hn,listUnitKobo:listUnit};
}
// The unit price the job will be billed at, and whether it may be recorded now.
export function billing(item:JobItem,material:JobMaterial|undefined) {
  const figures=itemFigures(item,material);
  if(!figures||!figures.fits||!figures.listUnitKobo)return null;
  const request=item.quoted?.request;
  const approved=request?.status==='approved' ? request.requestedUnitPriceKobo : null;
  const unit=approved ?? figures.listUnitKobo;
  const priceChanged=!approved && !!item.quoted && item.quoted.unitPriceKobo!==figures.listUnitKobo;
  return {...figures,unitKobo:unit,totalKobo:(BigInt(unit)*BigInt(item.quantity)).toString(),approvedRequestId:approved ? request!.id : null,
    waiting:request?.status==='pending',declined:request?.status==='declined',priceChanged,
    quotedTotalKobo:item.quoted ? (BigInt(item.quoted.unitPriceKobo)*BigInt(item.quantity)).toString() : null};
}
// Asked total for all pieces -> per-piece kobo (rounded), as the server stores unit prices.
export function askedUnitKobo(totalKobo:string,quantity:string):string|null {
  if(!/^[1-9][0-9]*$/.test(totalKobo)||!validQuantity(quantity))return null;
  const q=BigInt(quantity),unit=(BigInt(totalKobo)+q/BigInt(2))/q;
  return unit>BigInt(0) ? unit.toString() : null;
}
