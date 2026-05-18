import Image from 'next/image';
import { cn } from '@/lib/utils';

type Props = {
  // `light` = white logo for dark backgrounds, `dark` = colour logo for light backgrounds
  variant?: 'light' | 'dark';
  priority?: boolean;
  className?: string;
};

export function BrandLogo({ variant = 'dark', priority, className }: Props) {
  return (
    <Image
      src={variant === 'light' ? '/logos/kartriq-logo-white.png' : '/logos/kartriq-logo.png'}
      alt="Kartriq"
      width={960}
      height={224}
      priority={priority}
      className={cn('w-auto', className)}
    />
  );
}
