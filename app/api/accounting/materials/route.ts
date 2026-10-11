import { readMaterialsAdmin, saveMaterial } from '@/lib/server/materials-admin-routes';
export const dynamic = 'force-dynamic';
export const GET = readMaterialsAdmin;
export const POST = saveMaterial;
