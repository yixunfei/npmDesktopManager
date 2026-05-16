import { useLayoutEffect } from 'react'
import type { FC } from 'react'
import { translateText } from '../../i18n'
import { AppLanguage, useSettingsStore } from '../../stores/settingsStore'

const TRANSLATABLE_ATTRIBUTES = ['placeholder', 'title', 'aria-label', 'alt']
const originalTextNodes = new WeakMap<Text, string>()
const originalAttributes = new WeakMap<Element, Map<string, string>>()

const hasCjk = (value: string) => /[\u3400-\u9fff]/.test(value)

export const RuntimeLocalizer: FC = () => {
  const language = useSettingsStore((state) => state.language)

  useLayoutEffect(() => {
    if (typeof document === 'undefined' || !document.body) return

    const localizeNode = (node: Node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        localizeTextNode(node as Text, language)
        return
      }

      if (node.nodeType !== Node.ELEMENT_NODE) return

      const element = node as Element
      if (shouldSkipElement(element)) return

      localizeElementAttributes(element, language)

      const walker = document.createTreeWalker(
        element,
        NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT,
        {
          acceptNode: (candidate) => {
            if (candidate.nodeType === Node.ELEMENT_NODE && shouldSkipElement(candidate as Element)) {
              return NodeFilter.FILTER_REJECT
            }
            return NodeFilter.FILTER_ACCEPT
          }
        }
      )

      while (walker.nextNode()) {
        const current = walker.currentNode
        if (current.nodeType === Node.TEXT_NODE) {
          localizeTextNode(current as Text, language)
        } else if (current.nodeType === Node.ELEMENT_NODE) {
          localizeElementAttributes(current as Element, language)
        }
      }
    }

    localizeNode(document.body)

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === 'characterData') {
          localizeTextNode(mutation.target as Text, language)
        } else if (mutation.type === 'attributes') {
          localizeElementAttributes(mutation.target as Element, language)
        } else {
          mutation.addedNodes.forEach(localizeNode)
        }
      }
    })

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: TRANSLATABLE_ATTRIBUTES
    })

    return () => observer.disconnect()
  }, [language])

  return null
}

function localizeTextNode(node: Text, language: AppLanguage) {
  const parent = node.parentElement
  if (!parent || shouldSkipElement(parent)) return

  const current = node.textContent || ''
  const original = originalTextNodes.get(node)

  if (language === 'zh-CN') {
    if (original && current !== original) {
      node.textContent = original
    }
    return
  }

  if (!hasCjk(current) && !original) return

  const source = hasCjk(current) ? current : original || current
  const translated = translateText(language, source)

  if (hasCjk(source)) {
    originalTextNodes.set(node, source)
  }

  if (translated !== current) {
    node.textContent = translated
  }
}

function localizeElementAttributes(element: Element, language: AppLanguage) {
  if (shouldSkipElement(element)) return

  for (const attr of TRANSLATABLE_ATTRIBUTES) {
    const current = element.getAttribute(attr)
    if (!current) continue

    const originalMap = originalAttributes.get(element)
    const original = originalMap?.get(attr)

    if (language === 'zh-CN') {
      if (original && current !== original) {
        element.setAttribute(attr, original)
      }
      continue
    }

    if (!hasCjk(current) && !original) continue

    const source = hasCjk(current) ? current : original || current
    const translated = translateText(language, source)

    if (hasCjk(source)) {
      rememberAttribute(element, attr, source)
    }

    if (translated !== current) {
      element.setAttribute(attr, translated)
    }
  }
}

function rememberAttribute(element: Element, attr: string, value: string) {
  let attrs = originalAttributes.get(element)
  if (!attrs) {
    attrs = new Map<string, string>()
    originalAttributes.set(element, attrs)
  }
  attrs.set(attr, value)
}

function shouldSkipElement(element: Element): boolean {
  return !!element.closest('script, style, code, pre, textarea, [data-no-localize], [contenteditable="true"]')
}
