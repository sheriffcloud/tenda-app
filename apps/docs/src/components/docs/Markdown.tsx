/**
 * The document's own prose, rendered.
 *
 * OpenAPI descriptions are CommonMark, and since #157 stage 3 the integration
 * guide is one of them — so a page that printed them as plain text would show
 * a reader the asterisks instead of the emphasis.
 *
 * `dangerouslySetInnerHTML` is safe HERE and only here: the input is the
 * document generated from `@tenda/api-doc` at build time, never anything a
 * visitor supplies, and it is baked into the bundle rather than fetched. If
 * this component is ever pointed at a fetched document, it needs sanitising
 * first.
 */
import { marked } from 'marked'

export function Markdown({ children, className = '' }: { children: string; className?: string }) {
  // Synchronous by construction: `marked.parse` returns a string unless an
  // async extension is registered, and none is.
  const html = marked.parse(children, { async: false })
  return <div className={`prose-doc ${className}`} dangerouslySetInnerHTML={{ __html: html }} />
}
