"use client";

import { Children, Fragment, cloneElement, createContext, createElement, isValidElement, useContext, type JSX, type ReactNode } from 'react'
import { useTextLanguage, translateText } from './interface-language'

const OriginalText = createContext(false)

/** Native React text rendering; never mutates nodes owned by React. */
type UiProps = { [K in keyof JSX.IntrinsicElements]: { as: K } & JSX.IntrinsicElements[K] }[keyof JSX.IntrinsicElements]
export function Ui({ as, ...props }: UiProps) {
  const language = useTextLanguage()
  const original = useContext(OriginalText) || 'data-native-i18n' in props || 'data-original' in props
  const translate = language === 'en' && !original ? translateText : (value: string) => value
  const text = (value: ReactNode): ReactNode => {
    if (typeof value === 'string') return translate(value)
    if (Array.isArray(value)) {
      const result: ReactNode[] = []
      let words = ''
      let parts: Array<string | number> = []
      const flush = () => {
        if (words) {
          const translated = translate(words)
          result.push(translated !== words ? translated : parts.map(part => typeof part === 'string' ? translate(part) : part).join(''))
        }
        words = ''; parts = []
      }
      for (const child of value) {
        if (typeof child === 'string' || typeof child === 'number') { words += String(child); parts.push(child) }
        else { flush(); result.push(text(child)) }
      }
      flush()
      return Children.toArray(result)
    }
    if (isValidElement<{ children?: ReactNode }>(value) && value.type === Fragment) return cloneElement(value, { children: text(value.props.children) })
    return value
  }
  const attributes = { ...props } as Record<string, unknown>
  for (const key of ['aria-label','placeholder','title','alt']) {
    if (typeof attributes[key] === 'string') attributes[key] = translate(attributes[key])
  }
  attributes.children = original ? attributes.children : text(attributes.children as ReactNode)
  const node = createElement(as, attributes)
  return original ? <OriginalText.Provider value>{node}</OriginalText.Provider> : node
}
