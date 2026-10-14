/**
 * Chat limits. MESSAGE_MAX_LENGTH is enforced server-side on POST
 * /v1/conversations/:id/messages and mirrored by both composers'
 * maxLength — one number, three call sites.
 */
export const MESSAGE_MAX_LENGTH = 2000
