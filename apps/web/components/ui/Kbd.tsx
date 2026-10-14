/** A key cap, for the keyboard hints the list column and the feed both state. */
export function Kbd({ children }: { children: string }) {
  return (
    <kbd className="rounded-[5px] border border-border-default bg-surface-inset px-1.5 py-px font-numeric text-[10px] leading-4">
      {children}
    </kbd>
  )
}
