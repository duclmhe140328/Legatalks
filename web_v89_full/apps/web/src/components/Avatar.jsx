export default function Avatar({ user, size = 44, className = '' }) {
  const initials = (user?.displayName || '?').split(/\s+/).slice(-2).map((x) => x[0]).join('').toUpperCase();
  return user?.avatar
    ? <img className={`avatar ${className}`} src={user.avatar} alt={user.displayName || 'avatar'} style={{ width: size, height: size }} />
    : <div className={`avatar avatar-fallback ${className}`} style={{ width: size, height: size }}>{initials}</div>;
}
