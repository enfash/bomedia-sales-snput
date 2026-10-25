import { financialHandler,financialIdentity } from './financial-routes';
import { FinancialError } from './financial-service';
import { paymentMethodSettings } from './payment-method-settings';
import { verifiedAdminIdentity } from './postgres-auth-routes';

// Owner only: staff keep using the existing payment methods read (enabled methods only).
export function listPaymentMethodSettings() {
  return financialHandler(async()=>{
    if(!await verifiedAdminIdentity())throw new FinancialError('Owner access is required to see payment method settings.',403,'OWNER_REQUIRED');
    await financialIdentity(false);
    return paymentMethodSettings.list();
  });
}
export function savePaymentMethodSetting(request:Request) {
  return financialHandler(async()=>{
    if(!await verifiedAdminIdentity())throw new FinancialError('Owner access is required to change payment methods.',403,'OWNER_REQUIRED');
    const actor=await financialIdentity(true);
    if(!actor)throw new FinancialError('Owner accounting identity required.',403,'ACTOR_REQUIRED');
    let body:unknown;
    try {body=await request.json();}catch{throw new FinancialError('Invalid payment method request.',400,'INVALID_INPUT');}
    return {success:true,...await paymentMethodSettings.save(actor,body)};
  });
}
