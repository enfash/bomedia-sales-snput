import { expect,it } from 'vitest';
import { serializeJsonParameter } from './postgres-json.mjs';
it('serializes JSON text and objects identically without wrapping either as a scalar string',()=>{
  const value={amount_kobo:'9007199254740993',job_ids:['a','b'],notes:'Quote " and slash \\'};
  expect(JSON.parse(serializeJsonParameter(JSON.stringify(value)))).toEqual(value);
  expect(serializeJsonParameter(value)).toBe(serializeJsonParameter(JSON.stringify(value)));
});
