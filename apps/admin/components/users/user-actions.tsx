'use client'

/**
 * User mutations (#92): suspend/reinstate (users.suspend), role change
 * (users.assign_roles — demotion auto-releases claims + revokes dashboard
 * login server-side, #81/#87), and login-email provisioning (#87 —
 * grants LOGIN only, never authority; target must already be an admin).
 */

import { useState } from 'react'
import { toast } from 'sonner'
import { ADMIN_ROLES, ASSIGNABLE_ROLES, type UserRole } from '@tenda/shared'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/native-select'
import { ConfirmDialog } from '@/components/common/confirm-dialog'
import { adminApi, type AdminUserDetail } from '@/api/client'
import { ApiError } from '@/lib/api'
import { useSessionUser } from '@/lib/use-session'

interface UserActionsProps {
  user: AdminUserDetail
  onChanged: () => void
}

function isAssignableRole(v: string): v is UserRole {
  return (ASSIGNABLE_ROLES as readonly string[]).includes(v)
}

export function UserActions({ user, onChanged }: UserActionsProps) {
  const meId = useSessionUser()?.id ?? ''
  const isAdminRole = (ADMIN_ROLES as readonly string[]).includes(user.role)
  const [role, setRole] = useState<UserRole>(user.role)
  const [loginEmail, setLoginEmail] = useState('')
  const [confirmSuspend, setConfirmSuspend] = useState(false)
  const [busy, setBusy] = useState(false)

  async function run(action: () => Promise<unknown>, success: string) {
    setBusy(true)
    try {
      await action()
      toast.success(success)
      onChanged()
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Action failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="grid gap-4 rounded-md border p-4 md:grid-cols-3">
      <div className="space-y-2">
        <p className="text-sm font-medium">Account status</p>
        {user.status === 'active' ? (
          <Button
            variant="destructive"
            size="sm"
            disabled={busy || isAdminRole}
            onClick={() => setConfirmSuspend(true)}
          >
            Suspend
          </Button>
        ) : (
          <Button
            size="sm"
            disabled={busy}
            onClick={() => void run(() => adminApi.adminUsers.updateStatus(user.id, 'active'), 'User reinstated')}
          >
            Reinstate
          </Button>
        )}
        {isAdminRole && user.status === 'active' && (
          <p className="text-xs text-muted-foreground">Admins cannot be suspended — demote first.</p>
        )}
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium">Role</p>
        <div className="flex gap-2">
          <NativeSelect
            value={role}
            onChange={(e) => {
              if (isAssignableRole(e.target.value)) setRole(e.target.value)
            }}
            className="w-44"
          >
            {ASSIGNABLE_ROLES.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </NativeSelect>
          <Button
            size="sm"
            disabled={busy || role === user.role || (user.id === meId && role === 'user')}
            onClick={() => void run(() => adminApi.adminUsers.updateRole(user.id, role), `Role set to ${role}`)}
          >
            Apply
          </Button>
        </div>
        {user.id === meId && (
          <p className="text-xs text-muted-foreground">You cannot demote your own account.</p>
        )}
        <p className="text-xs text-muted-foreground">
          Demoting to a non-admin role releases claimed disputes and revokes dashboard login.
        </p>
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium">Dashboard login email</p>
        {isAdminRole ? (
          <>
            <div className="flex gap-2">
              <Input
                type="email"
                value={loginEmail}
                onChange={(e) => setLoginEmail(e.target.value)}
                placeholder="admin@tenda.app"
                className="w-56"
              />
              <Button
                size="sm"
                disabled={busy || loginEmail.trim() === ''}
                onClick={() =>
                  void run(async () => {
                    const granted = await adminApi.adminUsers.grantLoginEmail(user.id, loginEmail.trim())
                    setLoginEmail('')
                    return granted
                  }, 'Login email granted')
                }
              >
                Grant
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() => void run(() => adminApi.adminUsers.revokeLoginEmail(user.id), 'Login email revoked')}
              >
                Revoke
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Grants LOGIN only — authority always comes from the role.
            </p>
          </>
        ) : (
          <p className="text-xs text-muted-foreground">Promote to an admin role first.</p>
        )}
      </div>

      <ConfirmDialog
        open={confirmSuspend}
        onOpenChange={setConfirmSuspend}
        title="Suspend this account?"
        description="They are signed out within a minute and lose all access until reinstated."
        confirmLabel="Suspend"
        variant="destructive"
        onConfirm={() => {
          setConfirmSuspend(false)
          void run(() => adminApi.adminUsers.updateStatus(user.id, 'suspended'), 'User suspended')
        }}
      />
    </div>
  )
}
