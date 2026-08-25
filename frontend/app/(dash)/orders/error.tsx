'use client';
import { SegmentError } from '@/components/SegmentBoundary';
export default function Error(props: { error: Error & { digest?: string }; reset: () => void }) {
  return <SegmentError {...props} segment="orders" />;
}
