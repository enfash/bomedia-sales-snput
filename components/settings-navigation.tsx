"use client";

import { Settings, Users, BriefcaseBusiness, Landmark, Wallet, ScrollText, Receipt, Activity, CalendarCheck, Layers, ShieldCheck, BellRing } from 'lucide-react';

export const ownerSettingsNav = {href:'/bom03/settings',label:'Settings',icon:Settings,primary:false};
// One registry drives the settings hub; future sections can be added here.
export const settingsSections = [
  {href:'/bom03/settings/services',title:'Services',description:'Manage what staff can sell, prices and availability.',icon:BriefcaseBusiness},
  {href:'/bom03/settings/materials',title:'Materials',description:'One price per material for every size, plus sizes and low-stock levels.',icon:Layers},
  {href:'/bom03/settings/business-details',title:'Business details',description:'Bank account, phone, email and address printed on invoices.',icon:Landmark},
  {href:'/bom03/settings/payment-methods',title:'Payment methods',description:'Rename Cash, Transfer and POS, or turn one off.',icon:Wallet},
  {href:'/bom03/settings/expense-categories',title:'Expense categories',description:'Add the headings staff pick for expenses, or turn one off.',icon:Receipt},
  {href:'/bom03/settings/audit-log',title:'Audit log',description:'See who did what, and when. Read-only.',icon:ScrollText},
  {href:'/bom03/settings/bookkeeping-period',title:'Bookkeeping period',description:'Close finished months so their figures can never change.',icon:CalendarCheck},
  {href:'/bom03/settings/approvals',title:'Approvals',description:'Choose which sales wait for your approval: a different date or price.',icon:ShieldCheck},
  {href:'/bom03/settings/phone-alerts',title:'Phone alerts',description:'Get a buzz on your phone when something needs your approval.',icon:BellRing},
  {href:'/bom03/settings/system-status',title:'System status',description:'Check the database, recent activity and entries waiting on this phone.',icon:Activity},
  {href:'/bom03/settings/staff',title:'Staff Manager',description:'Manage staff accounts, access and performance.',icon:Users},
] as const;
