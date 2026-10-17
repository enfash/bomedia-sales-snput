import { nairaToKobo } from './accounting-entry';
import { orderItemTotal, type OrderCatalog, type OrderItem } from './order-contract';
export type OrderCartRow = { id: string; materialId: string; rollLabel: string; itemName: string; widthFt: number;
 jobDescription: string; jobWidth: number; jobHeight: number; dimUnit: 'ft'|'in'; qty: number; costPerSqft: number;
 unitSqft: number; unitCost: number; totalAmount: number; jobLengthFt: number; remainingAfterJob: number; fromInventory: boolean; isFlipped: boolean; orderItem?: OrderItem };
export function cartOrderItem(item: OrderCartRow, catalog?: OrderCatalog|null): OrderItem {
 if(item.orderItem)return item.orderItem;
 const price=nairaToKobo(String(item.costPerSqft));
 if(!price||price==='0')throw new Error('Enter a positive price with no more than two decimal places.');
 return {kind:'print',ref:catalog?.materials.find(m=>m.ref===item.materialId)?.id||item.materialId,description:item.jobDescription,
 quantity:String(item.qty),width:String(item.jobWidth),height:String(item.jobHeight),unit:item.dimUnit,priceKobo:price};
}
export function serviceCartItem(item:OrderItem,name:string):OrderCartRow {
 return {id:crypto.randomUUID(),materialId:'',rollLabel:name,itemName:name,widthFt:0,jobDescription:item.description,jobWidth:0,jobHeight:0,dimUnit:'ft',
 qty:Number(item.quantity),costPerSqft:0,unitSqft:0,unitCost:Number(item.approvedUnitKobo||item.priceKobo)/100,totalAmount:Number(orderItemTotal(item))/100,
 jobLengthFt:0,remainingAfterJob:0,fromInventory:false,isFlipped:false,orderItem:item};
}
type QuoteLine={material_id?:string;service_id?:string;description:string;quantity:string;width_ft?:string;height_ft?:string;unit_price_kobo:string;
 price_request?:{id:string;status:string;requested_unit_price_kobo:string}|null};
export type ScreenQuote={found:boolean;legacy?:boolean;used?:boolean;estimate_id:string;quote_number:string;customer_id?:string;client_name:string;total_kobo:string;items:QuoteLine[]};
export function quoteCart(quote:ScreenQuote,catalog:OrderCatalog):OrderCartRow[] {
 if(!quote.found||quote.legacy||quote.used||!Array.isArray(quote.items)||!quote.items.length)throw new Error('This quote is unavailable, historical or already converted. Ask the owner to review it.');
 return quote.items.map(line=>{
  if(line.price_request?.status==='pending')throw new Error('A quote price is still waiting for the owner.');
  const approved=line.price_request?.status==='approved'?{priceRequestId:line.price_request.id,approvedUnitKobo:line.price_request.requested_unit_price_kobo}:{};
  if(line.service_id){
   const service=catalog.services.find(s=>s.id===line.service_id);
   if(!service||(!approved.priceRequestId&&service.pricing==='per_job'))throw new Error('This service needs an owner-approved quote.');
   return serviceCartItem({kind:'service',ref:service.id,description:line.description,quantity:line.quantity,priceKobo:service.priceKobo||approved.approvedUnitKobo!,...approved},service.name);
  }
  const material=catalog.materials.find(m=>m.id===line.material_id);
  if(!material)throw new Error('A quoted material is no longer available. No items were dropped.');
  const item:OrderItem={kind:'print',ref:material.id,description:line.description,quantity:line.quantity,width:line.width_ft!,height:line.height_ft!,unit:'ft',priceKobo:material.priceKobo,...approved};
  const w=Number(line.width_ft),h=Number(line.height_ft),width=Number(material.width),qty=Number(line.quantity);
  const normal=w<=width?Math.ceil(qty/Math.floor(width/w))*h:Infinity;
  const rotated=h<=width?Math.ceil(qty/Math.floor(width/h))*w:Infinity;
  if(!Number.isFinite(Math.min(normal,rotated)))throw new Error('A quoted item does not fit the roll. Review it before saving.');
  const total=Number(orderItemTotal(item))/100;
  return {id:crypto.randomUUID(),materialId:material.ref,rollLabel:material.ref,itemName:material.name,widthFt:width,jobDescription:line.description,
   jobWidth:w,jobHeight:h,dimUnit:'ft' as const,qty,costPerSqft:Number(material.priceKobo)/100,unitSqft:w*h,unitCost:total/qty,totalAmount:total,
   jobLengthFt:Math.min(normal,rotated),remainingAfterJob:0,fromInventory:true,isFlipped:rotated<normal,orderItem:item};
 });
}
