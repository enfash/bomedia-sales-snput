import { expect, it } from 'vitest';
import { createServiceCatalog } from './service-catalog';

it('explains an unapplied pricing update without discarding the saved request', async () => {
  const catalog=createServiceCatalog(async()=>{throw Object.assign(new Error('Name, pricing and (for fixed services) a price are required'),{code:'22023'});});
  await expect(catalog.save({staffId:'00000000-0000-4000-8000-000000000001'},
    {requestId:'saved-delivery',name:'Delivery',pricing:'variable',visible:true})).rejects.toMatchObject({
      status:503,code:'SERVICE_PRICING_UPDATE_REQUIRED',message:expect.stringContaining('Keep this saved entry'),
    });
});
