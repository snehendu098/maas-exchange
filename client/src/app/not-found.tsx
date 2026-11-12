import { routes } from "@/shared/config/navigation";
import { NotFoundView } from "@/shared/ui/not-found-view";

export default function NotFound() {
  return (
    <NotFoundView
      title="This page doesn't exist"
      body="The link may be old or mistyped. Pick up from one of these instead."
      action={{ label: "Go to Vault", href: routes.vault() }}
    />
  );
}
