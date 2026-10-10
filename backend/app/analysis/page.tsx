"use client";
import { AnalysisWorkspace, type AnalysisApi } from "./AnalysisWorkspace";
import { useInterfaceLanguage } from "../interface-language";
import "./analysis-workspace.css";

async function call<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(path, body === undefined ? {} : {method:"POST", headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
  const data = await response.json() as {detail?: string; error?: string};
  if (!response.ok) throw new Error(data.detail || data.error || "request_failed");
  return data as T;
}
const api: AnalysisApi = {get: call, post: call};
export default function AnalysisPage() {
  const {language,setLanguage} = useInterfaceLanguage();
  return <main data-native-i18n><header style={{maxWidth:1280,margin:"auto",padding:"20px 24px",display:"flex",justifyContent:"space-between"}}><a href="/">{language==="en"?"← Posts and collection archive":"← 帖子与采集记录"}</a><select aria-label={language==="en"?"Interface language":"界面语言"} value={language} onChange={e=>setLanguage(e.target.value as "en"|"zh-CN")}><option value="zh-CN">中文</option><option value="en">English</option></select></header><AnalysisWorkspace locale={language} api={api}/></main>;
}
