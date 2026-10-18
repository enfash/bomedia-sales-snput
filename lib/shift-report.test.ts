import {expect,it,vi} from 'vitest';
import {shiftTotals,formatKobo,fetchShiftData,type ShiftData} from './shift-report';
const data:ShiftData={date:'2026-10-18',sales:[],staff:[],payments:[{_staffId:'ada',_amountKobo:'100001','PAYMENT METHOD':'Cash'},{_staffId:'bola',_amountKobo:'200000','PAYMENT METHOD':'Transfer'}],expenses:[{_staffId:'ada',_amountKobo:'50000','PAYMENT METHOD':'Cash'}]};
it('counts all receipts including old debts, scopes every movement, and separates cash from transfers',()=>{
 expect(shiftTotals(data)).toMatchObject({receipts:BigInt('300001'),spent:BigInt('50000'),net:BigInt('250001'),netCash:BigInt('50001'),cash:BigInt('100001'),transfer:BigInt('200000')});
 expect(shiftTotals(data,'ada')).toMatchObject({receipts:BigInt('100001'),spent:BigInt('50000'),netCash:BigInt('50001')});
 expect(shiftTotals(data,'bola')).toMatchObject({receipts:BigInt('200000'),spent:BigInt('0'),netCash:BigInt('0')});
 expect(formatKobo(BigInt('900719925474099399'))).toBe('₦9,007,199,254,740,993.99');
});
it('fails closed on HTTP failures, malformed arrays and invalid amounts',async()=>{
 for(const response of [Response.json({error:'unavailable'},{status:503}),Response.json({...data,payments:{}}),Response.json({...data,payments:[{_amountKobo:'bad'}]})])
 await expect(fetchShiftData(data.date,vi.fn().mockResolvedValue(response))).rejects.toThrow();
 expect(await fetchShiftData(data.date,vi.fn().mockResolvedValue(Response.json(data)))).toEqual(data);
});
