/**
 * Composer contract: Enter sends trimmed text (Shift+Enter doesn't),
 * empty/whitespace never sends, disabled blocks sending, the field clears
 * after send, the cap matches the server's MESSAGE_MAX_LENGTH, and the
 * paperclip hands the picked file up.
 */
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'
import { MESSAGE_MAX_LENGTH } from '@tenda/shared'
import { ChatInput } from '@/components/chat/ChatInput'

test('Enter sends the trimmed text and clears the field; Shift+Enter does not send', async () => {
  const onSend = vi.fn()
  render(<ChatInput onSend={onSend} />)
  const field = screen.getByPlaceholderText('Message…')

  await userEvent.type(field, '  hello there  ')
  await userEvent.keyboard('{Shift>}{Enter}{/Shift}')
  expect(onSend).not.toHaveBeenCalled()

  await userEvent.keyboard('{Enter}')
  expect(onSend).toHaveBeenCalledWith('hello there')
  expect(field).toHaveValue('')
})

test('whitespace-only input cannot send, via key or button', async () => {
  const onSend = vi.fn()
  render(<ChatInput onSend={onSend} />)
  await userEvent.type(screen.getByPlaceholderText('Message…'), '   ')
  await userEvent.keyboard('{Enter}')
  expect(screen.getByRole('button', { name: 'Send message' })).toBeDisabled()
  expect(onSend).not.toHaveBeenCalled()
})

test('disabled blocks sending even with content', async () => {
  const onSend = vi.fn()
  render(<ChatInput onSend={onSend} disabled />)
  const field = screen.getByPlaceholderText('Message…')
  fireEvent.change(field, { target: { value: 'ready' } })
  await userEvent.keyboard('{Enter}')
  expect(screen.getByRole('button', { name: 'Send message' })).toBeDisabled()
  expect(onSend).not.toHaveBeenCalled()
})

test('Enter during IME composition commits the composition, never sends', () => {
  const onSend = vi.fn()
  render(<ChatInput onSend={onSend} />)
  const field = screen.getByPlaceholderText('Message…')
  fireEvent.change(field, { target: { value: '你好' } })
  fireEvent.keyDown(field, { key: 'Enter', isComposing: true })
  expect(onSend).not.toHaveBeenCalled()
  fireEvent.keyDown(field, { key: 'Enter', isComposing: false })
  expect(onSend).toHaveBeenCalledWith('你好')
})

test('the length cap is the server cap', () => {
  render(<ChatInput onSend={vi.fn()} />)
  expect(screen.getByPlaceholderText('Message…')).toHaveAttribute(
    'maxlength',
    String(MESSAGE_MAX_LENGTH),
  )
})

test('the paperclip hands the picked file to onAttach; no onAttach hides it', () => {
  const onAttach = vi.fn()
  const { rerender } = render(<ChatInput onSend={vi.fn()} onAttach={onAttach} />)
  const input = screen.getByLabelText('Choose attachment')
  const file = new File(['x'], 'pic.png', { type: 'image/png' })
  fireEvent.change(input, { target: { files: [file] } })
  expect(onAttach).toHaveBeenCalledWith(file)

  rerender(<ChatInput onSend={vi.fn()} />)
  expect(screen.queryByLabelText('Attach file')).toBeNull()
})
