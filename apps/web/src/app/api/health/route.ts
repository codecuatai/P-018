/** Technical container probe only; product/auth authority remains the Gateway. */
export function GET() {
  return Response.json({ status: "ok" });
}
