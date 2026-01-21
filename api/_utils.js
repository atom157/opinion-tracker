export function setCors(res){
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, x-api-key");
}

export function handleOptions(req, res){
  if (req.method === "OPTIONS"){
    setCors(res);
    res.status(200).end();
    return true;
  }
  return false;
}

export function getApiKey(){
  return process.env.OPINION_API_KEY || process.env.OPINION_OPENAPI_KEY || process.env.API_KEY || "";
}

export async function fetchJson(url, apiKey){
  const headers = { "Accept":"application/json" };
  if (apiKey) headers["x-api-key"] = apiKey;
  const r = await fetch(url, { headers });
  const text = await r.text();
  let json;
  try{ json = JSON.parse(text); } catch { json = { raw:text }; }
  return { status: r.status, json };
}

export function ok(res, json){
  setCors(res);
  res.status(200).json(json);
}

export function fail(res, status, message, extra={}){
  setCors(res);
  res.status(status).json({ code: -1, msg: message, ...extra });
}
