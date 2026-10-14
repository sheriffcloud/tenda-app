import { apiRoutes } from '../routes'
import type {
  BankAccountSummary,
  CreateBankAccountBody,
  FiatInitiateBody,
  FiatInitiateResponse,
  FiatIntentDetail,
  FiatOfframpInitiateBody,
  FiatQuoteBody,
  FiatQuoteResponse,
} from '../..'
import type { ApiRequest } from './types'

const { fiat } = apiRoutes

export function createFiatApi(request: ApiRequest) {
  return {
    quote: (body: FiatQuoteBody) => request<FiatQuoteResponse>('POST', fiat.quote, { body }),
    onramp: (body: FiatInitiateBody) => request<FiatInitiateResponse>('POST', fiat.onramp, { body }),
    offramp: (body: FiatOfframpInitiateBody) =>
      request<FiatInitiateResponse>('POST', fiat.offramp, { body }),
    intent: (params: { id: string }) => request<FiatIntentDetail>('GET', fiat.intent, { params }),
    cancelIntent: (params: { id: string }) =>
      request<{ cancelled: true }>('POST', fiat.cancelIntent, { params }),
    bankAccounts: () => request<BankAccountSummary[]>('GET', fiat.bankAccounts),
    createBankAccount: (body: CreateBankAccountBody) =>
      request<BankAccountSummary>('POST', fiat.createBankAccount, { body }),
    deleteBankAccount: (params: { id: string }) =>
      request<{ deleted: true }>('DELETE', fiat.deleteBankAccount, { params }),
  }
}
