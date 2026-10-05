import Link from 'next/link';
import { MotionzWordmark } from '@/components/brand/MotionzLogo';
import { buttonClasses } from '@/components/ui/Button';

/** Shown for any address that does not exist. "/" sends each person to their own home page. */
export default function NotFound() {
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 'var(--space-4)',
        padding: 'var(--space-6)',
        textAlign: 'center',
        backgroundColor: 'var(--color-bg-page, var(--color-bg-surface))',
        color: 'var(--color-text-primary)',
      }}
    >
      <MotionzWordmark />
      <h1 style={{ fontSize: '1.25rem', margin: 0 }}>Page not found</h1>
      <p style={{ margin: 0, color: 'var(--color-text-secondary)', maxWidth: '44ch' }}>
        This page does not exist or has moved. Check the address, or go back to your home page.
      </p>
      <Link href="/" className={buttonClasses({ variant: 'primary' })} style={{ textDecoration: 'none' }}>
        Go to my home page
      </Link>
    </div>
  );
}
