import { getDataSource } from "@/lib/data";

export async function GET(request: Request) {
  const q = new URL(request.url).searchParams.get("q") ?? "";
  const hits = await getDataSource().searchTickers(q.slice(0, 40));
  return Response.json({ hits }, { headers: { "cache-control": "public, max-age=60" } });
}
