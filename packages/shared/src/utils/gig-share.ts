/**
 * The sentence a gig is shared with: "<title> on Tenda".
 *
 * One phrasing for the app's share sheet and the web's share button, so a
 * link forwarded from either reads the same in the chat it lands in. The
 * URL is deliberately NOT composed here — mobile shares the API host's
 * `/gig/<id>` page and the web its own canonical route, and a helper that
 * picked one would be wrong for the other.
 */
import { APP_INFO } from '../constants/app-info'

export function gigShareMessage(title: string): string {
  return `${title} on ${APP_INFO.name}`
}
