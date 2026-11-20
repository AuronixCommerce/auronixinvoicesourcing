import {env} from 'cloudflare:workers';
export const dynamic='force-dynamic';
export async function GET(){return Response.json({databaseConfigured:!!(env as any).FIREBASE_DATABASE_URL,adminUid:'w3NzuxTFqwYoweS9CWOXC8RROzp1'},{headers:{'Cache-Control':'no-store'}});}
