import { expect,it } from 'vitest';
import { askedUnitKobo,billing,itemFigures,toFeet,type JobItem } from './job-items';
const material={id:'m',name:'Flex',width_ft:'10',selling_price_per_sqft_kobo:'25000',remaining_length_ft:'212'};
const item=(extra:Partial<JobItem>={}):JobItem=>({key:'a',materialId:'m',description:'Banner',width:'8',height:'4',unit:'ft',quantity:'2',...extra});
it('converts inches to exact six-decimal feet',()=>{
  expect(toFeet('6','in')).toBe('0.5');expect(toFeet('5','in')).toBe('0.416667');expect(toFeet('0','ft')).toBeNull();expect(toFeet('1e3','ft')).toBeNull();
});
it('tiles pieces across the roll and prices from the catalog',()=>{
  expect(itemFigures(item(),material)).toMatchObject({fits:true,rollLengthFt:8,listUnitKobo:'800000'});
  expect(itemFigures(item({width:'12',height:'11'}),material)?.fits).toBe(false);
  expect(billing(item(),material)).toMatchObject({unitKobo:'800000',totalKobo:'1600000',priceChanged:false});
});
it('uses an approved price, waits on a pending one and flags a changed list price',()=>{
  const quoted=(status:string)=>item({quoted:{unitPriceKobo:'700000',currentUnitPriceKobo:'800000',request:{id:'r',status,requestedUnitPriceKobo:'650000',note:null}}});
  expect(billing(quoted('approved'),material)).toMatchObject({unitKobo:'650000',approvedRequestId:'r',priceChanged:false});
  expect(billing(quoted('pending'),material)).toMatchObject({waiting:true,priceChanged:true,unitKobo:'800000'});
  expect(billing(quoted('declined'),material)).toMatchObject({declined:true,priceChanged:true});
});
it('turns an asked total into a per-piece price',()=>{
  expect(askedUnitKobo('1500000','2')).toBe('750000');expect(askedUnitKobo('100','3')).toBe('33');expect(askedUnitKobo('0','2')).toBeNull();
});
