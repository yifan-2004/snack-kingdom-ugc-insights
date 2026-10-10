import { useCallback, useEffect, useState } from 'react'
import { AppShell, type PageKey } from './components/AppShell'
import { ContentPage } from './features/content/ContentPage'
import { CollectionPipelinePage } from './features/jobs/CollectionPipelinePage'
import { OverviewPage } from './features/overview/OverviewPage'
import { RagPage } from './features/rag/RagPage'
import { useOverview } from './hooks/useOverview'
import { LanguageProvider } from './i18n/LanguageContext'
import { ContextReviewPage } from './features/review/ContextReviewPage'
import { EvaluationPage } from './features/evaluation/EvaluationPage'
import { HostedCollectionPage, HostedRagPage } from './features/hosted/HostedPages'

const hosted = import.meta.env.VITE_HOSTED_SITE === 'true'

function pageFromLocation(): PageKey {
  const value = new URLSearchParams(location.search).get('page')
  if ((window as Window & { __SOCIALPULSE_ROLE__?: string }).__SOCIALPULSE_ROLE__ === 'viewer') return value === 'content' ? 'content' : 'overview'
  return ['overview', 'content', 'collection', 'analysis', 'review', 'evaluation'].includes(value || '') ? value as PageKey : 'overview'
}

function WorkbenchApp() {
  const [page, setPage] = useState<PageKey>(pageFromLocation)
  const [reviewVisited, setReviewVisited] = useState(page === 'review')
  useEffect(() => {
    const restore = () => { const next = pageFromLocation(); if (next === 'review') setReviewVisited(true); setPage(next) }
    window.addEventListener('popstate', restore)
    return () => window.removeEventListener('popstate', restore)
  }, [])
  useEffect(() => {
    const url = new URL(location.href); url.searchParams.set('page', page)
    window.history.replaceState(null, '', url)
  }, [page])
  const [selectedPost, setSelectedPost] = useState<string | null>(null)
  const [returnPage, setReturnPage] = useState<PageKey | null>(null)
  const [reportPostIds, setReportPostIds] = useState<string[]>([])
  const [selectingReportPosts, setSelectingReportPosts] = useState(false)
  const overview = useOverview()
  const openPost = useCallback((postId: string) => { setReturnPage(page); setSelectingReportPosts(false); setSelectedPost(postId); const url = new URL(location.href); url.searchParams.set('page','content'); history.pushState(null,'',url); setPage('content') }, [page])
  const navigate = useCallback((next: PageKey) => {
    if (!window.dispatchEvent(new Event('before-workbench-navigate', { cancelable: true }))) return
    setSelectingReportPosts(false); setSelectedPost(null); setReturnPage(null); setPage(next)
    if (next === 'review') setReviewVisited(true)
    const url = new URL(location.href)
    url.searchParams.set('page', next)
    window.history.pushState(null, '', url)
  }, [])
  return <AppShell page={page} onNavigate={navigate}>
    {page === 'overview' ? <OverviewPage data={overview.data} loading={overview.loading} error={overview.error} onRefresh={overview.refresh} onOpenPost={openPost} onNewAnalysis={() => navigate('analysis')} onStartCollection={() => navigate('collection')} onOpenContent={() => navigate('content')} /> : null}
    {page === 'content' ? <ContentPage jobId="processed" initialPostId={selectedPost} onPostClosed={() => { setSelectedPost(null); if(returnPage) { setPage(returnPage); setReturnPage(null); history.back() } }} selectionMode={selectingReportPosts} initialSelectedIds={reportPostIds} onConfirmSelection={(ids) => { setReportPostIds(ids); setSelectingReportPosts(false); setPage('analysis') }} onCancelSelection={() => { setSelectingReportPosts(false); setPage('analysis') }} /> : null}
    {page === 'collection' ? hosted ? <HostedCollectionPage /> : <CollectionPipelinePage onOpenContent={() => navigate('content')} onOpenReports={() => navigate('analysis')} /> : null}
    {page === 'analysis' ? hosted ? <HostedRagPage /> : <RagPage selectedPostIds={reportPostIds} onSelectPosts={() => { setSelectingReportPosts(true); setPage('content') }} /> : null}
    {page === 'evaluation' ? <EvaluationPage onOpenPost={openPost} /> : null}
    {reviewVisited && <div hidden={page !== 'review'}><ContextReviewPage active={page === 'review'} /></div>}
  </AppShell>
}

export default function App() {
  return <LanguageProvider><WorkbenchApp /></LanguageProvider>
}
