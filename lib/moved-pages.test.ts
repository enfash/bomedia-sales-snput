import { afterEach,expect,it,vi } from 'vitest';
import { movedPage } from './moved-pages';
afterEach(()=>vi.unstubAllEnvs());
it('leaves the old pages alone while Sheets is in charge',()=>{
  vi.stubEnv('POSTGRES_FINANCIAL_API_ENABLED','false');
  expect(movedPage('/cashier/new-entry')).toBeNull();
});
it('sends old entry pages to their replacements once Postgres is in charge',()=>{
  vi.stubEnv('POSTGRES_FINANCIAL_API_ENABLED','true');
  expect(movedPage('/cashier/new-entry')).toBe('/cashier/accounting');
  expect(movedPage('/bom03/estimator/')).toBe('/bom03/accounting');
  expect(movedPage('/cashier/waste')).toBe('/cashier/stock');
  expect(movedPage('/cashier/records')).toBeNull();
  expect(movedPage('/bom03/accounting')).toBeNull();
});
