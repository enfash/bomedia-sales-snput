"use client";

import { Settings, Users, BriefcaseBusiness, Landmark, Wallet, ScrollText, Receipt } from 'lucide-react';

export const ownerSettingsNav = {href:'/bom03/settings',label:'Settings',icon:Settings,primary:false};
// One registry drives the settings hub; future sections can be added here.
export const settingsSections = [
  {href:'/bom03/settings/services',title:'Services',description:'Manage what staff can sell, prices and availability.',icon:BriefcaseBusiness},
  {href:'/bom03/settings/business-details',title:'Business details',description:'Bank account, phone, email and address printed on invoices.',icon:Landmark},
  {href:'/bom03/settings/payment-methods',title:'Payment methods',description:'Rename Cash, Transfer and POS, or turn one off.',icon:Wallet},
  {href:'/bom03/settings/expense-categories',title:'Expense categories',description:'Add the headings staff pick for expenses, or turn one off.',icon:Receipt},
  {href:'/bom03/settings/audit-log',title:'Audit log',description:'See who did what, and when. Read-only.',icon:ScrollText},
  {href:'/bom03/settings/staff',title:'Staff Manager',description:'Manage staff accounts, access and performance.',icon:Users},
] as const;
