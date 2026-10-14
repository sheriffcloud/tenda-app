import PublicExchangePage, {
  generateExchangeMetadata,
  type ExchangeSearchParams,
} from '@/components/exchange/PublicExchangePage'

export const generateMetadata = generateExchangeMetadata

export default function ExchangePage({
  searchParams,
}: {
  searchParams: Promise<ExchangeSearchParams>
}) {
  return <PublicExchangePage searchParams={searchParams} />
}
