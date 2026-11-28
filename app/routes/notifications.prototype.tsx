// PROTOTYPE, throwaway. /notifications: renders the current variant's page, if it has one.
import { useVariantMount, useNotificationsPrototype } from "~/components/notifications-prototype";

export default function NotificationsPrototypePage() {
  const { variant } = useNotificationsPrototype();
  const { Page } = useVariantMount();
  if (Page) return <Page />;
  return (
    <div className="mx-auto max-w-xl p-8 text-sm text-muted-foreground">
      Variant {variant} has no notifications page, on purpose. Use its in-layout surface instead.
    </div>
  );
}
