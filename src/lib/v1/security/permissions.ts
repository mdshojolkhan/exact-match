/**
 * Permission boundaries for V1 skills.
 *
 * Every tool declares the permissions it needs. The registry refuses to run a
 * tool whose permissions are not granted, and every permission that touches the
 * device is denied in this phase.
 *
 * Hard rules for this phase:
 *  - no arbitrary code execution from user messages,
 *  - no device control (calls, SMS, apps, sensors),
 *  - network access is limited to the read-only web search skill,
 *  - file access is limited to V1's own sandboxed workspace (never the host FS).
 */
export const ALL_PERMISSIONS = [
  "read:time",
  "read:conversation",
  "write:memory",
  "write:plan",
  "net:search",
  "fs:workspace",
  "net:fetch",
  "device:control",
  "system:exec",
] as const;

export type Permission = (typeof ALL_PERMISSIONS)[number];

/** Permissions granted to tools in the current phase. */
export const GRANTED_PERMISSIONS: readonly Permission[] = [
  "read:time",
  "read:conversation",
  "write:memory",
  "write:plan",
  "net:search",
  "fs:workspace",
];

/** Permissions that must never be granted automatically. */
export const FORBIDDEN_PERMISSIONS: readonly Permission[] = [
  "net:fetch",
  "device:control",
  "system:exec",
];

export function isPermissionGranted(permission: Permission): boolean {
  if (FORBIDDEN_PERMISSIONS.includes(permission)) return false;
  return GRANTED_PERMISSIONS.includes(permission);
}

export function assertPermissions(permissions: readonly Permission[]): void {
  const denied = permissions.filter(
    (permission) => !isPermissionGranted(permission),
  );
  if (denied.length > 0) {
    throw new PermissionDeniedError(denied);
  }
}

export class PermissionDeniedError extends Error {
  readonly denied: readonly Permission[];

  constructor(denied: readonly Permission[]) {
    super(`Permission not granted: ${denied.join(", ")}`);
    this.name = "PermissionDeniedError";
    this.denied = denied;
  }
}
