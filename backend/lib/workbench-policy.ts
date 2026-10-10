// Fail-closed list of the current desktop UI's backend contracts.
// Local bootstrap sessions, arbitrary admin endpoints and external sync are not exposed.
export function workbenchRouteAllowed(method: string, path: string): boolean {
  if (/%|\\|\/\//.test(path)) return false;
  const id = '[A-Za-z0-9_-]+';
  const routes: Record<string, RegExp[]> = {
    GET: [
      /^\/api\/(health|system\/status|overview\/(latest|needs|explorer|campaign)|admin\/db-stats|model-center|settings\/api-key|context-review|collection-jobs|pipeline-jobs|processing-jobs|rag\/(status|benchmark\/questions)|crawler\/status|web-sync\/status)$/,
      new RegExp(`^/api/(processed-posts|posts)(/(time-tree|${id})(/packet)?)?$`),
      new RegExp(`^/api/evaluation/(questions|runs(/${id})?)$`),
      /^\/api\/analysis\/(capabilities|jobs)$/,
      /^\/media\/[A-Za-z0-9_./-]+$/,
    ],
    POST: [
      /^\/api\/(context-review|pipeline-jobs|processing-jobs|processing-jobs\/backfill|rag\/(ask|index|benchmark)|reports(\/(preview|stream|export))?|deletions\/(preview|execute)|evaluation\/(questions|runs|cancel|grade)|crawler\/(run-now|login\/(xhs|douyin))|web-sync\/(check|run))$/,
      new RegExp(`^/api/(pipeline-jobs|processing-jobs)/${id}/(cancel|retry|process-saved)$`),
      new RegExp(`^/api/analysis/(snapshot|report|ask|jobs(/${id}/(cancel|resume))?)$`),
    ],
    PUT: [
      /^\/api\/(model-center|settings\/api-key|crawler\/schedule|web-sync\/settings)$/,
      new RegExp(`^/api/(overview/campaign/${id}|processed-posts/${id}/packet)$`),
    ],
  };
  return !path.split('/').includes('..') && (routes[method] || []).some(pattern => pattern.test(path));
}

export function workbenchViewerRouteAllowed(method: string, path: string): boolean {
  if (method !== 'GET' || /%|\\|\/\//.test(path) || path.split('/').includes('..')) return false;
  const id = '[A-Za-z0-9_-]+';
  return [
    /^\/api\/(health|system\/status|overview\/(latest|needs|explorer))$/,
    new RegExp(`^/api/processed-posts(/(time-tree|${id})(/packet)?)?$`),
    /^\/media\/[A-Za-z0-9_./-]+$/,
  ].some(pattern => pattern.test(path));
}

export function workbenchPage(path: string): string | null {
  const aliases: Record<string, string> = {
    '/': '', '/analysis': 'analysis', '/workspace': 'analysis',
    '/evaluation': 'evaluation', '/evaluation/ai-review': 'evaluation',
    '/evaluation/sentiment': 'evaluation',
  };
  return Object.hasOwn(aliases, path) ? aliases[path] : null;
}
