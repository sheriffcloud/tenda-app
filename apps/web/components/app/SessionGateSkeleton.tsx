export function SessionGateSkeleton() {
  return (
    <div className="flex min-h-screen items-center justify-center" aria-busy="true">
      <span className="sr-only">Checking your session</span>
      <div className="h-8 w-40 animate-pulse rounded-control bg-surface-inset" aria-hidden />
    </div>
  )
}

