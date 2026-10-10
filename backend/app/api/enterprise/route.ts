// Multi-company functionality is retired. Never reopen it through a runtime flag.
export const dynamic = "force-dynamic";
function retired() {
  return Response.json({error:"多企业版本已撤下，请使用单企业工作台。"},
    {status:410,headers:{"Cache-Control":"private, no-store"}});
}
export const GET = retired;
export const POST = retired;
