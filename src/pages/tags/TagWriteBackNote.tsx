import { MetadataImpactNotice } from '@/components/ui/confirmation-dialog';

/**
 * Compatibility wrapper for catalog forms. Keeping one component lets those
 * surfaces share the same timing-aware language as confirmation dialogs.
 */
export function TagWriteBackNote({ className }: { className?: string }) {
  return <MetadataImpactNotice impact="automatic" showReadOnly className={className} />;
}
