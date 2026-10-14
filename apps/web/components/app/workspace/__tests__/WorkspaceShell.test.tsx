import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'

import { WorkspaceShell } from '@/components/app/workspace'
import { useChatStore } from '@/stores/chat.store'
import { useNotificationsStore } from '@/stores/notifications.store'
import { makeUser } from '../../../../test/factories/user'

const panes = () => document.querySelector('[data-panes]')

beforeEach(() => {
  useChatStore.setState({ unread: 0 })
  useNotificationsStore.setState({ unread: 0 })
})

describe('WorkspaceShell', () => {
  it('always renders the rail', () => {
    render(<WorkspaceShell user={makeUser()} />)
    expect(screen.getByRole('navigation', { name: 'Workspace' })).toBeInTheDocument()
  })

  it('renders both panes when given them', () => {
    render(<WorkspaceShell user={makeUser()} list={<p>the list</p>} detail={<p>the detail</p>} />)
    expect(screen.getByText('the list')).toBeInTheDocument()
    expect(screen.getByText('the detail')).toBeInTheDocument()
  })
})

describe('WorkspaceShell — selection flag (the ≤900px CSS keys off this)', () => {
  it('marks nodetail when no row is open, so the list wins the single pane', () => {
    render(<WorkspaceShell user={makeUser()} list={<p>list</p>} detail={<p>d</p>} />)
    expect(panes()).toHaveAttribute('data-nodetail')
  })

  it('drops nodetail once a row is open, so the detail wins', () => {
    render(
      <WorkspaceShell user={makeUser()} list={<p>list</p>} detail={<p>d</p>} hasSelection />,
    )
    expect(panes()).not.toHaveAttribute('data-nodetail')
  })

  it('keys off the selection, NOT off whether a detail pane was passed', () => {
    // The layout always mounts a detail pane, so inferring from `detail`
    // would mean nodetail was never set and the list always lost at ≤900px.
    render(<WorkspaceShell user={makeUser()} detail={<p>always mounted</p>} />)
    expect(panes()).toHaveAttribute('data-nodetail')
  })

  it('defaults to no selection when the flag is omitted', () => {
    render(<WorkspaceShell user={makeUser()} />)
    expect(panes()).toHaveAttribute('data-nodetail')
  })
})

describe('WorkspaceShell — list presence', () => {
  it('does not flag list presence itself — CSS :has([data-list]) reads the DOM', () => {
    // A JS flag cannot tell an empty @list slot from a real list: Next wraps
    // slot output in boundary elements, so the prop is an element either way.
    render(<WorkspaceShell user={makeUser()} detail={<p>d</p>} />)
    expect(panes()).not.toHaveAttribute('data-nolist')
  })

  it('renders whatever the slot supplies, empty or not', () => {
    render(<WorkspaceShell user={makeUser()} list={<div data-list>real list</div>} />)
    expect(document.querySelector('[data-list]')).toBeInTheDocument()
  })
})
