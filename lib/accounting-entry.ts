// Exact browser inputs for the PostgreSQL workflow; no floating-point money.
const maxKobo=BigInt('9223372036854775807');
export function nairaToKobo(value:string):string|null {
  const match=/^(0|[1-9][0-9]*)(?:\.([0-9]{1,2}))?$/.exec(value.trim());
  if(!match)return null;
  const amount=BigInt(match[1])*BigInt(100)+BigInt((match[2]||'').padEnd(2,'0'));
  return amount<=maxKobo ? amount.toString() : null;
}
export function quotedUnitPrice(width:string,height:string,price:string):string|null {
  const fixed=(value:string)=>{
    const match=/^([0-9]{1,6})(?:\.([0-9]{1,6}))?$/.exec(value);
    return match ? BigInt(match[1])*BigInt(1000000)+BigInt((match[2]||'').padEnd(6,'0')) : BigInt(0);
  };
  if(!/^[1-9][0-9]*$/.test(price))return null;
  const w=fixed(width),h=fixed(height),scale=BigInt('1000000000000');
  if(w<=BigInt(0)||h<=BigInt(0))return null;
  const amount=(w*h*BigInt(price)+scale/BigInt(2))/scale;
  return amount>BigInt(0)&&amount<=maxKobo ? amount.toString() : null;
}
export function lagosBusinessDate(now=new Date()):string {
  const parts=new Intl.DateTimeFormat('en-GB',{timeZone:'Africa/Lagos',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);
  return ['year','month','day'].map(type=>parts.find(p=>p.type===type)!.value).join('-');
}
