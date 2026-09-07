import type { Endpoint } from '../endpoint'
import type {
  Conversation,
  Message,
  SendMessageInput,
  MessagesQuery,
} from '../../types'

export interface ConversationsContract {
  list:          Endpoint<'GET',    undefined,           undefined,         undefined,      Conversation[]>
  findOrCreate:  Endpoint<'POST',   undefined,           { user_id: string }, undefined,    Conversation>
  messages:      Endpoint<'GET',    { id: string },      undefined,         MessagesQuery,  Message[]>
  sendMessage:   Endpoint<'POST',   { id: string },      SendMessageInput,  undefined,      Message>
  close:         Endpoint<'POST',   { id: string },      undefined,         undefined,      Conversation>
}
