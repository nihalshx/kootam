import { initials } from './utils'

export default function Avatar({ name, color, size = 44, online = false, group = false }) {
  return (
    <div className="avatar" style={{ width: size, height: size, background: color || '#6c757d', fontSize: size * 0.38 }}>
      {group ? (
        <svg width={size * 0.5} height={size * 0.5} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M16 11a3 3 0 1 0-3-3 3 3 0 0 0 3 3Zm-8 0a3 3 0 1 0-3-3 3 3 0 0 0 3 3Zm0 2c-2.7 0-8 1.3-8 4v2h10v-2c0-1 .4-1.9 1.1-2.6A13 13 0 0 0 8 13Zm8 0c-.3 0-.7 0-1.1.1A4.3 4.3 0 0 1 17 17v2h7v-2c0-2.7-5.3-4-8-4Z" />
        </svg>
      ) : initials(name)}
      {online && <span className="online-dot" aria-label="online" />}
    </div>
  )
}
