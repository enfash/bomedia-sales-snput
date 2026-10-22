// Avatar background tokens (MUI palette paths, never hex) so avatars follow the active theme.
const AVATAR_TONES = ["primary.main", "success.main", "info.main", "error.main", "warning.dark", "primary.light"] as const;

export function avatarTone(name: string) {
  return AVATAR_TONES[(name.charCodeAt(0) || 0) % AVATAR_TONES.length];
}
