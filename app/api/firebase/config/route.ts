export const dynamic='force-dynamic';
export const runtime='nodejs';
export async function GET(){return Response.json({databaseConfigured:!!process.env.FIREBASE_DATABASE_URL,adminUid:'w3NzuxTFqwYoweS9CWOXC8RROzp1'},{headers:{'Cache-Control':'no-store'}});}
