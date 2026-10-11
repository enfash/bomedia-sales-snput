import {expect,it} from 'vitest';
import {receiptDimensions,RECEIPT_MAX_BYTES} from './receipt-image';
it('preserves aspect ratio and never enlarges a receipt',()=>{
 expect(receiptDimensions(4000,3000)).toEqual({width:2200,height:1650});
 expect(receiptDimensions(1000,2000)).toEqual({width:1000,height:2000});
 expect(receiptDimensions(500,5000)).toEqual({width:500,height:5000});
 expect(RECEIPT_MAX_BYTES).toBe(1048576);
});
it('rejects invalid dimensions and extreme pixel counts',()=>{
 for(const [w,h] of [[0,1],[NaN,1],[10000,10000]])expect(()=>receiptDimensions(w,h)).toThrow();
});
