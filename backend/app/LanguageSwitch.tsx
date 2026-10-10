"use client";

import { useInterfaceLanguage } from './interface-language';

export function LanguageSwitch() {
  const { language, setLanguage } = useInterfaceLanguage();
  return <div data-native-i18n className="language-switch" role="group" aria-label={language === 'en' ? 'Interface language' : '界面语言'}>
    <button type="button" aria-pressed={language === 'zh-CN'} onClick={() => setLanguage('zh-CN')}>中文</button>
    <button type="button" aria-pressed={language === 'en'} onClick={() => setLanguage('en')}>English</button>
  </div>;
}
