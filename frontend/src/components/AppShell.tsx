import {
  BarChart3,
  FileSearch,
  PackageSearch,
  MessagesSquare,
  Languages,
  ClipboardCheck,
  type LucideIcon,
} from 'lucide-react'
import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { useLanguage } from '../i18n/LanguageContext'

export type PageKey = 'overview' | 'content' | 'collection' | 'analysis' | 'review' | 'evaluation'

const navigation: Array<{ key: PageKey; label: string; icon: LucideIcon }> = [
  { key: 'overview', label: '舆情总览', icon: BarChart3 },
  { key: 'content', label: '内容洞察', icon: FileSearch },
  { key: 'review', label: '评论审核', icon: ClipboardCheck },
  { key: 'collection', label: '采集与处理', icon: PackageSearch },
  { key: 'analysis', label: '报告&问答', icon: MessagesSquare },
  { key: 'evaluation', label: '系统评估', icon: ClipboardCheck },
]

interface AppShellProps {
  page: PageKey
  onNavigate: (page: PageKey) => void
  children: ReactNode
}

/** 手写风饼干轮廓（暖棕线条） */
function CookieIcon() {
  return (
    <svg className="brand-icon brand-cookie" viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <circle cx="16" cy="16" r="10.5" fill="#f2d8a0" stroke="#4a3423" strokeWidth="1.8" />
      <circle cx="12.5" cy="13" r="1.6" fill="#4a3423" />
      <circle cx="19.5" cy="12" r="1.6" fill="#4a3423" />
      <circle cx="14" cy="19.5" r="1.6" fill="#4a3423" />
      <circle cx="20" cy="18.5" r="1.6" fill="#4a3423" />
    </svg>
  )
}

/** 手写风糖果轮廓（暖棕线条 + 亮黄糖纸） */
function CandyIcon() {
  return (
    <svg className="brand-icon brand-candy" viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <path d="M11 16 4.5 11v10L11 16Z" fill="#ffe71e" stroke="#4a3423" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M21 16l6.5-5v10L21 16Z" fill="#ffe71e" stroke="#4a3423" strokeWidth="1.6" strokeLinejoin="round" />
      <circle cx="16" cy="16" r="5.4" fill="#ff8f5f" stroke="#4a3423" strokeWidth="1.8" />
      <path d="M13.6 13.8c1-1 2.7-1.3 4-.4" stroke="#fff9ef" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

export function AppShell({ page, onNavigate, children }: AppShellProps) {
  const { language, setLanguage } = useLanguage()
  const en = language === 'en'
  const webRole = (window as Window & { __SOCIALPULSE_ROLE__?: string }).__SOCIALPULSE_ROLE__
  const visibleNavigation = webRole === 'viewer' ? navigation.filter(item => ['overview', 'content'].includes(item.key)) : navigation
  const labels: Record<PageKey, string> = { overview: 'Overview', content: 'Content Insights', review: 'Comment review', collection: 'Collect & Process', analysis: 'Reports & Q&A', evaluation: 'System evaluation' }
  const navRef = useRef<HTMLElement>(null)
  const previousIndexRef = useRef(0)
  const activeIndex = Math.max(0, visibleNavigation.findIndex((item) => item.key === page))
  const direction = activeIndex >= previousIndexRef.current ? 1 : -1
  const [pill, setPill] = useState({ x: 0, y: 0, w: 0, h: 0, ready: false })

  useLayoutEffect(() => {
    previousIndexRef.current = activeIndex
    const update = () => {
      const nav = navRef.current
      const active = nav?.querySelector<HTMLElement>('.nav-item.active')
      if (!nav || !active) return
      setPill({ x: active.offsetLeft, y: active.offsetTop, w: active.offsetWidth, h: active.offsetHeight, ready: true })
    }
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [activeIndex, language])

  return (
    <div className="app-shell" style={{ '--page-dir': direction } as CSSProperties}>
      <aside className="sidebar" data-native-i18n>
        <div className="brand" aria-label={en ? 'Snack Kingdom UGC Workbench' : '零食王国 UGC 工作台'}>
          <span className="brand-mark" aria-hidden="true"><CookieIcon /><CandyIcon /></span>
          <span className="brand-copy">
            <strong>{en ? 'Snack Kingdom' : '零食王国'}</strong>
            <small>{en ? 'Insights Workbench' : '舆情工作台'}</small>
          </span>
        </div>
        <nav className="nav" aria-label={en ? 'Main navigation' : '主导航'} ref={navRef}>
          <span
            className="nav-pill"
            aria-hidden="true"
            style={{
              transform: `translate3d(${pill.x}px, ${pill.y}px, 0)`,
              width: pill.w,
              height: pill.h,
              opacity: pill.ready ? 1 : 0,
            }}
          />
          {visibleNavigation.map(({ key, label, icon: Icon }) => (
            <button
              type="button"
              key={key}
              className={page === key ? 'nav-item active' : 'nav-item'}
              aria-current={page === key ? 'page' : undefined}
              onClick={() => onNavigate(key)}
            >
              <Icon size={18} strokeWidth={1.8} aria-hidden="true" />
              <span>{en ? labels[key] : label}</span>
            </button>
          ))}
        </nav>
        <section className="language-switch" aria-label={en ? 'Change interface language' : '切换界面语言'}>
          <span><Languages size={14} aria-hidden="true" />{en ? 'Interface language' : '界面语言'}</span>
          <div role="group" aria-label={en ? 'Change interface language' : '切换界面语言'}>
            <button type="button" className={language === 'zh-CN' ? 'active' : ''} aria-pressed={language === 'zh-CN'} onClick={() => setLanguage('zh-CN')}>中</button>
            <button type="button" className={language === 'en' ? 'active' : ''} aria-pressed={language === 'en'} onClick={() => setLanguage('en')}>EN</button>
          </div>
        </section>
        <p className="sidebar-note" data-native-i18n>{import.meta.env.VITE_HOSTED_SITE === 'true' ? en ? <>Data mirror stored online<br />Reviews and evaluations are saved separately</> : <>数据镜像保存在云端<br />审核与评估独立记录</> : en ? <>Stored locally<br />AI uses your configured provider</> : <>数据保存在本机<br />AI 分析使用已配置的模型服务</>}</p>
        {webRole ? <a className="sidebar-logout" href="/logout">{en ? 'Sign out' : '退出登录'}</a> : null}
      </aside>
      <main className="main-content">{children}</main>
    </div>
  )
}
